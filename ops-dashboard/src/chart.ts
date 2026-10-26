// A stacked column chart in plain HTML and CSS: no script (the page's security policy allows
// none), crisp at any width. Each column carries a native tooltip; a table twin follows.

import { escapeHtml } from './format'
import { KIND_LABELS, type Bucket, type Kind } from './traffic'

/** A clean axis top and 2–4 even steps, for example 0 / 50 / 100 / 150. */
export function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 2, 4] }
  const rough = max / 3
  const power = 10 ** Math.floor(Math.log10(rough))
  // Counts are whole numbers, so a step is never smaller than 1.
  const step = Math.max(1, [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? 10 * power)
  const top = Math.max(step, Math.ceil(max / step) * step)
  const ticks: number[] = []
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(value)
  return { top, ticks }
}

export function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`
  return String(Math.round(value))
}

/** One colored part of a column: which color class, its label, and its value per bucket. */
export interface Series { kind: Kind; label: string; value: (bucket: Bucket) => number }

export const PEOPLE_SERIES: Series[] = [{ kind: 'people', label: 'Visits from Canada', value: (bucket) => bucket.peopleVisits }]
export const OTHER_SERIES: Series[] = (['robots', 'automated', 'agent'] as Kind[]).map((kind) => ({ kind, label: KIND_LABELS[kind], value: (bucket: Bucket) => bucket.counts[kind] }))

function tooltip(bucket: Bucket, series: Series[]): string {
  const parts = series.filter((item) => item.value(bucket) > 0).map((item) => `${item.label}: ${item.value(bucket)}`)
  return `${bucket.detail}\n${parts.length ? parts.join('\n') : 'None'}`
}

export function renderStackedChart(buckets: Bucket[], caption: string, series: Series[] = OTHER_SERIES, height = 180): string {
  const totals = buckets.map((bucket) => series.reduce((sum, item) => sum + item.value(bucket), 0))
  const { top, ticks } = niceScale(Math.max(0, ...totals))
  const labelEvery = buckets.length > 12 ? 3 : 1
  const grid = ticks.map((tick) => `<div class="tick" style="bottom:${(tick / top) * 100}%"><span>${compact(tick)}</span></div>`).join('')
  const columns = buckets.map((bucket, index) => {
    const total = totals[index]
    const segments = series.filter((item) => item.value(bucket) > 0)
      .map((item) => `<span class="seg k-${item.kind}" style="flex-grow:${item.value(bucket)}"></span>`).join('')
    return `<div class="col" title="${escapeHtml(tooltip(bucket, series))}"><div class="stack" style="height:${(total / top) * 100}%">${segments}</div></div>`
  }).join('')
  const labels = buckets.map((bucket, index) => `<span>${index % labelEvery === (buckets.length - 1) % labelEvery ? escapeHtml(bucket.label) : ''}</span>`).join('')
  // A single series needs no legend: the caption names it.
  const legend = series.length > 1 ? `<div class="legend">${series.map((item) => `<span class="key"><span class="swatch k-${item.kind}"></span>${escapeHtml(item.label)}</span>`).join('')}</div>` : ''
  return `<figure class="chart"><figcaption class="small">${escapeHtml(caption)}</figcaption>${legend}
<div class="plot" style="height:${height}px"><div class="grid">${grid}</div><div class="cols">${columns}</div></div><div class="xlabels">${labels}</div></figure>`
}

export function renderChartTable(buckets: Bucket[]): string {
  const columns = [...PEOPLE_SERIES, ...OTHER_SERIES]
  const head = columns.map((item) => `<th class="num">${escapeHtml(item.label)}</th>`).join('')
  const rows = buckets.map((bucket) => `<tr><td>${escapeHtml(bucket.detail)}</td>${columns.map((item) => `<td class="num">${item.value(bucket)}</td>`).join('')}</tr>`).join('')
  return `<details class="table-view"><summary>Show both charts as a table</summary><div class="scroll"><table><thead><tr><th>When (Toronto)</th>${head}</tr></thead><tbody>${rows}</tbody></table></div></details>`
}

export const CHART_STYLE = `
.k-people { --c: #2a78d6; } .k-robots { --c: #eb6834; } .k-automated { --c: #1baf7a; } .k-agent { --c: #eda100; }
@media (prefers-color-scheme: dark) { .k-people { --c: #3987e5; } .k-robots { --c: #d95926; } .k-automated { --c: #199e70; } .k-agent { --c: #c98500; } }
.chart { margin: 12px 0 4px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 0.82rem; margin: 6px 0 10px; }
.key { display: inline-flex; align-items: center; gap: 6px; }
.swatch { width: 10px; height: 10px; border-radius: 2px; background: var(--c); }
.plot { position: relative; margin: 14px 0 0 34px; }
.chart figcaption { font-weight: 600; }
.grid .tick { position: absolute; left: 0; right: 0; border-top: 1px solid var(--line); }
.grid .tick span { position: absolute; right: calc(100% + 6px); transform: translateY(-50%); font-size: 0.72rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.cols { position: absolute; inset: 0; display: flex; align-items: flex-end; gap: 2px; }
.col { flex: 1; height: 100%; display: flex; align-items: flex-end; justify-content: center; cursor: default; }
.col:hover { background: color-mix(in srgb, var(--text) 5%, transparent); }
.stack { width: min(24px, 70%); display: flex; flex-direction: column-reverse; gap: 2px; }
.seg { flex-basis: 0; min-height: 2px; background: var(--c); }
.stack .seg:last-child { border-radius: 4px 4px 0 0; }
.xlabels { display: flex; gap: 2px; margin-left: 34px; margin-top: 4px; }
.xlabels span { flex: 1; text-align: center; font-size: 0.72rem; color: var(--muted); white-space: nowrap; overflow: visible; }
.table-view summary { cursor: pointer; color: var(--accent); font-size: 0.85rem; margin: 6px 0; }
`
