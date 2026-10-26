// Pure formatting helpers for the dashboard. No network, no storage.

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escapes any value for safe use in HTML text or a quoted attribute. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character])
}

const torontoFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
})

/** A UTC ISO time shown as Toronto local time, for example "Oct 26, 2026, 14:05 EDT". */
export function torontoTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return '—'
  return torontoFormat.format(new Date(time))
}

/** Whole numbers with thousands separators; missing values as a dash. */
export function count(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return Math.round(value).toLocaleString('en-CA')
}

/** Byte sizes in KB, MB, or GB (1 KB = 1,000 bytes, as Cloudflare's limits use). */
export function bytes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (value < 1_000) return `${value} B`
  const units = ['KB', 'MB', 'GB']
  let size = value / 1_000
  let unit = 0
  while (size >= 1_000 && unit < units.length - 1) {
    size /= 1_000
    unit += 1
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`
}

/** Share of a limit, for example "3%", or "<1%" for a small non-zero share. */
export function percentOf(value: number | null | undefined, limit: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const percent = (value / limit) * 100
  if (percent > 0 && percent < 1) return '<1%'
  return `${Math.round(percent)}%`
}
