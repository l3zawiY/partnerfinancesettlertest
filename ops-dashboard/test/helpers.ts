// Test-only Access stand-in: a real RSA key pair and tokens signed the way Access signs them.

export const TEAM = 'fictional-team.cloudflareaccess.com'
export const AUD = 'fictional-audience-tag'
export const OWNER = 'owner@example.com'
export const NOW = Date.parse('2026-10-26T12:00:00.000Z')

function base64Url(bytes: Uint8Array | string): string {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  let binary = ''
  for (const byte of data) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function makeAccess() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const other = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey
  let certRequests = 0

  async function sign(payload: Record<string, unknown>, options: { kid?: string; alg?: string; key?: CryptoKey } = {}): Promise<string> {
    const header = base64Url(JSON.stringify({ alg: options.alg ?? 'RS256', kid: options.kid ?? 'kid-1', typ: 'JWT' }))
    const body = base64Url(JSON.stringify(payload))
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', options.key ?? pair.privateKey, new TextEncoder().encode(`${header}.${body}`))
    return `${header}.${body}.${base64Url(new Uint8Array(signature))}`
  }

  function claims(overrides: Record<string, unknown> = {}) {
    const seconds = Math.floor(NOW / 1000)
    return { iss: `https://${TEAM}`, aud: [AUD], email: OWNER, iat: seconds - 10, nbf: seconds - 10, exp: seconds + 3600, ...overrides }
  }

  const certsFetcher = async (url: string) => {
    if (url === `https://${TEAM}/cdn-cgi/access/certs`) {
      certRequests += 1
      return Response.json({ keys: [{ ...jwk, kid: 'kid-1', alg: 'RS256' }] })
    }
    return new Response('not found', { status: 404 })
  }

  return { sign, claims, certsFetcher, otherKey: other.privateKey, certRequests: () => certRequests }
}
