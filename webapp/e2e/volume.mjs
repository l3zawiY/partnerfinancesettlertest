// WEB-051: volume check. Two fresh fictional Clerk test users pair a fresh household, then
// for three months each imports 200 fictional purchases across 40 merchants, decides them
// with Apply to group, and submits; the coordinator closes each month. Every archive is
// compared with an exact integer-cent recalculation of the generated purchases. Usage (from
// webapp/, with the app running):
//   CLERK_SECRET_KEY=sk_test_... node e2e/volume.mjs [--base http://localhost:5173] [--keep]
// Evidence goes to a folder outside the repository, printed at the start. It refuses a
// production address or a live Clerk key, and removes its users and household at the end.
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clerk, importStatement, loadPlaywright, recorder, setMonth, signIn, tab, waitFor } from './lib.mjs'

const args = process.argv.slice(2)
const baseUrl = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:5173'
const keep = args.includes('--keep')
const host = new URL(baseUrl).hostname
if (!/^(localhost|127\.0\.0\.1)$/.test(host) && !host.endsWith('.workers.dev')) throw new Error('Refusing to run against ' + host + ': only local or workers.dev staging addresses are allowed.')

const MONTHS = ['2026-04', '2026-05', '2026-06']
const PER_PERSON = 200
const WORDS = ['ALPHA', 'BRAVO', 'CEDAR', 'DELTA', 'EMBER', 'FALCON', 'GARNET', 'HARBOR', 'IVORY', 'JUNIPER', 'KESTREL', 'LINDEN', 'MAPLE', 'NORTH', 'OPAL', 'PRAIRIE', 'QUARTZ', 'RIVER', 'SPRUCE', 'TUNDRA']
const MERCHANTS = WORDS.flatMap(function (word) { return ['FICTIONAL ' + word + ' MARKET', 'FICTIONAL ' + word + ' CAFE'] }) // 40
const SHARES = [{ label: 'Mine', share: 1 }, { label: '70/30', share: 0.7 }, { label: '50/50', share: 0.5 }, { label: '30/70', share: 0.3 }, { label: 'Theirs', share: 0 }]
function display(merchant) { return merchant.toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase() }) }
function shareFor(merchantIndex, person) { return SHARES[(merchantIndex + (person === 'b' ? 2 : 0)) % SHARES.length] }

// Deterministic fictional purchases: a seeded generator so a failure can be reproduced.
function generator(seed) { let x = seed >>> 0; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296 } }
function purchases(month, person) {
  const next = generator((month.replace('-', '') | 0) * (person === 'a' ? 7 : 13))
  const seen = new Set(), rows = []
  while (rows.length < PER_PERSON) {
    const m = Math.floor(next() * MERCHANTS.length), day = 1 + Math.floor(next() * 28), cents = 100 + Math.floor(next() * 14900)
    const date = month + '-' + String(day).padStart(2, '0')
    if (seen.has(date + cents)) continue // the importer treats identical date and amount as a possible duplicate
    seen.add(date + cents)
    rows.push({ merchantIndex: m, merchant: MERCHANTS[m], date, cents })
  }
  return rows
}
function statement(rows) { return rows.map(function (row) { return row.date + ' ' + row.merchant + ' $' + (row.cents / 100).toFixed(2) }).join('\n') }
// Same rule as shared/money.ts claimCents: round half away from zero on whole cents.
function claimCents(cents, share) { const raw = cents * (1 - share); return Math.sign(raw) * Math.round(Math.abs(raw) + 1e-9) }
function expected(rowsA, rowsB) {
  const items = []
  for (const [payer, rows] of [['a', rowsA], ['b', rowsB]]) for (const row of rows) {
    const share = shareFor(row.merchantIndex, payer).share
    if (share === 1) continue // Mine stays private and never reaches the archive
    items.push({ payer, date: row.date, merchant: display(row.merchant), cents: row.cents, share, owed: claimCents(row.cents, share) })
  }
  const aClaim = items.filter(function (i) { return i.payer === 'a' }).reduce(function (t, i) { return t + i.owed }, 0)
  const bClaim = items.filter(function (i) { return i.payer === 'b' }).reduce(function (t, i) { return t + i.owed }, 0)
  return { items, aClaim, bClaim, net: Math.abs(aClaim - bClaim), direction: aClaim > bClaim ? 'b_owes_a' : aClaim < bClaim ? 'a_owes_b' : 'square' }
}
function itemKey(i) { return [i.payer, i.date, i.merchant, i.cents, i.share, i.owed].join('|') }

const run = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12) + randomBytes(2).toString('hex')
const outDir = join(tmpdir(), 'split-ledger-volume-' + run)
const api = clerk(process.env.CLERK_SECRET_KEY)
const r = recorder(outDir)
const password = 'Fx-' + randomBytes(9).toString('base64url') + '9a!'
const people = { A: 'fictional-' + run + '-a+clerk_test@example.com', B: 'fictional-' + run + '-b+clerk_test@example.com' }
const household = 'Fictional Volume ' + run.slice(-6)
console.log('Volume run ' + run + ' against ' + baseUrl + '\nEvidence: ' + outDir)

const { chromium } = loadPlaywright()
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined
const browser = await chromium.launch({ proxy })
const ids = {}
const consoleErrors = []
async function newPage(name) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true })
  const page = await context.newPage()
  page.on('dialog', function (dialog) { void dialog.accept() })
  page.on('pageerror', function (error) { consoleErrors.push(name + ' pageerror: ' + error.message.slice(0, 200)) })
  page.on('console', function (message) { if (message.type() === 'error' && !/challenges\.cloudflare|development keys/.test(message.text())) consoleErrors.push(name + ': ' + message.text().slice(0, 200)) })
  return page
}
async function seconds(action) { const started = Date.now(); await action(); return Math.round((Date.now() - started) / 100) / 10 }

async function decideByGroup(page, rows, person) {
  await tab(page, 'Review')
  await page.getByRole('button', { name: 'Merchant', exact: true }).click(); await page.waitForTimeout(400)
  let clicks = 0
  for (const index of new Set(rows.map(function (row) { return row.merchantIndex }))) {
    const name = 'Apply ' + shareFor(index, person).label + ' to every ' + display(MERCHANTS[index]) + ' purchase'
    await page.getByRole('button', { name, exact: true }).click(); clicks++
  }
  await page.waitForTimeout(500)
  return clicks
}

try {
  ids.A = await api.createUser(people.A, password); ids.B = await api.createUser(people.B, password)
  const A = await newPage('A'), B = await newPage('B')

  r.scenario('V-00', 'Pair a fresh fictional household')
  await signIn(A, baseUrl, people.A, password)
  await A.fill('input[name=name]', household)
  await A.getByRole('button', { name: 'Continue', exact: true }).click(); await A.waitForTimeout(6000)
  await A.getByLabel('Household name (privacy-safe, shown to both of you)').fill(household)
  await A.getByLabel('Your alias (no email address)').fill('Fictional A')
  await A.getByLabel(/I understand that as coordinator/).check()
  await A.getByRole('button', { name: 'Set up this household' }).click(); await A.waitForTimeout(3000)
  ids.org = (await api.organizationByName(household))?.id
  await A.getByLabel('Partner’s email address').fill(people.B)
  await A.getByRole('button', { name: 'Send invitation' }).click()
  await waitFor(A, /Invitation sent through Clerk/, 10000)
  await signIn(B, baseUrl, people.B, password)
  await B.getByRole('button', { name: 'Join', exact: true }).first().click(); await B.waitForTimeout(5000)
  if (/Choose an organization/.test(await B.innerText('body'))) { await B.getByText(household).first().click(); await B.waitForTimeout(5000) }
  await B.getByLabel('Your alias (no email address)').fill('Fictional B')
  await B.getByRole('button', { name: 'Join as partner' }).click(); await B.waitForTimeout(3000)
  await A.getByRole('button', { name: 'Check latest pairing' }).click(); await A.waitForTimeout(2500)
  r.check('both show 2 of 2 connected', /2 of 2 connected/.test(await A.innerText('body')) && /2 of 2 connected/.test(await B.innerText('body')))

  for (const month of MONTHS) {
    r.scenario('V-' + month, 'Month ' + month + ': 200 purchases each, decide by group, close')
    const rows = { a: purchases(month, 'a'), b: purchases(month, 'b') }
    for (const [person, page] of [['b', B], ['a', A]]) {
      await setMonth(page, month)
      let added = ''
      const importTime = await seconds(async function () { added = await importStatement(page, 'Other / generic paste', statement(rows[person])) })
      r.check(person.toUpperCase() + ' imported 200 rows', /Added 200\b/.test(added), added)
      let clicks = 0
      const decideTime = await seconds(async function () { clicks = await decideByGroup(page, rows[person], person) })
      await tab(page, 'Share / Status')
      const submitButton = page.getByRole('button', { name: 'Submit shared projection' })
      r.check(person.toUpperCase() + ' has every row decided', await submitButton.isEnabled())
      const submitTime = await seconds(async function () { await submitButton.click(); await page.waitForTimeout(1500) })
      r.note(person.toUpperCase() + ': import ' + importTime + ' s, ' + clicks + ' Apply to group clicks in ' + decideTime + ' s, submit ' + submitTime + ' s')
    }
    await tab(A, 'Settle')
    await waitFor(A, /Fictional . pays Fictional . \$|are square/)
    await A.getByLabel('I checked the private count and net against my bank.').check()
    const [file] = await Promise.all([A.waitForEvent('download', { timeout: 20000 }), A.getByRole('button', { name: 'Close month and archive' }).click()])
    const path = join(outDir, run + '-' + file.suggestedFilename()); await file.saveAs(path)
    const archive = JSON.parse(readFileSync(path, 'utf8'))
    const want = expected(rows.a, rows.b)
    const got = archive.items.map(function (i) { return { payer: i.payer, date: i.date, merchant: i.merchant, cents: Math.round(i.amount * 100), share: i.shareOfPayer, owed: Math.round(i.owedToPayer * 100) } })
    const wantKeys = want.items.map(itemKey).sort(), gotKeys = got.map(itemKey).sort()
    const firstDifference = wantKeys.find(function (key, n) { return key !== gotKeys[n] })
    r.check('archive holds exactly the expected ' + want.items.length + ' shared items', wantKeys.length === gotKeys.length && !firstDifference, 'expected ' + wantKeys.length + ', got ' + gotKeys.length + (firstDifference ? '; first difference ' + firstDifference : ''))
    r.check('claims and net match the integer recalculation to the cent',
      Math.round(archive.settlement.aClaim * 100) === want.aClaim && Math.round(archive.settlement.bClaim * 100) === want.bClaim && Math.round(archive.settlement.net * 100) === want.net && archive.settlement.direction === want.direction,
      JSON.stringify(archive.settlement) + ' vs ' + JSON.stringify({ aClaim: want.aClaim, bClaim: want.bClaim, net: want.net, direction: want.direction }))
    const storage = await A.evaluate(function () { let total = 0; for (let n = 0; n < localStorage.length; n++) { const key = localStorage.key(n); total += key.length + (localStorage.getItem(key) || '').length } return total })
    r.note('A browser storage after ' + month + ': ' + Math.round(storage / 1024) + ' KB')
  }

  r.scenario('CONSOLE', 'No application console errors during the run')
  r.check('no application-origin console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (error) {
  r.error(error)
} finally {
  await browser.close()
  if (!keep) {
    for (const id of [ids.A, ids.B]) if (id) await api.deleteUser(id).catch(function () {})
    if (ids.org) await api.deleteOrganization(ids.org).catch(function () {})
    console.log('Removed the run\'s fictional users and household from Clerk Development.')
  }
  const rows = r.save()
  console.log('\n' + rows.join('\n') + '\nEvidence: ' + outDir)
  process.exitCode = rows.some(function (row) { return row.startsWith('FAIL') }) ? 1 : 0
}
