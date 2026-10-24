/**
 * Stable two-person household pairing: the vocabulary shared by the browser and the Worker.
 *
 * Three layers must never be confused (see docs/WEBAPP.md, "Authoritative concepts"):
 *  - account identity comes from the verified Clerk user id;
 *  - the household (tenant) comes from the verified active Clerk organization id;
 *  - the financial role is a Split Ledger record binding exactly two accounts to the
 *    stable `coordinator` and `partner` roles for that household.
 *
 * Everything in this file is pure: no database, no network, no React. It carries no Clerk
 * id, email, or organization id; a pairing response is safe to show to either participant.
 */

export type ParticipantRole = 'coordinator' | 'partner'

/** Archive compatibility: the coordinator is always payer `a`, the partner payer `b`. */
export const ROLE_SLOT: Record<ParticipantRole, 'a' | 'b'> = { coordinator: 'a', partner: 'b' }

export const ALIAS_MAX_LENGTH = 40
export const HOUSEHOLD_NAME_MAX_LENGTH = 60

/** A shared alias or household name is a short human label, never an address or an id. */
function isSafeLabel(value: unknown, maxLength: number): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return false
  // "@" is refused so an email address can never become a shared identity label.
  if (trimmed.includes('@')) return false
  // Control characters have no place in a label and could hide text in a status line.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return false
  return true
}

export function isSafeAlias(value: unknown): value is string { return isSafeLabel(value, ALIAS_MAX_LENGTH) }
export function isSafeHouseholdName(value: unknown): value is string { return isSafeLabel(value, HOUSEHOLD_NAME_MAX_LENGTH) }

/** Trim and collapse internal whitespace so "Alex  " and "Alex" are the same label. */
export function normalizeLabel(value: string): string { return value.trim().replace(/\s+/g, ' ') }

/** Case-insensitive comparison used before the database enforces the same rule. */
export function sameLabel(a: string, b: string): boolean { return normalizeLabel(a).toLowerCase() === normalizeLabel(b).toLowerCase() }

export interface PairedParticipant {
  role: ParticipantRole
  alias: string
  joinedAt: string
}

export type PairingState = 'uninitialized' | 'coordinator-only' | 'paired'

/**
 * What the signed-in person is, as the server sees it. `member` means the person is in
 * the Clerk organization but is not one of the two financial participants. Once the
 * pairing is full, a member can do nothing financial here.
 */
export type PairingViewer =
  | { kind: 'participant'; role: ParticipantRole; alias: string }
  | { kind: 'member'; canInitialize: boolean; canJoinAsPartner: boolean }

export interface HouseholdPairing {
  state: PairingState
  householdName: string | null
  coordinator: PairedParticipant | null
  partner: PairedParticipant | null
  viewer: PairingViewer
  /** `2 of 2 connected` is `connected: 2`. */
  connected: 0 | 1 | 2
  /**
   * Open months that still carry pre-WEB-019 participant slots that do not map to the
   * stable roles. They fail closed until recovered; nothing is deleted or reinterpreted.
   */
  recoveryRequiredPeriods: string[]
}

export interface InitializeHouseholdRequest { householdName: string; alias: string; requestId: string }
export interface JoinHouseholdRequest { alias: string; requestId: string }
export interface HouseholdPairingResponse { pairing: HouseholdPairing }

function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every(function (key) { return keys.includes(key) })
}

function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value)
}

export function isInitializeHouseholdRequest(value: unknown): value is InitializeHouseholdRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  return onlyKeys(request, ['householdName', 'alias', 'requestId']) && isRequestId(request.requestId) &&
    isSafeHouseholdName(request.householdName) && isSafeAlias(request.alias)
}

export interface PartnerInvitationRequest { invitationId: string; requestId: string }

/** A Clerk organization invitation id; opaque, never an email address. */
export function isInvitationId(value: unknown): value is string {
  return typeof value === 'string' && /^orginv_[A-Za-z0-9]{8,64}$/.test(value)
}

export function isPartnerInvitationRequest(value: unknown): value is PartnerInvitationRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  return onlyKeys(request, ['invitationId', 'requestId']) && isRequestId(request.requestId) && isInvitationId(request.invitationId)
}

export function isJoinHouseholdRequest(value: unknown): value is JoinHouseholdRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Record<string, unknown>
  return onlyKeys(request, ['alias', 'requestId']) && isRequestId(request.requestId) && isSafeAlias(request.alias)
}

function isPairedParticipant(value: unknown): value is PairedParticipant {
  if (!value || typeof value !== 'object') return false
  const participant = value as Record<string, unknown>
  return onlyKeys(participant, ['role', 'alias', 'joinedAt']) &&
    (participant.role === 'coordinator' || participant.role === 'partner') &&
    isSafeAlias(participant.alias) &&
    typeof participant.joinedAt === 'string' && !Number.isNaN(Date.parse(participant.joinedAt))
}

function isPairingViewer(value: unknown): value is PairingViewer {
  if (!value || typeof value !== 'object') return false
  const viewer = value as Record<string, unknown>
  if (viewer.kind === 'participant') {
    return onlyKeys(viewer, ['kind', 'role', 'alias']) && (viewer.role === 'coordinator' || viewer.role === 'partner') && isSafeAlias(viewer.alias)
  }
  if (viewer.kind === 'member') {
    return onlyKeys(viewer, ['kind', 'canInitialize', 'canJoinAsPartner']) && typeof viewer.canInitialize === 'boolean' && typeof viewer.canJoinAsPartner === 'boolean'
  }
  return false
}

/**
 * Strict guard for what the browser accepts as a pairing. Beyond shape, it checks the
 * internal consistency the server promises, so a tampered or half-formed response is
 * refused rather than rendered.
 */
export function isHouseholdPairing(value: unknown): value is HouseholdPairing {
  if (!value || typeof value !== 'object') return false
  const pairing = value as Record<string, unknown>
  if (!onlyKeys(pairing, ['state', 'householdName', 'coordinator', 'partner', 'viewer', 'connected', 'recoveryRequiredPeriods'])) return false
  if (!['uninitialized', 'coordinator-only', 'paired'].includes(String(pairing.state))) return false
  if (pairing.householdName !== null && !isSafeHouseholdName(pairing.householdName)) return false
  if (pairing.coordinator !== null && !isPairedParticipant(pairing.coordinator)) return false
  if (pairing.partner !== null && !isPairedParticipant(pairing.partner)) return false
  if (!isPairingViewer(pairing.viewer)) return false
  if (![0, 1, 2].includes(Number(pairing.connected))) return false
  if (!Array.isArray(pairing.recoveryRequiredPeriods) || !pairing.recoveryRequiredPeriods.every(function (period) { return typeof period === 'string' && /^\d{4}-\d{2}$/.test(period) })) return false

  const coordinator = pairing.coordinator as PairedParticipant | null
  const partner = pairing.partner as PairedParticipant | null
  const expectedConnected = (coordinator ? 1 : 0) + (partner ? 1 : 0)
  if (pairing.connected !== expectedConnected) return false
  if (coordinator && coordinator.role !== 'coordinator') return false
  if (partner && partner.role !== 'partner') return false
  if (coordinator && partner && sameLabel(coordinator.alias, partner.alias)) return false
  const expectedState: PairingState = !coordinator ? 'uninitialized' : !partner ? 'coordinator-only' : 'paired'
  if (pairing.state !== expectedState) return false
  if (pairing.state !== 'uninitialized' && pairing.householdName === null) return false
  if (pairing.state === 'uninitialized' && (pairing.householdName !== null || partner)) return false
  return true
}

export function isHouseholdPairingResponse(value: unknown): value is HouseholdPairingResponse {
  return !!value && typeof value === 'object' && isHouseholdPairing((value as Record<string, unknown>).pairing)
}

/** The other role. */
export function otherRole(role: ParticipantRole): ParticipantRole { return role === 'coordinator' ? 'partner' : 'coordinator' }

/**
 * The only pairing vocabulary React may call. The browser never names a household id or
 * chooses a role: the server derives both from the verified session.
 */
export interface PairingGateway {
  getPairing(): Promise<HouseholdPairing>
  initialize(householdName: string, alias: string): Promise<HouseholdPairing>
  joinAsPartner(alias: string): Promise<HouseholdPairing>
  /** Tells the server which Clerk invitation is the partner invitation (WEB-022). */
  recordPartnerInvitation(invitationId: string): Promise<HouseholdPairing>
}
