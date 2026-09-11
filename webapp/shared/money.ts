/**
 * Split Ledger monetary policy.
 *
 * External formats keep decimal-dollar fields for v1 compatibility, but calculations
 * cross this boundary once and then use integer cents. Exact half cents are rounded
 * away from zero. Each item's claim is rounded once; rounded claims are then summed.
 */
export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Money must be finite.')
  const absolute = Math.abs(value)
  const rounded = Math.floor(absolute + 0.5 + Number.EPSILON * Math.max(1, absolute) * 4)
  return value < 0 ? -rounded : rounded
}

export function dollarsToCents(value: number): number {
  return roundHalfAwayFromZero(value * 100)
}

export function centsToDollars(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('Cents must be a safe integer.')
  return value / 100
}

export function claimCents(amount: number, payerShare: number): number {
  if (!Number.isFinite(payerShare) || payerShare < 0 || payerShare > 1) {
    throw new Error('Payer share must be between zero and one.')
  }
  return roundHalfAwayFromZero(dollarsToCents(amount) * (1 - payerShare))
}
