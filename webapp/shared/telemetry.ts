/**
 * Clerk's SDKs collect telemetry from development instances unless they are told not
 * to, and print a one-time notice saying so. This project forbids telemetry, so both
 * layers import an explicit setting from here instead of relying on a default.
 *
 * Clerk also documents a `CLERK_TELEMETRY_DISABLED` environment variable, but it is
 * read from `process.env`, which exists in neither a Cloudflare Worker nor the browser.
 * The code options below are therefore the only controls that actually take effect.
 */

/** Passed to `<ClerkProvider telemetry={...}>` in the browser. */
export const BROWSER_CLERK_TELEMETRY = false

/** Passed to `createClerkClient({ telemetry: ... })` in the Worker. */
export const WORKER_CLERK_TELEMETRY = { disabled: true }
