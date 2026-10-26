// The "at a glance" box at the top of the page: the owner's four questions, each answered in
// one line, worked out only from the numbers already on the page.

import type { DatabaseUsage, Loaded, PerWindow, WorkerCounts } from './cloudflare'
import type { PublicPage } from './render'
import { count, torontoTime } from './format'
import type { LogbookName, LogbookView } from './logbook'

export type Level = 'good' | 'info' | 'watch' | 'act'
export interface Answer { question: string; answer: string; level: Level }
export interface Health { level: Level; headline: string; answers: Answer[] }

// Workers Free daily limits (checked 2026-10-26 in Cloudflare's pricing pages).
export const FREE_LIMITS = { workerRequestsPerDay: 100_000, d1RowsReadPerDay: 5_000_000, d1RowsWrittenPerDay: 100_000, d1StorageBytes: 5_000_000_000 }
export const WATCH_SHARE = 0.5
export const ACT_SHARE = 0.8
export const MANY_ERRORS = 5
export const ACTIVE_DAYS = 7

export const QUESTIONS = {
  broken: 'Is something broken?',
  partner: 'Is my partner using the app?',
  plan: 'Is the free plan enough?',
  visitors: 'Is anyone visiting the public page?',
} as const

const ORDER: Level[] = ['good', 'info', 'watch', 'act']
const HEADLINES: Record<Level, string> = { good: 'All good', info: 'All good', watch: 'Worth a look', act: 'Needs action' }

export interface HealthInput {
  now: Date
  logbookName: LogbookName
  logbook: Loaded<LogbookView>
  workers: Loaded<Record<string, PerWindow<WorkerCounts>>>
  databases: Loaded<DatabaseUsage[]>
  visitors: Loaded<PublicPage>
}

function plural(value: number, word: string): string {
  return `${count(value)} ${word}${value === 1 ? '' : 's'}`
}

/** "today", "yesterday", or "N days ago", counted in Toronto calendar days. */
export function daysAgo(now: Date, iso: string): string {
  const day = (time: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(time)
  const difference = Math.round((Date.parse(day(now)) - Date.parse(day(new Date(iso)))) / 86_400_000)
  if (difference <= 0) return 'today'
  if (difference === 1) return 'yesterday'
  return `${difference} days ago`
}

function broken(input: HealthInput, where: string): Answer {
  const question = QUESTIONS.broken
  if (!input.logbook.ok) return { question, level: 'watch', answer: 'Can’t tell right now: the logbook could not be read. Refresh in a minute; if it stays, tell Claude.' }
  const { summary } = input.logbook.value
  const today = summary['24h'].errors
  const week = summary['7d'].errors
  const failures = input.workers.ok ? Object.values(input.workers.value).reduce((sum, counts) => sum + counts['24h'].errors, 0) : 0
  if (today >= MANY_ERRORS) return { question, level: 'act', answer: `Probably: ${plural(today, 'error')} in ${where} in the last 24 hours. Send Claude the reference codes from the list below.` }
  if (today > 0) return { question, level: 'watch', answer: `Maybe: ${plural(today, 'error')} in ${where} in the last 24 hours. Check whether someone was blocked; send Claude the reference code.` }
  if (failures > 0) return { question, level: 'watch', answer: `Maybe: a part crashed ${plural(failures, 'time')} in the last 24 hours (see Traffic). Tell Claude if it repeats.` }
  if (week > 0) return { question, level: 'good', answer: `No. No errors in the last 24 hours (${count(week)} earlier this week, see below).` }
  return { question, level: 'good', answer: `No. No errors in ${where} in the last 7 days.` }
}

function partner(input: HealthInput, where: string): Answer {
  const question = QUESTIONS.partner
  if (!input.logbook.ok) return { question, level: 'info', answer: 'Can’t tell right now: the logbook could not be read.' }
  const rows = input.logbook.value.activity.filter((row) => row.role === 'partner')
  const times = rows.reduce((sum, row) => sum + row.times, 0)
  const last = rows.map((row) => row.lastAt).filter((value): value is string => Boolean(value)).sort().pop()
  if (!last) return { question, level: 'info', answer: `Not in the last 30 days: no partner activity in ${where}. Expected before they join or between months.` }
  const recent = input.now.getTime() - Date.parse(last) <= ACTIVE_DAYS * 86_400_000
  const when = `last active ${daysAgo(input.now, last)} (${torontoTime(last)})`
  return recent
    ? { question, level: 'good', answer: `Yes: ${when}, ${plural(times, 'action')} in 30 days.` }
    : { question, level: 'info', answer: `Not lately: ${when}. A nudge may help near month end.` }
}

function plan(input: HealthInput): Answer {
  const question = QUESTIONS.plan
  if (!input.workers.ok || !input.databases.ok) return { question, level: 'info', answer: 'Can’t tell yet: the Cloudflare numbers are not available (see Traffic and Databases).' }
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
  const uses = [
    { what: 'traffic', share: sum(Object.values(input.workers.value).map((counts) => counts['24h'].requests)) / FREE_LIMITS.workerRequestsPerDay, daily: true },
    { what: 'database reading', share: sum(input.databases.value.map((database) => database.rowsRead['24h'])) / FREE_LIMITS.d1RowsReadPerDay, daily: true },
    { what: 'database writing', share: sum(input.databases.value.map((database) => database.rowsWritten['24h'])) / FREE_LIMITS.d1RowsWrittenPerDay, daily: true },
    { what: 'database storage', share: sum(input.databases.value.map((database) => database.sizeBytes ?? 0)) / FREE_LIMITS.d1StorageBytes, daily: false },
  ]
  const top = uses.reduce((highest, use) => (use.share > highest.share ? use : highest))
  const percent = top.share > 0 && top.share < 0.01 ? 'under 1%' : `${Math.round(top.share * 100)}%`
  const limit = top.daily ? 'its free daily limit' : 'its free limit'
  if (top.share >= ACT_SHARE) return { question, level: 'act', answer: `Not for long: ${top.what} is at ${percent} of ${limit}. Ask Claude to look today${top.daily ? ' (the app would pause until the limit resets at 8 pm Toronto, 7 pm in winter)' : ''}.` }
  if (top.share >= WATCH_SHARE) return { question, level: 'watch', answer: `Yes, for now: ${top.what} is at ${percent} of ${limit}. Check again ${top.daily ? 'tomorrow' : 'next week'}.` }
  return { question, level: 'good', answer: `Yes. The most-used limit today is ${top.what}, at ${percent}.` }
}

function visitors(input: HealthInput): Answer {
  const question = QUESTIONS.visitors
  if (!input.visitors.ok) return { question, level: 'info', answer: 'Can’t tell yet: public page numbers are not available (see Public page).' }
  const { report } = input.visitors.value
  const period = report.range === '24h' ? 'the last 24 hours' : 'the last 7 days'
  const others = report.requests.robots + report.requests.automated
  const otherPart = others ? ` Robots and scanners sent ${plural(others, 'request')}.` : ''
  if (report.people.visits === 0 && report.people.pageViews === 0) return { question, level: 'info', answer: `No people in ${period}.${otherPart}` }
  return { question, level: 'good', answer: `Yes: about ${plural(report.people.visits || report.people.pageViews, 'visit')} by people in ${period}.${otherPart}` }
}

export function assessHealth(input: HealthInput): Health {
  const where = input.logbookName === 'production' ? 'the real pilot' : 'the test copy'
  const answers = [broken(input, where), partner(input, where), plan(input), visitors(input)]
  const level = answers.reduce<Level>((worst, answer) => (ORDER.indexOf(answer.level) > ORDER.indexOf(worst) ? answer.level : worst), 'good')
  return { level, headline: HEADLINES[level], answers }
}
