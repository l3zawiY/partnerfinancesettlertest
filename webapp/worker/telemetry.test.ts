import { createClerkClient } from '@clerk/backend'
import { describe, expect, it } from 'vitest'
import { BROWSER_CLERK_TELEMETRY } from '../shared/telemetry'
import { clerkClientOptions, type ClerkEnvironment } from './auth'

/**
 * A realistically shaped fictional development key. Clerk's collector inspects the
 * publishable key and disables itself when it cannot read one, so a short placeholder
 * such as `pk_test_fixture` would make these assertions pass for the wrong reason.
 */
const FICTIONAL_PUBLISHABLE_KEY = 'pk_test_' + btoa('fixture.clerk.accounts.dev$')

function environment(): ClerkEnvironment {
  return {
    VITE_CLERK_PUBLISHABLE_KEY: FICTIONAL_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: 'sk_test_fixture',
  }
}

describe('Telemetry boundary', () => {
  /**
   * This control deliberately leaves telemetry at its default so the opt-out assertion
   * below cannot pass by accident. Constructing an enabled collector makes Clerk print
   * its one-time development telemetry notice, so those lines are expected in test
   * output and do not mean the application collects telemetry.
   */
  it('confirms Clerk would collect telemetry without an explicit opt-out', () => {
    const client = createClerkClient({
      publishableKey: FICTIONAL_PUBLISHABLE_KEY,
      secretKey: 'sk_test_fixture',
    })

    expect(client.telemetry.isEnabled).toBe(true)
  })

  it('disables Clerk telemetry collection in the Worker', () => {
    const client = createClerkClient(clerkClientOptions(environment()))

    expect(client.telemetry.isEnabled).toBe(false)
  })

  it('disables Clerk telemetry collection in the browser application', () => {
    expect(BROWSER_CLERK_TELEMETRY).toBe(false)
  })
})
