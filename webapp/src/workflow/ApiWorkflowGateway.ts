import {
  isWorkflowDeleteResponse,
  isWorkflowCancelResponse,
  isWorkflowCapabilitiesResponse,
  isWorkflowExportResponse,
  isWorkflowResponse,
  isWorkflowRestoreResponse,
} from '../../shared/api'
import type { HouseholdArchiveBundle } from '../../shared/formats'
import type {
  PeriodWorkflow,
  SubmissionCommand,
  WorkflowAdministrationGateway,
  WorkflowDeleteResult,
  WorkflowCancelResult,
  WorkflowCapabilities,
  WorkflowExportReceipt,
  WorkflowGateway,
  WorkflowRestoreResult,
} from '../../shared/workflow'
import { authenticatedApiRequest } from '../api'

type GetToken = () => Promise<string | null>

function message(body: unknown, fallback: string): string {
  return body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : fallback
}

export class ApiWorkflowGateway implements WorkflowGateway, WorkflowAdministrationGateway {
  private readonly known = new Map<string, PeriodWorkflow>()

  constructor(
    private readonly getToken: GetToken,
    private readonly newRequestId: () => string = function () { return crypto.randomUUID() },
  ) {}

  private remember(workflow: PeriodWorkflow): PeriodWorkflow { this.known.set(workflow.period, workflow); return workflow }

  private async mutation(path: string, method: string, body: unknown): Promise<PeriodWorkflow> {
    const result = await authenticatedApiRequest(this.getToken, path, { method, body: JSON.stringify(body) })
    if ((result.response.ok || result.response.status === 409) && isWorkflowResponse(result.body)) return this.remember(result.body.workflow)
    throw new Error(message(result.body, 'The workflow service rejected this action.'))
  }

  async getPeriodStatus(period: string): Promise<PeriodWorkflow> {
    const result = await authenticatedApiRequest(this.getToken, '/api/workflows/' + encodeURIComponent(period))
    if (!result.response.ok || !isWorkflowResponse(result.body)) throw new Error(message(result.body, 'The workflow service returned an unexpected response.'))
    return this.remember(result.body.workflow)
  }

  submit(command: SubmissionCommand): Promise<PeriodWorkflow> {
    return this.mutation('/api/workflows/' + command.projection.period + '/submission', 'POST', { ...command, requestId: this.newRequestId() })
  }

  replace(command: SubmissionCommand & { expectedVersion: number }): Promise<PeriodWorkflow> {
    return this.mutation('/api/workflows/' + command.projection.period + '/submission', 'PUT', { ...command, requestId: this.newRequestId() })
  }

  withdraw(period: string, expectedVersion: number): Promise<PeriodWorkflow> {
    return this.mutation('/api/workflows/' + period + '/submission', 'DELETE', { expectedVersion, requestId: this.newRequestId() })
  }

  async close(period: string, expectedVersion: number): Promise<PeriodWorkflow> {
    try { return await this.mutation('/api/workflows/' + period + '/close', 'POST', { expectedVersion, requestId: this.newRequestId() }) }
    catch (error) {
      const current = this.known.get(period)
      if (!current) throw error
      return this.remember({ ...current, status: 'retryable-error', errorMessage: error instanceof Error ? error.message : 'The close response was interrupted. Retry safely.' })
    }
  }

  async exportClosedArchives(): Promise<WorkflowExportReceipt> {
    const result = await authenticatedApiRequest(this.getToken, '/api/workflows/export', { method: 'POST' })
    if (!result.response.ok || !isWorkflowExportResponse(result.body)) throw new Error(message(result.body, 'The shared archive export failed.'))
    return result.body
  }

  async getCapabilities(): Promise<WorkflowCapabilities> {
    const result = await authenticatedApiRequest(this.getToken, '/api/workflows/capabilities')
    if (!result.response.ok || !isWorkflowCapabilitiesResponse(result.body)) throw new Error(message(result.body, 'Workflow permissions are unavailable.'))
    return result.body
  }

  async restoreClosedArchives(bundle: HouseholdArchiveBundle): Promise<WorkflowRestoreResult> {
    const result = await authenticatedApiRequest(this.getToken, '/api/workflows/restore', { method: 'POST', body: JSON.stringify({ bundle, requestId: this.newRequestId() }) })
    if (!result.response.ok || !isWorkflowRestoreResponse(result.body)) throw new Error(message(result.body, 'The shared archive restore failed.'))
    return result.body
  }

  async deleteSharedHistory(deletionToken: string, confirmation: string): Promise<WorkflowDeleteResult> {
    const result = await authenticatedApiRequest(this.getToken, '/api/workflows', { method: 'DELETE', body: JSON.stringify({ deletionToken, confirmation, requestId: this.newRequestId() }) })
    if (!result.response.ok || !isWorkflowDeleteResponse(result.body)) throw new Error(message(result.body, 'The shared-history deletion failed.'))
    this.known.clear()
    return result.body
  }

  async cancelAbandonedPeriod(period: string, confirmation: string): Promise<WorkflowCancelResult> {
    const result = await authenticatedApiRequest(this.getToken, '/api/workflows/cancel-abandoned', { method: 'POST', body: JSON.stringify({ period, confirmation, requestId: this.newRequestId() }) })
    if (!result.response.ok || !isWorkflowCancelResponse(result.body)) throw new Error(message(result.body, 'The abandoned period could not be cancelled.'))
    this.known.delete(period)
    return result.body
  }
}
