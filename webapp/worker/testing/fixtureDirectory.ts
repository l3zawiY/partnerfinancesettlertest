import type { ClerkDirectory } from '../auth'

export interface FixtureInvitation { organizationId: string; emailAddress: string; status: string }

/** A fictional stand-in for Clerk's invitation and email lookups (WEB-022 tests). */
export function fixtureDirectory(input: { invitations?: Record<string, FixtureInvitation>; emails?: Record<string, string[]> } = {}): ClerkDirectory {
  const invitations = input.invitations || {}
  const emails = input.emails || {}
  return {
    async organizationInvitation(_environment, organizationId, invitationId) {
      const invitation = invitations[invitationId]
      return invitation && invitation.organizationId === organizationId ? { emailAddress: invitation.emailAddress, status: invitation.status } : null
    },
    async verifiedEmails(_environment, userId) { return (emails[userId] || []).map(function (address) { return address.toLowerCase() }) },
  }
}

export const FIXTURE_PARTNER_INVITATION = 'orginv_fixturepartner01'
