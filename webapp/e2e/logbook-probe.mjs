// WEB-048 privacy probe. A fresh fictional Clerk test user signs in, sets up a household,
// and deliberately throws an uncaught error and an unhandled rejection whose messages
// contain a fictional merchant, amount, and email. Then it reads the logbook rows written during the run (local D1, or the staging
// logbook through Wrangler) and checks that the expected events arrived and that no row
// contains any of that text. Usage (from webapp/, with the app running):
//   CLERK_SECRET_KEY=sk_test_... node e2e/logbook-probe.mjs [--base https://split-ledger-staging.<account>.workers.dev]
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clerk, loadPlaywright, recorder, signIn, waitFor } from './lib.mjs'

const args = process.argv.slice(2)
const baseUrl = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:5173'
const host = new URL(baseUrl).hostname
const local = /^(localhost|127\.0\.0\.1)$/.test(host)
if (!local && !host.endsWith('.workers.dev')) throw new Error('Refusing to run against ' + host + ': only local or workers.dev staging addresses are allowed.')

const run = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12) + randomBytes(2).toString('hex')
const outDir = join(tmpdir(), 'split-ledger-logbook-probe-' + run)
const api = clerk(process.env.CLERK_SECRET_KEY)
const r = recorder(outDir)
const password = 'Fx-' + randomBytes(9).toString('base64url') + '9a!'
const email = 'fictional-' + run + '-probe+clerk_test@example.com'
const household = 'Fictional Probe ' + run.slice(-6)
const FORBIDDEN = ['Fictional Probe Merchant', '987.65', 'probe-person@example.com', email, household, 'Fictional P', 'FICTIONAL', 'Sample']
const started = new Date(Date.now() - 5000).toISOString()
console.log('Logbook probe ' + run + ' against ' + baseUrl + '\nEvidence: ' + outDir)

function logbookRows() {
  const query = "SELECT * FROM logbook WHERE at >= '" + started + "' ORDER BY id"
  const target = local ? ['split-ledger-logbook', '--local'] : ['split-ledger-telemetry-staging', '--remote', '--env', 'staging']
  const output = execFileSync('npx', ['wrangler', 'd1', 'execute', ...target, '--command', query, '--json'], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: '.wrangler/logs' }, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
  return JSON.parse(output)[0].results
}

const { chromium } = loadPlaywright()
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined
const browser = await chromium.launch({ proxy })
const ids = {}
try {
  ids.user = await api.createUser(email, password)
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage()
  r.scenario('LB-01', 'Allowlisted events arrive; crash text never does')
  await signIn(page, baseUrl, email, password)
  await page.fill('input[name=name]', household)
  await page.getByRole('button', { name: 'Continue', exact: true }).click(); await page.waitForTimeout(6000)
  await page.getByLabel('Household name (privacy-safe, shown to both of you)').fill(household)
  await page.getByLabel('Your alias (no email address)').fill('Fictional P')
  await page.getByLabel(/I understand that as coordinator/).check()
  await page.getByRole('button', { name: 'Set up this household' }).click(); await page.waitForTimeout(3000)
  ids.org = (await api.organizationByName(household))?.id
  r.check('household set up', await waitFor(page, /Waiting for your partner/, 10000) >= 0)
  // The pairing screen is enough: the logbook is on as soon as the session reaches the Worker.
  await page.evaluate(function () {
    setTimeout(function () { throw new TypeError('Fictional Probe Merchant $987.65 for probe-person@example.com') }, 0)
    void Promise.reject(new RangeError('Fictional Probe Merchant $987.65'))
  })
  await page.waitForTimeout(4000)
  let rows = logbookRows()
  const errors = rows.filter(function (row) { return row.event === 'browser_error' })
  r.check('two browser errors recorded', errors.length === 2, JSON.stringify(rows.map(function (row) { return row.event })))
  r.check('errors carry type and screen only', errors.every(function (row) { return ['TypeError', 'RangeError'].includes(row.error_type) && row.screen === 'pairing' && row.role === 'coordinator' }), JSON.stringify(errors))
  r.check('setup recorded as activity', rows.some(function (row) { return row.event === 'household_initialized' && row.role === 'coordinator' }))
  r.note('a single-person household cannot import; statement and self-test events are covered by the WEB-031 run')
  rows = logbookRows()
  const text = JSON.stringify(rows)
  const leaked = FORBIDDEN.filter(function (word) { return text.includes(word) })
  r.check('no row contains the crash message, email, household, or alias', leaked.length === 0, leaked.join(', '))
  r.check('no row contains an id or an amount-like value', !/user_|org_|\$\d|@/.test(text))
} catch (error) {
  r.error(error)
} finally {
  await browser.close()
  if (ids.user) await api.deleteUser(ids.user).catch(function () {})
  if (ids.org) await api.deleteOrganization(ids.org).catch(function () {})
  const summary = r.save()
  console.log('\n' + summary.join('\n') + '\nEvidence: ' + outDir)
  process.exitCode = summary.some(function (row) { return row.startsWith('FAIL') }) ? 1 : 0
}
