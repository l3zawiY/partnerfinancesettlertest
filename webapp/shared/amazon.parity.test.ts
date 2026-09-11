import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  amazonConfirmationConflict,
  amazonReviewState,
  amazonSessionContext,
  matchAmazonOrders,
  parseAmazonOrders,
  summarizeAmazonMatches,
  type AmazonCharge,
  type AmazonContext,
  type AmazonDecision,
  type AmazonMatch,
  type AmazonOrder,
} from './amazon'

interface V1Amazon {
  parseAmazonOrders: typeof parseAmazonOrders
  matchAmazonOrders: typeof matchAmazonOrders
  summarizeAmazonMatches: typeof summarizeAmazonMatches
  amazonReviewState: typeof amazonReviewState
  amazonConfirmationConflict: typeof amazonConfirmationConflict
  amazonSessionContext: typeof amazonSessionContext
}

function loadV1Amazon(): V1Amazon {
  const indexPath = fileURLToPath(new URL('../../index.html', import.meta.url))
  const html = readFileSync(indexPath, 'utf8')
  const engineStart = html.indexOf('/* ==ENGINE-START==')
  const engineEnd = html.indexOf('/* ==ENGINE-END==')
  const amazonStart = html.indexOf('/* ==AMAZON-CONTEXT-START==')
  const amazonEnd = html.indexOf('/* ==AMAZON-CONTEXT-END==')
  if ([engineStart, engineEnd, amazonStart, amazonEnd].some((position) => position === -1)) {
    throw new Error('Could not locate the engine and Amazon marker blocks in index.html.')
  }
  const source =
    html.slice(engineStart, engineEnd) + '\n' + html.slice(amazonStart, amazonEnd)
  const sandbox: Record<string, unknown> = {}
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'index.html#amazon' })
  return sandbox as unknown as V1Amazon
}

const AMAZON_PASTE = [
  '2 orders placed in',
  'Order placed',
  'July 10, 2026',
  'Total',
  '$40.37',
  'Order # 700-9000000-0000001',
  'Synthetic pantry organizer',
  'Track package',
  'Order placed',
  'July 11, 2026',
  'Total',
  '$90.83',
  'Order # 700-9000000-0000002',
  'Synthetic device purchased with instalments',
  'Purchased with monthly payments',
].join('\n')

const CHARGES: AmazonCharge[] = [
  { id: 'exact', date: '2026-07-12', family: 'amazon', amount: 40.37, pending: false },
  { id: 'monthly', date: '2026-07-12', family: 'amazon', amount: 90.83, pending: false },
  { id: 'other', date: '2026-07-12', family: null, amount: 40.37, pending: false },
]

describe('Amazon context parity against index.html', () => {
  it('parses normalized order evidence identically', () => {
    const v1 = loadV1Amazon()
    expect(parseAmazonOrders(AMAZON_PASTE)).toEqual(v1.parseAmazonOrders(AMAZON_PASTE))
  })

  it('matches charges and summarizes every result identically', () => {
    const v1 = loadV1Amazon()
    const orders = parseAmazonOrders(AMAZON_PASTE).orders
    const ported = matchAmazonOrders(CHARGES, orders)
    const original = v1.matchAmazonOrders(CHARGES, orders)
    expect(ported).toEqual(original)
    expect(summarizeAmazonMatches(ported)).toEqual(v1.summarizeAmazonMatches(original))
  })

  it('applies review decisions and one-to-one conflicts identically', () => {
    const v1 = loadV1Amazon()
    const orders = parseAmazonOrders(AMAZON_PASTE).orders
    const matches = matchAmazonOrders(CHARGES, orders)
    const decision: AmazonDecision = {
      status: 'confirmed',
      orderId: orders[0]?.orderId as string,
    }
    expect(amazonReviewState(matches[0] as AmazonMatch, orders, decision)).toEqual(
      v1.amazonReviewState(matches[0] as AmazonMatch, orders, decision),
    )
    const decisions = { otherCharge: decision }
    expect(
      amazonConfirmationConflict('exact', decision.orderId, matches, decisions),
    ).toEqual(v1.amazonConfirmationConflict('exact', decision.orderId, matches, decisions))
  })

  it('validates persisted normalized context identically and drops private extras', () => {
    const v1 = loadV1Amazon()
    const parsed = parseAmazonOrders(AMAZON_PASTE)
    const input: AmazonContext & { rawPaste?: string; matches?: AmazonMatch[] } = {
      orders: parsed.orders,
      decisions: {
        exact: { status: 'confirmed', orderId: parsed.orders[0]?.orderId as string },
        unknown: { status: 'rejected' },
      },
      advertisedOrderCount: parsed.advertisedOrderCount,
      duplicateBlocks: 0,
      invalidBlocks: 0,
      rawPaste: 'must not survive',
      matches: matchAmazonOrders(CHARGES, parsed.orders),
    }
    const ids = { exact: true }
    const ported = amazonSessionContext(input, ids)
    expect(ported).toEqual(v1.amazonSessionContext(input, ids))
    expect(JSON.stringify(ported)).not.toContain('rawPaste')
    expect(JSON.stringify(ported)).not.toContain('matches')
  })
})
