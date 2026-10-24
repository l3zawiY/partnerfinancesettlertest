import { describe, expect, it } from 'vitest'
import { clerkFrontendApi, headersFile } from '../securityHeaders'

// Fictional keys: base64 of "<host>$" after the pk_test_/pk_live_ prefix.
const DEV = 'pk_test_' + Buffer.from('fictional-instance-01.clerk.accounts.dev$').toString('base64')
const LIVE = 'pk_live_' + Buffer.from('clerk.split.example.com$').toString('base64')

describe('security headers', function () {
  it('names exactly the Clerk host encoded in the publishable key', function () {
    expect(clerkFrontendApi(DEV)).toBe('fictional-instance-01.clerk.accounts.dev')
    expect(clerkFrontendApi(LIVE)).toBe('clerk.split.example.com')
    expect(function () { clerkFrontendApi('pk_test_' + Buffer.from('not a host$').toString('base64')) }).toThrow()
  })

  it('locks down framing, sniffing, referrers, and every source to self, Clerk, and the anti-bot check', function () {
    const file = headersFile(LIVE)
    expect(file).toMatch(/^\/\*\n/)
    expect(file).toContain("script-src 'self' https://clerk.split.example.com https://challenges.cloudflare.com")
    expect(file).toContain("connect-src 'self' https://clerk.split.example.com;")
    expect(file).toContain("frame-ancestors 'none'")
    expect(file).toContain('X-Content-Type-Options: nosniff')
    expect(file).toContain('Referrer-Policy: no-referrer')
    expect(file).not.toMatch(/unsafe-eval|\*\.|https:\/\/\*/)
  })
})
