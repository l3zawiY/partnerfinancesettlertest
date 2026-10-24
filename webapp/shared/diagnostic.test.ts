import { describe, expect, it } from 'vitest'
import { browserFamily, buildWebDiagnostic, routeName } from './diagnostic'
import { runSelfTest } from './selfTest'

const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

describe('safe diagnostic (WEB-030)', function () {
  it('names only the browser family, major version, and system', function () {
    expect(browserFamily(CHROME_WINDOWS)).toBe('Chrome 141 on Windows')
    expect(browserFamily('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe('Safari 18 on macOS')
  })

  it('collapses API paths to fixed route names so no period or id leaves the browser', function () {
    expect(routeName('/api/workflows/2026-10/submission')).toBe('/api/workflows/:period/submission')
    expect(routeName('/api/workflows/2026-10')).toBe('/api/workflows/:period')
    expect(routeName('/api/household/pairing/join')).toBe('/api/household/pairing')
    expect(routeName('/api/unknown/org_secret?x=1')).toBe('/api/other')
  })

  it('carries counts and states only, and rejects unexpected free text', function () {
    const report = buildWebDiagnostic({
      applicationVersion: '0.0.0-experiment', deployment: 'https://evil.example.com', userAgent: CHROME_WINDOWS, storageAvailable: true, privateMonths: 3,
      rows: [{ amount: 12, decided: true }, { amount: 30, decided: false }, { amount: -5, decided: false }, { amount: 7, decided: false, pending: true }],
      rules: 2, cards: 1, amazonOrders: 0, amazonDecisions: 0, groupBy: 'merchant', onlyUndecided: true,
      pairing: { connected: 2, role: 'partner' }, workflow: { status: 'Fictional A <a@example.com>', version: 4 },
      recentApiStatuses: [{ route: '/api/workflows/2026-10', status: 200 }, { route: '/api/household/pairing/join', status: 403 }],
      selfTests: runSelfTest(),
    })
    expect(report.environment.deployment).toBe('unknown')
    expect(report.workflow.status).toBe('other')
    expect(report.counts).toMatchObject({ privateMonths: 3, transactions: 4, purchasesDecided: 1, purchasesUndecided: 1, credits: 1, pending: 1 })
    expect(report.recentApi).toEqual([{ route: '/api/workflows/:period', status: 200 }, { route: '/api/household/pairing', status: 403 }])
    expect(report.selfTest.passed).toBe(report.selfTest.total)
    expect(JSON.stringify(report)).not.toMatch(/@|example\.com|2026-10|org_|user_|Fictional|https?:/)
  })
})
