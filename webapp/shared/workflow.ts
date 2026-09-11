import { buildMonthArchive, isMonthArchive, type HouseholdArchiveBundle, type MonthArchive, type SharedExport } from './formats'
import { centsToDollars, dollarsToCents } from './money'

export type WorkflowStatus =
  | 'draft'
  | 'ready'
  | 'submitted'
  | 'replaced'
  | 'withdrawn'
  | 'partner-ready'
  | 'stale'
  | 'closing'
  | 'retryable-error'
  | 'closed'

export interface WorkflowSubmission {
  projection: SharedExport
  version: number
  submittedAt: string
}

export interface PeriodWorkflow {
  period: string
  status: WorkflowStatus
  version: number
  mine: WorkflowSubmission | null
  partner: WorkflowSubmission | null
  staleReason?: string
  errorMessage?: string
  archive?: MonthArchive
}

export interface SubmissionCommand {
  projection: SharedExport
  expectedVersion: number | null
}

/**
 * The only product-workflow vocabulary React may call. Batch 5 implements it in the
 * browser with fictional local state; Batch 6 can replace that adapter with authorized
 * HTTP calls without giving the API a private ledger.
 */
export interface WorkflowGateway {
  getPeriodStatus(period: string): Promise<PeriodWorkflow>
  submit(command: SubmissionCommand): Promise<PeriodWorkflow>
  replace(command: SubmissionCommand & { expectedVersion: number }): Promise<PeriodWorkflow>
  withdraw(period: string, expectedVersion: number): Promise<PeriodWorkflow>
  close(period: string, expectedVersion: number): Promise<PeriodWorkflow>
}

export interface WorkflowExportReceipt {
  bundle: HouseholdArchiveBundle
  deletionToken: string
  openPeriods: string[]
}

export interface WorkflowRestoreResult { restoredPeriods: number }
export interface WorkflowDeleteResult { deletedPeriods: number }
export interface WorkflowCapabilities { canAdministerSharedHistory: boolean }
export interface WorkflowCancelResult { cancelledPeriod: string }

export interface WorkflowAdministrationGateway {
  getCapabilities(): Promise<WorkflowCapabilities>
  exportClosedArchives(): Promise<WorkflowExportReceipt>
  restoreClosedArchives(bundle: HouseholdArchiveBundle): Promise<WorkflowRestoreResult>
  deleteSharedHistory(deletionToken: string, confirmation: string): Promise<WorkflowDeleteResult>
  cancelAbandonedPeriod(period: string, confirmation: string): Promise<WorkflowCancelResult>
}

const EXPORT_KEYS = ['format', 'toolVersion', 'period', 'owner', 'generated', 'items', 'totals']
const ITEM_KEYS = ['date', 'merchant', 'category', 'amount', 'share', 'edited']

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every(function (key) { return allowed.includes(key) })
}

/** Runtime belt-and-braces check. The builder is the primary allowlist. */
export function isStrictSharedProjection(value: unknown): value is SharedExport {
  if (!value || typeof value !== 'object') return false
  const projection = value as Record<string, unknown>
  if (!hasOnlyKeys(projection, EXPORT_KEYS)) return false
  if (
    projection.format !== 'split-ledger/v1' ||
    typeof projection.toolVersion !== 'string' || projection.toolVersion.length > 40 ||
    typeof projection.period !== 'string' || !/^\d{4}-\d{2}$/.test(projection.period) ||
    typeof projection.owner !== 'string' || !projection.owner.trim() || projection.owner.length > 100 ||
    typeof projection.generated !== 'string' || Number.isNaN(Date.parse(projection.generated)) ||
    !Array.isArray(projection.items) ||
    projection.items.length > 5000 ||
    !projection.totals || typeof projection.totals !== 'object'
  ) return false
  const totals = projection.totals as Record<string, unknown>
  if (!hasOnlyKeys(totals, ['sharedPaidByOwner']) || typeof totals.sharedPaidByOwner !== 'number' || !Number.isFinite(totals.sharedPaidByOwner) || Math.abs(totals.sharedPaidByOwner) > 10_000_000) return false
  const validItems = projection.items.every(function (item) {
    if (!item || typeof item !== 'object') return false
    const row = item as Record<string, unknown>
    return hasOnlyKeys(row, ITEM_KEYS) &&
      typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.date.startsWith(projection.period + '-') &&
      typeof row.merchant === 'string' && !!row.merchant.trim() && row.merchant.length <= 200 &&
      typeof row.category === 'string' && row.category.length <= 100 &&
      typeof row.amount === 'number' && Number.isFinite(row.amount) && Math.abs(row.amount) <= 10_000_000 && centsToDollars(dollarsToCents(row.amount)) === row.amount &&
      typeof row.share === 'number' && Number.isFinite(row.share) && row.share >= 0 && row.share < 1 &&
      (row.edited === undefined || row.edited === true)
  })
  if (!validItems) return false
  const computedCents = projection.items.reduce(function (sum, item) { return sum + dollarsToCents((item as { amount: number }).amount) }, 0)
  return centsToDollars(computedCents) === totals.sharedPaidByOwner
}

const WORKFLOW_STATUSES = new Set<WorkflowStatus>(['draft', 'ready', 'submitted', 'replaced', 'withdrawn', 'partner-ready', 'stale', 'closing', 'retryable-error', 'closed'])

export function isPeriodWorkflow(value: unknown): value is PeriodWorkflow {
  if (!value || typeof value !== 'object') return false
  const workflow = value as Record<string, unknown>
  if (typeof workflow.period !== 'string' || !/^\d{4}-\d{2}$/.test(workflow.period)) return false
  if (typeof workflow.status !== 'string' || !WORKFLOW_STATUSES.has(workflow.status as WorkflowStatus)) return false
  if (!Number.isInteger(workflow.version) || Number(workflow.version) < 0) return false
  for (const key of ['mine', 'partner'] as const) {
    const submission = workflow[key]
    if (submission === null) continue
    if (!submission || typeof submission !== 'object') return false
    const candidate = submission as Record<string, unknown>
    if (!Number.isInteger(candidate.version) || typeof candidate.submittedAt !== 'string' || !isStrictSharedProjection(candidate.projection) || candidate.projection.period !== workflow.period) return false
  }
  if (workflow.archive !== undefined && !isMonthArchive(workflow.archive)) return false
  return true
}

export function localDraftStatus(hasRows: boolean, undecidedCount: number): 'draft' | 'ready' {
  return hasRows && undecidedCount === 0 ? 'ready' : 'draft'
}

export function emptyWorkflow(period: string): PeriodWorkflow {
  return { period, status: 'draft', version: 0, mine: null, partner: null }
}

/** generated is audit metadata; all financial and identifying projection content must match. */
export function sameProjectionContent(a: SharedExport, b: SharedExport): boolean {
  const withoutGenerated = function (value: SharedExport) {
    return { format: value.format, toolVersion: value.toolVersion, period: value.period, owner: value.owner, items: value.items, totals: value.totals }
  }
  return JSON.stringify(withoutGenerated(a)) === JSON.stringify(withoutGenerated(b))
}

export function submitTransition(
  current: PeriodWorkflow,
  projection: SharedExport,
  expectedVersion: number | null,
  now: string,
  replacement: boolean,
): PeriodWorkflow {
  if (!isStrictSharedProjection(projection) || projection.period !== current.period) {
    throw new Error('Only a valid shared projection for this period may be submitted.')
  }
  if (current.status === 'closed') throw new Error('A closed month is locked.')
  if (expectedVersion !== null && expectedVersion !== current.version) {
    return { ...current, status: 'stale', staleReason: 'The fictional workflow changed after this screen loaded.' }
  }
  const version = current.version + 1
  return {
    ...current,
    status: current.partner ? 'partner-ready' : replacement ? 'replaced' : 'submitted',
    version,
    mine: { projection, version, submittedAt: now },
    staleReason: undefined,
    errorMessage: undefined,
  }
}

export function withdrawTransition(current: PeriodWorkflow, expectedVersion: number): PeriodWorkflow {
  if (current.status === 'closed') throw new Error('A closed month is locked.')
  if (expectedVersion !== current.version) {
    return { ...current, status: 'stale', staleReason: 'Refresh before withdrawing this fictional submission.' }
  }
  return { ...current, status: 'withdrawn', version: current.version + 1, mine: null }
}

export function closeTransition(
  current: PeriodWorkflow,
  expectedVersion: number,
  now: string,
): PeriodWorkflow {
  if (current.status === 'closed') return current
  if (expectedVersion !== current.version) {
    return { ...current, status: 'stale', staleReason: 'A submission changed before close.' }
  }
  if (!current.mine || !current.partner) throw new Error('Both fictional submissions are required before close.')
  const archive = buildMonthArchive({
    toolVersion: current.mine.projection.toolVersion,
    period: current.period,
    closed: now,
    people: { a: current.mine.projection.owner, b: current.partner.projection.owner },
    mine: current.mine.projection.items,
    theirs: current.partner.projection.items,
  })
  return { ...current, status: 'closed', version: current.version + 1, archive }
}
