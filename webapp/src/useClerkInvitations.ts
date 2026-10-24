import { useOrganization } from '@clerk/react'
import { useMemo } from 'react'
import type { InvitationSurface } from './HouseholdPairingScreen'

/**
 * Thin bridge from Clerk's organization invitations to the pairing screen. The email
 * address is sent to Clerk by the browser and never to the Split Ledger Worker; pending
 * invitations are read back from Clerk, not stored here.
 */
export function useClerkInvitations(): InvitationSurface | undefined {
  // Clerk lets only administrators list invitations; a member's request is refused with 403.
  const { membership } = useOrganization()
  const canListInvitations = membership?.role === 'org:admin'
  const { organization, invitations } = useOrganization({ invitations: canListInvitations ? { status: ['pending'] } : undefined })
  return useMemo(function () {
    if (!organization) return undefined
    return {
      async invite(emailAddress: string) {
        await organization.inviteMember({ emailAddress, role: 'org:member' })
        if (invitations?.revalidate) await invitations.revalidate()
      },
      pending: (invitations?.data || []).map(function (invitation) { return { id: invitation.id, emailAddress: invitation.emailAddress, status: invitation.status } }),
      async refresh() { if (invitations?.revalidate) await invitations.revalidate() },
    }
  }, [organization, invitations])
}
