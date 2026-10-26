// The "at a glance" verdict at the top of the page: a few plain sentences, each with what to
// do, worked out only from the numbers already on the page.

import type { DatabaseUsage, Loaded, PerWindow, WorkerCounts } from './cloudflare'
import type { LogbookName, LogbookView } from './logbook'

export type Level = 'good' | 'info' | 'watch' | 'act'
export interface HealthItem { level: Level; text: string }
export interface Health { level: Level; headline: string; items: HealthItem[] }

// Workers Free daily limits (checked 2026-10-26 in Cloudflare's pricing pages).
export const FREE_LIMITS = { workerRequestsPerDay: 100_000, d1RowsReadPerDay: 5_000_000, d1RowsWrittenPerDay: 100_000, d1StorageBytes: 5_000_000_000 }
export const WATCH_SHARE = 0.5
export const ACT_SHARE = 0.8
export const MANY_ERRORS = 5

const ORDER: Level[] = ['good', 'info', 'watch', 'act']
const HEADLINES: Record<Level, string> = { good: 'All good', info: 'All good', watch: 'Worth a look', act: 'Needs action' }

export interface HealthInput {
  logbookName: LogbookName
  logbook: Loaded<LogbookView>
  workers: Loaded<Record<string, PerWindow<WorkerCounts>>>
  databases: Loaded<DatabaseUsage[]>
}

function limitItem(what: string, used: number, limit: number, daily = true): HealthItem | null {
  const share = used / limit
  const percent = Math.round(share * 100)
  const kind = daily ? 'daily' : 'storage'
  if (share >= ACT_SHARE) return { level: 'act', text: `${what} is at ${percent}% of the free ${kind} limit. Ask Claude to look before it runs out${daily ? ' (the app would pause until the limit resets at midnight UTC)' : ''}.` }
  if (share >= WATCH_SHARE) return { level: 'watch', text: `${what} is at ${percent}% of the free ${kind} limit. Fine for now; check again ${daily ? 'tomorrow' : 'next week'}.` }
  return null
}

export function assessHealth(input: HealthInput): Health {
  const items: HealthItem[] = []
  const where = input.logbookName === 'production' ? 'the real pilot' : 'the test copy'

  if (!input.logbook.ok) {
    items.push({ level: 'watch', text: 'The logbook could not be read just now. Refresh in a minute; if it stays, tell Claude.' })
  } else {
    const { summary, activity } = input.logbook.value
    const day = summary['24h'].errors
    const week = summary['7d'].errors
    if (day >= MANY_ERRORS) items.push({ level: 'act', text: `${day} errors in ${where} in the last 24 hours. Open the error list below and send Claude the reference codes.` })
    else if (day > 0) items.push({ level: 'watch', text: `${day} error${day === 1 ? '' : 's'} in ${where} in the last 24 hours. Check whether someone was blocked; send Claude the reference code if so.` })
    else if (week > 0) items.push({ level: 'good', text: `No errors in ${where} in the last 24 hours (${week} earlier this week).` })
    else items.push({ level: 'good', text: `No errors in ${where} in the last 7 days.` })
    if (input.logbookName === 'production' && summary['7d'].activity === 0) {
      items.push({ level: 'info', text: 'Nobody used the app in the last 7 days. Expected between months; a nudge may help near month end.' })
    } else if (activity.length) {
      items.push({ level: 'good', text: `${summary['7d'].activity} activity records in ${where} this week.` })
    }
  }

  if (!input.workers.ok || !input.databases.ok) {
    items.push({ level: 'info', text: 'Traffic and database numbers are not available yet (see the message in those sections).' })
  }
  let nearLimit = false
  if (input.workers.ok) {
    const failures = Object.values(input.workers.value).reduce((sum, counts) => sum + counts['24h'].errors, 0)
    if (failures > 0) items.push({ level: 'watch', text: `${failures} Worker failure${failures === 1 ? '' : 's'} in the last 24 hours (section 2). Tell Claude if it repeats.` })
    const requests = Object.values(input.workers.value).reduce((sum, counts) => sum + counts['24h'].requests, 0)
    const item = limitItem('Traffic', requests, FREE_LIMITS.workerRequestsPerDay)
    if (item) { items.push(item); nearLimit = true }
  }
  if (input.databases.ok) {
    const total = (pick: (database: DatabaseUsage) => number) => input.databases.ok ? input.databases.value.reduce((sum, database) => sum + pick(database), 0) : 0
    for (const item of [
      limitItem('Database reading', total((database) => database.rowsRead['24h']), FREE_LIMITS.d1RowsReadPerDay),
      limitItem('Database writing', total((database) => database.rowsWritten['24h']), FREE_LIMITS.d1RowsWrittenPerDay),
      limitItem('Database storage', total((database) => database.sizeBytes ?? 0), FREE_LIMITS.d1StorageBytes, false),
    ]) if (item) { items.push(item); nearLimit = true }
    if (input.workers.ok && !nearLimit) {
      items.push({ level: 'good', text: 'Well within the free plan limits.' })
    }
  }

  const level = items.reduce<Level>((worst, item) => (ORDER.indexOf(item.level) > ORDER.indexOf(worst) ? item.level : worst), 'good')
  items.sort((a, b) => ORDER.indexOf(b.level) - ORDER.indexOf(a.level))
  return { level, headline: HEADLINES[level], items }
}
