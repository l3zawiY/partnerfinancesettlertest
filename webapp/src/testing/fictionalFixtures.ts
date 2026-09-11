import type { SharedExport } from '../../shared/formats'

export const FICTIONAL_PERIOD = '2026-07'

export const FICTIONAL_TD = [
  'Posted Transactions2026-07-01 to 2026-07-31',
  'Date\tTransaction Description\tDebit\tCredit\tBalance\t',
  'Jul 16, 2026\tSAMPLE RESTAURANT\t146.67\t\t900.00\t',
  'Jul 18, 2026\tSAMPLE BOOK SHOP\t32.40\t\t867.60\t',
  'Jul 20, 2026\tANNUAL CASH BACK\t\t20.00\t887.60\t',
].join('\n')

export const FICTIONAL_BMO = [
  'Posted',
  'Jul 21, 2026\tSAMPLE GROCER Toronto ON\t-$84.26',
  'Jul 22, 2026\tSAMPLE PHARMACY Toronto ON\t-$18.15',
].join('\n')

export const FICTIONAL_AMAZON = [
  '1 orders placed in',
  'Order placed',
  'July 14, 2026',
  'Total',
  '$146.67',
  'Order # 000-0000000-0000000',
  'Fictional kitchen item — demonstration only',
].join('\n')

export function fictionalPartnerProjection(period = FICTIONAL_PERIOD): SharedExport {
  return {
    format: 'split-ledger/v1',
    toolVersion: '0.0.0-experiment',
    period,
    owner: 'Fictional Partner',
    generated: '2026-08-01T12:00:00.000Z',
    items: [
      { date: period + '-12', merchant: 'Fictional Hardware', category: 'Household', amount: 80, share: 0.5 },
      { date: period + '-24', merchant: 'Fictional Tickets', category: 'Entertainment', amount: 40, share: 0.3 },
    ],
    totals: { sharedPaidByOwner: 120 },
  }
}
