import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { parsePaste } from './engine'
import { toLedgerRow } from './refunds'
import {
  amountEdited,
  canEditAmount,
  correctLedgerAmount,
} from './amountCorrection'

function loadV1AmountPolicy(): {
  canEditAmount: typeof canEditAmount
  amountEdited: typeof amountEdited
} {
  const indexPath = fileURLToPath(new URL('../../index.html', import.meta.url))
  const html = readFileSync(indexPath, 'utf8')
  const start = html.indexOf('var EDIT_MIN = 1000;')
  const end = html.indexOf('/* Interactive QA samples')
  if (start === -1 || end === -1) throw new Error('Could not locate amount policy in index.html.')
  const sandbox: Record<string, unknown> = {}
  vm.createContext(sandbox)
  vm.runInContext(html.slice(start, end), sandbox, { filename: 'index.html#amount-policy' })
  return sandbox as unknown as {
    canEditAmount: typeof canEditAmount
    amountEdited: typeof amountEdited
  }
}

describe('amount correction', () => {
  it('matches v1 correction eligibility and edited-state behavior', () => {
    const v1 = loadV1AmountPolicy()
    const rows = [
      { amount: 999.99 },
      { amount: 1000 },
      { amount: 52, originalAmount: 3500 },
    ]
    expect(rows.map(canEditAmount)).toEqual(rows.map(v1.canEditAmount))
    expect(rows.map(amountEdited)).toEqual(rows.map(v1.amountEdited))
  })

  it('keeps the stable id and original amount, then reruns refund pairing', () => {
    const row = toLedgerRow(
      parsePaste('2026-07-10\tSYNTHETIC LARGE PURCHASE\t$3,500.00', 'generic', {
        year: 2026,
        today: '2026-08-01',
        card: 'Sample card',
        excludes: [],
      }).rows[0]!,
    )
    const corrected = correctLedgerAmount([row], row.id, 52)[0]!
    expect(corrected.id).toBe(row.id)
    expect(corrected.originalAmount).toBe(3500)
    expect(corrected.amount).toBe(52)
    expect(corrected.large).toBe(false)
  })

  it('rejects zero and non-finite correction values', () => {
    expect(() => correctLedgerAmount([], 'missing', 0)).toThrow()
    expect(() => correctLedgerAmount([], 'missing', Number.NaN)).toThrow()
  })
})
