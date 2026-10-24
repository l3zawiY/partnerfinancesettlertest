import { describe, expect, it } from 'vitest'
import { emptyWorkflow, type PeriodWorkflow } from '../shared/workflow'
import { fictionalPartnerProjection } from './testing/fictionalFixtures'
import { closedMessage, turnMessage } from './handover'

const SUBMISSION = { projection: fictionalPartnerProjection('2026-10'), version: 1, submittedAt: '2026-11-02T18:00:00.000Z' }
function workflow(role: 'coordinator' | 'partner', mine: boolean, partner: boolean, status: PeriodWorkflow['status'] = 'submitted'): PeriodWorkflow {
  return { ...emptyWorkflow('2026-10'), status, mine: mine ? SUBMISSION : null, partner: partner ? SUBMISSION : null, participants: { me: { role, alias: role === 'coordinator' ? 'Fictional A' : 'Fictional B' }, partner: { role: role === 'coordinator' ? 'partner' : 'coordinator', alias: role === 'coordinator' ? 'Fictional B' : 'Fictional A' } } }
}

describe('your-turn messages (WEB-034)', function () {
  it('tells the other person it is their turn, or the coordinator that the month can close', function () {
    expect(turnMessage(workflow('partner', true, false), 'https://split.example')?.body).toBe('I submitted October 2026 in Split Ledger. Your turn when you have 15 minutes: https://split.example')
    expect(turnMessage(workflow('coordinator', true, false), 'https://split.example')?.subject).toBe('Split Ledger: your turn for October 2026')
    expect(turnMessage(workflow('partner', true, true), 'https://split.example')?.body).toMatch(/Both sides are in, so you can review and close it/)
  })

  it('stays silent when nothing needs saying', function () {
    expect(turnMessage(workflow('coordinator', true, true), 'https://split.example')).toBeNull()
    expect(turnMessage(workflow('partner', false, true), 'https://split.example')).toBeNull()
    expect(turnMessage(workflow('partner', true, false, 'stale'), 'https://split.example')).toBeNull()
    expect(turnMessage(workflow('partner', true, true, 'closed'), 'https://split.example')).toBeNull()
    expect(turnMessage(emptyWorkflow('2026-10'), 'https://split.example')).toBeNull()
  })

  it('carries the settlement line after closing and nothing private', function () {
    const message = closedMessage('2026-10', 'Fictional B pays Fictional A $21.54', 'https://split.example')
    expect(message.body).toBe('October 2026 is closed in Split Ledger: Fictional B pays Fictional A $21.54. https://split.example')
  })
})
