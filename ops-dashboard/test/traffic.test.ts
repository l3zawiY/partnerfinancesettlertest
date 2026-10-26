import { describe, expect, it } from 'vitest'
import { agentMatch, buildReport, classify, isRangeName, makeBuckets, type TrafficRow } from '../src/traffic'
import { PEOPLE_SERIES, niceScale, renderStackedChart } from '../src/chart'

// FICTIONAL rows modelled on the owner's real case: 3 desktop visits, 1 phone visit, and a lot of probing.
const NOW = new Date('2026-10-26T15:20:00.000Z')
function row(overrides: Partial<TrafficRow>): TrafficRow {
  return { hour: '2026-10-26T14:00:00Z', path: '/', status: 200, browser: 'Chrome', network: 'FICTIONAL-HOME-ISP', bot: '', device: 'desktop', country: 'Canada', agent: '', requests: 1, visits: 1, ...overrides }
}

describe('telling people from robots', () => {
  it('counts a browser on a home network getting the page as a person', () => {
    expect(classify(row({}))).toBe('people')
    expect(classify(row({ path: '/style.css', visits: 0 }))).toBe('people')
    expect(classify(row({ device: 'mobile', browser: 'Mobile Safari' }))).toBe('people')
  })

  it('counts probing, non-browsers, and server networks as automated', () => {
    expect(classify(row({ path: '/wp-login.php', status: 404 }))).toBe('automated')
    expect(classify(row({ browser: 'unknown' }))).toBe('automated')
    expect(classify(row({ network: 'AMAZON-02' }))).toBe('automated')
    expect(classify(row({ network: 'DIGITALOCEAN-ASN' }))).toBe('automated')
    expect(classify(row({ status: 404 }))).toBe('automated')
  })

  it('separates known robots and Claude’s checks', () => {
    expect(classify(row({ bot: 'Search Engine Crawler' }))).toBe('robots')
    expect(classify(row({ agent: 'certain', browser: 'unknown' }))).toBe('agent')
    expect(agentMatch('tallywithus-agent-check/1')).toBe('certain')
    expect(agentMatch('curl/8.5.0')).toBe('likely')
    expect(agentMatch('node')).toBe('likely')
    expect(agentMatch('Mozilla/5.0 (X11; Linux) Chrome/120')).toBe('')
  })

  it('accepts only the two ranges', () => {
    expect(isRangeName('7d')).toBe(true)
    for (const value of ['30d', '', null, '__proto__']) expect(isRangeName(value)).toBe(false)
  })
})

describe('the public page report', () => {
  const rows = [
    // Owner: 3 desktop visits, each page + 3 files, one arriving via the http -> https redirect.
    ...[11, 13, 14].flatMap((hour) => [
      row({ hour: `2026-10-26T${hour}:00:00Z` }),
      row({ hour: `2026-10-26T${hour}:00:00Z`, path: '/style.css', visits: 0 }),
      row({ hour: `2026-10-26T${hour}:00:00Z`, path: '/fonts/inter.woff2', visits: 0 }),
    ]),
    row({ hour: '2026-10-26T11:00:00Z', status: 301 }),
    // Wife: one phone visit (page plus its style).
    row({ hour: '2026-10-26T12:00:00Z', device: 'mobile', browser: 'Mobile Safari', network: 'FICTIONAL-MOBILE' }),
    row({ hour: '2026-10-26T12:00:00Z', device: 'mobile', browser: 'Mobile Safari', network: 'FICTIONAL-MOBILE', path: '/style.css', visits: 0 }),
    // What the live page showed on 2026-10-26: programs posing as Chrome, page only, no style.
    row({ hour: '2026-10-26T13:00:00Z', country: 'DE', network: 'unknown', requests: 19, visits: 19 }),
    row({ hour: '2026-10-26T13:00:00Z', country: 'US', browser: 'Firefox', network: 'unknown', requests: 10, visits: 10 }),
    // Scanners and robots.
    row({ hour: '2026-10-26T03:00:00Z', path: '/.env', status: 404, browser: 'unknown', network: 'FICTIONAL CLOUD HOSTING', requests: 300, visits: 60 }),
    row({ hour: '2026-10-26T04:00:00Z', path: '/', browser: 'Chrome', network: 'DIGITALOCEAN-ASN', requests: 50, visits: 50 }),
    row({ hour: '2026-10-26T05:00:00Z', bot: 'Search Engine Crawler', requests: 12, visits: 12 }),
    // Claude's checks.
    row({ hour: '2026-10-26T02:00:00Z', browser: 'unknown', agent: 'likely', requests: 6, visits: 6 }),
  ]
  const report = buildReport(rows, '24h', NOW)

  it('lands near the real answer: about 4 visits by people', () => {
    expect(report.people).toEqual({ visits: 4, pageViews: 4 })
    expect(report.requests).toEqual({ people: 12, robots: 12, automated: 379, agent: 6 })
    expect(report.agentLikely).toBe(6)
    expect(report.totalRequests).toBe(409)
  })

  it('counts a page load without its style as a program posing as a browser', () => {
    expect(report.peopleGroups.some((group) => group.detail === 'DE')).toBe(false)
    expect(report.automatedGroups.find((group) => group.detail.startsWith('page only'))).toMatchObject({ label: '/', requests: 29 })
  })

  it('leans low for a repeat visit that reuses the cached style', () => {
    const repeat = buildReport([row({ requests: 2, visits: 2 }), row({ path: '/style.css', visits: 0 })], '24h', NOW)
    expect(repeat.people.visits).toBe(1)
  })

  it('puts requests into Toronto-labelled hours, newest last', () => {
    expect(report.buckets).toHaveLength(24)
    expect(report.buckets[23].key).toBe('2026-10-26T15')
    expect(report.buckets[23].label).toBe('11 am')
    expect(report.buckets.find((bucket) => bucket.key === '2026-10-26T03')!.counts.automated).toBe(300)
    const week = makeBuckets('7d', NOW)
    expect(week[week.length - 1].label).toBe('Mon 26')
    expect(week.length).toBeGreaterThanOrEqual(7)
  })

  it('lists who the people were and what was probed, biggest first', () => {
    expect(report.peopleGroups[0]).toMatchObject({ label: 'Chrome on desktop', detail: 'Canada', visits: 3, pageViews: 3 })
    expect(report.peopleGroups).toHaveLength(2)
    expect(report.peopleGroups[1]).toMatchObject({ label: 'Mobile Safari on mobile', visits: 1 })
    expect(report.automatedGroups[0]).toMatchObject({ label: '/.env', requests: 300 })
    expect(report.automatedGroups[0].detail).toBe('does not exist on the site')
    expect(report.peopleGroups[0].lastHour).toBe('2026-10-26T14:00:00Z')
    expect(report.buckets.find((bucket) => bucket.key === '2026-10-26T12')!.peopleVisits).toBe(1)
  })
})

describe('chart', () => {
  it('picks a clean scale', () => {
    expect(niceScale(0)).toEqual({ top: 4, ticks: [0, 2, 4] })
    expect(niceScale(7)).toEqual({ top: 10, ticks: [0, 5, 10] })
    expect(niceScale(1)).toEqual({ top: 1, ticks: [0, 1] })
    expect(niceScale(4)).toEqual({ top: 4, ticks: [0, 2, 4] })
    expect(niceScale(300)).toEqual({ top: 300, ticks: [0, 100, 200, 300] })
  })

  it('draws one column per bucket with a tooltip and legend, escaping labels', () => {
    const html = renderStackedChart(makeBuckets('24h', NOW).map((bucket, index) => ({ ...bucket, label: index === 0 ? '<b>' : bucket.label, counts: { people: index, robots: 0, automated: 1, agent: 0 } })), 'Fictional')
    expect(html.match(/class="col"/g)).toHaveLength(24)
    expect(html).toContain('Known robots')
    expect(html).toContain('Claude’s checks')
    expect(html).not.toContain('<b>')
    const people = renderStackedChart(makeBuckets('24h', NOW), 'Visits by people', PEOPLE_SERIES)
    expect(people).not.toContain('class="legend"')
  })
})
