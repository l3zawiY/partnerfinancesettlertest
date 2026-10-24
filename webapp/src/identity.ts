import type { HouseholdPairing } from '../shared/pairing'

/**
 * The two names a screen should greet the person with.
 *
 * Once the household is paired, both names are the server-bound aliases from the pairing
 * record — never the locally typed Setup names. Those typed names are a private display
 * preference with no bearing on shared identity (see docs/WEBAPP.md, "Server-owned
 * identity and attribution"): a person could type anything there, so no screen a partner's
 * work might be judged from should show it. This falls back to the typed names only when
 * there is no pairing yet — the local fictional fixture, or before pairing completes.
 */
export function viewerAliases(
  pairing: HouseholdPairing | undefined,
  names: [string, string],
  meIndex: number,
): { me: string; partner: string } {
  const viewer = pairing?.viewer.kind === 'participant' ? pairing.viewer : null
  if (!viewer) return { me: names[meIndex] || 'Me', partner: names[meIndex === 0 ? 1 : 0] || 'Partner' }
  const partnerAlias = (viewer.role === 'coordinator' ? pairing?.partner?.alias : pairing?.coordinator?.alias) || 'Partner'
  return { me: viewer.alias, partner: partnerAlias }
}
