// Server-rendered HTML for the one dashboard page. Every value passes through escapeHtml.
// The page shows only logbook fields and Cloudflare operational counts.

import type { DatabaseUsage, Loaded, PerWindow, VisitorCounts, WorkerCounts } from './cloudflare'
import { bytes, count, escapeHtml, percentOf, torontoTime } from './format'
import { FREE_LIMITS, assessHealth, type Health } from './health'
import { ACTIVITY_LABELS, DATABASE_LABELS, SCREEN_LABELS, WORKER_LABELS, errorLabel, label } from './labels'
import { ERROR_LIMIT, LOGBOOKS, WINDOWS, type LogbookName, type LogbookView, type WindowName } from './logbook'

export { FREE_LIMITS }

const WINDOW_LABELS: Record<WindowName, string> = { '24h': 'Last 24 hours', '7d': 'Last 7 days', '30d': 'Last 30 days' }
const WINDOW_NAMES = Object.keys(WINDOWS) as WindowName[]

export interface PageData {
  now: Date
  logbookName: LogbookName
  errorWindow: WindowName
  stagingAvailable: boolean
  logbook: Loaded<LogbookView>
  workers: Loaded<Record<string, PerWindow<WorkerCounts>>>
  databases: Loaded<DatabaseUsage[]>
  visitors: Loaded<PerWindow<VisitorCounts | null>>
}

const STYLE = `
:root { color-scheme: light dark; --bg: #f5f5f2; --card: #fff; --text: #1d1d1f; --muted: #6b6f76; --line: #e6e5e0; --accent: #2557a7;
  --good: #1e7b34; --good-bg: #eaf6ec; --info: #3b5b8c; --info-bg: #edf2fa; --watch: #8a5a00; --watch-bg: #fdf4e1; --act: #b3261e; --act-bg: #fdecea; }
@media (prefers-color-scheme: dark) { :root { --bg: #141414; --card: #1e1e1e; --text: #ececec; --muted: #a3a3a3; --line: #323232; --accent: #8ab4f8;
  --good: #7bd88f; --good-bg: #17291b; --info: #9db7e0; --info-bg: #19212e; --watch: #f2c26b; --watch-bg: #2c2414; --act: #ff8a80; --act-bg: #331a18; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1040px; margin: 0 auto; padding: 16px; }
a { color: var(--accent); }
header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 16px; margin: 8px 0 4px; }
h1 { font-size: 1.35rem; margin: 0; letter-spacing: -0.01em; }
h2 { font-size: 1.1rem; margin: 0; }
h3 { font-size: 0.95rem; margin: 20px 0 6px; }
section { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 18px; margin: 14px 0; }
.how { color: var(--muted); font-size: 0.88rem; margin: 4px 0 12px; }
.muted { color: var(--muted); }
.small { font-size: 0.8rem; }
.note { color: var(--muted); font-size: 0.82rem; margin: 10px 0 0; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; font-size: 0.8rem; white-space: nowrap; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
tbody tr:last-child td { border-bottom: none; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: 8px; }
.tile { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
.tile .big { font-size: 1.7rem; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.2; }
.zero { color: var(--good); }
.some { color: var(--act); }
.choices { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; }
.choices a, .choices strong { font-size: 0.85rem; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--line); text-decoration: none; }
.choices strong { background: var(--text); color: var(--card); border-color: var(--text); font-weight: 600; }
.failed { color: var(--watch); background: var(--watch-bg); border-radius: 8px; padding: 8px 12px; margin: 0; }
code { font-size: 0.82rem; white-space: nowrap; }
.glance { border-width: 2px; }
.glance.good, .glance.info { border-color: var(--good); }
.glance.watch { border-color: var(--watch); }
.glance.act { border-color: var(--act); }
.verdict { font-size: 1.25rem; font-weight: 650; margin: 0 0 10px; }
.glance.watch .verdict { color: var(--watch); } .glance.act .verdict { color: var(--act); } .glance.good .verdict, .glance.info .verdict { color: var(--good); }
.answers { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 8px; }
.answer { border-radius: 10px; padding: 10px 12px; }
.answer p { margin: 0; }
.answer .question { display: flex; align-items: center; gap: 8px; font-weight: 650; margin-bottom: 2px; }
.answer.good { background: var(--good-bg); } .answer.info { background: var(--info-bg); } .answer.watch { background: var(--watch-bg); } .answer.act { background: var(--act-bg); }
.dot { width: 11px; height: 11px; border-radius: 50%; flex: none; }
.dot.good { background: var(--good); } .dot.info { background: var(--info); } .dot.watch { background: var(--watch); } .dot.act { background: var(--act); }
nav { display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.9rem; margin: 0 0 4px; }
`

function link(text: string, href: string, current: boolean): string {
  return current ? `<strong>${escapeHtml(text)}</strong>` : `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`
}

function pageHref(logbookName: LogbookName, errorWindow: WindowName, anchor = ''): string {
  return `/?logbook=${encodeURIComponent(logbookName)}&window=${encodeURIComponent(errorWindow)}${anchor}`
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

export function renderGlance(health: Health): string {
  const answers = health.answers.map((answer) => `<div class="answer ${answer.level}"><p class="question"><span class="dot ${answer.level}"></span>${escapeHtml(answer.question)}</p><p>${escapeHtml(answer.answer)}</p></div>`).join('')
  return `<section class="glance ${health.level}" id="glance"><p class="verdict">${escapeHtml(health.headline)}</p><div class="answers">${answers}</div></section>`
}

export function renderLogbook(data: PageData): string {
  const choices = (Object.keys(LOGBOOKS) as LogbookName[])
    .filter((name) => name === 'production' || data.stagingAvailable)
    .map((name) => link(name === 'production' ? 'Real pilot' : 'Test copy (fictional)', pageHref(name, data.errorWindow, '#logbook'), name === data.logbookName))
    .join('')
  const heading = `<h2>1. Logbook: errors and activity</h2>
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
  const heading = `<h2>2. Traffic: requests to each part</h2>
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
  const heading = `<h2>3. Databases: size and use</h2>
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

export function renderVisitors(visitors: PageData['visitors']): string {
  const heading = `<h2>4. Public page: visits and traffic</h2>
<p class="how">How often tallywithus.com was opened. A visit is someone arriving from another site or a typed address; requests count every file loaded. Search engines and other bots are included, so real people are fewer.</p>`
  if (!visitors.ok) return `<section id="visitors">${heading}${failed(visitors.reason)}</section>`
  const tiles = WINDOW_NAMES.map((window) => {
    const counts = visitors.value[window]
    if (!counts) return `<div class="tile"><div class="muted small">${WINDOW_LABELS[window]}</div><div class="big muted">—</div><div class="muted small">Not kept on the free plan</div></div>`
    const errors = counts.serverErrors > 0 ? `<div class="some small">${count(counts.serverErrors)} server error${counts.serverErrors === 1 ? '' : 's'}</div>` : ''
    return `<div class="tile"><div class="muted small">${WINDOW_LABELS[window]}</div><div class="big">${count(counts.visits)}</div><div>visit${counts.visits === 1 ? '' : 's'}</div><div class="muted small">${count(counts.requests)} requests</div>${errors}</div>`
  }).join('')
  return `<section id="visitors">${heading}<div class="tiles">${tiles}</div><p class="note">From Cloudflare's traffic records for tallywithus.com and www.tallywithus.com. Counts only; no visitor is identified.</p></section>`
}

export function renderPage(data: PageData): string {
  const health = assessHealth(data)
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Tally with us — operations</title><style>${STYLE}</style></head>
<body><main>
<header><h1>Tally with us — operations</h1><span class="muted small">Updated ${escapeHtml(torontoTime(data.now.toISOString()))} · <a href="${escapeHtml(pageHref(data.logbookName, data.errorWindow))}">Refresh</a></span></header>
<nav><a href="#logbook">Logbook</a><a href="#workers">Traffic</a><a href="#databases">Databases</a><a href="#visitors">Public page</a></nav>
${renderGlance(health)}
${renderLogbook(data)}
${renderWorkers(data.workers)}
${renderDatabases(data.databases)}
${renderVisitors(data.visitors)}
<p class="note">Private page for the owner. Shows only logbook fields and Cloudflare's operational counts; never names, amounts, emails, household ids, or anything people entered.</p>
</main></body></html>`
}

export function renderMessage(title: string, message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main><section><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></section></main></body></html>`
}
