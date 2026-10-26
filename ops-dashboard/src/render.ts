// Server-rendered HTML for the one dashboard page. Every value passes through escapeHtml.
// The page shows only logbook fields and Cloudflare operational counts.

import type { DatabaseUsage, Loaded, PerWindow, WorkerCounts } from './cloudflare'
import { CHART_STYLE, PEOPLE_SERIES, renderChartTable, renderStackedChart } from './chart'
import { HOME_NAME, TRAFFIC_RANGES, isHome, type TrafficRange, type TrafficReport } from './traffic'
import { bytes, count, escapeHtml, percentOf, torontoTime } from './format'
import { FREE_LIMITS, assessHealth, type Health } from './health'
import { ACTIVITY_LABELS, DATABASE_LABELS, SCREEN_LABELS, WORKER_LABELS, errorLabel, label } from './labels'
import { ERROR_LIMIT, LOGBOOKS, WINDOWS, type LogbookName, type LogbookView, type WindowName } from './logbook'

export { FREE_LIMITS }

const WINDOW_LABELS: Record<WindowName, string> = { '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days' }
const WINDOW_NAMES = Object.keys(WINDOWS) as WindowName[]

/** The public page section's data: the sorted report plus how exact Cloudflare's numbers were. */
export interface PublicPage { report: TrafficReport; sampled: boolean; truncated: boolean; missing: string[] }

export interface PageData {
  now: Date
  logbookName: LogbookName
  errorWindow: WindowName
  stagingAvailable: boolean
  logbook: Loaded<LogbookView>
  workers: Loaded<Record<string, PerWindow<WorkerCounts>>>
  databases: Loaded<DatabaseUsage[]>
  trafficRange: TrafficRange
  visitors: Loaded<PublicPage>
}

// Light SaaS look (references: Vercel's dashboard for the sidebar and hairline cards, Stripe's
// home for the overview row of status cards). System font: the page loads nothing outside.
const STYLE = `
:root { color-scheme: light dark; --bg: #f6f7f9; --card: #fff; --text: #0f1115; --muted: #6b7280; --line: #e7e8ec; --accent: #4f46e5; --side: #fbfbfc;
  --good: #15803d; --good-bg: #ecfdf3; --info: #3b5bdb; --info-bg: #eef2ff; --watch: #a16207; --watch-bg: #fef6e0; --act: #b42318; --act-bg: #fef1f0;
  --shadow: 0 1px 2px rgba(16, 24, 40, 0.04); }
@media (prefers-color-scheme: dark) { :root { --bg: #0b0c0f; --card: #14161b; --text: #ececf1; --muted: #9aa0ab; --line: #262a33; --accent: #a5b4fc; --side: #0f1115;
  --good: #6ee7a0; --good-bg: #0f2a1b; --info: #a5b4fc; --info-bg: #1a1f3a; --watch: #fcd34d; --watch-bg: #2d2410; --act: #fda29b; --act-bg: #34171a; --shadow: none; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
.shell { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 100vh; }
.side { position: sticky; top: 0; height: 100vh; background: var(--side); border-right: 1px solid var(--line); padding: 20px 14px; display: flex; flex-direction: column; gap: 18px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 650; }
.logo { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: #fff; font-size: 0.85rem; background: var(--good); }
.logo.watch { background: var(--watch); } .logo.act { background: var(--act); }
@media (prefers-color-scheme: dark) { .logo { color: #0b0c0f; } }
.side nav { display: flex; flex-direction: column; gap: 2px; }
.side nav a { color: var(--text); padding: 7px 10px; border-radius: 8px; font-size: 0.9rem; }
.side nav a:hover { background: color-mix(in srgb, var(--text) 6%, transparent); text-decoration: none; }
.side-foot { margin-top: auto; font-size: 0.78rem; color: var(--muted); }
.content { padding: 28px 32px 48px; max-width: 1180px; width: 100%; min-width: 0; }
.top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; }
h1 { font-size: 1.45rem; margin: 0; letter-spacing: -0.02em; display: flex; align-items: center; gap: 10px; }
h2 { font-size: 1rem; margin: 0; letter-spacing: -0.01em; }
h3 { font-size: 0.9rem; margin: 22px 0 8px; }
.btn { border: 1px solid var(--line); background: var(--card); color: var(--text); border-radius: 8px; padding: 7px 14px; font-weight: 550; box-shadow: var(--shadow); }
.btn:hover { text-decoration: none; border-color: var(--muted); }
section { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin: 16px 0; box-shadow: var(--shadow); scroll-margin-top: 16px; }
.how { color: var(--muted); font-size: 0.86rem; margin: 4px 0 14px; max-width: 75ch; }
.muted { color: var(--muted); } .small { font-size: 0.8rem; }
.note { color: var(--muted); font-size: 0.8rem; margin: 12px 0 0; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 550; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
tbody tr:hover { background: color-mix(in srgb, var(--text) 3%, transparent); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
tbody tr:last-child td { border-bottom: none; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.tile { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; background: var(--card); }
.tile .big { font-size: 1.75rem; font-weight: 650; letter-spacing: -0.02em; line-height: 1.2; margin: 4px 0 2px; }
.tile.hero .big { font-size: 2.3rem; }
.zero { color: var(--good); } .some { color: var(--act); }
.choices { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; background: color-mix(in srgb, var(--text) 5%, transparent); border-radius: 9px; margin: 0 0 14px; }
.choices a, .choices strong { font-size: 0.8rem; padding: 4px 12px; border-radius: 7px; color: var(--muted); font-weight: 550; }
.choices strong { background: var(--card); color: var(--text); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08); }
.choices a:hover { color: var(--text); text-decoration: none; }
.failed { color: var(--watch); background: var(--watch-bg); border-radius: 8px; padding: 10px 12px; margin: 0; }
code { font: 0.8rem ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
.pill { display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 600; padding: 3px 10px; border-radius: 999px; letter-spacing: 0; }
.pill.good { color: var(--good); background: var(--good-bg); } .pill.info { color: var(--info); background: var(--info-bg); }
.pill.watch { color: var(--watch); background: var(--watch-bg); } .pill.act { color: var(--act); background: var(--act-bg); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: none; }
.overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 12px; }
.answer { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 10px; }
.answer.watch { border-color: color-mix(in srgb, var(--watch) 45%, var(--line)); } .answer.act { border-color: color-mix(in srgb, var(--act) 55%, var(--line)); }
.answer .question { margin: 0; font-size: 0.8rem; color: var(--muted); font-weight: 550; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.answer p { margin: 0; }
.answer .short { font-size: 1.3rem; font-weight: 650; letter-spacing: -0.02em; line-height: 1.2; }
.answer .long { color: var(--muted); font-size: 0.86rem; }
.plain { margin: 0 0 10px; padding-left: 18px; }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 0 24px; }
.takeaway { margin: 0 0 14px; }
.foot { color: var(--muted); font-size: 0.78rem; margin-top: 24px; }
@media (max-width: 820px) {
  .shell { grid-template-columns: minmax(0, 1fr); }
  .side { position: static; height: auto; flex-direction: row; flex-wrap: wrap; align-items: center; padding: 12px 16px; gap: 10px 16px; border-right: 0; border-bottom: 1px solid var(--line); }
  .side nav { flex-direction: row; flex-wrap: wrap; }
  .side nav a { padding: 4px 8px; }
  .side-foot { display: none; }
  .content { padding: 18px 16px 40px; }
}
`

function link(text: string, href: string, current: boolean): string {
  return current ? `<strong>${escapeHtml(text)}</strong>` : `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`
}

let currentRange: TrafficRange = '24h'

function pageHref(logbookName: LogbookName, errorWindow: WindowName, anchor = '', range: TrafficRange = currentRange): string {
  return `/?logbook=${encodeURIComponent(logbookName)}&window=${encodeURIComponent(errorWindow)}&traffic=${encodeURIComponent(range)}${anchor}`
}

function failed(reason: string): string {
  return `<p class="failed">Not available right now: ${escapeHtml(reason)}</p>`
}

function zeroOrSome(value: number): string {
  return value > 0 ? 'some' : 'zero'
}

/** A friendly name with the technical name underneath, so either can be searched for. */
function named(friendly: string, technical: string): string {
  return friendly === technical ? escapeHtml(technical) : `${escapeHtml(friendly)}<br><span class="muted small">${escapeHtml(technical)}</span>`
}

const PILL_WORDS: Record<string, string> = { good: 'Good', info: 'Info', watch: 'Look', act: 'Act' }

function pill(level: string, text = PILL_WORDS[level]): string {
  return `<span class="pill ${level}"><span class="dot"></span>${escapeHtml(text)}</span>`
}

/** "Maybe: 1 error …" becomes a big "Maybe" over the smaller rest, so the card reads at a glance. */
export function splitAnswer(text: string): { short: string; long: string } {
  const match = text.match(/^([^:.]{1,40})[:.]\s+(.*)$/s)
  return match ? { short: match[1], long: match[2].charAt(0).toUpperCase() + match[2].slice(1) } : { short: text, long: '' }
}

export function renderGlance(health: Health): string {
  const answers = health.answers.map((answer) => {
    const { short, long } = splitAnswer(answer.answer)
    return `<div class="answer ${answer.level}"><p class="question">${escapeHtml(answer.question)}${pill(answer.level)}</p><p class="short">${escapeHtml(short)}</p>${long ? `<p class="long">${escapeHtml(long)}</p>` : ''}</div>`
  }).join('')
  return `<div class="overview" id="glance">${answers}</div>`
}

export function renderLogbook(data: PageData): string {
  const choices = (Object.keys(LOGBOOKS) as LogbookName[])
    .filter((name) => name === 'production' || data.stagingAvailable)
    .map((name) => link(name === 'production' ? 'Real pilot' : 'Test copy (fictional)', pageHref(name, data.errorWindow, '#logbook'), name === data.logbookName))
    .join('')
  const heading = `<h2>Logbook</h2>
<p class="how">What the app recorded on its own. Errors are problems someone ran into. Activity is what people did (never what they entered). Zero errors is the goal.</p>
<div class="choices">${choices}</div>`
  if (!data.logbook.ok) return `<section id="logbook">${heading}${failed(data.logbook.reason)}</section>`
  const view = data.logbook.value

  const tiles = WINDOW_NAMES.map((window) => {
    const counts = view.summary[window]
    return `<div class="tile"><div class="muted small">${WINDOW_LABELS[window]}</div><div class="big ${zeroOrSome(counts.errors)}">${count(counts.errors)}</div><div>error${counts.errors === 1 ? '' : 's'}</div><div class="muted small">${count(counts.activity)} activity record${counts.activity === 1 ? '' : 's'}</div></div>`
  }).join('')

  const windowChoices = WINDOW_NAMES.map((window) => link(WINDOW_LABELS[window], pageHref(data.logbookName, window, '#errors'), window === data.errorWindow)).join('')
  const errorRows = view.errors.map((row) => {
    const where = row.route ?? label(SCREEN_LABELS, row.screen)
    const details = [row.codeLocation, row.appVersion ? `version ${row.appVersion}` : null].filter(Boolean).join(' · ')
    return `<tr>
<td>${escapeHtml(torontoTime(row.at))}</td>
<td>${escapeHtml(errorLabel(row.source, row.errorType))}<br><span class="muted small">${escapeHtml(row.source === 'browser' ? 'In the browser' : 'On the server')}${row.errorType ? ` · ${escapeHtml(row.errorType)}` : ''}</span></td>
<td>${escapeHtml(where)}</td>
<td class="num">${escapeHtml(row.status ?? '—')}</td>
<td><code>${escapeHtml(row.reference ?? '—')}</code><br><span class="muted small">${escapeHtml(details)}</span></td>
</tr>`
  }).join('')
  const errorTable = view.errors.length
    ? `<div class="scroll"><table><thead><tr><th>When (Toronto)</th><th>What happened</th><th>Where</th><th class="num">Status</th><th>Reference</th></tr></thead><tbody>${errorRows}</tbody></table></div>`
      + (view.errors.length >= ERROR_LIMIT ? `<p class="note">Showing the newest ${ERROR_LIMIT} errors.</p>` : '')
    : '<p class="zero">No errors in this period.</p>'

  const activityRows = view.activity.map((row) => `<tr><td>${named(label(ACTIVITY_LABELS, row.event), row.event)}</td><td>${escapeHtml(row.role === 'coordinator' ? 'Coordinator' : row.role === 'partner' ? 'Partner' : '—')}</td><td class="num">${count(row.times)}</td><td>${escapeHtml(torontoTime(row.lastAt))}</td></tr>`).join('')
  const activityTable = view.activity.length
    ? `<div class="scroll"><table><thead><tr><th>What</th><th>Who</th><th class="num">Times</th><th>Last time (Toronto)</th></tr></thead><tbody>${activityRows}</tbody></table></div>`
    : '<p class="muted">No activity in the last 30 days.</p>'

  return `<section id="logbook">${heading}<div class="tiles">${tiles}</div>
<h3 id="errors">Errors</h3><div class="choices">${windowChoices}</div>${errorTable}
<p class="note">To get help with an error, send Claude its reference code. That is all Claude needs.</p>
<h3>Activity in the last 30 days</h3>${activityTable}
<p class="note">The logbook never holds names, amounts, merchants, emails, or household ids.</p></section>`
}

export function renderWorkers(workers: PageData['workers']): string {
  const heading = `<h2>Traffic</h2>
<p class="how">How many times each part answered a request (each page load makes several). Failures should stay at 0. The last column shows how much of the free plan's ${count(FREE_LIMITS.workerRequestsPerDay)} requests a day each part used.</p>`
  if (!workers.ok) return `<section id="workers">${heading}${failed(workers.reason)}</section>`
  const rows = Object.entries(workers.value).map(([name, counts]) => `<tr><td>${named(label(WORKER_LABELS, name), name)}</td>
${WINDOW_NAMES.map((window) => `<td class="num">${count(counts[window].requests)}</td>`).join('')}
<td class="num ${zeroOrSome(counts['7d'].errors)}">${count(counts['7d'].errors)}</td>
<td class="num">${percentOf(counts['24h'].requests, FREE_LIMITS.workerRequestsPerDay)}</td></tr>`).join('')
  return `<section id="workers">${heading}<div class="scroll"><table><thead>
<tr><th>Part</th><th class="num">24 h</th><th class="num">7 days</th><th class="num">30 days</th><th class="num">Failures (7 days)</th><th class="num">Free limit used today</th></tr>
</thead><tbody>${rows}</tbody></table></div>
<p class="note">A failure means the part itself crashed or hit a limit. Error answers the app gives on purpose (such as "please sign in again") are in the logbook above. The public page runs no code, so it is not counted here; see section 4. Cloudflare's counts can be a few minutes behind.</p></section>`
}

export function renderDatabases(databases: PageData['databases']): string {
  const heading = `<h2>Databases</h2>
<p class="how">How big each database is and how much it was used. The free plan allows ${count(FREE_LIMITS.d1RowsReadPerDay)} rows read and ${count(FREE_LIMITS.d1RowsWrittenPerDay)} rows written a day, and ${bytes(FREE_LIMITS.d1StorageBytes)} of storage, for all databases together.</p>`
  if (!databases.ok) return `<section id="databases">${heading}${failed(databases.reason)}</section>`
  if (!databases.value.length) return `<section id="databases">${heading}<p class="muted">No databases found.</p></section>`
  const totalSize = databases.value.reduce((sum, database) => sum + (database.sizeBytes ?? 0), 0)
  const totalRead = databases.value.reduce((sum, database) => sum + database.rowsRead['24h'], 0)
  const totalWritten = databases.value.reduce((sum, database) => sum + database.rowsWritten['24h'], 0)
  const rows = databases.value.map((database) => `<tr><td>${named(label(DATABASE_LABELS, database.name), database.name)}</td><td class="num">${bytes(database.sizeBytes)}</td>
<td class="num">${count(database.rowsRead['24h'])}</td><td class="num">${count(database.rowsRead['30d'])}</td>
<td class="num">${count(database.rowsWritten['24h'])}</td><td class="num">${count(database.rowsWritten['30d'])}</td></tr>`).join('')
  const tiles = [
    ['Rows read today', percentOf(totalRead, FREE_LIMITS.d1RowsReadPerDay)],
    ['Rows written today', percentOf(totalWritten, FREE_LIMITS.d1RowsWrittenPerDay)],
    ['Storage', percentOf(totalSize, FREE_LIMITS.d1StorageBytes)],
  ].map(([name, value]) => `<div class="tile"><div class="muted small">${escapeHtml(name)}</div><div class="big">${escapeHtml(value)}</div><div class="muted small">of the free limit</div></div>`).join('')
  return `<section id="databases">${heading}<div class="tiles">${tiles}</div><h3>Each database</h3><div class="scroll"><table><thead>
<tr><th>Database</th><th class="num">Size now</th><th class="num">Rows read 24 h</th><th class="num">Rows read 30 days</th><th class="num">Rows written 24 h</th><th class="num">Rows written 30 days</th></tr>
</thead><tbody>${rows}</tbody></table></div>
<p class="note">These numbers come from Cloudflare's records about the databases. This page never reads what is inside the app's databases.</p></section>`
}

const RANGE_LABELS: Record<TrafficRange, string> = { '24h': 'Last 24 hours', '7d': 'Last 7 days' }

function lastSeen(hour: string): string {
  return hour ? torontoTime(hour).replace(/, \d{4}/, '') : '—'
}

export function renderVisitors(data: PageData): string {
  const range = data.trafficRange
  const period = range === '24h' ? 'the last 24 hours' : 'the last 7 days'
  const choices = (Object.keys(TRAFFIC_RANGES) as TrafficRange[]).map((name) => link(RANGE_LABELS[name], pageHref(data.logbookName, data.errorWindow, '#visitors', name), name === range)).join('')
  const heading = `<h2>Public page</h2><div class="choices">${choices}</div>`
  if (!data.visitors.ok) return `<section id="visitors">${heading}${failed(data.visitors.reason)}</section>`
  const { report, sampled, truncated, missing } = data.visitors.value
  const others = report.requests.robots + report.requests.automated
  const share = report.totalRequests ? Math.round((others / report.totalRequests) * 100) : 0
  const home = report.people.home
  const abroad = report.people.abroad
  const takeaway = `<p class="takeaway"><strong>${count(home)} visit${home === 1 ? '' : 's'} from ${HOME_NAME}</strong> in ${period}.${abroad ? ` ${count(abroad)} more from other countries, probably automated tools.` : ''} ${others ? `${share}% of all traffic was robots and scanners: normal for any new website, and nothing to do.` : ''}</p>`
  const tiles = [
    [`Visits from ${HOME_NAME}`, count(home), 'people, confirmed by the page style loading', 'hero'],
    ['Other countries', count(abroad), 'probably automated; real visitors abroad show here too', ''],
    ['Robots and scanners', count(others), `requests · ${share}% of traffic`, ''],
    ['Claude’s checks', count(report.requests.agent), 'requests from my tests', ''],
  ].map(([name, value, sub, cls]) => `<div class="tile ${cls}"><div class="muted small">${escapeHtml(name)}</div><div class="big">${escapeHtml(value)}</div><div class="muted small">${escapeHtml(sub)}</div></div>`).join('')
  const step = range === '24h' ? 'per hour' : 'per day'
  const peopleChart = renderStackedChart(report.buckets, `Visits from ${HOME_NAME} ${step} (Toronto time)`, PEOPLE_SERIES, 140)
  const otherChart = renderStackedChart(report.buckets, `Robots, scanners, and Claude’s checks: requests ${step}`, undefined, 90)
  const errors = report.serverErrors ? `<p class="failed">The public page answered ${count(report.serverErrors)} request${report.serverErrors === 1 ? '' : 's'} with a server error. Tell Claude.</p>` : ''
  const peopleRows = report.peopleGroups.map((group) => `<tr><td>${escapeHtml(group.label)}<br><span class="muted small">${escapeHtml(isHome(group.detail) ? HOME_NAME : `${group.detail} · probably automated`)}</span></td><td class="num">${count(group.visits)}</td><td>${escapeHtml(lastSeen(group.lastHour))}</td></tr>`).join('')
  const peopleTable = report.peopleGroups.length
    ? `<div class="scroll"><table><thead><tr><th>Browser and device</th><th class="num">Visits</th><th>Last visit (hour)</th></tr></thead><tbody>${peopleRows}</tbody></table></div>`
    : '<p class="muted small">No people in this period.</p>'
  const robotRows = report.automatedGroups.map((group) => `<tr><td><code>${escapeHtml(group.label)}</code><br><span class="muted small">${escapeHtml(group.detail)}</span></td><td class="num">${count(group.requests)}</td></tr>`).join('')
  const robots = report.automatedGroups.length
    ? `<details class="table-view"><summary>What robots and scanners asked for (top ${report.automatedGroups.length})</summary><div class="scroll"><table><thead><tr><th>Address asked for</th><th class="num">Requests</th></tr></thead><tbody>${robotRows}</tbody></table></div></details>`
    : ''
  const notes = [missing.length ? `Cloudflare's free plan does not give the ${missing.join(', ')}, so telling people from robots is less exact.` : '', sampled ? 'Cloudflare estimated some numbers from a sample.' : '', truncated ? 'Totals are partial (too many groups).' : ''].filter(Boolean).join(' ')
  return `<section id="visitors">${heading}${takeaway}<div class="tiles">${tiles}</div>${errors}
<div class="two"><div>${peopleChart}</div><div><h3>Who the people were</h3>${peopleTable}</div></div>
${otherChart}${renderChartTable(report.buckets)}${robots}
<details class="table-view"><summary>How people are told apart</summary><p class="small">A page load counts as a person when it comes from a recognised browser, from a home or mobile internet provider where Cloudflare says so, and the same browser also downloads the page's style or font that hour. Scanners posing as browsers fetch the page alone. A repeat visit that reuses the saved style is missed, so the count leans low. Known robots are those Cloudflare labels (search engines and similar). Claude's checks name themselves; older ones are recognised as curl or Node programs${report.agentLikely ? ` (${count(report.agentLikely)} of these requests)` : ''}. Everything else is scanners and other automated programs. A scanner that also fetches the style would count as a person, so small numbers are approximate.</p></details>
<p class="note">From Cloudflare's traffic records for tallywithus.com and www.tallywithus.com. Counts only; no visitor is identified. ${escapeHtml(notes)}</p></section>`
}

export function renderPage(data: PageData): string {
  currentRange = data.trafficRange
  const health = assessHealth(data)
  const level = health.level === 'info' ? 'good' : health.level
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Tally with us — operations</title><style>${STYLE}${CHART_STYLE}</style></head>
<body><div class="shell">
<aside class="side"><div class="brand"><span class="logo ${level}">T</span>Tally ops</div>
<nav><a href="#top">Overview</a><a href="#logbook">Logbook</a><a href="#workers">Traffic</a><a href="#databases">Databases</a><a href="#visitors">Public page</a></nav>
<div class="side-foot">Private to the owner</div></aside>
<main class="content">
<header class="top" id="top"><div><h1>Overview ${pill(level, health.headline)}</h1><p class="muted small" style="margin:4px 0 0">Updated ${escapeHtml(torontoTime(data.now.toISOString()))}</p></div><a class="btn" href="${escapeHtml(pageHref(data.logbookName, data.errorWindow))}">Refresh</a></header>
${renderGlance(health)}
${renderLogbook(data)}
${renderWorkers(data.workers)}
${renderDatabases(data.databases)}
${renderVisitors(data)}
<p class="foot">Shows only logbook fields and Cloudflare's operational counts; never names, amounts, emails, household ids, or anything people entered.</p>
</main></div></body></html>`
}

export function renderMessage(title: string, message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main class="content" style="margin:40px auto;max-width:520px"><section><h2>${escapeHtml(title)}</h2><p class="muted">${escapeHtml(message)}</p></section></main></body></html>`
}
