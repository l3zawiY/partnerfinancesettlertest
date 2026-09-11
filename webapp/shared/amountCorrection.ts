import { pairRefunds, type LedgerRow } from './refunds'

/** v1 deliberately exposes correction only for unusually large rows. */
export const EDIT_MIN = 1000

export function canEditAmount(t: { amount: number; originalAmount?: number }): boolean {
  return Math.abs(t.amount) >= EDIT_MIN || t.originalAmount != null
}

export function amountEdited(t: { amount: number; originalAmount?: number }): boolean {
  return t.originalAmount != null && Math.abs(t.originalAmount - t.amount) >= 0.005
}

/**
 * Correct one row without changing its id. The original bank value is retained and
 * refund pairing is recalculated because a correction may change the value or sign.
 */
export function correctLedgerAmount(
  txns: LedgerRow[],
  rowId: string,
  correctedAmount: number,
): LedgerRow[] {
  if (!Number.isFinite(correctedAmount) || Math.abs(correctedAmount) < 0.01) {
    throw new Error('Enter a non-zero amount.')
  }
  const rounded = +correctedAmount.toFixed(2)
  const next = txns.map(function (row) {
    if (row.id !== rowId || !canEditAmount(row)) return { ...row }
    return {
      ...row,
      originalAmount: row.originalAmount == null ? row.amount : row.originalAmount,
      amount: rounded,
      refund: rounded < 0,
      large: Math.abs(rounded) >= 150,
    }
  })
  return pairRefunds(next)
}
