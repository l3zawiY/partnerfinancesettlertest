// Server-rendered HTML for the one dashboard page. Every value passes through escapeHtml.
// The page shows only logbook fields and Cloudflare operational counts.

import type { DatabaseUsage, Loaded, PerWindow, WorkerCounts } from './cloudflare'
import { icon, STATUS_ICONS, type IconName } from './icons'
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

// Horizon UI look (Figma community file "Horizon UI", values read through the Figma connector):
// DM Sans; navy #2B3674 text, grey #A3AED0 labels, violet #4318FF accent on a #F4F7FE canvas;
// white 20px-radius cards; mini-stat cards with a 56px icon bubble; grey uppercase table heads.
export const FONT_PATH = '/fonts/dm-sans.woff2'
const STYLE = `
@font-face { font-family: "DM Sans"; src: url("${FONT_PATH}") format("woff2-variations"), url("${FONT_PATH}") format("woff2"); font-weight: 100 1000; font-style: normal; font-display: swap; }
:root { color-scheme: light dark; --bg: #f4f7fe; --card: #fff; --text: #2b3674; --strong: #1b2559; --muted: #a3aed0; --soft: #707eae; --line: #e9edf7; --bubble: #f4f7fe; --track: #eff4fb; --accent: #4318ff;
  --good: #05cd99; --info: #4318ff; --watch: #ffb547; --act: #ee5d50; --shadow: 14px 17px 40px 4px rgba(112, 144, 176, 0.08); }
@media (prefers-color-scheme: dark) { :root { --bg: #0b1437; --card: #111c44; --text: #fff; --strong: #fff; --muted: #a3aed0; --soft: #a3aed0; --line: rgba(255, 255, 255, 0.1); --bubble: #1b254b; --track: #1b254b; --accent: #7551ff; --info: #7551ff; --shadow: none; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 500 14px/24px "DM Sans", system-ui, sans-serif; letter-spacing: -0.02em; -webkit-font-smoothing: antialiased; }
a { color: var(--accent); text-decoration: none; }
.icon { flex: none; display: block; }
.shell { display: grid; grid-template-columns: 290px minmax(0, 1fr); min-height: 100vh; background: linear-gradient(to right, var(--card) 290px, var(--bg) 290px); }
.side { position: sticky; top: 0; height: 100vh; background: var(--card); display: flex; flex-direction: column; }
.brand { height: 130px; display: grid; place-items: center; border-bottom: 1px solid var(--bubble); font-size: 26px; font-weight: 700; color: var(--text); letter-spacing: 0; text-transform: uppercase; }
.brand span { font-weight: 400; }
.side nav { display: flex; flex-direction: column; gap: 20px; padding: 38px 0 0; }
.side nav a { position: relative; display: flex; align-items: center; gap: 12px; padding: 3px 0 3px 33px; font-size: 16px; line-height: 30px; color: var(--muted); }
.side nav a.active { color: var(--text); font-weight: 700; }
.side nav a.active .icon { color: var(--accent); }
.side nav a.active::after { content: ""; position: absolute; right: 0; top: 0; width: 4px; height: 36px; border-radius: 25px; background: var(--accent); }
.side nav a:hover { color: var(--text); }
.promo { margin: auto 31px 31px; border-radius: 24px; padding: 22px 18px; color: #fff; text-align: center; background: linear-gradient(140deg, #868cff 0%, #4318ff 100%); }
.promo b { display: block; font-size: 16px; line-height: 28px; }
.promo span { color: #e9edf7; font-size: 14px; }
.content { padding: 49px 20px 40px 30px; min-width: 0; max-width: 1640px; }
.top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px; margin: 0 0 24px; }
.crumb { margin: 0; font-size: 14px; color: var(--soft); }
h1 { margin: 2px 0 0; font-size: 34px; line-height: 42px; font-weight: 700; letter-spacing: -0.02em; color: var(--text); }
.toolbar { display: flex; align-items: center; gap: 12px; background: var(--card); border-radius: 30px; padding: 10px; box-shadow: var(--shadow); }
.chip { display: inline-flex; align-items: center; gap: 8px; background: var(--bubble); border-radius: 49px; padding: 6px 16px 6px 12px; font-size: 14px; font-weight: 700; color: var(--text); }
.round { width: 41px; height: 41px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 700; background: linear-gradient(140deg, #868cff 0%, #4318ff 100%); }
.iconbtn { width: 37px; height: 37px; border-radius: 10px; display: grid; place-items: center; background: var(--bubble); color: var(--accent); }
.grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; margin-bottom: 20px; }
@media (max-width: 1350px) { .grid4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .grid4 { grid-template-columns: minmax(0, 1fr); } }
.stat { background: var(--card); border-radius: 20px; padding: 20px; display: flex; gap: 18px; align-items: flex-start; box-shadow: var(--shadow); }
.bubble { width: 56px; height: 56px; border-radius: 50%; background: var(--bubble); color: var(--accent); display: grid; place-items: center; flex: none; }
.stat .label { margin: 0; color: var(--muted); font-size: 14px; line-height: 24px; }
.stat .value { margin: 0; color: var(--text); font-size: 24px; line-height: 32px; font-weight: 700; letter-spacing: -0.02em; }
.stat .detail { margin: 4px 0 0; color: var(--soft); font-size: 13px; line-height: 20px; }
.stat .state { margin-left: auto; }
.grid4 .stat { display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: "b . s" "t t t"; row-gap: 16px; align-content: start; }
.grid4 .stat > .bubble { grid-area: b; } .grid4 .stat > div { grid-area: t; } .grid4 .stat > .state { grid-area: s; }
.grid4 .stat .value { font-size: 28px; line-height: 36px; }
.mini { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 20px; margin: 4px 0 8px; }
.mini .stat { box-shadow: none; border: 1px solid var(--line); }
section { background: var(--card); border-radius: 20px; padding: 24px 30px 28px; margin: 0 0 20px; box-shadow: var(--shadow); scroll-margin-top: 20px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
h2 { margin: 0; font-size: 24px; line-height: 32px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
h3 { margin: 26px 0 6px; font-size: 18px; line-height: 28px; font-weight: 700; color: var(--text); }
.how { color: var(--muted); margin: 2px 0 18px; max-width: 80ch; }
.muted { color: var(--muted); } .small { font-size: 12px; line-height: 20px; }
.note { color: var(--muted); font-size: 13px; margin: 14px 0 0; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; }
th { text-align: left; color: var(--muted); font-weight: 500; font-size: 14px; padding: 0 12px 8px 0; border-bottom: 1px solid var(--line); text-transform: uppercase; white-space: nowrap; }
td { text-align: left; color: var(--text); font-weight: 700; font-size: 14px; padding: 12px 12px 12px 0; vertical-align: top; }
td .muted, td .small { font-weight: 500; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.status { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: var(--text); white-space: nowrap; }
.s-good { color: var(--good); } .s-info { color: var(--info); } .s-watch { color: var(--watch); } .s-act { color: var(--act); }
.zero { color: var(--good); } .some { color: var(--act); }
.bar { display: block; width: 108px; height: 8px; border-radius: 21px; background: var(--track); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 21px; background: var(--accent); min-width: 4px; }
.bar.watch i { background: var(--watch); } .bar.act i { background: var(--act); }
.choices { display: inline-flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }
.choices a, .choices strong { font-size: 14px; line-height: 20px; padding: 7px 16px; border-radius: 70px; background: var(--bubble); color: var(--muted); font-weight: 700; }
.choices strong { background: var(--accent); color: #fff; }
.failed { color: var(--text); background: var(--bubble); border-radius: 16px; padding: 12px 16px; margin: 0; display: flex; gap: 10px; align-items: flex-start; }
code { font: 700 13px "DM Sans", system-ui, sans-serif; letter-spacing: 0.02em; white-space: nowrap; color: var(--accent); }
.plain { margin: 0 0 10px; padding-left: 18px; }
.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 0 30px; }
.takeaway { margin: 0 0 18px; color: var(--soft); font-size: 15px; }
.takeaway strong { color: var(--text); }
.foot { color: var(--muted); font-size: 13px; margin: 8px 4px 0; }
details.table-view summary { cursor: pointer; color: var(--accent); font-weight: 700; margin: 14px 0 6px; }
@media (max-width: 900px) {
  .shell { grid-template-columns: minmax(0, 1fr); background: var(--bg); }
  .side { position: static; height: auto; }
  .brand { height: auto; padding: 18px 20px; place-items: start; font-size: 22px; }
  .side nav { flex-direction: row; flex-wrap: wrap; gap: 4px 18px; padding: 12px 20px 14px; }
  .side nav a { padding: 0; font-size: 14px; }
  .side nav a.active::after { display: none; }
  .promo { display: none; }
  .content { padding: 22px 16px 40px; }
  h1 { font-size: 28px; line-height: 36px; }
  section { padding: 20px 18px 22px; }
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
  return `<p class="failed">${icon('error', 20, 's-watch')}<span>Not available right now: ${escapeHtml(reason)}</span></p>`
}

function zeroOrSome(value: number): string {
  return value > 0 ? 'some' : 'zero'
}

/** A friendly name with the technical name underneath, so either can be searched for. */
function named(friendly: string, technical: string): string {
  return friendly === technical ? escapeHtml(technical) : `${escapeHtml(friendly)}<br><span class="muted small">${escapeHtml(technical)}</span>`
}

const STATUS_WORDS: Record<string, string> = { good: 'Good', info: 'Info', watch: 'Look', act: 'Act' }

/** Horizon's table status: a coloured icon and a word. */
function status(level: string, text = STATUS_WORDS[level]): string {
  return `<span class="status">${icon(STATUS_ICONS[level] ?? 'info', 24, `s-${level}`)}${escapeHtml(text)}</span>`
}

/** Horizon's mini-stat card: icon bubble, grey label, bold value, optional detail and status. */
function stat(iconName: IconName, labelText: string, value: string, detail = '', level = ''): string {
  return `<div class="stat"><span class="bubble">${icon(iconName, 28)}</span><div><p class="label">${escapeHtml(labelText)}</p><p class="value">${escapeHtml(value)}</p>${detail ? `<p class="detail">${escapeHtml(detail)}</p>` : ''}</div>${level ? `<span class="state">${icon(STATUS_ICONS[level] ?? 'info', 24, `s-${level}`)}</span>` : ''}</div>`
}

/** Horizon's progress bar; the fill turns amber or red as a free limit fills up. */
function bar(share: number): string {
  const level = share >= 0.8 ? 'act' : share >= 0.5 ? 'watch' : ''
  return `<span class="bar ${level}"><i style="width:${Math.min(100, Math.max(0, share * 100)).toFixed(1)}%"></i></span>`
}

/** "Maybe: 1 error …" becomes a big "Maybe" over the smaller rest, so the card reads at a glance. */
export function splitAnswer(text: string): { short: string; long: string } {
  const match = text.match(/^([^:.]{1,40})[:.]\s+(.*)$/s)
  return match ? { short: match[1], long: match[2].charAt(0).toUpperCase() + match[2].slice(1) } : { short: text, long: '' }
}

const QUESTION_ICONS: IconName[] = ['bug', 'people', 'savings', 'globe']

export function renderGlance(health: Health): string {
  const answers = health.answers.map((answer, index) => {
    const { short, long } = splitAnswer(answer.answer)
    return stat(QUESTION_ICONS[index] ?? 'info', answer.question, short, long, answer.level)
  }).join('')
  return `<div class="grid4" id="glance">${answers}</div>`
}

export function renderLogbook(data: PageData): string {
  const choices = (Object.keys(LOGBOOKS) as LogbookName[])
    .filter((name) => name === 'production' || data.stagingAvailable)
    .map((name) => link(name === 'production' ? 'Real pilot' : 'Test copy (fictional)', pageHref(name, data.errorWindow, '#logbook'), name === data.logbookName))
    .join('')
  const heading = `<div class="head"><h2>Logbook</h2><span class="iconbtn">${icon('list')}</span></div>
<p class="how">What the app recorded on its own. Errors are problems someone ran into. Activity is what people did (never what they entered). Zero errors is the goal.</p>
<div class="choices">${choices}</div>`
  if (!data.logbook.ok) return `<section id="logbook">${heading}${failed(data.logbook.reason)}</section>`
  const view = data.logbook.value

  const tiles = WINDOW_NAMES.map((window) => {
    const counts = view.summary[window]
    return stat('bug', `Errors · ${WINDOW_LABELS[window].toLowerCase()}`, count(counts.errors), `${count(counts.activity)} activity record${counts.activity === 1 ? '' : 's'}`, counts.errors ? (window === '24h' ? 'watch' : 'info') : 'good')
  }).join('')

  const windowChoices = WINDOW_NAMES.map((window) => link(WINDOW_LABELS[window], pageHref(data.logbookName, window, '#errors'), window === data.errorWindow)).join('')
  const errorRows = view.errors.map((row) => {
    const where = row.route ?? label(SCREEN_LABELS, row.screen)
    const details = [row.codeLocation, row.appVersion ? `version ${row.appVersion}` : null].filter(Boolean).join(' · ')
    return `<tr>
<td>${escapeHtml(torontoTime(row.at))}</td>
<td><span class="status">${icon('cancel', 24, 's-act')}${escapeHtml(errorLabel(row.source, row.errorType))}</span><br><span class="muted small">${escapeHtml(row.source === 'browser' ? 'In the browser' : 'On the server')}${row.errorType ? ` · ${escapeHtml(row.errorType)}` : ''}</span></td>
<td>${escapeHtml(where)}</td>
<td class="num">${escapeHtml(row.status ?? '—')}</td>
<td><code>${escapeHtml(row.reference ?? '—')}</code><br><span class="muted small">${escapeHtml(details)}</span></td>
</tr>`
  }).join('')
  const errorTable = view.errors.length
    ? `<div class="scroll"><table><thead><tr><th>When (Toronto)</th><th>What happened</th><th>Where</th><th class="num">Status</th><th>Reference</th></tr></thead><tbody>${errorRows}</tbody></table></div>`
      + (view.errors.length >= ERROR_LIMIT ? `<p class="note">Showing the newest ${ERROR_LIMIT} errors.</p>` : '')
    : `<p class="status">${icon('check', 24, 's-good')}No errors in this period.</p>`

  const activityRows = view.activity.map((row) => `<tr><td>${named(label(ACTIVITY_LABELS, row.event), row.event)}</td><td>${escapeHtml(row.role === 'coordinator' ? 'Coordinator' : row.role === 'partner' ? 'Partner' : '—')}</td><td class="num">${count(row.times)}</td><td>${escapeHtml(torontoTime(row.lastAt))}</td></tr>`).join('')
  const activityTable = view.activity.length
    ? `<div class="scroll"><table><thead><tr><th>What</th><th>Who</th><th class="num">Times</th><th>Last time (Toronto)</th></tr></thead><tbody>${activityRows}</tbody></table></div>`
    : '<p class="muted">No activity in the last 30 days.</p>'

  return `<section id="logbook">${heading}<div class="mini">${tiles}</div>
<h3 id="errors">Errors</h3><div class="choices">${windowChoices}</div>${errorTable}
<p class="note">To get help with an error, send Claude its reference code. That is all Claude needs.</p>
<h3>Activity in the last 30 days</h3>${activityTable}
<p class="note">The logbook never holds names, amounts, merchants, emails, or household ids.</p></section>`
}

export function renderWorkers(workers: PageData['workers']): string {
  const heading = `<div class="head"><h2>Traffic</h2><span class="iconbtn">${icon('chart')}</span></div>
<p class="how">How many times each part answered a request (each page load makes several). Failures should stay at 0. The last column shows how much of the free plan's ${count(FREE_LIMITS.workerRequestsPerDay)} requests a day each part used.</p>`
  if (!workers.ok) return `<section id="workers">${heading}${failed(workers.reason)}</section>`
  const rows = Object.entries(workers.value).map(([name, counts]) => `<tr><td>${named(label(WORKER_LABELS, name), name)}</td>
${WINDOW_NAMES.map((window) => `<td class="num">${count(counts[window].requests)}</td>`).join('')}
<td>${counts['7d'].errors ? status('act', `${count(counts['7d'].errors)} failed`) : status('good', 'None')}</td>
<td><span class="status">${bar(counts['24h'].requests / FREE_LIMITS.workerRequestsPerDay)}<span class="small muted">${percentOf(counts['24h'].requests, FREE_LIMITS.workerRequestsPerDay)}</span></span></td></tr>`).join('')
  return `<section id="workers">${heading}<div class="scroll"><table><thead>
<tr><th>Part</th><th class="num">24 h</th><th class="num">7 days</th><th class="num">30 days</th><th>Failures (7 days)</th><th>Free limit today</th></tr>
</thead><tbody>${rows}</tbody></table></div>
<p class="note">A failure means the part itself crashed or hit a limit. Error answers the app gives on purpose (such as "please sign in again") are in the logbook above. The public page runs no code, so it is not counted here; see Public page. Cloudflare's counts can be a few minutes behind.</p></section>`
}

export function renderDatabases(databases: PageData['databases']): string {
  const heading = `<div class="head"><h2>Databases</h2><span class="iconbtn">${icon('storage')}</span></div>
<p class="how">How big each database is and how much it was used. The free plan allows ${count(FREE_LIMITS.d1RowsReadPerDay)} rows read and ${count(FREE_LIMITS.d1RowsWrittenPerDay)} rows written a day, and ${bytes(FREE_LIMITS.d1StorageBytes)} of storage, for all databases together.</p>`
  if (!databases.ok) return `<section id="databases">${heading}${failed(databases.reason)}</section>`
  if (!databases.value.length) return `<section id="databases">${heading}<p class="muted">No databases found.</p></section>`
  const totalSize = databases.value.reduce((sum, database) => sum + (database.sizeBytes ?? 0), 0)
  const totalRead = databases.value.reduce((sum, database) => sum + database.rowsRead['24h'], 0)
  const totalWritten = databases.value.reduce((sum, database) => sum + database.rowsWritten['24h'], 0)
  const rows = databases.value.map((database) => `<tr><td>${named(label(DATABASE_LABELS, database.name), database.name)}</td><td class="num">${bytes(database.sizeBytes)}</td>
<td class="num">${count(database.rowsRead['24h'])}</td><td class="num">${count(database.rowsRead['30d'])}</td>
<td class="num">${count(database.rowsWritten['24h'])}</td><td class="num">${count(database.rowsWritten['30d'])}</td></tr>`).join('')
  const limits = ([
    ['Rows read today', totalRead, FREE_LIMITS.d1RowsReadPerDay, count(totalRead)],
    ['Rows written today', totalWritten, FREE_LIMITS.d1RowsWrittenPerDay, count(totalWritten)],
    ['Storage', totalSize, FREE_LIMITS.d1StorageBytes, bytes(totalSize)],
  ] as Array<[string, number, number, string]>).map(([name, used, limit, shown]) => {
    const share = used / limit
    return `<tr><td>${escapeHtml(name)}</td><td>${share >= 0.8 ? status('act', 'Near limit') : share >= 0.5 ? status('watch', 'Watch') : status('good', 'Fine')}</td><td class="num">${escapeHtml(shown)}</td><td><span class="status">${bar(share)}<span class="small muted">${percentOf(used, limit)}</span></span></td></tr>`
  }).join('')
  return `<section id="databases">${heading}<div class="scroll"><table><thead><tr><th>Free plan limit</th><th>Status</th><th class="num">Used</th><th>Progress</th></tr></thead><tbody>${limits}</tbody></table></div><h3>Each database</h3><div class="scroll"><table><thead>
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
  const heading = `<div class="head"><h2>Public page</h2><span class="iconbtn">${icon('globe')}</span></div><div class="choices" style="margin-top:12px">${choices}</div>`
  if (!data.visitors.ok) return `<section id="visitors">${heading}${failed(data.visitors.reason)}</section>`
  const { report, sampled, truncated, missing } = data.visitors.value
  const others = report.requests.robots + report.requests.automated
  const share = report.totalRequests ? Math.round((others / report.totalRequests) * 100) : 0
  const home = report.people.home
  const abroad = report.people.abroad
  const takeaway = `<p class="takeaway"><strong>${count(home)} visit${home === 1 ? '' : 's'} from ${HOME_NAME}</strong> in ${period}.${abroad ? ` ${count(abroad)} more from other countries, probably automated tools.` : ''} ${others ? `${share}% of all traffic was robots and scanners: normal for any new website, and nothing to do.` : ''}</p>`
  const tiles = [
    stat('people', `Visits from ${HOME_NAME}`, count(home), 'people, confirmed by the page style loading'),
    stat('globe', 'Other countries', count(abroad), 'probably automated'),
    stat('bug', 'Robots and scanners', count(others), `requests · ${share}% of traffic`),
    stat('refresh', 'Claude’s checks', count(report.requests.agent), 'requests from my tests'),
  ].join('')
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
  return `<section id="visitors">${heading}${takeaway}<div class="mini">${tiles}</div>${errors}
<div class="two"><div>${peopleChart}</div><div><h3>Who the people were</h3>${peopleTable}</div></div>
${otherChart}${renderChartTable(report.buckets)}${robots}
<details class="table-view"><summary>How people are told apart</summary><p class="small">A page load counts as a person when it comes from a recognised browser, from a home or mobile internet provider where Cloudflare says so, and the same browser also downloads the page's style or font that hour. Scanners posing as browsers fetch the page alone. A repeat visit that reuses the saved style is missed, so the count leans low. Known robots are those Cloudflare labels (search engines and similar). Claude's checks name themselves; older ones are recognised as curl or Node programs${report.agentLikely ? ` (${count(report.agentLikely)} of these requests)` : ''}. Everything else is scanners and other automated programs. A scanner that also fetches the style would count as a person, so small numbers are approximate.</p></details>
<p class="note">From Cloudflare's traffic records for tallywithus.com and www.tallywithus.com. Counts only; no visitor is identified. ${escapeHtml(notes)}</p></section>`
}

export function renderPage(data: PageData): string {
  currentRange = data.trafficRange
  const health = assessHealth(data)
  const level = health.level === 'info' ? 'good' : health.level
  const updated = torontoTime(data.now.toISOString())
  const nav = ([['#top', 'home', 'Overview'], ['#logbook', 'list', 'Logbook'], ['#workers', 'chart', 'Traffic'], ['#databases', 'storage', 'Databases'], ['#visitors', 'globe', 'Public page']] as Array<[string, IconName, string]>)
    .map(([href, iconName, text], index) => `<a href="${href}"${index === 0 ? ' class="active"' : ''}>${icon(iconName)}${text}</a>`).join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Tally with us — operations</title><style>${STYLE}${CHART_STYLE}</style></head>
<body><div class="shell">
<aside class="side"><div class="brand"><div>Tally <span>Ops</span></div></div>
<nav>${nav}</nav>
<div class="promo">${icon('lock', 28)}<b>Private to the owner</b><span>Updated ${escapeHtml(updated)}</span></div></aside>
<main class="content">
<header class="top" id="top"><div><p class="crumb">Pages / Operations</p><h1>Overview</h1></div>
<div class="toolbar"><span class="chip">${icon(STATUS_ICONS[level] ?? 'info', 20, `s-${level}`)}${escapeHtml(health.headline)}</span><a class="iconbtn" href="${escapeHtml(pageHref(data.logbookName, data.errorWindow))}" title="Refresh">${icon('refresh', 22)}</a><span class="round">T</span></div></header>
${renderGlance(health)}
${renderLogbook(data)}
${renderWorkers(data.workers)}
${renderDatabases(data.databases)}
${renderVisitors(data)}
<p class="foot">Shows only logbook fields and Cloudflare's operational counts; never names, amounts, emails, household ids, or anything people entered. Updated ${escapeHtml(updated)}.</p>
</main></div></body></html>`
}

export function renderMessage(title: string, message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main class="content" style="margin:60px auto;max-width:520px"><section><h2>${escapeHtml(title)}</h2><p class="muted">${escapeHtml(message)}</p></section></main></body></html>`
}
