import { describe, expect, it } from 'vitest'
import { bytes, count, escapeHtml, percentOf, torontoTime } from '../src/format'

describe('format', () => {
  it('escapes everything that could become markup', () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe('&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;')
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(503)).toBe('503')
  })

  it('shows UTC times in Toronto, on both sides of the daylight-saving change', () => {
    expect(torontoTime('2026-10-26T18:05:00.000Z')).toMatch(/Oct\.? 26, 2026, 14:05 EDT/)
    expect(torontoTime('2026-11-02T18:05:00.000Z')).toMatch(/Nov\.? 2, 2026, 13:05 EST/)
    expect(torontoTime('2026-10-27T03:30:00Z')).toMatch(/Oct\.? 26, 2026, 23:30 EDT/)
    expect(torontoTime(null)).toBe('—')
    expect(torontoTime('not a time')).toBe('—')
  })

  it('formats counts, sizes, and shares of a limit', () => {
    expect(count(1234567)).toBe('1,234,567')
    expect(count(undefined)).toBe('—')
    expect(bytes(512)).toBe('512 B')
    expect(bytes(36_864)).toBe('37 KB')
    expect(bytes(962_560)).toBe('963 KB')
    expect(bytes(5_000_000_000)).toBe('5.0 GB')
    expect(percentOf(0, 100)).toBe('0%')
    expect(percentOf(3, 1000)).toBe('<1%')
    expect(percentOf(25_000, 100_000)).toBe('25%')
    expect(percentOf(null, 10)).toBe('—')
  })
})
