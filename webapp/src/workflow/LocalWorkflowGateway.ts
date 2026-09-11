import { buildHouseholdArchiveBundle, type HouseholdArchiveBundle, type SharedExport } from '../../shared/formats'
import {
  closeTransition,
  emptyWorkflow,
  isStrictSharedProjection,
  submitTransition,
  withdrawTransition,
  type PeriodWorkflow,
  type SubmissionCommand,
  type WorkflowAdministrationGateway,
  type WorkflowDeleteResult,
  type WorkflowCancelResult,
  type WorkflowCapabilities,
  type WorkflowExportReceipt,
  type WorkflowGateway,
  type WorkflowRestoreResult,
} from '../../shared/workflow'

export interface FictionalWorkflowControls {
  makePartnerReady(period: string, projection: SharedExport): Promise<PeriodWorkflow>
  makeStale(period: string): Promise<PeriodWorkflow>
  recoverFromStale(period: string): Promise<PeriodWorkflow>
  failNextClose(period: string): Promise<PeriodWorkflow>
}

export function workflowStorageKey(userId: string, organizationId: string): string {
  return 'splitledger.webapp.workflow.v1.' + encodeURIComponent(userId) + '.' + encodeURIComponent(organizationId)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export class LocalWorkflowGateway implements WorkflowGateway, WorkflowAdministrationGateway, FictionalWorkflowControls {
  private records: Record<string, PeriodWorkflow> = {}
  private failClose = new Set<string>()
  private deletionToken: string | null = null

  constructor(private readonly storageKey: string, private readonly now = function () { return new Date().toISOString() }) {
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) || '{}')
      if (parsed && typeof parsed === 'object') {
        Object.entries(parsed as Record<string, unknown>).forEach(([period, value]) => {
          if (!value || typeof value !== 'object') return
          const candidate = value as PeriodWorkflow
          if (candidate.period !== period || typeof candidate.version !== 'number') return
          if (candidate.mine && !isStrictSharedProjection(candidate.mine.projection)) return
          if (candidate.partner && !isStrictSharedProjection(candidate.partner.projection)) return
          this.records[period] = clone(candidate)
        })
      }
    } catch {
      this.records = {}
    }
  }

  private read(period: string): PeriodWorkflow {
    return clone(this.records[period] || emptyWorkflow(period))
  }

  private save(value: PeriodWorkflow): PeriodWorkflow {
    this.records[value.period] = clone(value)
    window.localStorage.setItem(this.storageKey, JSON.stringify(this.records))
    return clone(value)
  }

  async getPeriodStatus(period: string): Promise<PeriodWorkflow> { return this.read(period) }

  async submit(command: SubmissionCommand): Promise<PeriodWorkflow> {
    return this.save(submitTransition(this.read(command.projection.period), command.projection, command.expectedVersion, this.now(), false))
  }

  async replace(command: SubmissionCommand & { expectedVersion: number }): Promise<PeriodWorkflow> {
    return this.save(submitTransition(this.read(command.projection.period), command.projection, command.expectedVersion, this.now(), true))
  }

  async withdraw(period: string, expectedVersion: number): Promise<PeriodWorkflow> {
    return this.save(withdrawTransition(this.read(period), expectedVersion))
  }

  async close(period: string, expectedVersion: number): Promise<PeriodWorkflow> {
    const current = this.read(period)
    if (this.failClose.delete(period)) {
      return this.save({ ...current, status: 'retryable-error', errorMessage: 'The fictional close response was interrupted. Review and retry safely.' })
    }
    return this.save(closeTransition({ ...current, status: 'closing' }, expectedVersion, this.now()))
  }

  async exportClosedArchives(): Promise<WorkflowExportReceipt> {
    const closed = Object.values(this.records).filter(function (record) { return record.status === 'closed' && record.archive }).map(function (record) { return record.archive! })
    this.deletionToken = 'fictional_delete_token'
    return { bundle: buildHouseholdArchiveBundle(closed, this.now()), deletionToken: this.deletionToken, openPeriods: Object.values(this.records).filter(function (record) { return record.status !== 'closed' }).map(function (record) { return record.period }) }
  }

  async getCapabilities(): Promise<WorkflowCapabilities> { return { canAdministerSharedHistory: true } }

  async cancelAbandonedPeriod(period: string, confirmation: string): Promise<WorkflowCancelResult> {
    if (confirmation !== 'CANCEL ABANDONED PERIOD') throw new Error('Enter the exact abandoned-period confirmation.')
    const current = this.records[period]
    if (current?.mine || current?.partner) throw new Error('Withdraw all submissions before cancelling this abandoned period.')
    if (current?.status === 'closed') throw new Error('A closed period cannot be cancelled.')
    delete this.records[period]
    window.localStorage.setItem(this.storageKey, JSON.stringify(this.records))
    return { cancelledPeriod: period }
  }

  async restoreClosedArchives(bundle: HouseholdArchiveBundle): Promise<WorkflowRestoreResult> {
    for (const archive of bundle.archives) {
      if (this.records[archive.period] && this.records[archive.period]?.status !== 'closed') throw new Error('A workflow already exists for ' + archive.period + '.')
      this.save({ period: archive.period, status: 'closed', version: 1, mine: null, partner: null, archive })
    }
    return { restoredPeriods: bundle.archives.length }
  }

  async deleteSharedHistory(deletionToken: string, confirmation: string): Promise<WorkflowDeleteResult> {
    if (deletionToken !== this.deletionToken || confirmation !== 'DELETE SHARED HISTORY') throw new Error('Export again and enter the exact confirmation before deleting.')
    if (Object.values(this.records).some(function (record) { return record.status !== 'closed' })) throw new Error('Close or withdraw every open period before deleting shared history.')
    const deletedPeriods = Object.keys(this.records).length
    this.records = {}
    window.localStorage.setItem(this.storageKey, '{}')
    this.deletionToken = null
    return { deletedPeriods }
  }

  async makePartnerReady(period: string, projection: SharedExport): Promise<PeriodWorkflow> {
    if (!isStrictSharedProjection(projection) || projection.period !== period) throw new Error('Invalid fictional partner projection.')
    const current = this.read(period)
    return this.save({ ...current, status: current.mine ? 'partner-ready' : current.status, version: current.version + 1, partner: { projection, version: current.version + 1, submittedAt: this.now() } })
  }

  async makeStale(period: string): Promise<PeriodWorkflow> {
    const current = this.read(period)
    return this.save({ ...current, status: 'stale', version: current.version + 1, staleReason: 'The fictional partner changed their submission while you were reviewing.' })
  }

  async recoverFromStale(period: string): Promise<PeriodWorkflow> {
    const current = this.read(period)
    return this.save({ ...current, status: current.mine && current.partner ? 'partner-ready' : current.mine ? 'submitted' : 'draft', staleReason: undefined })
  }

  async failNextClose(period: string): Promise<PeriodWorkflow> {
    this.failClose.add(period)
    return this.read(period)
  }
}
