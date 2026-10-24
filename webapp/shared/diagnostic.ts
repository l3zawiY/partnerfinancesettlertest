import type { SelfTestResult } from './selfTest'

/**
 * WEB-030, the web equivalent of v1's safe diagnostic (M18), format
 * `split-ledger-diagnostic/v1` with `app: "web"`. Built from an explicit allowlist: no
 * aliases, household name, emails, Clerk ids, periods, dates, merchants, amounts, card
 * labels, raw text, or URLs. See docs/DATA-FORMATS.md.
 */
export interface WebDiagnosticInput {
  applicationVersion: string
  deployment: string
  userAgent: string
  storageAvailable: boolean
  privateMonths: number
  rows: { amount: number; decided: boolean; pending?: boolean }[]
  rules: number
  cards: number
  amazonOrders: number
  amazonDecisions: number
  groupBy: 'day' | 'merchant'
  onlyUndecided: boolean
  pairing: { connected: number; role: 'coordinator' | 'partner' | 'member' | 'none' }
  workflow: { status: string; version: number }
  recentApiStatuses: { route: string; status: number }[]
  selfTests: SelfTestResult[]
}

const DEPLOYMENTS = ['local', 'staging', 'production']
const ROUTES = ['/api/me', '/api/household', '/api/household/pairing', '/api/workflows/:period', '/api/workflows/:period/submission', '/api/workflows/:period/close', '/api/workflows/export', '/api/workflows/capabilities', '/api/workflows/restore', '/api/workflows', '/api/workflows/cancel-abandoned', '/api/other']
const WORKFLOW_STATUSES = ['draft', 'ready', 'submitted', 'replaced', 'withdrawn', 'partner-ready', 'stale', 'closing', 'retryable-error', 'closed', 'recovery-required']

/** Browser family and major version only, for example "Chrome 141 on Windows". */
export function browserFamily(userAgent: string): string {
  const os = /Windows/.test(userAgent) ? 'Windows' : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS' : /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : /Linux/.test(userAgent) ? 'Linux' : 'other'
  const match = /Edg\/(\d+)/.exec(userAgent) || /Firefox\/(\d+)/.exec(userAgent) || /Chrome\/(\d+)/.exec(userAgent) || /Version\/(\d+).*Safari/.exec(userAgent)
  const name = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' : /Chrome\//.test(userAgent) ? (/HeadlessChrome/.test(userAgent) ? 'Headless Chrome' : 'Chrome') : /Safari\//.test(userAgent) ? 'Safari' : 'other'
  return name + (match ? ' ' + match[1] : '') + ' on ' + os
}

/** Collapses an API path to a fixed route name so no period or id leaves the browser. */
export function routeName(path: string): string {
  const clean = path.split('?')[0]!.replace(/\/\d{4}-\d{2}(?=\/|$)/, '/:period').replace(/^\/api\/household\/pairing\/.*$/, '/api/household/pairing')
  return ROUTES.includes(clean) ? clean : '/api/other'
}

export function buildWebDiagnostic(input: WebDiagnosticInput) {
  const failed = input.selfTests.filter(function (test) { return !test.ok })
  const posted = input.rows.filter(function (row) { return row.amount > 0 && !row.pending })
  return {
    format: 'split-ledger-diagnostic/v1',
    app: 'web',
    applicationVersion: String(input.applicationVersion),
    environment: {
      deployment: DEPLOYMENTS.includes(input.deployment) ? input.deployment : 'unknown',
      browser: browserFamily(input.userAgent),
      storageAvailable: !!input.storageAvailable,
    },
    counts: {
      privateMonths: Math.max(0, Math.floor(input.privateMonths)),
      transactions: input.rows.length,
      purchasesDecided: posted.filter(function (row) { return row.decided }).length,
      purchasesUndecided: posted.filter(function (row) { return !row.decided }).length,
      credits: input.rows.filter(function (row) { return row.amount < 0 }).length,
      pending: input.rows.filter(function (row) { return row.pending }).length,
      rules: input.rules,
      cards: input.cards,
      amazonOrders: input.amazonOrders,
      amazonDecisions: input.amazonDecisions,
    },
    view: { groupBy: input.groupBy === 'merchant' ? 'merchant' : 'day', onlyUndecided: !!input.onlyUndecided },
    pairing: { connected: Math.min(2, Math.max(0, input.pairing.connected)), role: input.pairing.role },
    workflow: { status: WORKFLOW_STATUSES.includes(input.workflow.status) ? input.workflow.status : 'other', version: Math.max(0, Math.floor(input.workflow.version)) },
    recentApi: input.recentApiStatuses.slice(-8).map(function (entry) { return { route: routeName(entry.route), status: Math.floor(entry.status) } }),
    selfTest: {
      total: input.selfTests.length,
      passed: input.selfTests.length - failed.length,
      failures: failed.map(function (test) { return { id: test.id, label: test.label, actual: test.actual, expected: test.expected } }),
    },
  }
}
