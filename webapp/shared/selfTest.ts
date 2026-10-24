import { canEditAmount, amountEdited } from './amountCorrection'
import { balanceViolations, canonicalise, coverageGap, EXCLUDE_DEFAULT, parsePaste, periodBounds, type EngineRow } from './engine'
import { buildSharedExport } from './formats'
import { claimCents } from './money'
import { pairFor, toLedgerRow, type LedgerRow } from './refunds'
import { decideMerchantGroup, ruleEligible } from './rules'
import { SELF_TEST_BMO, SELF_TEST_TD } from './selfTestFixtures'

export interface SelfTestResult { id: string; label: string; ok: boolean; actual: string; expected: string }

function fixtureRow(input: Partial<EngineRow> & { id: string; key: string; date: string; amount: number }): LedgerRow {
  return toLedgerRow({ raw: input.key, merchant: input.key, family: null, processor: null, city: null, category: 'Shopping', bank: 'generic', card: 'Fixture', balance: null, pending: false, bnpl: false, subscription: false, refund: input.amount < 0, large: false, occurrences: 1, share: null, decided: false, auto: false, pairedWith: null, ...input })
}

/**
 * WEB-029, the web equivalent of v1's Run self-test (M17). It runs the calculation engine on
 * built-in fictional statements inside this browser, with no network request and no storage
 * write, and reports each check. Ids T1–T23 mirror v1's assertions of the same id; W ids are
 * web-only checks.
 */
export function runSelfTest(): SelfTestResult[] {
  const results: SelfTestResult[] = []
  function check(id: string, label: string, actual: unknown, expected: unknown): void {
    results.push({ id, label, ok: String(actual) === String(expected), actual: String(actual), expected: String(expected) })
  }
  function guarded(id: string, label: string, run: () => [unknown, unknown]): void {
    try { const [actual, expected] = run(); check(id, label, actual, expected) }
    catch (error) { results.push({ id, label, ok: false, actual: 'error: ' + (error instanceof Error ? error.message : 'unknown'), expected: 'no error' }) }
  }
  const options = { year: 2026, today: '2026-08-06', excludes: EXCLUDE_DEFAULT, card: 'Fixture' }
  const bounds = periodBounds('2026-05')
  const inMay = function (row: { date: string }) { return row.date >= bounds.start && row.date <= bounds.end }
  const sum = function (rows: { amount: number }[]) { return +rows.reduce(function (total, row) { return total + row.amount }, 0).toFixed(2) }

  guarded('T1', 'TD statement: May row count', function () {
    const td = parsePaste(SELF_TEST_TD, 'td', options)
    return [td.rows.filter(inMay).length, 13]
  })
  const td = parsePaste(SELF_TEST_TD, 'td', options)
  const bmo = parsePaste(SELF_TEST_BMO, 'bmo', options)
  const tdMay = td.rows.filter(inMay), bmoMay = bmo.rows.filter(inMay)
  const all = tdMay.concat(bmoMay)
  check('T2', 'TD statement: May net', sum(tdMay), 341)
  check('T3', 'TD statement: credit rows', tdMay.filter(function (row) { return row.amount < 0 }).length, 2)
  check('T4', 'TD statement: no amount copied from the balance column', balanceViolations(td.rows).length, 0)
  check('T5', 'BMO statement: May row count', bmoMay.length, 8)
  check('T6', 'BMO statement: May net', sum(bmoMay), 275)
  check('T7', 'BMO statement: pending row flagged', bmoMay.filter(function (row) { return row.pending }).length, 1)
  check('T8', 'Both statements: combined rows and net', all.length + ' / ' + sum(all), '21 / 616')
  check('T9', 'TD statement: block totals reconcile', td.blocks.map(function (block) { return block.debit.toFixed(2) + '=' + (block.statedDebit || 0).toFixed(2) }).join(' '), '77.00=77.00 371.00=371.00')
  check('T10', 'Coverage: both blocks cover May', coverageGap(td.ranges, '2026-05'), null)
  check('T11', 'Coverage: one block leaves a gap', coverageGap([{ from: '2026-05-21', to: '2026-08-06' }], '2026-05') ? 'gap' : 'none', 'gap')
  const uberRaw: Record<string, true> = {}, uberFamilies: Record<string, true> = {}
  td.rows.concat(bmo.rows).filter(function (row) { return /UBER|LYFT/i.test(row.raw) }).forEach(function (row) { uberRaw[row.raw] = true; uberFamilies[row.key] = true })
  check('T12', 'Uber and Lyft descriptions group into families', Object.keys(uberRaw).length + ' -> ' + Object.keys(uberFamilies).length, '6 -> 3')
  check('T12b', 'Uber One is its own family', canonicalise('UberDirectCA_PASS', 'td').family, 'uber-one')
  check('T12c', 'Uber Eats is separate from rides', canonicalise('UBER CANADA/UBEREATS', 'td').family + '|' + canonicalise('UBER CANADA/UBERTRIP', 'td').family, 'uber-eats|uber-ride')
  check('T13', 'A repeat merchant collapses to one key', Object.keys(all.filter(function (row) { return /DELI/i.test(row.raw) }).reduce(function (keys: Record<string, true>, row) { keys[row.key] = true; return keys }, {})).length, 1)
  check('T14a', 'Merchant names: SQ * prefix removed', canonicalise('SQ *SAMPLE COFFEE Toronto ON', 'bmo').merchant, 'Sample Coffee')
  check('T14b', 'Merchant names: city captured', canonicalise('SQ *SAMPLE COFFEE Toronto ON', 'bmo').city, 'Toronto')
  check('T14c', 'Merchant names: store number removed', canonicalise('FARM BOY #99', 'td').merchant, 'Farm Boy')
  check('T14d', 'Merchant names: Amazon order id removed', canonicalise('Amazon.ca*ABC123XYZ', 'td').merchant, 'Amazon')
  check('T14e', 'Klarna marked as instalment', canonicalise('Klarna*Sample Shop Vancouver BC', 'bmo').processor, 'Klarna')

  const refundCharges = [fixtureRow({ id: 'r1', key: 'sample-store', date: '2026-05-01', amount: 100 })]
  check('T16d', 'Refunds: unique same-merchant partial refund pairs', pairFor(fixtureRow({ id: 'c1', key: 'sample-store', date: '2026-05-20', amount: -75, raw: 'REFUND' }), refundCharges).kind, 'partial')
  check('T16e', 'Refunds: ambiguous partial refund is not guessed', pairFor(fixtureRow({ id: 'c2', key: 'sample-store', date: '2026-05-20', amount: -25, raw: 'REFUND' }), refundCharges.concat([fixtureRow({ id: 'r2', key: 'sample-store', date: '2026-05-10', amount: 80 })])).kind, 'ambiguous')
  check('T16f', 'Refunds: larger than the remaining charge stays unmatched', pairFor(fixtureRow({ id: 'c3', key: 'sample-store', date: '2026-05-20', amount: -50, raw: 'REFUND' }), refundCharges, { r1: 6000 }).kind, 'unmatched')
  check('T16g', 'Refunds: cash back is not spending', pairFor(fixtureRow({ id: 'c4', key: 'card-reward', merchant: 'Card reward', date: '2026-05-20', amount: -20, raw: 'ANNUAL CASH BACK' }), refundCharges).kind, 'non-spending')
  check('T16j', 'Remembered rules never assign credits', ruleEligible({ amount: -10, bnpl: false }), false)
  check('T17a', 'Card payment excluded', td.dropped.filter(function (drop) { return /PREAUTHORIZED/i.test(drop.line) }).length, 1)
  check('T17b', 'Internal transfer excluded', bmo.dropped.filter(function (drop) { return /TRSF/i.test(drop.line) }).length, 1)
  check('T17c', 'Minimum-payment line not imported', td.rows.filter(function (row) { return /MINIMUM/i.test(row.raw) }).length, 0)
  const ids: Record<string, true> = {}
  tdMay.forEach(function (row) { ids[row.id] = true })
  check('T18', 'Re-importing the same paste adds nothing', parsePaste(SELF_TEST_TD, 'td', options).rows.filter(inMay).filter(function (row) { return !ids[row.id] }).length, 0)
  const klarna = all.find(function (row) { return row.bnpl }), plain = all.find(function (row) { return !row.bnpl })
  check('T21', 'Instalments never inherit a remembered rule', (klarna ? ruleEligible(klarna) : 'missing') + '|' + (plain ? ruleEligible(plain) : 'missing'), 'false|true')
  check('T22', 'Amount corrections allowed only from $1,000', canEditAmount({ amount: 999.99 }) + '|' + canEditAmount({ amount: 1000 }) + '|' + canEditAmount({ amount: 52, originalAmount: 3500 }), 'false|true|true')
  check('T23', 'A corrected amount is marked as edited', amountEdited({ amount: 52, originalAmount: 3500 }) + '|' + amountEdited({ amount: 52 }), 'true|false')

  guarded('W1', 'Settlement money: half cents round away from zero once per row', function () { return [claimCents(0.05, 0.5) + '|' + claimCents(100, 0.5) + '|' + claimCents(60, 0), '3|5000|6000'] })
  guarded('W2', 'Shared file carries no card label, description, or private row', function () {
    const shared = fixtureRow({ id: 's1', key: 'SAMPLE CAFE', date: '2026-05-03', amount: 12, card: 'Fixture Visa', raw: 'SQ *SAMPLE CAFE 1234', share: 0.5, decided: true })
    const privateRow = fixtureRow({ id: 's2', key: 'PRIVATE SHOP', date: '2026-05-04', amount: 30, share: 1, decided: true })
    const text = JSON.stringify(buildSharedExport({ toolVersion: 'self-test', period: '2026-05', owner: 'Fixture', txns: [shared, privateRow] }))
    return [/Fixture Visa|1234|PRIVATE SHOP|"raw"|"card"/.test(text) + '|' + /SAMPLE CAFE|Sample Cafe/i.test(text), 'false|true']
  })
  guarded('W3', 'Apply to group decides every purchase of one merchant only', function () {
    const next = decideMerchantGroup([fixtureRow({ id: 'g1', key: 'SAMPLE DELI', date: '2026-05-02', amount: 5 }), fixtureRow({ id: 'g2', key: 'SAMPLE DELI', date: '2026-05-04', amount: 5 }), fixtureRow({ id: 'g3', key: 'FARM BOY', date: '2026-05-05', amount: 60 })], 'SAMPLE DELI', 0.5)
    return [next.map(function (row) { return row.decided ? row.share : 'open' }).join('|'), '0.5|0.5|open']
  })
  return results
}
