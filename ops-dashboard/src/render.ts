// Server-rendered HTML for the one dashboard page. Every value passes through escapeHtml.
// The page shows only logbook fields and Cloudflare operational counts.

import type { DatabaseUsage, Loaded, PerWindow, VisitorCounts, WorkerCounts } from './cloudflare'
import { bytes, count, escapeHtml, percentOf, torontoTime } from './format'
import { ERROR_LIMIT, LOGBOOKS, WINDOWS, type LogbookName, type LogbookView, type WindowName } from './logbook'

// Workers Free daily limits (checked 2026-10-26 in Cloudflare's pricing pages).
export const FREE_LIMITS = { workerRequestsPerDay: 100_000, d1RowsReadPerDay: 5_000_000, d1RowsWrittenPerDay: 100_000, d1StorageBytes: 5_000_000_000 }

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
  visitors: Loaded<PerWindow<VisitorCounts>>
}

const STYLE = `
:root { color-scheme: light dark; --bg: #f7f7f5; --card: #fff; --text: #1d1d1f; --muted: #5f6368; --line: #e3e3e0; --bad: #b3261e; --ok: #1e7b34; --accent: #2557a7; }
@media (prefers-color-scheme: dark) { :root { --bg: #151515; --card: #1f1f1f; --text: #ececec; --muted: #a5a5a5; --line: #333; --bad: #ff8a80; --ok: #7bd88f; --accent: #8ab4f8; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 16px; }
header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 8px; }
h1 { font-size: 1.4rem; margin: 8px 0; }
h2 { font-size: 1.1rem; margin: 0 0 8px; }
h3 { font-size: 0.95rem; margin: 16px 0 6px; }
section { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin: 16px 0; }
.muted, .note { color: var(--muted); }
.note { font-size: 0.85rem; margin: 8px 0 0; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; white-space: nowrap; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.tile { border: 1px solid var(--line); border-radius: 8px; padding: 10px; }
.tile .big { font-size: 1.5rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.bad { color: var(--bad); }
.good { color: var(--ok); }
nav a, .choices a { color: var(--accent); margin-right: 12px; }
.choices strong { margin-right: 12px; }
.failed { color: var(--bad); }
code { font-size: 0.85rem; white-space: nowrap; }
`

function link(label: string, href: string, current: boolean): string {
  return current ? `<strong>${escapeHtml(label)}</strong>` : `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
}

function pageHref(logbookName: LogbookName, errorWindow: WindowName): string {
  return `/?logbook=${encodeURIComponent(logbookName)}&window=${encodeURIComponent(errorWindow)}`
}

function failed(reason: string): string {
  return `<p class="failed">Could not load this part: ${escapeHtml(reason)}</p>`
}

function errorClass(value: number): string {
  return value > 0 ? 'bad' : 'good'
}

export function renderLogbook(data: PageData): string {
  const choices = (Object.keys(LOGBOOKS) as LogbookName[])
    .filter((name) => name === 'production' || data.stagingAvailable)
    .map((name) => link(LOGBOOKS[name], pageHref(name, data.errorWindow), name === data.logbookName))
    .join('')
  const heading = `<h2>1. Logbook — ${escapeHtml(LOGBOOKS[data.logbookName])}</h2><p class="choices">${choices}</p>`
  if (!data.logbook.ok) return `<section id="logbook">${heading}${failed(data.logbook.reason)}</section>`
  const view = data.logbook.value

  const tiles = WINDOW_NAMES.map((window) => {
    const counts = view.summary[window]
    return `<div class="tile"><div class="muted">${WINDOW_LABELS[window]}</div><div class="big ${errorClass(counts.errors)}">${count(counts.errors)}</div><div>errors</div><div class="muted">${count(counts.activity)} activity records</div></div>`
  }).join('')

  const windowChoices = WINDOW_NAMES.map((window) => link(WINDOW_LABELS[window], pageHref(data.logbookName, window), window === data.errorWindow)).join('')
  const errorRows = view.errors.map((row) => `<tr>
<td>${escapeHtml(torontoTime(row.at))}</td>
<td>${escapeHtml(row.source)}</td>
<td>${escapeHtml(row.route ?? row.screen ?? '')}</td>
<td class="num">${escapeHtml(row.status ?? '')}</td>
<td>${escapeHtml(row.errorType)}</td>
<td>${escapeHtml(row.event)}</td>
<td><code>${escapeHtml(row.reference)}</code></td>
<td>${escapeHtml(row.codeLocation)}</td>
<td>${escapeHtml(row.appVersion)}</td>
</tr>`).join('')
  const errorTable = view.errors.length
    ? `<div class="scroll"><table><thead><tr><th>Time (Toronto)</th><th>From</th><th>Route or screen</th><th class="num">Status</th><th>Error type</th><th>Event</th><th>Reference</th><th>Code location</th><th>Version</th></tr></thead><tbody>${errorRows}</tbody></table></div>`
      + (view.errors.length >= ERROR_LIMIT ? `<p class="note">Showing the newest ${ERROR_LIMIT} errors.</p>` : '')
    : '<p class="good">No errors in this period.</p>'

  const activityRows = view.activity.map((row) => `<tr><td>${escapeHtml(row.event)}</td><td>${escapeHtml(row.role ?? '—')}</td><td class="num">${count(row.times)}</td><td>${escapeHtml(torontoTime(row.lastAt))}</td></tr>`).join('')
  const activityTable = view.activity.length
    ? `<div class="scroll"><table><thead><tr><th>Activity</th><th>Role</th><th class="num">Times</th><th>Last time (Toronto)</th></tr></thead><tbody>${activityRows}</tbody></table></div>`
    : '<p class="muted">No activity in the last 30 days.</p>'

  return `<section id="logbook">${heading}<div class="tiles">${tiles}</div>
<h3>Errors</h3><p class="choices">${windowChoices}</p>${errorTable}
<h3>Activity in the last 30 days</h3>${activityTable}
<p class="note">Give the reference code when asking for help with an error. The logbook never holds names, amounts, merchants, emails, or household ids.</p></section>`
}

export function renderWorkers(workers: PageData['workers']): string {
  const heading = '<h2>2. Traffic and errors per Worker</h2>'
  if (!workers.ok) return `<section id="workers">${heading}${failed(workers.reason)}</section>`
  const rows = Object.entries(workers.value).map(([name, counts]) => `<tr><td>${escapeHtml(name)}</td>
${WINDOW_NAMES.map((window) => `<td class="num">${count(counts[window].requests)}</td>`).join('')}
${WINDOW_NAMES.map((window) => `<td class="num ${errorClass(counts[window].errors)}">${count(counts[window].errors)}</td>`).join('')}
<td class="num">${percentOf(counts['24h'].requests, FREE_LIMITS.workerRequestsPerDay)}</td></tr>`).join('')
  return `<section id="workers">${heading}<div class="scroll"><table><thead>
<tr><th rowspan="2">Worker</th><th colspan="3" class="num">Requests</th><th colspan="3" class="num">Errors</th><th rowspan="2" class="num">Share of free daily limit (24 h)</th></tr>
<tr>${WINDOW_NAMES.map((window) => `<th class="num">${window}</th>`).join('')}${WINDOW_NAMES.map((window) => `<th class="num">${window}</th>`).join('')}</tr>
</thead><tbody>${rows}</tbody></table></div>
<p class="note">“Errors” here means the Worker itself failed (crashed or hit a limit). Error answers such as 500 or 503 that the app sends on purpose are in the logbook above. Cloudflare's counts can lag by a few minutes and are sampled for very busy Workers. The free daily limit (${count(FREE_LIMITS.workerRequestsPerDay)} requests) is shared by all Workers in the account.</p></section>`
}

export function renderDatabases(databases: PageData['databases']): string {
  const heading = '<h2>3. Database usage (D1)</h2>'
  if (!databases.ok) return `<section id="databases">${heading}${failed(databases.reason)}</section>`
  if (!databases.value.length) return `<section id="databases">${heading}<p class="muted">No databases found.</p></section>`
  const totalSize = databases.value.reduce((sum, database) => sum + (database.sizeBytes ?? 0), 0)
  const totalRead = databases.value.reduce((sum, database) => sum + database.rowsRead['24h'], 0)
  const totalWritten = databases.value.reduce((sum, database) => sum + database.rowsWritten['24h'], 0)
  const rows = databases.value.map((database) => `<tr><td>${escapeHtml(database.name)}</td><td class="num">${bytes(database.sizeBytes)}</td>
${WINDOW_NAMES.map((window) => `<td class="num">${count(database.rowsRead[window])}</td>`).join('')}
${WINDOW_NAMES.map((window) => `<td class="num">${count(database.rowsWritten[window])}</td>`).join('')}</tr>`).join('')
  return `<section id="databases">${heading}<div class="scroll"><table><thead>
<tr><th rowspan="2">Database</th><th rowspan="2" class="num">Size now</th><th colspan="3" class="num">Rows read</th><th colspan="3" class="num">Rows written</th></tr>
<tr>${WINDOW_NAMES.map((window) => `<th class="num">${window}</th>`).join('')}${WINDOW_NAMES.map((window) => `<th class="num">${window}</th>`).join('')}</tr>
</thead><tbody>${rows}</tbody></table></div>
<p class="note">Free plan use in the last 24 hours, all databases together: rows read ${percentOf(totalRead, FREE_LIMITS.d1RowsReadPerDay)} of ${count(FREE_LIMITS.d1RowsReadPerDay)} a day, rows written ${percentOf(totalWritten, FREE_LIMITS.d1RowsWrittenPerDay)} of ${count(FREE_LIMITS.d1RowsWrittenPerDay)} a day, storage ${percentOf(totalSize, FREE_LIMITS.d1StorageBytes)} of ${bytes(FREE_LIMITS.d1StorageBytes)}. Sizes and counts come from Cloudflare's records about the databases; this page never reads what is inside the app's databases.</p></section>`
}

export function renderVisitors(visitors: PageData['visitors']): string {
  const heading = '<h2>4. Visitors to the public page</h2>'
  if (!visitors.ok) return `<section id="visitors">${heading}${failed(visitors.reason)}</section>`
  const total = WINDOW_NAMES.reduce((sum, window) => sum + visitors.value[window].pageViews, 0)
  if (total === 0) {
    return `<section id="visitors">${heading}<p class="muted">No visitor statistics yet for tallywithus.com. They appear here once Cloudflare Web Analytics records visits to the public page.</p></section>`
  }
  const tiles = WINDOW_NAMES.map((window) => `<div class="tile"><div class="muted">${WINDOW_LABELS[window]}</div><div class="big">${count(visitors.value[window].visits)}</div><div>visits</div><div class="muted">${count(visitors.value[window].pageViews)} page views</div></div>`).join('')
  return `<section id="visitors">${heading}<div class="tiles">${tiles}</div><p class="note">From Cloudflare Web Analytics for tallywithus.com and www.tallywithus.com. Counts only; no visitor is identified.</p></section>`
}

export function renderPage(data: PageData): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Tally with us — operations</title><style>${STYLE}</style></head>
<body><main>
<header><h1>Tally with us — operations</h1><span class="muted">Updated ${escapeHtml(torontoTime(data.now.toISOString()))} · <a href="${escapeHtml(pageHref(data.logbookName, data.errorWindow))}">Refresh</a></span></header>
<nav><a href="#logbook">Logbook</a><a href="#workers">Workers</a><a href="#databases">Databases</a><a href="#visitors">Visitors</a></nav>
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
