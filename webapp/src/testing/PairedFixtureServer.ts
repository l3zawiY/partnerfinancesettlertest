import { buildMonthArchive, type MonthArchive, type SharedExport } from '../../shared/formats'
import type { ParticipantRole } from '../../shared/pairing'
import type { PeriodWorkflow, SubmissionCommand, WorkflowAction, WorkflowGateway, WorkflowSubmission } from '../../shared/workflow'

/**
 * A deterministic, in-memory stand-in for the paired Worker, used only by component
 * tests. One shared store is viewed by two gateways, one per stable role, so a test can
 * act as the partner in one place and as the coordinator in another and prove that both
 * see the same authoritative state. It mirrors the Worker's rules: server-bound
 * attribution, coordinator-only close, stale responses carrying the current workflow.
 */
interface StoredPeriod {
  version: number
  submissions: Partial<Record<ParticipantRole, WorkflowSubmission>>
  events: { version: number; action: WorkflowAction; actorRole: ParticipantRole; at: string }[]
  archive?: MonthArchive
  closedAt?: string
}

export const FIXTURE_ALIASES: Record<ParticipantRole, string> = { coordinator: 'Fictional A', partner: 'Fictional B' }

export class PairedFixtureServer {
  private readonly periods: Record<string, StoredPeriod> = {}
  writes = 0
  reads = 0

  constructor(private readonly now: () => string = function () { return '2026-08-01T00:00:00.000Z' }) {}

  private period(period: string): StoredPeriod {
    return this.periods[period] || (this.periods[period] = { version: 0, submissions: {}, events: [] })
  }

  private other(role: ParticipantRole): ParticipantRole { return role === 'coordinator' ? 'partner' : 'coordinator' }

  view(period: string, role: ParticipantRole): PeriodWorkflow {
    const stored = this.period(period)
    const mine = stored.submissions[role] || null
    const partner = stored.submissions[this.other(role)] || null
    const last = stored.events[stored.events.length - 1]
    const base: PeriodWorkflow = {
      period, status: 'draft', version: stored.version, mine, partner,
      participants: { me: { role, alias: FIXTURE_ALIASES[role] }, partner: { role: this.other(role), alias: FIXTURE_ALIASES[this.other(role)] } },
      lastEvent: last ? { version: last.version, action: last.action, actorRole: last.actorRole, at: last.at } : null,
    }
    if (stored.archive) return { ...base, status: 'closed', archive: stored.archive, closedBy: 'coordinator', closedAt: stored.closedAt }
    const own = stored.events.filter(function (event) { return event.actorRole === role }).pop()
    const status = mine && partner ? 'partner-ready' : mine ? own?.action === 'replace' ? 'replaced' : 'submitted' : own?.action === 'withdraw' ? 'withdrawn' : 'draft'
    return { ...base, status }
  }

  private stale(period: string, role: ParticipantRole, reason: string): PeriodWorkflow {
    return { ...this.view(period, role), status: 'stale', staleReason: reason }
  }

  private record(period: string, role: ParticipantRole, action: WorkflowAction): number {
    const stored = this.period(period)
    stored.version += 1
    stored.events.push({ version: stored.version, action, actorRole: role, at: this.now() })
    this.writes += 1
    return stored.version
  }

  as(role: ParticipantRole): WorkflowGateway {
    const server = this
    return {
      async getPeriodStatus(period) { server.reads += 1; return server.view(period, role) },
      async submit(command: SubmissionCommand) { return server.submit(role, command.projection, command.expectedVersion, 'submit') },
      async replace(command) { return server.submit(role, command.projection, command.expectedVersion, 'replace') },
      async withdraw(period, expectedVersion) {
        const stored = server.period(period)
        if (stored.archive) return server.stale(period, role, 'A closed month is locked.')
        if (expectedVersion !== stored.version) return server.stale(period, role, 'Refresh before withdrawing this submission.')
        delete stored.submissions[role]
        server.record(period, role, 'withdraw')
        return server.view(period, role)
      },
      async close(period, expectedVersion) {
        const stored = server.period(period)
        if (stored.archive) return server.view(period, role)
        if (role !== 'coordinator') throw new Error('Only the coordinator, Fictional A, can close this month.')
        if (expectedVersion !== stored.version) return server.stale(period, role, 'A submission changed before close.')
        const a = stored.submissions.coordinator
        const b = stored.submissions.partner
        if (!a || !b) throw new Error('Both household submissions are required before close.')
        stored.closedAt = server.now()
        stored.archive = buildMonthArchive({ toolVersion: 'test', period, closed: stored.closedAt, people: { a: FIXTURE_ALIASES.coordinator, b: FIXTURE_ALIASES.partner }, mine: a.projection.items, theirs: b.projection.items })
        server.record(period, role, 'close')
        return server.view(period, role)
      },
    }
  }

  submit(role: ParticipantRole, input: SharedExport, expectedVersion: number | null, action: 'submit' | 'replace'): PeriodWorkflow {
    const stored = this.period(input.period)
    if (stored.archive) return this.stale(input.period, role, 'A closed month is locked.')
    if (expectedVersion !== null && expectedVersion !== stored.version) return this.stale(input.period, role, 'The workflow changed after this screen loaded.')
    const version = this.record(input.period, role, action)
    stored.submissions[role] = { projection: { ...input, owner: FIXTURE_ALIASES[role] }, version, submittedAt: this.now() }
    return this.view(input.period, role)
  }
}
