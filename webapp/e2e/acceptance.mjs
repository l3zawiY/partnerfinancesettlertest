// WEB-031: automated two-account acceptance suite. Runs HC-01 to HC-10 from
// docs/WEBAPP-HUMAN-TESTING.md plus the reruns H4C-03, H4C-05, H5-03, and H5-04 against a
// running app, with three fresh fictional Clerk test users and a fresh household, removed
// at the end. Usage (from webapp/, with the app running):
//   CLERK_SECRET_KEY=sk_test_... node e2e/acceptance.mjs [--base http://localhost:5173] [--keep]
// Evidence (screenshots, archives, results.json, summary.txt) goes to a folder outside the
// repository, printed at the start. It refuses a production address or a live Clerk key.
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bodyText, clerk, decide, fixture, importStatement, loadPlaywright, recorder, setMonth, settleLine, signIn, tab, waitFor } from './lib.mjs'

const args = process.argv.slice(2)
const baseUrl = (args[args.indexOf('--base') + 1] && args.includes('--base')) ? args[args.indexOf('--base') + 1] : 'http://localhost:5173'
const keep = args.includes('--keep')
const host = new URL(baseUrl).hostname
if (!/^(localhost|127\.0\.0\.1)$/.test(host) && !host.endsWith('.workers.dev')) throw new Error('Refusing to run against ' + host + ': only local or workers.dev staging addresses are allowed.')

const run = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12) + randomBytes(2).toString('hex')
const outDir = join(tmpdir(), 'split-ledger-e2e-' + run)
const api = clerk(process.env.CLERK_SECRET_KEY)
const r = recorder(outDir)
const password = 'Fx-' + randomBytes(9).toString('base64url') + '9a!'
const people = { A: 'fictional-' + run + '-a+clerk_test@example.com', B: 'fictional-' + run + '-b+clerk_test@example.com', C: 'fictional-' + run + '-c+clerk_test@example.com' }
const household = 'Fictional Household ' + run.slice(-6)
console.log('Run ' + run + ' against ' + baseUrl + '\nEvidence: ' + outDir)

const { chromium } = loadPlaywright()
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined
const browser = await chromium.launch({ proxy })
const ids = {}
const contexts = {}
const pages = {}
const consoleErrors = []
let probing = false // deliberate refusal probes log expected 403s in the browser console
async function newContext(name, state) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true, storageState: state })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseUrl).origin })
  const page = await context.newPage()
  page.on('dialog', function (dialog) { r.note('unexpected browser dialog: ' + dialog.message()); void dialog.accept() })
  page.on('pageerror', function (error) { consoleErrors.push(name + ' pageerror: ' + error.message.slice(0, 200)) })
  page.on('console', function (message) {
    const text = message.text()
    if (!probing && message.type() === 'error' && !/challenges\.cloudflare|data:,|font-size:0|GL Driver|OTS parsing|development keys/.test(text)) consoleErrors.push(name + ': ' + text.slice(0, 200))
  })
  contexts[name] = context; pages[name] = page
  return page
}
async function download(page, action) {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), action()])
  const path = join(outDir, run + '-' + file.suggestedFilename())
  await file.saveAs(path)
  return readFileSync(path, 'utf8')
}
async function apiAs(page, method, path, body) {
  probing = true
  try { return await page.evaluate(async function ({ method, path, body }) {
    const token = await window.Clerk.session.getToken()
    const response = await fetch(path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return response.status
  }, { method, path, body }) } finally { await page.waitForTimeout(300); probing = false }
}
async function scenario(id, title, body) { r.scenario(id, title); try { await body() } catch (error) { r.error(error); for (const page of Object.values(pages)) await r.shot(page, 'error-' + Object.keys(pages).find(function (k) { return pages[k] === page })) } }

try {
  for (const who of ['A', 'B', 'C']) ids[who] = await api.createUser(people[who], password)
  const A = await newContext('A'), B = await newContext('B'), C = await newContext('C')

  await scenario('HC-01', 'Coordinator initializes the household', async function () {
    await signIn(A, baseUrl, people.A, password)
    await A.fill('input[name=name]', household)
    await A.getByRole('button', { name: 'Continue', exact: true }).click()
    await A.waitForTimeout(6000)
    r.check('setup card shown', /Split Ledger is not set up for this household yet/.test(await A.innerText('body')))
    await A.getByLabel('Household name (privacy-safe, shown to both of you)').fill(household)
    await A.getByLabel('Your alias (no email address)').fill('person@example.com')
    r.check('email alias refused', await A.getByRole('button', { name: 'Set up this household' }).isDisabled())
    await A.getByLabel('Your alias (no email address)').fill('Fictional A')
    await A.getByLabel(/I understand that as coordinator/).check()
    await A.getByRole('button', { name: 'Set up this household' }).click()
    await A.waitForTimeout(2500)
    await A.reload({ waitUntil: 'networkidle' }); await A.waitForTimeout(3000)
    const text = await A.innerText('body')
    r.check('waiting for partner after reload', /Waiting for your partner/.test(text) && /1 of 2 connected/.test(text))
    r.check('no monthly tabs yet', !(await A.getByRole('tab', { name: 'Import', exact: true }).count()))
    ids.org = (await api.organizationByName(household))?.id
    await r.shot(A, 'waiting')
  })

  await scenario('HC-02', 'Invitation and explicit partner join', async function () {
    await A.getByLabel('Partner’s email address').fill(people.B)
    await A.getByRole('button', { name: 'Send invitation' }).click()
    r.check('invitation recorded as the partner invitation', await waitFor(A, /Invitation sent through Clerk/, 10000) >= 0)
    await signIn(B, baseUrl, people.B, password)
    await B.getByRole('button', { name: 'Join', exact: true }).first().click(); await B.waitForTimeout(5000)
    if (/Choose an organization/.test(await B.innerText('body'))) { await B.getByText(household).first().click(); await B.waitForTimeout(5000) }
    r.check('invited card names the coordinator', /You are invited to pair with Fictional A/.test(await B.innerText('body')))
    await B.getByLabel('Your alias (no email address)').fill('Fictional B')
    await B.getByRole('button', { name: 'Join as partner' }).click(); await B.waitForTimeout(3000)
    await A.getByRole('button', { name: 'Check latest pairing' }).click(); await A.waitForTimeout(2500)
    const a = await A.innerText('body'), b = await B.innerText('body')
    r.check('both show 2 of 2 with roles', /2 of 2 connected · you are the coordinator/.test(a) && /2 of 2 connected · you are the partner/.test(b))
    r.check('headers orient each viewer', /You are Fictional A \(coordinator\)/.test(a) && /You are Fictional B \(partner\)/.test(b))
    r.check('no Join button after joining', !(await B.getByRole('button', { name: 'Join as partner' }).count()))
    await r.shot(B, 'paired')
  })

  await scenario('HC-03', 'Third-member refusal', async function () {
    await api.invite(ids.org, people.C, ids.A)
    await signIn(C, baseUrl, people.C, password)
    await C.getByRole('button', { name: 'Join', exact: true }).first().click(); await C.waitForTimeout(5000)
    if (/Choose an organization/.test(await C.innerText('body'))) { await C.getByText(household).first().click(); await C.waitForTimeout(5000) }
    let text = await C.innerText('body')
    r.check('refusal heading', /This household already has two participants/.test(text))
    r.check('no tabs, amounts, or emails', !(await C.getByRole('tab').count()) && !/\$|@/.test(text))
    const statuses = [await apiAs(C, 'GET', '/api/workflows/2026-07'), await apiAs(C, 'POST', '/api/workflows/2026-07/close', { expectedVersion: 1, requestId: 'request_third_close' }), await apiAs(C, 'POST', '/api/household/pairing/join', { alias: 'Fictional C', requestId: 'request_third_join' })]
    r.check('server refuses the third member', statuses[0] === 403 && statuses[1] === 403 && statuses[2] === 409, statuses.join(','))
    await api.setRole(ids.org, ids.C, 'org:admin')
    await C.reload({ waitUntil: 'networkidle' }); await C.waitForTimeout(3000)
    text = await C.innerText('body')
    r.check('administrator status changes nothing', /This household already has two participants/.test(text) && await apiAs(C, 'GET', '/api/workflows/capabilities') === 403)
    await r.shot(C, 'refused')
  })

  await scenario('HC-04', 'Stable roles independent of submission order', async function () {
    await setMonth(B, '2026-08')
    await importStatement(B, 'Other / generic paste', fixture('F-H', 1))
    await tab(B, 'Review'); await B.getByRole('button', { name: 'Merchant', exact: true }).click()
    await B.getByRole('button', { name: 'Apply 50/50 to every Sample Bakery purchase' }).click(); await B.waitForTimeout(400)
    await tab(B, 'Share / Status'); await B.getByRole('button', { name: 'Submit shared projection' }).click(); await B.waitForTimeout(2000)
    r.check('partner waits for coordinator', /Waiting for Fictional A/.test(await B.innerText('body')))
    await setMonth(A, '2026-08')
    await importStatement(A, 'Other / generic paste', fixture('F-H', 0))
    await decide(A, 'Sample Cinema', '50/50')
    await tab(A, 'Share / Status'); await A.waitForTimeout(1500)
    r.check('coordinator sees the partner submitted first', /Fictional B submitted August 2026/.test(await A.innerText('body')))
    await A.getByRole('button', { name: 'Submit shared projection' }).click(); await A.waitForTimeout(2000)
    const lineA = await settleLine(A)
    await tab(B, 'Settle'); await waitFor(B, /Fictional B pays Fictional A \$10\.00/)
    const lineB = await settleLine(B)
    r.check('both settle B pays A $10.00', lineA === 'Fictional B pays Fictional A $10.00' && lineB === lineA, lineA + ' / ' + lineB)
    await A.getByLabel('I checked the private count and net against my bank.').check()
    const archive = JSON.parse(await download(A, function () { return A.getByRole('button', { name: 'Close month and archive' }).click() }))
    r.check('archive uses aliases, direction, and net', archive.people.a === 'Fictional A' && archive.people.b === 'Fictional B' && archive.settlement.direction === 'b_owes_a' && archive.settlement.net === 10, JSON.stringify(archive.people) + JSON.stringify(archive.settlement))
    await tab(A, 'Setup'); await A.getByLabel('First person').fill('Someone Else'); await A.waitForTimeout(500)
    r.check('typed name never changes the alias', /You are Fictional A \(coordinator\)/.test(await A.innerText('body')))
  })

  await scenario('HC-05', 'Submission is a visible handover', async function () {
    await setMonth(A, '2026-07')
    await importStatement(A, 'TD — 5 columns with balance', fixture('F-A'))
    await decide(A, 'Sample Restaurant', '50/50'); await decide(A, 'Sample Book Shop', '50/50')
    await tab(A, 'Share / Status')
    await A.getByRole('button', { name: 'Submit shared projection' }).click(); await A.waitForTimeout(2000)
    r.check('coordinator waits for partner', /Waiting for Fictional B to submit/.test(await A.innerText('body')))
    await setMonth(B, '2026-07'); await tab(B, 'Share / Status')
    r.check('partner sees the handover without reload', await waitFor(B, /Fictional A submitted July 2026/) >= 0)
    await importStatement(B, 'Other / generic paste', fixture('F-G'))
    await decide(B, 'Fictional Hardware', '50/50')
    await tab(B, 'Share / Status')
    r.check('H5-04: submit disabled with a reason while a purchase is undecided', await B.getByRole('button', { name: 'Submit shared projection' }).isDisabled() && /still need a decision/.test(await B.innerText('body')))
    await decide(B, 'Fictional Tickets', '30/70')
    await tab(B, 'Share / Status'); await B.getByRole('button', { name: 'Submit shared projection' }).click(); await B.waitForTimeout(2000)
    r.check('your-turn message offered to the partner', /Both sides are in, so you can review and close it/.test(await B.innerText('body')))
    r.check('coordinator notified without reload', await waitFor(A, /Shared status updated while you were here\. Fictional B submitted/) >= 0)
    const lineA = await settleLine(A), lineB = await settleLine(B)
    r.check('both settle B pays A $21.54', lineA === 'Fictional B pays Fictional A $21.54' && lineB === lineA, lineA + ' / ' + lineB)
    await tab(A, 'Share / Status')
  })

  await scenario('HC-06', 'Replace and withdraw revoke readiness', async function () {
    await decide(B, 'Fictional Tickets', '50/50'); await tab(B, 'Share / Status')
    await B.getByRole('button', { name: 'Replace submission' }).click(); await B.waitForTimeout(2000)
    r.check('partner reads "You replaced your submission"', /You replaced your submission \(version 3/.test(await B.innerText('body')))
    r.check('coordinator told about the replacement', await waitFor(A, /Fictional B replaced their submission \(version 3/) >= 0)
    r.check('settlement follows to $29.54', await settleLine(A) === 'Fictional B pays Fictional A $29.54')
    await tab(A, 'Share / Status')
    await B.getByRole('button', { name: 'Withdraw' }).click(); await B.waitForTimeout(2000)
    r.check('coordinator loses readiness after withdrawal', await waitFor(A, /Fictional B withdrew their submission \(version 4/) >= 0)
    await tab(A, 'Settle')
    r.check('close disabled while a side is missing', await A.getByRole('button', { name: 'Close month and archive' }).isDisabled())
    await decide(B, 'Fictional Tickets', '30/70'); await tab(B, 'Share / Status')
    await B.getByRole('button', { name: 'Submit shared projection' }).click(); await B.waitForTimeout(2000)
    await tab(A, 'Share / Status')
    r.check('both ready again', await waitFor(A, /Fictional B submitted \(version 5/) >= 0)
    r.check('settlement back to $21.54', await settleLine(A) === 'Fictional B pays Fictional A $21.54')
    await tab(B, 'Share / Status')
    const buttons = await B.$$eval('button', function (all) { return all.filter(function (b) { return b.offsetParent }).map(function (b) { return b.innerText.trim() }) })
    r.check('partner controls only its own submission', buttons.includes('Replace submission') && buttons.includes('Withdraw') && !buttons.some(function (t) { return /Close month/.test(t) }))
  })

  await scenario('HC-07', 'Stale recovery is safe and understandable', async function () {
    const tab2 = await contexts.B.newPage()
    await tab2.goto(baseUrl, { waitUntil: 'networkidle' }); await tab2.waitForTimeout(3000)
    await setMonth(tab2, '2026-07'); await tab(tab2, 'Share / Status')
    await decide(B, 'Fictional Hardware', '70/30'); await tab(B, 'Share / Status')
    await B.getByRole('button', { name: 'Replace submission' }).click(); await B.waitForTimeout(1500)
    await tab2.bringToFront()
    r.check('second tab updates itself to version 6', await waitFor(tab2, /Version 6/) >= 0)
    await tab(tab2, 'Review')
    r.check('second tab adopted the newer private decision (WEB-027)', /Fictional Hardware[\s\S]{0,120}70% to partner|Fictional Hardware[\s\S]{0,120}Shared 30%/.test(await tab2.innerText('body')) || /another tab of this browser/.test(await tab2.innerText('body')))
    await tab(tab2, 'Share / Status')
    await B.getByRole('button', { name: 'Replace submission' }).click(); await B.waitForTimeout(800)
    await tab2.getByRole('button', { name: 'Withdraw' }).click(); await tab2.waitForTimeout(2000)
    const conflict = await tab2.innerText('body')
    r.check('forced conflict keeps the private draft and disables actions', /Shared status changed/.test(conflict) && /private draft in this browser is safe/.test(conflict))
    await tab2.getByRole('button', { name: 'Load latest shared status' }).click(); await tab2.waitForTimeout(2000)
    r.check('recovery explains and re-enables', /Loaded the latest shared status/.test(await tab2.innerText('body')) && !(await tab2.getByRole('button', { name: 'Withdraw' }).isDisabled()))
    await tab2.getByRole('button', { name: 'Withdraw' }).click(); await tab2.waitForTimeout(1500)
    await tab2.getByRole('button', { name: 'Submit shared projection' }).click(); await tab2.waitForTimeout(1500)
    r.check('H5-04: sequential withdraw and resubmit without a conflict', !/review needed|Shared status changed/i.test(await tab2.innerText('body')))
    await tab2.close()
  })

  await scenario('HC-08', 'Coordinator-only deterministic close', async function () {
    await B.reload({ waitUntil: 'networkidle' }); await B.waitForTimeout(2500)
    await decide(B, 'Fictional Hardware', '50/50'); await decide(B, 'Fictional Tickets', '30/70')
    await tab(B, 'Share / Status')
    if (await B.getByRole('button', { name: 'Replace submission' }).isEnabled()) { await B.getByRole('button', { name: 'Replace submission' }).click(); await B.waitForTimeout(1500) }
    await tab(B, 'Settle')
    r.check('partner has no close control', !(await B.getByRole('button', { name: 'Close month and archive' }).count()) && /Only the coordinator, Fictional A, can close/.test(await B.innerText('body')))
    r.check('server refuses a partner close', await apiAs(B, 'POST', '/api/workflows/2026-07/close', { expectedVersion: 99, requestId: 'request_partner_close' }) === 403)
    await A.reload({ waitUntil: 'networkidle' }); await A.waitForTimeout(2500); await tab(A, 'Settle')
    await A.getByLabel('I checked the private count and net against my bank.').check()
    const closeArchive = await download(A, function () { return A.getByRole('button', { name: 'Close month and archive' }).click() })
    r.check('closed message ready for the coordinator', await waitFor(A, /July 2026 is closed in Split Ledger: Fictional B pays Fictional A \$21\.54/, 5000) >= 0)
    r.check('backup reminder offered', /Keep a private backup/.test(await A.innerText('body')))
    await B.getByRole('button', { name: 'Check latest status' }).click(); await B.waitForTimeout(1500)
    const fromB = await download(B, function () { return B.getByRole('button', { name: 'Download fresh archive' }).click() })
    r.check('both archives identical', closeArchive === fromB)
    r.check('archive holds no private strings', !/@|user_|org_|Visa|Mastercard|"raw"|rule|amazon|orderId|originalAmount/i.test(fromB))
    r.check('archive net 21.54 b_owes_a', /"net": ?21\.54/.test(fromB) && /"direction": ?"b_owes_a"/.test(fromB))
  })

  await scenario('HC-09', 'Restart and browser persistence boundaries', async function () {
    const stateA = await contexts.A.storageState(), stateB = await contexts.B.storageState()
    await contexts.A.close(); await contexts.B.close()
    const A2 = await newContext('A', stateA), B2 = await newContext('B', stateB)
    for (const [page, name] of [[A2, 'A'], [B2, 'B']]) {
      await page.goto(baseUrl, { waitUntil: 'networkidle' }); await page.waitForTimeout(4000)
      r.check(name + ' pairing survives restart', /2 of 2 connected/.test(await page.innerText('body')))
      await setMonth(page, '2026-07'); await tab(page, 'Review')
      const july = await page.innerText('body')
      await setMonth(page, '2026-08'); await tab(page, 'Review')
      const august = await page.innerText('body')
      r.check(name + ' keeps July and August private rows (one draft per month)', (name === 'A' ? /Sample Restaurant/.test(july) && /Sample Cinema/.test(august) : /Fictional Hardware/.test(july) && /Sample Bakery/.test(august)))
      await tab(page, 'Share / Status')
      r.check(name + ' August stays closed', /Month closed/.test(await page.innerText('body')))
    }
  })

  await scenario('HC-10', 'Privacy and recovery regression', async function () {
    const A2 = pages.A, B2 = pages.B
    await B2.getByRole('button', { name: 'Rules & Files' }).first().click(); await B2.waitForTimeout(1000)
    const bundleB = await download(B2, function () { return B2.getByRole('button', { name: 'Download closed shared archives' }).click() })
    const periods = JSON.parse(bundleB).archives.map(function (a) { return a.period }).join(',')
    r.check('archive file holds July and August only', periods === '2026-07,2026-08', periods)
    r.check('archive file holds no searched strings', !/@|user_|org_|Visa|Mastercard|"raw"|rule|amazon|product|orderId|originalAmount/i.test(bundleB))
    r.check('partner cannot restore or delete', await B2.getByLabel('Restore closed shared archives').isDisabled() && await B2.getByRole('button', { name: 'Delete shared workflow history' }).isDisabled())
    r.check('partner sees no deletion-token wording', !/delete shared history in the next 15 minutes/.test(await B2.innerText('body')))
    await A2.getByRole('button', { name: 'Rules & Files' }).first().click(); await A2.waitForTimeout(1000)
    const bundleA = await download(A2, function () { return A2.getByRole('button', { name: 'Download closed shared archives' }).click() })
    await B2.getByRole('button', { name: 'Download closed shared archives' }).click(); await B2.waitForTimeout(1000)
    await A2.getByLabel('Type DELETE SHARED HISTORY').fill('DELETE SHARED HISTORY')
    await A2.getByRole('button', { name: 'Delete shared workflow history' }).click(); await A2.waitForTimeout(2000)
    r.check('coordinator deletes even after the partner exported (WEB-025)', /Deleted 2 shared workflow period/.test(await A2.innerText('body')))
    await A2.reload({ waitUntil: 'networkidle' }); await A2.waitForTimeout(2500)
    await setMonth(A2, '2026-07'); await tab(A2, 'Share / Status')
    r.check('July empty after deletion, pairing kept', /Nothing submitted yet/.test(await A2.innerText('body')) && /2 of 2 connected/.test(await A2.innerText('body')))
    await A2.getByRole('button', { name: 'Rules & Files' }).first().click(); await A2.waitForTimeout(800)
    const file = join(outDir, run + '-restore.json'); (await import('node:fs')).writeFileSync(file, bundleA)
    await A2.getByLabel('Restore closed shared archives').setInputFiles(file); await A2.waitForTimeout(2500)
    r.check('restore succeeds', /Restored 2 closed period/.test(await A2.innerText('body')))
    for (const [page, name] of [[A2, 'A'], [B2, 'B']]) {
      await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500)
      await setMonth(page, '2026-07')
      r.check(name + ' sees July closed again at $21.54', await settleLine(page) === 'Fictional B pays Fictional A $21.54' && /Month closed/i.test(await page.innerText('body')))
    }
    await C.reload({ waitUntil: 'networkidle' }); await C.waitForTimeout(2500)
    r.check('third member still refused', /This household already has two participants/.test(await C.innerText('body')))
    for (const [page, name] of [[A2, 'A'], [B2, 'B']]) {
      await page.setViewportSize({ width: 390, height: 844 })
      for (const screen of ['Setup', 'Share / Status', 'Settle']) {
        await tab(page, screen)
        const wide = await page.evaluate(function () { return document.documentElement.scrollWidth > document.documentElement.clientWidth })
        if (wide) r.check(name + ' ' + screen + ' fits 390 px', false)
      }
      await page.setViewportSize({ width: 1400, height: 1000 })
    }
    r.check('no page-level horizontal scroll at 390 px', true)
    await tab(B2, 'Share / Status')
    probing = true // the blocked requests below log expected network errors
    await contexts.B.route('**/api/workflows**', function (route) { return route.abort('failed') })
    await B2.getByRole('button', { name: 'Check latest status' }).click(); await B2.waitForTimeout(2000)
    r.check('blocked network shows a plain message', /Could not reach the Split Ledger service/.test(await B2.innerText('body')))
    await contexts.B.unroute('**/api/workflows**')
    await B2.waitForTimeout(500); probing = false
    await B2.getByRole('button', { name: 'Check latest status' }).click(); await B2.waitForTimeout(2000)
    r.check('recovers after unblocking', !/Could not reach the Split Ledger service/.test(await B2.innerText('body')))
  })

  await scenario('H4C-03', 'Amazon is evidence, not financial authority', async function () {
    const page = pages.A
    await setMonth(page, '2026-07')
    await importStatement(page, 'Other / generic paste', fixture('F-E'))
    await importStatement(page, 'Other / generic paste', fixture('F-E2'))
    await tab(page, 'Import')
    await page.locator('details.amazon-card summary').click()
    await page.getByLabel('Amazon order text').fill(fixture('F-F'))
    await page.getByRole('button', { name: 'Read Amazon orders' }).click(); await page.waitForTimeout(800)
    await tab(page, 'Review'); await page.getByRole('button', { name: /^All transactions/ }).click()
    const row13 = page.locator('article', { hasText: '2026-07-13' }).filter({ hasText: '$25.00' }).first()
    await row13.getByRole('button', { name: /Details/ }).click(); await page.waitForTimeout(400)
    await row13.locator('.evidence-order', { hasText: 'Fictional book A' }).getByRole('button', { name: 'Use this order' }).click(); await page.waitForTimeout(500)
    const row14 = page.locator('article', { hasText: '2026-07-14' }).filter({ hasText: '$25.00' }).first()
    await row14.getByRole('button', { name: /Details/ }).click(); await page.waitForTimeout(400)
    const used = row14.locator('.evidence-order', { hasText: 'Fictional book A' })
    r.check('used order labelled and disabled on the other charge', /Already used for .+ on 2026-07-13 \(\$25\.00\)/.test(await used.innerText()) && await used.getByRole('button', { name: 'Already used' }).isDisabled())
    r.check('other candidate stays usable', await row14.locator('.evidence-order', { hasText: 'Fictional book B' }).getByRole('button', { name: 'Use this order' }).isEnabled())
    r.check('evidence never decides ownership', /Needs a decision/.test(await row13.innerText()))
    await r.shot(page, 'amazon')
  })

  await scenario('H4C-05', 'Private session versus shared file', async function () {
    const page = pages.A
    await page.getByRole('button', { name: 'Rules & Files' }).first().click(); await page.waitForTimeout(800)
    const session = await download(page, function () { return page.getByRole('button', { name: 'Download private session' }).click() })
    const shared = await download(page, function () { return page.getByRole('button', { name: 'Download shared file' }).click() })
    r.check('private session is split-ledger-session/v3', /"format": ?"split-ledger-session\/v3"/.test(session))
    r.check('no raw Amazon paste or matches persisted', !/demonstration only\\nOrder placed|amazonMatches/.test(session))
    r.check('shared file is the allowlisted projection only', /"format": ?"split-ledger\/v1"/.test(shared) && !/"raw"|"card"|originalAmount|amazonContext|products|orderId|decisions/.test(shared))
    const file = join(outDir, run + '-session.json'); (await import('node:fs')).writeFileSync(file, session)
    await page.getByLabel('Load private session').setInputFiles(file); await page.waitForTimeout(1500)
    const notice = await page.locator('.settings-section .fine-print').first().innerText().catch(function () { return '(no notice)' })
    r.check('loading the session restores the draft', /Private session loaded/.test(await page.innerText('body')), notice)
  })

  await scenario('H5-03', 'Remember and remove a rule from a clean state', async function () {
    const page = pages.B
    await setMonth(page, '2026-06')
    await importStatement(page, 'Other / generic paste', '2026-06-10 SAMPLE RESTAURANT $40.00')
    await decide(page, 'Sample Restaurant', '50/50')
    await page.getByRole('button', { name: 'Remember this split for Sample Restaurant' }).click(); await page.waitForTimeout(500)
    r.check('saved-rule marker appears', /saved rule/.test(await page.innerText('body')))
    await page.getByRole('button', { name: 'Rules & Files' }).first().click(); await page.waitForTimeout(800)
    await page.locator('aside').getByRole('button', { name: /Remove|Forget/ }).first().click(); await page.waitForTimeout(500)
    await tab(page, 'Review'); await page.getByRole('button', { name: /Reapply rules/ }).click(); await page.waitForTimeout(500)
    r.check('removing the rule keeps the manual decision', /Shared 50% to partner/.test(await page.locator('article', { hasText: 'Sample Restaurant' }).first().innerText()))
  })

  r.scenario('CONSOLE', 'No application console errors during the run')
  r.check('no application-origin console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '))
} finally {
  const rows = r.save()
  console.log('\n' + rows.join('\n') + '\nEvidence: ' + outDir)
  await browser.close()
  if (!keep) {
    if (ids.org) await api.deleteOrganization(ids.org).catch(function () {})
    for (const who of ['A', 'B', 'C']) if (ids[who]) await api.deleteUser(ids[who]).catch(function () {})
    console.log('Removed the run\'s fictional users and household from Clerk Development.')
  }
  const failed = r.results.some(function (s) { return s.checks.some(function (c) { return !c.ok }) })
  process.exitCode = failed ? 1 : 0
}
