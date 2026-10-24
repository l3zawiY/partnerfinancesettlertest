import { isHouseholdPairingResponse, type HouseholdPairing, type PairingGateway } from '../../shared/pairing'
import { authenticatedApiRequest } from '../api'

type GetToken = () => Promise<string | null>

function message(body: unknown, fallback: string): string {
  return body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : fallback
}

/**
 * Talks to the Worker's pairing routes. The request carries a bearer token and, for
 * writes, only the labels the person typed plus a request id. It never carries an email
 * address, a household id, or a role: the invitation goes through Clerk directly (only its
 * opaque id is reported afterwards), and the server decides household and role from the
 * verified session.
 */
export class ApiPairingGateway implements PairingGateway {
  constructor(
    private readonly getToken: GetToken,
    private readonly newRequestId: () => string = function () { return crypto.randomUUID() },
  ) {}

  private async call(path: string, body?: unknown): Promise<HouseholdPairing> {
    const result = await authenticatedApiRequest(this.getToken, path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) })
    if (result.response.ok && isHouseholdPairingResponse(result.body)) return result.body.pairing
    if (result.response.ok) throw new Error('The household pairing response was not understood, so it was not shown.')
    throw new Error(message(result.body, 'The household pairing service rejected this action.'))
  }

  getPairing(): Promise<HouseholdPairing> { return this.call('/api/household/pairing') }

  initialize(householdName: string, alias: string): Promise<HouseholdPairing> {
    return this.call('/api/household/pairing/initialize', { householdName, alias, requestId: this.newRequestId() })
  }

  joinAsPartner(alias: string): Promise<HouseholdPairing> {
    return this.call('/api/household/pairing/join', { alias, requestId: this.newRequestId() })
  }

  /** Sends only Clerk's opaque invitation id, never the email address (WEB-022). */
  recordPartnerInvitation(invitationId: string): Promise<HouseholdPairing> {
    return this.call('/api/household/pairing/partner-invitation', { invitationId, requestId: this.newRequestId() })
  }
}
