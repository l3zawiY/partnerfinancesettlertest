import type { LedgerRow } from './refunds'
import type { PeriodWorkflow } from './workflow'
import { sameProjectionContent } from './workflow'
import type { SharedExport } from './formats'

export interface PreCloseCheck {
  id: string
  label: string
  detail: string
  passed: boolean
}

export function preCloseChecks(input: {
  ledger: LedgerRow[]
  workflow: PeriodWorkflow
  totalsConfirmed: boolean
  currentProjection?: SharedExport
}): PreCloseCheck[] {
  const undecided = input.ledger.filter(function (row) {
    return row.amount > 0 && !row.pending && !row.decided
  }).length
  return [
    { id: 'decisions', label: 'Every posted purchase decided', detail: undecided ? undecided + ' still need a decision.' : 'Nothing remains undecided.', passed: undecided === 0 },
    { id: 'mine', label: 'Your current projection submitted', detail: input.workflow.mine ? 'Version ' + input.workflow.mine.version + ' is present.' : 'Submit from Share / Status first.', passed: !!input.workflow.mine },
    { id: 'current', label: 'Submitted projection matches this private draft', detail: input.workflow.mine && input.currentProjection && sameProjectionContent(input.workflow.mine.projection, input.currentProjection) ? 'No private decision changed after submission.' : 'Replace the submission after finishing the current private draft.', passed: !!input.workflow.mine && !!input.currentProjection && sameProjectionContent(input.workflow.mine.projection, input.currentProjection) },
    { id: 'partner', label: 'Partner projection ready', detail: input.workflow.partner ? 'The fictional partner submission is present.' : 'The fictional partner has not submitted yet.', passed: !!input.workflow.partner },
    { id: 'fresh', label: 'Submission versions reviewed', detail: input.workflow.status === 'stale' ? 'Refresh and review the changed version.' : 'No stale version is visible.', passed: input.workflow.status !== 'stale' },
    { id: 'totals', label: 'Count and net checked against bank', detail: input.totalsConfirmed ? 'Acknowledged on this device.' : 'Tick the acknowledgement after reviewing the private ledger.', passed: input.totalsConfirmed },
  ]
}

export function canClose(checks: PreCloseCheck[], workflow: PeriodWorkflow): boolean {
  return workflow.status !== 'closed' && checks.every(function (check) { return check.passed })
}
