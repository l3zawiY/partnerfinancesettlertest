// Who visited the public page: sorts Cloudflare's request groups into people, known robots,
// and scanners or other automated traffic, and adds them up for the tiles, chart, and tables.
// Pure functions; the rules are a best judgement from what Cloudflare reports, not a proof.

export const TRAFFIC_RANGES = { '24h': 1, '7d': 7 } as const
export type TrafficRange = keyof typeof TRAFFIC_RANGES

export type Kind = 'people' | 'robots' | 'automated' | 'agent'
export const KINDS: Kind[] = ['people', 'robots', 'automated', 'agent']
export const KIND_LABELS: Record<Kind, string> = { people: 'People', robots: 'Known robots', automated: 'Scanners and other automated', agent: 'Claude’s checks' }

/** Claude's own checks name themselves with this user agent from 2026-10-26 on. */
export const AGENT_USER_AGENT = 'tallywithus-agent-check'
/** Before that, Claude checked with curl and Node; a few scanners use these too, so "likely". */
const LIKELY_AGENT = /^(curl\/|node$|undici)/i

/** Sorts a full user agent without keeping it: certain, likely, or not Claude's check. */
export function agentMatch(userAgent: string): 'certain' | 'likely' | '' {
  if (userAgent.includes(AGENT_USER_AGENT)) return 'certain'
  return LIKELY_AGENT.test(userAgent.trim()) ? 'likely' : ''
}

/** The public page's own files (landing/public). Anything else asked for is probing. */
export const SITE_PAGES = ['/', '/index.html']
export const SITE_FILES = [...SITE_PAGES, '/style.css', '/favicon.svg', '/fonts/inter.woff2']

/** Networks that host servers rather than homes or phones; people rarely browse from these. */
export const SERVER_NETWORKS = /amazon|aws|google|microsoft|azure|digitalocean|ovh|hetzner|linode|akamai|contabo|oracle|alibaba|tencent|huawei|vultr|choopa|constant|m247|leaseweb|datacamp|scaleway|hostinger|hosting|server|data ?cent|colocation|cloud|vps|censys|shodan|internet-measurement|stretchoid|palo alto|onyphe/i

/** One group of requests from Cloudflare, with no addresses and no full browser strings. */
export interface TrafficRow {
  hour: string
  path: string
  status: number | null
  browser: string
  network: string
  bot: string
  device: string
  country: string
  /** From agentMatch; the full user agent itself is never kept. */
  agent: 'certain' | 'likely' | ''
  requests: number
  visits: number
}

export function isRangeName(value: string | null): value is TrafficRange {
  return value !== null && Object.prototype.hasOwnProperty.call(TRAFFIC_RANGES, value)
}

function recognisedBrowser(browser: string): boolean {
  return !/^(unknown|other|)$/i.test(browser.trim())
}

export function classify(row: TrafficRow): Kind {
  if (row.agent) return 'agent'
  if (row.bot) return 'robots'
  if (!recognisedBrowser(row.browser)) return 'automated'
  if (SERVER_NETWORKS.test(row.network)) return 'automated'
  if (!SITE_FILES.includes(row.path)) return 'automated'
  if (row.status === null || row.status >= 400) return 'automated'
  return 'people'
}

/** A page a person actually saw: the page itself, delivered (not a redirect on the way). */
function isPageView(row: TrafficRow): boolean {
  return SITE_PAGES.includes(row.path) && row.status !== null && ((row.status >= 200 && row.status < 300) || row.status === 304)
}

export interface Bucket { key: string; label: string; detail: string; counts: Record<Kind, number>; peopleVisits: number }
export interface Group { label: string; detail: string; visits: number; pageViews: number; requests: number; lastHour: string }

export interface TrafficReport {
  range: TrafficRange
  /** visits = home + abroad; only home visits feed the chart and the top answer. */
  people: { visits: number; pageViews: number; home: number; abroad: number }
  requests: Record<Kind, number>
  totalRequests: number
  /** Requests counted as Claude's checks only because they came from curl or Node. */
  agentLikely: number
  serverErrors: number
  buckets: Bucket[]
  peopleGroups: Group[]
  automatedGroups: Group[]
}

const hourLabel = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', hour12: true })
const hourDetail = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', weekday: 'short', hour: 'numeric', hour12: true, timeZoneName: 'short' })
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' })
const dayLabel = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', weekday: 'short', day: 'numeric' })
const dayDetail = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', weekday: 'long', month: 'short', day: 'numeric' })

function clean(text: string): string {
  return text.replace(/\./g, '').replace(/\s+/g, ' ').trim()
}

/** Hourly buckets for 24 hours, Toronto days for 7 days; the newest bucket is last. */
export function makeBuckets(range: TrafficRange, now: Date): Bucket[] {
  const empty = () => ({ people: 0, robots: 0, automated: 0, agent: 0 })
  const hour = Math.floor(now.getTime() / 3_600_000) * 3_600_000
  if (range === '24h') {
    return Array.from({ length: 24 }, (_, index) => {
      const time = new Date(hour - (23 - index) * 3_600_000)
      return { key: time.toISOString().slice(0, 13), label: clean(hourLabel.format(time)), detail: clean(hourDetail.format(time)), counts: empty(), peopleVisits: 0 }
    })
  }
  const buckets: Bucket[] = []
  for (let time = hour - (TRAFFIC_RANGES[range] * 24 - 1) * 3_600_000; time <= hour; time += 3_600_000) {
    const key = dayKey.format(new Date(time))
    if (!buckets.length || buckets[buckets.length - 1].key !== key) {
      buckets.push({ key, label: clean(dayLabel.format(new Date(time))), detail: clean(dayDetail.format(new Date(time))), counts: empty(), peopleVisits: 0 })
    }
  }
  return buckets
}

function bucketKey(range: TrafficRange, hour: string): string {
  const time = Date.parse(hour)
  if (Number.isNaN(time)) return ''
  return range === '24h' ? new Date(time).toISOString().slice(0, 13) : dayKey.format(new Date(time))
}

function addTo(groups: Map<string, Group>, key: string, label: string, detail: string, row: TrafficRow, pageView: boolean): void {
  const group = groups.get(key) ?? { label, detail, visits: 0, pageViews: 0, requests: 0, lastHour: '' }
  group.requests += row.requests
  if (row.hour > group.lastHour) group.lastHour = row.hour
  if (pageView) {
    group.visits += row.visits
    group.pageViews += row.requests
  }
  groups.set(key, group)
}

const STATUS_WORDS: Record<string, string> = { '2': 'found', '3': 'redirected', '4': 'not found or refused', '5': 'server error' }

export function statusWord(status: number | null): string {
  if (status === null) return 'no answer'
  return `${STATUS_WORDS[String(status)[0]] ?? 'other'} (${status})`
}

export const GROUP_LIMIT = 8

/** Where the owner's audience is for now (owner decision 2026-10-26). People elsewhere are shown
 * apart: mostly automated tools running a real browser, but real visitors abroad land there too.
 * Cloudflare reports the country as a code (CA) or a name, depending on the field. */
export const HOME_COUNTRIES = ['CA', 'Canada']
export const HOME_NAME = 'Canada'

export function isHome(country: string): boolean {
  return HOME_COUNTRIES.includes(country)
}

/** The page's style and font: real browsers download them with the page; scanners skip them. */
export const PAGE_ASSETS = ['/style.css', '/fonts/inter.woff2']

function delivered(row: TrafficRow): boolean {
  return row.status !== null && ((row.status >= 200 && row.status < 300) || row.status === 304)
}

function clientKey(row: TrafficRow): string {
  return `${row.hour}|${row.browser}|${row.device}|${row.country}`
}

/**
 * How many page loads each browser group can back with a style or font download in the same
 * hour. Without the network (withheld on the free plan), this is what tells a person from a
 * scanner posing as a browser. A repeat visit that reuses the cached style is missed, so this
 * leans low rather than high.
 */
export function confirmedPages(rows: TrafficRow[]): Map<string, number> {
  const pages = new Map<string, number>()
  const assets = new Map<string, Record<string, number>>()
  for (const row of rows) {
    if (classify(row) !== 'people') continue
    const key = clientKey(row)
    if (isPageView(row)) pages.set(key, (pages.get(key) ?? 0) + row.requests)
    else if (PAGE_ASSETS.includes(row.path) && delivered(row)) {
      const counts = assets.get(key) ?? {}
      counts[row.path] = (counts[row.path] ?? 0) + row.requests
      assets.set(key, counts)
    }
  }
  const confirmed = new Map<string, number>()
  for (const [key, count] of pages) confirmed.set(key, Math.min(count, Math.max(0, ...Object.values(assets.get(key) ?? {}))))
  return confirmed
}

export function buildReport(rows: TrafficRow[], range: TrafficRange, now: Date): TrafficReport {
  const buckets = makeBuckets(range, now)
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
  const requests: Record<Kind, number> = { people: 0, robots: 0, automated: 0, agent: 0 }
  let agentLikely = 0
  const people = { visits: 0, pageViews: 0, home: 0, abroad: 0 }
  const peopleGroups = new Map<string, Group>()
  const automatedGroups = new Map<string, Group>()
  const remaining = confirmedPages(rows)
  let serverErrors = 0

  const count = (kind: Kind, row: TrafficRow, amount: number, bucket: Bucket | undefined) => {
    requests[kind] += amount
    if (bucket) bucket.counts[kind] += amount
  }

  for (const row of rows) {
    const kind = classify(row)
    const bucket = byKey.get(bucketKey(range, row.hour))
    if (row.status !== null && row.status >= 500 && SITE_FILES.includes(row.path)) serverErrors += row.requests
    if (kind === 'people' && isPageView(row)) {
      const key = clientKey(row)
      const real = Math.min(row.requests, remaining.get(key) ?? 0)
      remaining.set(key, (remaining.get(key) ?? 0) - real)
      if (real > 0) {
        count('people', row, real, bucket)
        people.visits += real
        people.pageViews += real
        if (isHome(row.country)) people.home += real
        else people.abroad += real
        if (bucket && isHome(row.country)) bucket.peopleVisits += real
        addTo(peopleGroups, `${row.device}|${row.browser}|${row.country}`, `${row.browser} on ${row.device}`, row.country, { ...row, requests: real, visits: real }, true)
      }
      if (row.requests > real) {
        const posing = { ...row, requests: row.requests - real }
        count('automated', posing, posing.requests, bucket)
        addTo(automatedGroups, `${row.path}|posing`, row.path, 'page only, never its style: a program posing as a browser', posing, false)
      }
    } else if (kind === 'people') {
      count('people', row, row.requests, bucket)
      addTo(peopleGroups, `${row.device}|${row.browser}|${row.country}`, `${row.browser} on ${row.device}`, row.country, row, false)
    } else if (kind === 'agent') {
      count('agent', row, row.requests, bucket)
      if (row.agent === 'likely') agentLikely += row.requests
    } else {
      count(kind, row, row.requests, bucket)
      // One line per address asked for: the owner needs the pattern, not every network.
      addTo(automatedGroups, row.path, row.path, SITE_FILES.includes(row.path) ? 'a real page file' : 'does not exist on the site', row, false)
    }
  }

  // A browser group that only fetched files and never a confirmed page is not listed as a person.
  for (const [key, group] of peopleGroups) if (group.pageViews === 0) peopleGroups.delete(key)

  const top = (groups: Map<string, Group>, by: (group: Group) => number) => [...groups.values()].sort((a, b) => by(b) - by(a) || a.label.localeCompare(b.label)).slice(0, GROUP_LIMIT)
  return {
    range,
    people,
    requests,
    totalRequests: requests.people + requests.robots + requests.automated + requests.agent,
    agentLikely,
    serverErrors,
    buckets,
    peopleGroups: top(peopleGroups, (group) => (isHome(group.detail) ? 1_000_000 : 0) + (group.pageViews || group.requests)),
    automatedGroups: top(automatedGroups, (group) => group.requests),
  }
}
