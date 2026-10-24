import { describe, expect, it } from 'vitest'
import { emptyWorkflow, type PeriodWorkflow } from '../shared/workflow'
import { describeEvent, endSentence } from './ShareStatusScreen'

const AT = '2026-07-31T18:48:00.000Z'
function withEvent(actorRole: 'coordinator' | 'partner'): PeriodWorkflow {
  return { ...emptyWorkflow('2026-07'), participants: { me: { role: 'partner', alias: 'Fictional B' }, partner: { role: 'coordinator', alias: 'Fictional A' } }, lastEvent: { version: 3, action: 'replace', actorRole, at: AT } }
}

describe('handover wording', function () {
  it('says "your submission" for the viewer and "their submission" for the other participant', function () {
    expect(describeEvent(withEvent('partner'))).toMatch(/^You replaced your submission \(version 3, /)
    expect(describeEvent(withEvent('coordinator'))).toMatch(/^Fictional A replaced their submission \(version 3, /)
  })

  it('ends a sentence once even when the time already ends in a period', function () {
    expect(endSentence('Last checked Jul 31, 2026, 6:48 p.m.')).toBe('Last checked Jul 31, 2026, 6:48 p.m.')
    expect(endSentence('Version 3')).toBe('Version 3.')
  })
})
