import type { Plugin } from 'vite'

/**
 * The Clerk Frontend API host is encoded in the publishable key (pk_test_/pk_live_ followed
 * by base64 of "<host>$"), so each environment's content-security policy names exactly its
 * own Clerk host.
 */
export function clerkFrontendApi(publishableKey: string): string {
  const encoded = publishableKey.replace(/^pk_(test|live)_/, '')
  const host = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '')
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) throw new Error('The Clerk publishable key does not contain a valid Frontend API host.')
  return host
}

/** Security headers for every static response, following Clerk's documented CSP needs. */
export function headersFile(publishableKey: string): string {
  const clerk = 'https://' + clerkFrontendApi(publishableKey)
  const csp = [
    "default-src 'self'",
    "script-src 'self' " + clerk + ' https://challenges.cloudflare.com',
    "connect-src 'self' " + clerk,
    "img-src 'self' https://img.clerk.com data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "frame-src 'self' https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
  return [
    '/*',
    '  Content-Security-Policy: ' + csp,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: no-referrer',
    '  X-Frame-Options: DENY',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    '  Cross-Origin-Opener-Policy: same-origin',
    '  Strict-Transport-Security: max-age=31536000',
    '',
  ].join('\n')
}

/** Emits `_headers` into the static-asset output, which Cloudflare applies to every asset. */
export function securityHeaders(publishableKey: string | undefined): Plugin {
  return {
    name: 'split-ledger-security-headers',
    apply: 'build',
    applyToEnvironment(environment) { return environment.name === 'client' },
    generateBundle() {
      if (!publishableKey) throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required to build the security headers.')
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile(publishableKey) })
    },
  }
}
