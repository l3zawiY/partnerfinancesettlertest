import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import * as ported from './engine'

/**
 * Loads index.html's actual frozen engine block and runs it in a sandbox, so this file
 * can assert the TypeScript port in engine.ts behaves identically to the real thing —
 * not to a hand-typed guess of what it should do. If either side changes in a way that
 * breaks agreement, this fails, which is the "parity fixtures against v1" the roadmap
 * calls for before Batch 4 goes further.
 */
function loadV1Engine(): typeof ported {
  const indexPath = fileURLToPath(new URL('../../index.html', import.meta.url))
  const html = readFileSync(indexPath, 'utf8')

  // The literal comment-open prefix disambiguates the real marker from the mention of
  // "==ENGINE-START==" in the file's own top-of-file documentation comment.
  const start = html.indexOf('/* ==ENGINE-START==')
  const end = html.indexOf('/* ==ENGINE-END==')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Could not locate the ENGINE-START/END markers in index.html.')
  }
  const afterStartComment = html.indexOf('*/', start) + 2
  const source = html.slice(afterStartComment, end)

  const sandbox: Record<string, unknown> = {}
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'index.html#engine' })

  return sandbox as unknown as typeof ported
}

const v1 = loadV1Engine()

const OPTS = { year: 2026, today: '2026-08-20', card: 'TD Visa', excludes: v1.EXCLUDE_DEFAULT }

const TD_FIXTURE = [
  'Posted Transactions2026-07-21 to Today',
  'Date\tTransaction Description\tDebit\tCredit\tBalance\t',
  'Jul 24, 2026\tFARM BOY #43\t84.26\t\t4137.41\t',
  'Jul 19, 2026\tANNUAL CASH BACK\t\t20.00\t4000.00\t',
  'Jul 06, 2026\tUBER CANADA/UBEREATS\t32.62\t\t4020.00\t',
  'Jul 02, 2026\tPREAUTHORIZED PAYMENT\t\t500.00\t3500.00\t',
  'Total\t\t116.88\t520.00\t\t',
].join('\n')

const BMO_FIXTURE = [
  'Transactions Transaction date sorted descending',
  'Posted',
  'Jul 21, 2026\tTST-SAMPLE RESTAURANT TORONTO ON\t-$146.67\t',
  'Jul 13, 2026\tSQ *SAMPLE COFFEE TORONTO ON\t-$8.19\t',
  'Jul 09, 2026\tANNUAL REWARDS TORONTO ON\t+$15.00\t',
  'Jul 07, 2026\tTRSF FROM/DE ACCT/CPT 1234-XXXX-999\t+$98.96\t',
].join('\n')

const GENERIC_FIXTURE = ['Jul 15, 2026 SAMPLE GENERIC MERCHANT $42.10'].join('\n')

const CANONICALISE_FIXTURES: [string, string][] = [
  ['SQ *NEO COFFEE BAR TORONTO ON', 'bmo'],
  ['AMZN MKTP CA*QAEXACT001', 'td'],
  ['UBER CANADA/UBEREATS', 'td'],
  ['TST-SAMPLE RESTAURANT TORONTO ON', 'bmo'],
  ['KLARNA*Sample Electronics TORONTO ON', 'bmo'],
  ['WALMART #4213', 'td'],
]

describe('engine parity against index.html', () => {
  it('parses TD statements identically', () => {
    expect(ported.parsePaste(TD_FIXTURE, 'td', OPTS)).toEqual(
      v1.parsePaste(TD_FIXTURE, 'td', OPTS),
    )
  })

  it('parses BMO statements identically', () => {
    expect(ported.parsePaste(BMO_FIXTURE, 'bmo', OPTS)).toEqual(
      v1.parsePaste(BMO_FIXTURE, 'bmo', OPTS),
    )
  })

  it('parses the generic fallback identically', () => {
    expect(ported.parsePaste(GENERIC_FIXTURE, 'generic', OPTS)).toEqual(
      v1.parsePaste(GENERIC_FIXTURE, 'generic', OPTS),
    )
  })

  it('canonicalises merchant descriptions identically', () => {
    for (const [raw, bank] of CANONICALISE_FIXTURES) {
      expect(ported.canonicalise(raw, bank)).toEqual(v1.canonicalise(raw, bank))
    }
  })

  it('flags balance violations identically', () => {
    const rows = ported.parsePaste(TD_FIXTURE, 'td', OPTS).rows
    // A contrived row whose amount happens to equal its own balance — the exact case the
    // refusal guard in CLAUDE.md invariant 6 exists to catch.
    const withViolation = rows.concat([{ ...(rows[0] as (typeof rows)[number]), balance: (rows[0] as (typeof rows)[number]).amount }])
    expect(ported.balanceViolations(withViolation)).toEqual(v1.balanceViolations(withViolation))
  })

  it('merges coverage ranges and finds gaps identically', () => {
    const ranges = [
      { from: '2026-06-21', to: '2026-07-20' },
      { from: '2026-07-21', to: '2026-08-20' },
      { from: '2026-09-05', to: '2026-09-20' },
    ]
    expect(ported.mergeRanges(ranges)).toEqual(v1.mergeRanges(ranges))
    expect(ported.coverageGap(ranges, '2026-07')).toEqual(v1.coverageGap(ranges, '2026-07'))
    expect(ported.coverageGap(ranges, '2026-09')).toEqual(v1.coverageGap(ranges, '2026-09'))
  })
})
