/**
 * Typed port of the pure code inside index.html's AMAZON-CONTEXT markers. Amazon
 * context is private evidence: these functions never choose a share, alter a ledger
 * row, or make a network request.
 */

import { parseDate, parseMoney } from './engine'

export interface AmazonOrder {
  orderId: string
  orderDate: string
  total: number
  products: string[]
  monthlyPayments: boolean
  subscription: boolean
}

export interface ParsedAmazonOrders {
  orders: AmazonOrder[]
  invalidBlocks: number
  duplicateBlocks: number
  advertisedOrderCount: number | null
}

export type AmazonMatchKind = 'exact' | 'ambiguous' | 'split-order' | 'instalment' | 'unmatched'

export interface AmazonMatch {
  txnId: string
  kind: AmazonMatchKind
  orderIds: string[]
  evidence: string
}

export type AmazonDecision =
  | { status: 'rejected' }
  | { status: 'confirmed'; orderId: string }

export interface AmazonContext {
  orders: AmazonOrder[]
  decisions: Record<string, AmazonDecision>
  advertisedOrderCount: number | null
  duplicateBlocks: number
  invalidBlocks: number
}

export interface AmazonCharge {
  id: string
  date: string
  family: string | null
  amount: number
  pending: boolean
}

export interface AmazonReviewState {
  kind: AmazonMatchKind | 'confirmed' | 'rejected'
  orders: AmazonOrder[]
  evidence: string
}

function amazonNoiseLine(line: string): boolean {
  return (
    /^(Your Orders|Search all orders|Search Orders|Orders Buy Again Not Yet Shipped|View transactions|View order details(?:\s+Invoice)?|Invoice|Buy it again|View your item|Get product support|Track package|Return items.*|Return or replace items.*|Share gift receipt|Leave seller feedback|Write a product review|Ask a Product-Related Question|View your Subscribe & Save|Problem with order|Email delivery)$/i.test(
      line,
    ) ||
    /^(Delivered\b|Package was\b|Return window closed\b|\d+ orders placed in\b|past 3 months$|[0-9]+$|←?Previous[\\]*$|Next→?[\\]*$)/i.test(
      line,
    ) ||
    /^[\\]+$/.test(line)
  )
}

function amazonTitleKey(title: string): string {
  return String(title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function addAmazonTitle(products: string[], title: string): void {
  const key = amazonTitleKey(title)
  if (!key) return
  for (let i = 0; i < products.length; i++) {
    if (amazonTitleKey(products[i] as string) === key) return
  }
  if (products.length) {
    const last = products.length - 1
    const prevKey = amazonTitleKey(products[last] as string)
    if (
      Math.min(prevKey.length, key.length) >= 20 &&
      (prevKey.indexOf(key) === 0 || key.indexOf(prevKey) === 0)
    ) {
      if (key.length > prevKey.length) products[last] = title
      return
    }
  }
  products.push(title)
}

function parseAmazonOrderBlock(lines: string[]): AmazonOrder | null {
  let orderDate: string | null = null
  let total: number | null = null
  let orderId: string | null = null
  let orderAt = -1
  let monthlyPayments = false
  let subscription = false
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] as string
    if (!orderDate) orderDate = parseDate(line)
    if (/^Total$/i.test(line) && i + 1 < lines.length) {
      const money = parseMoney(lines[i + 1])
      if (money) total = money.value
    }
    const id = line.match(/^Order\s*#\s*(\d{3}-\d{7}-\d{7})$/i)
    if (id) {
      orderId = id[1] as string
      orderAt = i
    }
    if (/^Purchased with monthly payments\b/i.test(line)) monthlyPayments = true
    if (/^Auto-delivered:/i.test(line)) subscription = true
  }
  if (!orderDate || total === null || !orderId) return null

  const products: string[] = []
  for (let j = orderAt + 1; j < lines.length; j++) {
    const candidate = lines[j] as string
    if (
      !candidate ||
      amazonNoiseLine(candidate) ||
      /^Purchased with monthly payments\b/i.test(candidate) ||
      /^Auto-delivered:/i.test(candidate) ||
      /^Order\s*#/i.test(candidate) ||
      /^Total$/i.test(candidate) ||
      parseMoney(candidate) ||
      parseDate(candidate)
    )
      continue
    addAmazonTitle(products, candidate)
  }
  return { orderId, orderDate, total, products, monthlyPayments, subscription }
}

export function parseAmazonOrders(text: string): ParsedAmazonOrders {
  const source = String(text || '').replace(/\r/g, '')
  const advertised = source.match(/(\d[\d,]*)\s+orders placed in/i)
  const advertisedOrderCount = advertised
    ? parseInt((advertised[1] as string).replace(/,/g, ''), 10)
    : null
  const raw = source.split('\n')
  const lines = raw.map(function (line) {
    return line.replace(/\s+/g, ' ').trim()
  })
  const blocks: string[][] = []
  let current: string[] | null = null
  lines.forEach(function (line) {
    if (/^Order placed$/i.test(line)) {
      if (current) blocks.push(current)
      current = [line]
    } else if (current) current.push(line)
  })
  if (current) blocks.push(current)

  const orders: AmazonOrder[] = []
  const byId: Record<string, AmazonOrder> = {}
  let invalidBlocks = 0
  let duplicateBlocks = 0
  blocks.forEach(function (block) {
    const order = parseAmazonOrderBlock(block)
    if (!order) {
      invalidBlocks++
      return
    }
    const existing = byId[order.orderId]
    if (existing) {
      duplicateBlocks++
      order.products.forEach(function (title) {
        addAmazonTitle(existing.products, title)
      })
      existing.monthlyPayments = existing.monthlyPayments || order.monthlyPayments
      existing.subscription = existing.subscription || order.subscription
      return
    }
    byId[order.orderId] = order
    orders.push(order)
  })
  return { orders, invalidBlocks, duplicateBlocks, advertisedOrderCount }
}

export function amazonPasteMayBeIncomplete(parsed: ParsedAmazonOrders): boolean {
  return (
    parsed.advertisedOrderCount !== null && parsed.advertisedOrderCount > parsed.orders.length
  )
}

export const AMAZON_MATCH_WINDOW_DAYS = 7

function amazonCents(amount: number): number {
  return Math.round(Number(amount) * 100)
}

function amazonDayGap(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86400000
}

export function isAmazonCharge(t: AmazonCharge | null | undefined): boolean {
  return !!t && t.family === 'amazon' && t.amount > 0 && !t.pending
}

function amazonResult(
  t: AmazonCharge,
  kind: AmazonMatchKind,
  orderIds: string[],
  evidence: string,
): AmazonMatch {
  return { txnId: t.id, kind, orderIds: orderIds || [], evidence }
}

/** Suggestions carry evidence but never alter transactions or orders. */
export function matchAmazonOrders(
  txns: AmazonCharge[],
  orders: AmazonOrder[],
  opts?: { windowDays?: number },
): AmazonMatch[] {
  const windowDays = opts && typeof opts.windowDays === 'number' ? opts.windowDays : AMAZON_MATCH_WINDOW_DAYS
  const charges = txns.filter(isAmazonCharge)
  const regular = orders.filter(function (o) {
    return !o.monthlyPayments
  })
  const monthly = orders.filter(function (o) {
    return o.monthlyPayments
  })
  const results: Record<string, AmazonMatch> = {}
  const exactCandidates: Record<string, AmazonOrder[]> = {}
  const claims: Record<string, number> = {}

  charges.forEach(function (t) {
    const candidates = regular.filter(function (o) {
      return amazonCents(o.total) === amazonCents(t.amount) && amazonDayGap(o.orderDate, t.date) <= windowDays
    })
    exactCandidates[t.id] = candidates
    candidates.forEach(function (o) {
      claims[o.orderId] = (claims[o.orderId] || 0) + 1
    })
  })

  charges.forEach(function (t) {
    const candidates = exactCandidates[t.id] as AmazonOrder[]
    if (candidates.length === 1 && claims[(candidates[0] as AmazonOrder).orderId] === 1) {
      results[t.id] = amazonResult(
        t,
        'exact',
        [(candidates[0] as AmazonOrder).orderId],
        'Exact amount; order date is within ' + windowDays + ' days.',
      )
    } else if (candidates.length) {
      const relatedCharges = charges.filter(function (other) {
        return (exactCandidates[other.id] as AmazonOrder[]).some(function (otherOrder) {
          return candidates.some(function (candidate) {
            return candidate.orderId === otherOrder.orderId
          })
        })
      }).length
      results[t.id] = amazonResult(
        t,
        'ambiguous',
        candidates.map(function (o) {
          return o.orderId
        }),
        candidates.length +
          ' Amazon orders and ' +
          relatedCharges +
          ' bank charges share this exact amount within the date window. Compare their dates and products.',
      )
    } else {
      const instalments = monthly.filter(function (o) {
        return amazonCents(o.total) === amazonCents(t.amount) && amazonDayGap(o.orderDate, t.date) <= windowDays
      })
      results[t.id] = instalments.length
        ? amazonResult(
            t,
            'instalment',
            instalments.map(function (o) {
              return o.orderId
            }),
            'The equal-total order is marked as purchased with monthly payments.',
          )
        : amazonResult(t, 'unmatched', [], 'No reliable Amazon order candidate was found.')
    }
  })

  const usedOrders: Record<string, boolean> = {}
  Object.keys(results).forEach(function (id) {
    const result = results[id] as AmazonMatch
    if (result.kind === 'exact') usedOrders[result.orderIds[0] as string] = true
  })
  const openCharges = charges.filter(function (t) {
    return (results[t.id] as AmazonMatch).kind === 'unmatched'
  })
  const combos: { order: AmazonOrder; charges: AmazonCharge[] }[] = []
  regular
    .filter(function (o) {
      return !usedOrders[o.orderId]
    })
    .forEach(function (o) {
      const near = openCharges.filter(function (t) {
        return amazonDayGap(o.orderDate, t.date) <= windowDays
      })
      for (let a = 0; a < near.length; a++)
        for (let b = a + 1; b < near.length; b++) {
          if (
            amazonCents((near[a] as AmazonCharge).amount) +
              amazonCents((near[b] as AmazonCharge).amount) ===
            amazonCents(o.total)
          )
            combos.push({ order: o, charges: [near[a] as AmazonCharge, near[b] as AmazonCharge] })
          for (let c = b + 1; c < near.length; c++) {
            if (
              amazonCents((near[a] as AmazonCharge).amount) +
                amazonCents((near[b] as AmazonCharge).amount) +
                amazonCents((near[c] as AmazonCharge).amount) ===
              amazonCents(o.total)
            )
              combos.push({
                order: o,
                charges: [near[a] as AmazonCharge, near[b] as AmazonCharge, near[c] as AmazonCharge],
              })
          }
        }
    })

  const comboUses: Record<string, string[]> = {}
  const orderCombos: Record<string, number> = {}
  combos.forEach(function (combo) {
    orderCombos[combo.order.orderId] = (orderCombos[combo.order.orderId] || 0) + 1
    combo.charges.forEach(function (t) {
      comboUses[t.id] = comboUses[t.id] || []
      if ((comboUses[t.id] as string[]).indexOf(combo.order.orderId) === -1)
        (comboUses[t.id] as string[]).push(combo.order.orderId)
    })
  })
  combos.forEach(function (combo) {
    const unique =
      orderCombos[combo.order.orderId] === 1 &&
      combo.charges.every(function (t) {
        return (comboUses[t.id] as string[]).length === 1
      })
    combo.charges.forEach(function (t) {
      if (unique) {
        results[t.id] = amazonResult(
          t,
          'split-order',
          [combo.order.orderId],
          combo.charges.length +
            ' nearby charges add exactly to one order total; products are not allocated to a charge.',
        )
      } else if ((results[t.id] as AmazonMatch).kind === 'unmatched') {
        results[t.id] = amazonResult(
          t,
          'ambiguous',
          comboUses[t.id] as string[],
          'More than one split-order combination is possible.',
        )
      }
    })
  })

  return charges.map(function (t) {
    return results[t.id] as AmazonMatch
  })
}

export function summarizeAmazonMatches(matches: AmazonMatch[]) {
  const out = { total: matches.length, exact: 0, ambiguous: 0, splitOrder: 0, instalment: 0, unmatched: 0 }
  matches.forEach(function (m) {
    if (m.kind === 'split-order') out.splitOrder++
    else out[m.kind]++
  })
  return out
}

export function amazonReviewState(
  match: AmazonMatch | null,
  orders: AmazonOrder[],
  decision?: AmazonDecision,
): AmazonReviewState | null {
  if (!match) return null
  if (decision && decision.status === 'rejected')
    return { kind: 'rejected', orders: [], evidence: 'Suggestion rejected.' }
  const byId: Record<string, AmazonOrder> = {}
  orders.forEach(function (o) {
    byId[o.orderId] = o
  })
  if (decision && decision.status === 'confirmed' && byId[decision.orderId]) {
    return { kind: 'confirmed', orders: [byId[decision.orderId] as AmazonOrder], evidence: 'Confirmed by you.' }
  }
  return {
    kind: match.kind,
    orders: match.orderIds
      .map(function (id) {
        return byId[id]
      })
      .filter(function (order): order is AmazonOrder {
        return !!order
      }),
    evidence: match.evidence,
  }
}

export function amazonConfirmationConflict(
  txnId: string,
  orderId: string,
  matches: AmazonMatch[],
  decisions: Record<string, AmazonDecision>,
): boolean {
  const current =
    matches.filter(function (m) {
      return m.txnId === txnId
    })[0] || null
  let conflict = false
  Object.keys(decisions || {}).forEach(function (otherTxnId) {
    const decision = decisions[otherTxnId]
    if (
      conflict ||
      otherTxnId === txnId ||
      !decision ||
      decision.status !== 'confirmed' ||
      decision.orderId !== orderId
    )
      return
    const other =
      matches.filter(function (m) {
        return m.txnId === otherTxnId
      })[0] || null
    if (!current || !other || current.kind !== 'split-order' || other.kind !== 'split-order')
      conflict = true
  })
  return conflict
}

function amazonSessionCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

/** Allowlist and validate the normalized context stored in a private session. */
export function amazonSessionContext(
  input: unknown,
  validTxnIds?: Record<string, boolean>,
): AmazonContext {
  const empty: AmazonContext = {
    orders: [],
    decisions: {},
    advertisedOrderCount: null,
    duplicateBlocks: 0,
    invalidBlocks: 0,
  }
  if (!input || typeof input !== 'object') return empty
  const source = input as Record<string, unknown>
  const orders: AmazonOrder[] = []
  const byId: Record<string, AmazonOrder> = {}
  ;(Array.isArray(source.orders) ? source.orders : []).forEach(function (value) {
    if (!value || typeof value !== 'object') return
    const order = value as Record<string, unknown>
    if (
      !/^\d{3}-\d{7}-\d{7}$/.test(typeof order.orderId === 'string' ? order.orderId : '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(typeof order.orderDate === 'string' ? order.orderDate : '') ||
      Number.isNaN(Date.parse(order.orderDate as string)) ||
      typeof order.total !== 'number' ||
      !Number.isFinite(order.total) ||
      order.total < 0 ||
      !Array.isArray(order.products) ||
      byId[order.orderId as string]
    )
      return
    const products = order.products
      .filter(function (title) {
        return typeof title === 'string' && !!title.trim()
      })
      .map(function (title) {
        return (title as string).trim()
      })
    if (products.length !== order.products.length) return
    const clean: AmazonOrder = {
      orderId: order.orderId as string,
      orderDate: order.orderDate as string,
      total: +order.total.toFixed(2),
      products,
      monthlyPayments: order.monthlyPayments === true,
      subscription: order.subscription === true,
    }
    byId[clean.orderId] = clean
    orders.push(clean)
  })
  const decisions: Record<string, AmazonDecision> = {}
  const sourceDecisions =
    source.decisions && typeof source.decisions === 'object'
      ? (source.decisions as Record<string, unknown>)
      : {}
  Object.keys(sourceDecisions).forEach(function (txnId) {
    const value = sourceDecisions[txnId]
    if (!value || typeof value !== 'object' || (validTxnIds && !validTxnIds[txnId])) return
    const decision = value as Record<string, unknown>
    if (decision.status === 'rejected') decisions[txnId] = { status: 'rejected' }
    else if (
      decision.status === 'confirmed' &&
      typeof decision.orderId === 'string' &&
      byId[decision.orderId]
    )
      decisions[txnId] = { status: 'confirmed', orderId: decision.orderId }
  })
  const advertised = source.advertisedOrderCount
  return {
    orders,
    decisions,
    advertisedOrderCount:
      advertised === null
        ? null
        : typeof advertised === 'number' && Number.isFinite(advertised) && advertised >= 0
          ? Math.floor(advertised)
          : null,
    duplicateBlocks: amazonSessionCount(source.duplicateBlocks),
    invalidBlocks: amazonSessionCount(source.invalidBlocks),
  }
}
