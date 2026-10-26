// Who may open the page. Cloudflare Access sits in front of ops.tallywithus.com; this Worker
// also checks Access's signed token itself, so a missing or mistaken Access policy cannot
// expose the page. Fallback (only if the owner declines Zero Trust): one password stored as
// a Worker secret, sent with HTTP Basic over HTTPS. Every missing setting refuses access.

export interface AuthSettings {
  AUTH_MODE?: string
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_AUD?: string
  OWNER_EMAIL?: string
  OPS_PASSWORD?: string
}

export type AuthResult = { ok: true; who: string } | { ok: false; status: 401 | 403 | 503; reason: string; challenge?: boolean }

const CLOCK_SKEW_SECONDS = 60
const KEY_CACHE_MS = 10 * 60_000
export const MIN_PASSWORD_LENGTH = 20

interface Jwk { kid?: string; kty?: string; n?: string; e?: string; alg?: string }
interface CachedKeys { fetchedAt: number; keys: Map<string, CryptoKey> }
const keyCache = new Map<string, CachedKeys>()

/** For tests only. */
export function clearKeyCache(): void {
  keyCache.clear()
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

/** A team domain like "example.cloudflareaccess.com", with nothing else allowed. */
export function validTeamDomain(value: string | undefined): value is string {
  return typeof value === 'string' && /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(value)
}

async function fetchKeys(teamDomain: string, fetcher: typeof fetch): Promise<Map<string, CryptoKey>> {
  const response = await fetcher(`https://${teamDomain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5_000) })
  if (!response.ok) throw new Error(`certs ${response.status}`)
  const body = (await response.json()) as { keys?: Jwk[] }
  const keys = new Map<string, CryptoKey>()
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) continue
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    keys.set(jwk.kid, key)
  }
  return keys
}

async function keyFor(teamDomain: string, kid: string, now: number, fetcher: typeof fetch): Promise<CryptoKey | null> {
  const cached = keyCache.get(teamDomain)
  if (cached && now - cached.fetchedAt < KEY_CACHE_MS && cached.keys.has(kid)) return cached.keys.get(kid) ?? null
  // Unknown key id or stale cache: fetch again once (Access rotates its keys).
  const keys = await fetchKeys(teamDomain, fetcher)
  keyCache.set(teamDomain, { fetchedAt: now, keys })
  return keys.get(kid) ?? null
}

/** Checks a Cf-Access-Jwt-Assertion token: signature, issuer, audience, time, and owner email. */
export async function verifyAccessToken(
  token: string | null,
  settings: { teamDomain: string; audience: string; ownerEmail: string },
  now: number = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; email: string } | { ok: false; reason: string }> {
  if (!token) return { ok: false, reason: 'missing Access token' }
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' }
  const header = decodeJson(parts[0])
  const payload = decodeJson(parts[1])
  if (!header || !payload) return { ok: false, reason: 'malformed token' }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false, reason: 'unexpected token algorithm' }

  let key: CryptoKey | null
  try {
    key = await keyFor(settings.teamDomain, header.kid, now, fetcher)
  } catch {
    return { ok: false, reason: 'could not load Access keys' }
  }
  if (!key) return { ok: false, reason: 'unknown signing key' }

  let signatureValid = false
  try {
    signatureValid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))
  } catch {
    signatureValid = false
  }
  if (!signatureValid) return { ok: false, reason: 'bad signature' }

  if (payload.iss !== `https://${settings.teamDomain}`) return { ok: false, reason: 'wrong issuer' }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!audiences.includes(settings.audience)) return { ok: false, reason: 'wrong audience' }
  const seconds = Math.floor(now / 1000)
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < seconds) return { ok: false, reason: 'expired token' }
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SECONDS > seconds) return { ok: false, reason: 'token not yet valid' }
  if (typeof payload.iat === 'number' && payload.iat - CLOCK_SKEW_SECONDS > seconds) return { ok: false, reason: 'token issued in the future' }
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  if (!email || email !== settings.ownerEmail.trim().toLowerCase()) return { ok: false, reason: 'not the owner' }
  return { ok: true, email }
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

/** Compares two strings without revealing where they differ. */
export async function sameSecret(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(given), digest(expected)])
  let difference = 0
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index]
  return difference === 0
}

/** The password from an HTTP Basic header (any user name), or null. */
export function basicPassword(header: string | null): string | null {
  if (!header || !header.startsWith('Basic ')) return null
  try {
    const decoded = new TextDecoder().decode(base64UrlToBytes(header.slice(6).trim()))
    const colon = decoded.indexOf(':')
    return colon === -1 ? null : decoded.slice(colon + 1)
  } catch {
    return null
  }
}

export async function authorize(request: Request, settings: AuthSettings, now: number = Date.now(), fetcher: typeof fetch = fetch): Promise<AuthResult> {
  const mode = settings.AUTH_MODE ?? 'access'
  if (mode === 'access') {
    if (!validTeamDomain(settings.ACCESS_TEAM_DOMAIN) || !settings.ACCESS_AUD || !settings.OWNER_EMAIL) {
      return { ok: false, status: 503, reason: 'Access is not configured yet.' }
    }
    const result = await verifyAccessToken(
      request.headers.get('Cf-Access-Jwt-Assertion'),
      { teamDomain: settings.ACCESS_TEAM_DOMAIN, audience: settings.ACCESS_AUD, ownerEmail: settings.OWNER_EMAIL },
      now,
      fetcher,
    )
    return result.ok ? { ok: true, who: result.email } : { ok: false, status: 403, reason: 'Not allowed.' }
  }
  if (mode === 'password') {
    if (!settings.OPS_PASSWORD || settings.OPS_PASSWORD.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, status: 503, reason: 'The password is not configured yet.' }
    }
    const given = basicPassword(request.headers.get('Authorization'))
    if (given !== null && (await sameSecret(given, settings.OPS_PASSWORD))) return { ok: true, who: 'password' }
    return { ok: false, status: 401, reason: 'Password required.', challenge: true }
  }
  return { ok: false, status: 503, reason: 'Unknown sign-in setting.' }
}
