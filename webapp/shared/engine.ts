/**
 * A typed port of the pure, DOM-free parsing engine between the `==ENGINE-START==` and
 * `==ENGINE-END==` markers in `index.html` (see `canonicalise`, `parseTD`, `parseBMO`,
 * `parseGeneric`, `balanceViolations`, `mergeRanges`, `coverageGap`, and their shared
 * constants). The logic here is copied, not redesigned: every regex, ordering, and
 * comment explaining a specific bank quirk is intentionally identical to the frozen
 * original, because Batch 4's whole point is proving the browser port behaves the same
 * as v1, not improving on it.
 *
 * `webapp/shared/engine.parity.test.ts` proves this file and index.html's engine block
 * agree, by loading index.html's actual source and running both on the same fixtures —
 * so a change to either side that breaks agreement fails a test, not just a review.
 *
 * This file has no DOM access, matching the same rule index.html's engine markers follow.
 */

export interface ParseOptions {
  year: number
  today: string
  card: string
  excludes: string[]
}

export interface CanonicalInfo {
  merchant: string
  key: string
  family: string | null
  processor: string | null
  city: string | null
  category: string
}

export interface EngineRow {
  id: string
  date: string
  raw: string
  merchant: string
  key: string
  family: string | null
  processor: string | null
  city: string | null
  category: string
  amount: number
  /** Bank-parsed value retained after a deliberate manual correction. */
  originalAmount?: number
  bank: string
  card: string
  balance: number | null
  pending: boolean
  bnpl: boolean
  subscription: boolean
  refund: boolean
  large: boolean
  occurrences: number
  share: number | null
  decided: boolean
  auto: boolean
  pairedWith: string | null
}

export interface DroppedLine {
  line: string
  why: string
}

export interface TdBlock {
  from: string
  to: string
  debit: number
  credit: number
  statedDebit: number | null
  statedCredit: number | null
  count: number
}

export interface CoverageRange {
  from: string
  to: string
  inferred?: boolean
}

export interface ParseResult {
  rows: EngineRow[]
  dropped: DroppedLine[]
  blocks: TdBlock[]
  ranges: CoverageRange[]
  tabs: boolean
}

export interface MoneyMatch {
  value: number
  sign: string | null
}

export interface CoverageGap {
  from: string
  to: string
  partial?: boolean
  have?: string
}

const NOISE = [
  /^Posted Transactions/i,
  /^Transactions\s+Transaction date/i,
  /^Statement balance/i,
  /^Minimum payment/i,
  /^Total\b/i,
  /^Date$/i,
  /^Transaction Description$/i,
  /^Debit$/i,
  /^Credit$/i,
  /^Balance$/i,
  /^\s*Pending\s*$/i,
  /^\s*Posted\s*$/i,
  /^\w{3}\s+\d{1,2},\s+\d{4}\s*-\s*\w{3}\s+\d{1,2},\s+\d{4}/i,
]

export const EXCLUDE_DEFAULT = [
  'PREAUTHORIZED PAYMENT',
  'PRE-AUTHORIZED PAYMENT',
  'PAYMENT - THANK YOU',
  'PAIEMENT',
  'AUTOPAY',
  'TRSF FROM/DE',
  'TRSF TO/A',
  'TRANSFER TO',
  'TRANSFER FROM',
  'INTEREST',
  'INTERET',
  'ANNUAL FEE',
  'CASH ADVANCE',
  'BALANCE FORWARD',
  'PREVIOUS BALANCE',
  'E-TRANSFER',
  'INTERAC E-TRANSFER',
  'OVERLIMIT',
  'CREDIT LIMIT',
]

const PROCESSORS: { re: RegExp; name: string }[] = [
  { re: /^SQ\s*\*\s*/i, name: 'Square' },
  { re: /^TST[-*]\s*/i, name: 'Toast' },
  { re: /^FS\s*\*\s*/i, name: 'Fullsteam' },
  { re: /^KLARNA\s*\*\s*/i, name: 'Klarna' },
  { re: /^AMZN\s*MKTP\s*CA\s*\*\s*/i, name: 'Amazon' },
  { re: /^AMAZON\.CA\s*\*\s*/i, name: 'Amazon' },
  { re: /^HOPP\/O\/\s*/i, name: 'Hopp' },
  { re: /^PRESTO\s+APPL\/\s*/i, name: 'Presto' },
  { re: /^LS\s+(?=\S)/i, name: 'Lightspeed' },
  { re: /^SP\s+(?=\S)/i, name: 'Shopify' },
]

/* order matters — eats before the bare Uber pattern */
const FAMILIES: { re: RegExp; name: string | null; family: string | null; cat: string }[] = [
  { re: /UBEREATS|UBER\s*EATS/i, name: 'Uber Eats', family: 'uber-eats', cat: 'Food delivery' },
  { re: /UBERDIRECT|UBER\s*ONE/i, name: 'Uber One', family: 'uber-one', cat: 'Subscriptions' },
  {
    re: /UBERTRIP|UBER\s*HOLDINGS|^UBER\s*CANADA$/i,
    name: 'Uber',
    family: 'uber-ride',
    cat: 'Transport',
  },
  { re: /^LYFT/i, name: 'Lyft', family: 'lyft-ride', cat: 'Transport' },
  { re: /AMAZON|AMZN/i, name: 'Amazon', family: 'amazon', cat: 'Shopping' },
  { re: /APPLE\.COM/i, name: 'Apple', family: 'apple', cat: 'Subscriptions' },
  { re: /MICROSOFT/i, name: 'Microsoft', family: 'microsoft', cat: 'Subscriptions' },
  { re: /ANTHROPIC/i, name: 'Anthropic', family: 'anthropic', cat: 'Subscriptions' },
  { re: /OPENAI/i, name: 'OpenAI', family: 'openai', cat: 'Subscriptions' },
  { re: /SPOTIFY/i, name: 'Spotify', family: 'spotify', cat: 'Subscriptions' },
  {
    re: /DOLLARSHAVECLUB/i,
    name: 'Dollar Shave Club',
    family: 'dsc',
    cat: 'Subscriptions',
  },
  { re: /WALMART/i, name: 'Walmart', family: 'walmart', cat: 'Groceries' },
  { re: /FARM\s*BOY/i, name: 'Farm Boy', family: 'farmboy', cat: 'Groceries' },
  {
    re: /IMPACT\s*KITCHEN/i,
    name: 'Impact Kitchen',
    family: 'impact',
    cat: 'Restaurants',
  },
  { re: /CINEPLEX/i, name: 'Cineplex', family: 'cineplex', cat: 'Entertainment' },
  { re: /YUK\s*YUK|YUKYUKS/i, name: "Yuk Yuk's", family: 'yukyuks', cat: 'Entertainment' },
  { re: /WYGO/i, name: 'Wygo', family: 'wygo', cat: 'Entertainment' },
  { re: /HM\s*ONLINE|H&M/i, name: 'H&M', family: 'hm', cat: 'Shopping' },
  { re: /NEW\s*BALANCE/i, name: 'New Balance', family: 'newbalance', cat: 'Shopping' },
  {
    re: /BEANFIELD/i,
    name: 'Beanfield Fibre',
    family: 'beanfield',
    cat: 'Household',
  },
  { re: /HOME\s*DEPOT/i, name: 'Home Depot', family: 'homedepot', cat: 'Household' },
  {
    re: /SQUARE\s*ONE\s*INSURANCE/i,
    name: 'Square One Insurance',
    family: 'sqoneins',
    cat: 'Household',
  },
  { re: /PRESTO/i, name: 'Presto', family: 'presto', cat: 'Transport' },
  {
    re: /BIKE\s*SHARE/i,
    name: 'Bike Share Toronto',
    family: 'bikeshare',
    cat: 'Transport',
  },
  {
    re: /TORONTO\s*HARBOUR|CANADA\s*BOAT\s*SAFETY/i,
    name: null,
    family: null,
    cat: 'Boating',
  },
  { re: /VAPE/i, name: null, family: null, cat: 'Personal care' },
  { re: /HOPP\/O\//i, name: 'Hopp', family: 'hopp', cat: 'Uncategorised' },
]

const CATEGORIES: { re: RegExp; cat: string }[] = [
  {
    re: /METRO|RABBA|HASTY\s*MARKET|NATURES\s*EMPORIUM|DOLLARAMA|LOBLAWS|NO\s*FRILLS/i,
    cat: 'Groceries',
  },
  {
    re: /COFFEE|CAFE|GELAT|KITCHEN|SHAWARMA|CHICKEN|SUBS|BOWL|KABOB|NASHVI|COTTAGE\s*CHEESE|RENDEZVOUS|MADO|MOS\s*MOS|QISHR/i,
    cat: 'Restaurants',
  },
  { re: /EVENTBRITE|TICKET|TOURS|HIDDEN\s*RIVERS/i, cat: 'Entertainment' },
  {
    re: /WINNERS|IKEA|YVES\s*ROCHER|MR\.?\s*BIG|UPS\s*STORE|BRAND\s*MOMENTUM/i,
    cat: 'Shopping',
  },
]

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, function (c) {
      return c.toUpperCase()
    })
    .replace(/\b(Ca|Inc|Llc|Ltd)\b/g, function (m) {
      return m.toUpperCase()
    })
}

/* Explicit list, because a greedy "word before province" regex eats the merchant
   name — "SQ *NEO COFFEE BAR Toronto ON" becomes "Neo". Add cities as you meet them. */
const CITY_RE = new RegExp(
  '\\s+(NORTH YORK|SAN FRANCISCO|RICHMOND HILL|OLD TORONTO|THORNHILL|ETOBICOKE|' +
    'SCARBOROUGH|MISSISSAUGA|BRAMPTON|MARKHAM|VAUGHAN|OAKVILLE|BURLINGTON|PICKERING|AJAX|WHITBY|OSHAWA|' +
    'TORONTO|VANCOUVER|MONTREAL|CALGARY|OTTAWA|HALIFAX|WATERLOO|KITCHENER|LONDON|WINNIPEG|EDMONTON|' +
    'VICTORIA|BURNABY|RICHMOND|SURREY|LAVAL|QUEBEC|GATINEAU|HAMILTON|BARRIE|GUELPH|WINDSOR|SEATTLE)' +
    '\\s+(ON|BC|AB|QC|NS|NB|MB|SK|NL|PE|YT|NT|NU|CA|NY|WA|TX)\\s*$',
  'i',
)
const PROV_RE = /\s+(ON|BC|AB|QC|NS|NB|MB|SK|NL|PE|YT|NT|NU|CA|NY|WA|TX)\s*$/i

export function canonicalise(raw: string, bank: string): CanonicalInfo {
  const original = String(raw).replace(/\s+/g, ' ').trim()
  let s = original
  let processor: string | null = null
  let city: string | null = null

  for (const p of PROCESSORS) {
    if (p.re.test(s)) {
      processor = p.name
      s = s.replace(p.re, '')
      break
    }
  }
  if (bank === 'bmo') {
    const loc = s.match(CITY_RE)
    if (loc) {
      city = titleCase(loc[1] as string)
      s = s.slice(0, s.length - loc[0].length)
    } else {
      s = s.replace(PROV_RE, '') // unknown city: drop the province, keep the rest
    }
  }

  /* Match families and categories against the ORIGINAL text — the processor prefix
     often carries the identifying token (PRESTO APPL/, AMZN MKTP CA*). */
  let family: string | null = null
  let cat: string | null = null
  let name: string | null = null
  for (const fam of FAMILIES) {
    if (fam.re.test(original)) {
      family = fam.family
      cat = fam.cat
      if (fam.name) name = fam.name
      break
    }
  }
  if (!cat) {
    for (const c of CATEGORIES) {
      if (c.re.test(original)) {
        cat = c.cat
        break
      }
    }
  }

  const cleaned0 = s
    .replace(/[*/][A-Z0-9]{6,}\s*$/i, '') // order ids
    .replace(/#\s*\d+\s*$/, '') // store numbers
    .replace(/\s+\d{2,4}\s*$/, '') // trailing store number
    .replace(/\s+(WEB\s*QPS|SUMME|QUA)\s*$/i, '')
    .replace(/[\s\-.,*]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const cleaned = cleaned0 || s.trim()

  const display = name || titleCase(cleaned)
  return {
    merchant: display,
    key: (family || display).toUpperCase(),
    family: family,
    processor: processor,
    city: city,
    category: cat || 'Uncategorised',
  }
}

export function parseMoney(t: unknown): MoneyMatch | null {
  if (t === undefined || t === null) return null
  const s = String(t).trim()
  if (!s) return null
  const m = s.match(/^([-+])?\$?\s*([\d,]+\.\d{2})$/)
  if (!m) return null
  const v = parseFloat((m[2] as string).replace(/,/g, ''))
  return { value: v, sign: m[1] || null }
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

export function parseDate(t: unknown, fallbackYear?: number): string | null {
  const s = String(t || '').trim()
  let m = s.match(/^(20\d{2})-(\d{2})-(\d{2})$/)
  if (m) return m[1] + '-' + m[2] + '-' + m[3]
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(20\d{2})?$/)
  if (m) {
    const mo = MONTHS[(m[1] as string).slice(0, 3).toLowerCase()]
    if (mo) return pad(m[3] ? +m[3] : fallbackYear) + '-' + pad2(mo) + '-' + pad2(+(m[2] as string))
  }
  return null
}
function pad(y: number | undefined): string {
  return String(y)
}
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function isNoise(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  for (const re of NOISE) if (re.test(t)) return true
  return false
}
function matchExclusion(text: string, patterns: string[]): string | null {
  const up = text.toUpperCase()
  for (const raw of patterns) {
    const p = raw.trim()
    if (!p) continue
    if (up.indexOf(p.toUpperCase()) !== -1) return p
  }
  return null
}

/* ---- TD: Date | Description | Debit | Credit | Balance ---- */
function parseTD(text: string, opts: ParseOptions): ParseResult {
  const lines = String(text).split(/\r?\n/)
  const rows: EngineRow[] = []
  const dropped: DroppedLine[] = []
  const blocks: TdBlock[] = []
  const ranges: CoverageRange[] = []
  let block: TdBlock | null = null
  const year = opts.year

  for (const line of lines) {
    if (!line.trim()) continue

    const cov = line.match(
      /Posted Transactions\s*(\d{4}-\d{2}-\d{2})\s*(?:-|to)\s*(\d{4}-\d{2}-\d{2}|Today)/i,
    )
    if (cov) {
      const from = cov[1] as string
      const to = cov[2] as string
      ranges.push({ from, to: /today/i.test(to) ? opts.today : to })
      block = { from, to, debit: 0, credit: 0, statedDebit: null, statedCredit: null, count: 0 }
      blocks.push(block)
      dropped.push({ line: line.trim(), why: 'coverage header' })
      continue
    }

    const f = line.split('\t')
    if (/^Total\b/i.test(line.trim())) {
      if (block) {
        const td = parseMoney(f[2]) || parseMoney(f[1])
        const tc = parseMoney(f[3]) || parseMoney(f[2])
        if (td) block.statedDebit = td.value
        if (tc && tc !== td) block.statedCredit = tc.value
      }
      dropped.push({ line: line.trim(), why: 'block total' })
      continue
    }
    if (isNoise(line)) {
      dropped.push({ line: line.trim(), why: 'header / label' })
      continue
    }

    if (f.length < 4) {
      dropped.push({ line: line.trim(), why: 'no column structure' })
      continue
    }

    const date = parseDate(f[0], year)
    if (!date) {
      dropped.push({ line: line.trim(), why: 'no date in column 1' })
      continue
    }

    const debit = parseMoney(f[2])
    const credit = parseMoney(f[3])
    const balance = parseMoney(f[4])
    if (!debit && !credit) {
      dropped.push({ line: line.trim(), why: 'no amount' })
      continue
    }
    if (debit && credit) {
      dropped.push({ line: line.trim(), why: 'debit and credit both set' })
      continue
    }

    const amount = debit ? debit.value : -(credit as MoneyMatch).value
    const desc = (f[1] || '').trim()
    const ex = matchExclusion(desc, opts.excludes)
    if (block) {
      block.count++
      if (debit) block.debit += debit.value
      else block.credit += (credit as MoneyMatch).value
    }
    if (ex) {
      dropped.push({ line: desc + '  ' + (debit ? debit.value : (credit as MoneyMatch).value), why: 'excluded: ' + ex })
      continue
    }

    rows.push(makeRow(date, desc, amount, 'td', opts.card, balance ? balance.value : null, false))
  }
  return {
    rows,
    dropped,
    blocks,
    ranges,
    tabs: lines.some(function (l) {
      return l.indexOf('\t') !== -1
    }),
  }
}

/* ---- BMO: Date | Description+City | Signed amount ---- */
function parseBMO(text: string, opts: ParseOptions): ParseResult {
  const lines = String(text).split(/\r?\n/)
  const rows: EngineRow[] = []
  const dropped: DroppedLine[] = []
  let pending = false
  const year = opts.year
  let minD: string | null = null
  let maxD: string | null = null

  for (const line of lines) {
    if (!line.trim()) continue
    if (/^\s*Pending\s*$/i.test(line)) {
      pending = true
      dropped.push({ line: 'Pending', why: 'section marker' })
      continue
    }
    if (/^\s*Posted\s*$/i.test(line)) {
      pending = false
      dropped.push({ line: 'Posted', why: 'section marker' })
      continue
    }
    if (isNoise(line)) {
      dropped.push({ line: line.trim(), why: 'header / label' })
      continue
    }

    const f = line.split('\t').filter(function (x, ix) {
      return ix < 3 || x.trim() !== ''
    })
    let date: string | null
    let desc: string
    let amt: MoneyMatch

    if (f.length >= 3 && parseDate(f[0], year) && parseMoney(f[2])) {
      date = parseDate(f[0], year)
      desc = (f[1] || '').trim()
      amt = parseMoney(f[2]) as MoneyMatch
    } else {
      // fallback: sign-anchored, works when tabs are lost to spaces
      const m = line.match(/^(.*?)\s{1,}([-+])\$([\d,]+\.\d{2})\s*$/)
      if (!m) {
        dropped.push({ line: line.trim(), why: 'unparseable' })
        continue
      }
      const head = (m[1] as string).trim()
      const dm = head.match(/^([A-Za-z]{3,9}\.?\s+\d{1,2},?\s*(?:20\d{2})?)\s+(.*)$/)
      if (!dm) {
        dropped.push({ line: line.trim(), why: 'no date' })
        continue
      }
      date = parseDate(dm[1], year)
      desc = (dm[2] as string).trim()
      amt = { value: parseFloat((m[3] as string).replace(/,/g, '')), sign: m[2] as string }
      if (!date) {
        dropped.push({ line: line.trim(), why: 'no date' })
        continue
      }
    }

    const amount = amt.sign === '+' ? -amt.value : amt.value // -$ spend, +$ credit
    const ex = matchExclusion(desc, opts.excludes)
    if (ex) {
      dropped.push({ line: desc + '  ' + amt.value, why: 'excluded: ' + ex })
      continue
    }

    if (!minD || (date as string) < minD) minD = date
    if (!maxD || (date as string) > maxD) maxD = date
    rows.push(makeRow(date as string, desc, amount, 'bmo', opts.card, null, pending))
  }
  return {
    rows,
    dropped,
    blocks: [],
    ranges: minD ? [{ from: minD, to: maxD as string, inferred: true }] : [],
    tabs: true,
  }
}

/* ---- generic heuristic fallback ---- */
function parseGeneric(text: string, opts: ParseOptions): ParseResult {
  const lines = String(text).split(/\r?\n/)
  const rows: EngineRow[] = []
  const dropped: DroppedLine[] = []
  let lastDate: string | null = null
  for (const line of lines) {
    if (!line.trim()) continue
    if (isNoise(line)) {
      dropped.push({ line: line.trim(), why: 'header / label' })
      continue
    }
    const dm = line.match(/(20\d{2}-\d{2}-\d{2})|([A-Za-z]{3,9}\.?\s+\d{1,2},?\s*(?:20\d{2})?)/)
    if (dm) lastDate = parseDate((dm[1] || dm[2]) as string, opts.year) || lastDate
    const re = /(-)?\$?\s?([\d,]+\.\d{2})/g
    let m: RegExpExecArray | null
    let last: RegExpExecArray | null = null
    while ((m = re.exec(line)) !== null) last = m
    if (!last || !lastDate) {
      dropped.push({ line: line.trim(), why: 'no amount or date' })
      continue
    }
    const desc = line
      .slice(0, last.index)
      .replace(dm ? ((dm[1] || dm[2]) as string) : '', '')
      .replace(/[\t]+/g, ' ')
      .trim()
    const ex = matchExclusion(desc, opts.excludes)
    if (ex) {
      dropped.push({ line: desc, why: 'excluded: ' + ex })
      continue
    }
    const val = parseFloat((last[2] as string).replace(/,/g, '')) * (last[1] ? -1 : 1)
    rows.push(makeRow(lastDate, desc, val, 'generic', opts.card, null, false))
  }
  return { rows, dropped, blocks: [], ranges: [], tabs: false }
}

function makeRow(
  date: string,
  raw: string,
  amount: number,
  bank: string,
  card: string,
  balance: number | null,
  pending: boolean,
): EngineRow {
  const c = canonicalise(raw, bank)
  return {
    id: date + '|' + c.key + '|' + amount.toFixed(2) + '|' + card,
    date: date,
    raw: raw,
    merchant: c.merchant,
    key: c.key,
    family: c.family,
    processor: c.processor,
    city: c.city,
    category: c.category,
    amount: amount,
    bank: bank,
    card: card,
    balance: balance,
    pending: !!pending,
    bnpl: c.processor === 'Klarna',
    subscription: c.category === 'Subscriptions',
    refund: amount < 0,
    large: Math.abs(amount) >= 150,
    occurrences: 1,
    share: null,
    decided: false,
    auto: false,
    pairedWith: null,
  }
}

export function parsePaste(text: string, bank: string, opts: ParseOptions): ParseResult {
  if (bank === 'td') return parseTD(text, opts)
  if (bank === 'bmo') return parseBMO(text, opts)
  return parseGeneric(text, opts)
}

/* balance guard — an amount must never equal that row's balance */
export function balanceViolations(rows: EngineRow[]): EngineRow[] {
  return rows.filter(function (r) {
    return r.balance !== null && Math.abs(Math.abs(r.amount) - Math.abs(r.balance)) < 0.005
  })
}

export function mergeRanges(ranges: CoverageRange[]): CoverageRange[] {
  if (!ranges.length) return []
  const rs = ranges.slice().sort(function (a, b) {
    return a.from < b.from ? -1 : 1
  })
  const out: CoverageRange[] = [rs[0] as CoverageRange]
  for (let i = 1; i < rs.length; i++) {
    const last = out[out.length - 1] as CoverageRange
    const next = rs[i] as CoverageRange
    if (dayAfter(last.to) >= next.from) {
      if (next.to > last.to) last.to = next.to
    } else out.push(next)
  }
  return out
}
export function dayAfter(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
export function periodBounds(period: string): { start: string; end: string } {
  const y = +period.slice(0, 4)
  const m = +period.slice(5, 7)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { start: period + '-01', end: period + '-' + pad2(last) }
}
export function coverageGap(ranges: CoverageRange[], period: string): CoverageGap | null {
  const b = periodBounds(period)
  const merged = mergeRanges(ranges)
  for (const r of merged) {
    if (r.from <= b.start && r.to >= b.end) return null
  }
  const covered = merged.filter(function (r) {
    return r.to >= b.start && r.from <= b.end
  })
  if (!covered.length) return { from: b.start, to: b.end }
  const from = (covered[0] as CoverageRange).from > b.start ? b.start : null
  const to = (covered[covered.length - 1] as CoverageRange).to < b.end ? b.end : null
  return {
    from: from || (covered[covered.length - 1] as CoverageRange).to,
    to: to || (covered[0] as CoverageRange).from,
    partial: true,
    have: covered
      .map(function (r) {
        return r.from + '→' + r.to
      })
      .join(', '),
  }
}
