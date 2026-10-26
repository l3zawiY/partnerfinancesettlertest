import { beforeEach, describe, expect, it } from 'vitest'
import { authorize, basicPassword, clearKeyCache, sameSecret, validTeamDomain, verifyAccessToken } from '../src/auth'
import { AUD, NOW, OWNER, TEAM, makeAccess } from './helpers'

const settings = { teamDomain: TEAM, audience: AUD, ownerEmail: OWNER }
const access = await makeAccess()
const fetcher = access.certsFetcher as unknown as typeof fetch

beforeEach(() => clearKeyCache())

async function check(token: string | null) {
  return verifyAccessToken(token, settings, NOW, fetcher)
}

describe('Cloudflare Access token check', () => {
  it('accepts a correctly signed token for the owner', async () => {
    expect(await check(await access.sign(access.claims()))).toEqual({ ok: true, email: OWNER })
    expect(await check(await access.sign(access.claims({ aud: AUD, email: 'Owner@Example.com' })))).toEqual({ ok: true, email: OWNER })
  })

  it('refuses a token for anyone else, even one Access signed (a too-wide Access policy)', async () => {
    expect(await check(await access.sign(access.claims({ email: 'someone@example.com' })))).toEqual({ ok: false, reason: 'not the owner' })
    expect(await check(await access.sign(access.claims({ email: undefined })))).toEqual({ ok: false, reason: 'not the owner' })
  })

  it('refuses other applications, other teams, and old or future tokens', async () => {
    expect(await check(await access.sign(access.claims({ aud: ['another-app'] })))).toMatchObject({ reason: 'wrong audience' })
    expect(await check(await access.sign(access.claims({ iss: 'https://other.cloudflareaccess.com' })))).toMatchObject({ reason: 'wrong issuer' })
    expect(await check(await access.sign(access.claims({ exp: Math.floor(NOW / 1000) - 120 })))).toMatchObject({ reason: 'expired token' })
    expect(await check(await access.sign(access.claims({ exp: undefined })))).toMatchObject({ reason: 'expired token' })
    expect(await check(await access.sign(access.claims({ nbf: Math.floor(NOW / 1000) + 600 })))).toMatchObject({ reason: 'token not yet valid' })
  })

  it('refuses forged, altered, unsigned, and malformed tokens', async () => {
    expect(await check(await access.sign(access.claims(), { key: access.otherKey }))).toMatchObject({ reason: 'bad signature' })
    const [header, , signature] = (await access.sign(access.claims())).split('.')
    const altered = btoa(JSON.stringify(access.claims({ email: 'someone@example.com' }))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(await check(`${header}.${altered}.${signature}`)).toMatchObject({ reason: 'bad signature' })
    expect(await check(await access.sign(access.claims(), { alg: 'none' }))).toMatchObject({ reason: 'unexpected token algorithm' })
    expect(await check(await access.sign(access.claims(), { alg: 'HS256' }))).toMatchObject({ reason: 'unexpected token algorithm' })
    expect(await check(await access.sign(access.claims(), { kid: 'unknown' }))).toMatchObject({ reason: 'unknown signing key' })
    expect(await check('not-a-token')).toMatchObject({ reason: 'malformed token' })
    expect(await check(null)).toMatchObject({ reason: 'missing Access token' })
  })

  it('caches Access keys but fetches again for an unknown key id', async () => {
    const before = access.certRequests()
    await check(await access.sign(access.claims()))
    await check(await access.sign(access.claims()))
    expect(access.certRequests() - before).toBe(1)
    await check(await access.sign(access.claims(), { kid: 'rotated' }))
    expect(access.certRequests() - before).toBe(2)
  })

  it('accepts only a plain cloudflareaccess.com team domain', () => {
    expect(validTeamDomain(TEAM)).toBe(true)
    for (const value of ['', undefined, 'evil.com', 'x.cloudflareaccess.com/path', 'https://x.cloudflareaccess.com', 'x.cloudflareaccess.com.evil.com']) expect(validTeamDomain(value)).toBe(false)
  })
})

function request(headers: Record<string, string> = {}) {
  return new Request('https://ops.tallywithus.com/', { headers })
}

describe('authorize', () => {
  const accessEnv = { AUTH_MODE: 'access', ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, OWNER_EMAIL: OWNER }

  it('refuses everyone while Access settings are missing', async () => {
    const token = await access.sign(access.claims())
    for (const env of [{ ...accessEnv, ACCESS_AUD: '' }, { ...accessEnv, ACCESS_TEAM_DOMAIN: '' }, { ...accessEnv, OWNER_EMAIL: undefined }, { AUTH_MODE: undefined }]) {
      expect(await authorize(request({ 'Cf-Access-Jwt-Assertion': token }), env, NOW, fetcher)).toMatchObject({ ok: false, status: 503 })
    }
  })

  it('lets only the owner in with Access', async () => {
    expect(await authorize(request({ 'Cf-Access-Jwt-Assertion': await access.sign(access.claims()) }), accessEnv, NOW, fetcher)).toEqual({ ok: true, who: OWNER })
    expect(await authorize(request(), accessEnv, NOW, fetcher)).toMatchObject({ ok: false, status: 403 })
    // A password never works in Access mode.
    expect(await authorize(request({ Authorization: `Basic ${btoa('x:a-very-long-fictional-password')}` }), { ...accessEnv, OPS_PASSWORD: 'a-very-long-fictional-password' }, NOW, fetcher)).toMatchObject({ ok: false, status: 403 })
  })

  it('password fallback: right password in, wrong or missing asked again, short password refused', async () => {
    const env = { AUTH_MODE: 'password', OPS_PASSWORD: 'a-very-long-fictional-password' }
    expect(await authorize(request({ Authorization: `Basic ${btoa('owner:a-very-long-fictional-password')}` }), env, NOW, fetcher)).toEqual({ ok: true, who: 'password' })
    expect(await authorize(request({ Authorization: `Basic ${btoa('owner:wrong')}` }), env, NOW, fetcher)).toMatchObject({ ok: false, status: 401, challenge: true })
    expect(await authorize(request(), env, NOW, fetcher)).toMatchObject({ ok: false, status: 401 })
    expect(await authorize(request(), { AUTH_MODE: 'password', OPS_PASSWORD: 'short' }, NOW, fetcher)).toMatchObject({ ok: false, status: 503 })
    expect(await authorize(request(), { AUTH_MODE: 'open' }, NOW, fetcher)).toMatchObject({ ok: false, status: 503 })
  })

  it('reads Basic passwords, including ones with colons', async () => {
    expect(basicPassword(`Basic ${btoa('u:pa:ss')}`)).toBe('pa:ss')
    expect(basicPassword('Bearer x')).toBeNull()
    expect(basicPassword('Basic !!!')).toBeNull()
    expect(await sameSecret('abc', 'abc')).toBe(true)
    expect(await sameSecret('abc', 'abd')).toBe(false)
  })
})
