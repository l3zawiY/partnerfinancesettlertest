// Helpers for the WEB-031 two-account acceptance suite. Fictional data and Clerk
// Development test identities only; see docs/TESTING.md for how to run it.
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

/** Playwright from the project if installed, otherwise the machine-wide install. */
export function loadPlaywright() {
  try { return require('playwright') } catch { /* fall through */ }
  const globalRoot = execSync('npm root -g').toString().trim()
  return require(join(globalRoot, 'playwright'))
}

/** Fictional statement blocks, read from the testing guide so the suite and the guide agree. */
export function fixture(name, index = 0) {
  const guide = readFileSync(new URL('../../docs/WEBAPP-HUMAN-TESTING.md', import.meta.url), 'utf8')
  const start = guide.indexOf('### ' + name + ' —')
  if (start < 0) throw new Error('Fixture ' + name + ' not found in the testing guide.')
  const sectionEnd = guide.indexOf('\n### ', start + 4)
  const section = guide.slice(start, sectionEnd < 0 ? undefined : sectionEnd)
  const blocks = section.split('```text\n').slice(1).map(function (part) { return part.slice(0, part.indexOf('\n```')) })
  if (!blocks[index]) throw new Error('Fixture ' + name + ' has no text block ' + index + '.')
  return blocks[index]
}

/** Clerk Backend API, Development instance only. Never prints keys or ids. */
export function clerk(secret) {
  if (!secret || !secret.startsWith('sk_test_')) throw new Error('The suite runs only against a Clerk Development instance (sk_test_ key).')
  async function call(method, path, body) {
    const response = await fetch('https://api.clerk.com/v1' + path, { method, headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await response.text()
    const json = text ? JSON.parse(text) : null
    if (!response.ok) throw new Error('Clerk ' + method + ' ' + path.replace(/(user|org|orginv)_[A-Za-z0-9]+/g, '$1_…') + ' failed with ' + response.status)
    return json
  }
  return {
    async createUser(email, password) { return (await call('POST', '/users', { email_address: [email], password, first_name: 'Fictional', last_name: 'Tester' })).id },
    async deleteUser(id) { await call('DELETE', '/users/' + id) },
    async organizationByName(name) { const list = await call('GET', '/organizations?limit=100&query=' + encodeURIComponent(name)); return (list.data || list).find(function (org) { return org.name === name }) || null },
    async invite(orgId, email, inviterId) { await call('POST', '/organizations/' + orgId + '/invitations', { email_address: email, role: 'org:member', inviter_user_id: inviterId }) },
    async setRole(orgId, userId, role) { await call('PATCH', '/organizations/' + orgId + '/memberships/' + userId, { role }) },
    async deleteOrganization(id) { await call('DELETE', '/organizations/' + id) },
  }
}

export function recorder(outDir) {
  mkdirSync(outDir, { recursive: true })
  const results = []
  let current = null
  return {
    results,
    scenario(id, title) { current = { id, title, checks: [], notes: [] }; results.push(current); console.log('\n== ' + id + ' ' + title) },
    check(label, ok, detail = '') {
      current.checks.push({ label, ok: !!ok, detail: String(detail).slice(0, 300) })
      console.log((ok ? '  ok   ' : '  FAIL ') + label + (detail && !ok ? ' — ' + String(detail).slice(0, 200) : ''))
    },
    note(text) { current.notes.push(text); console.log('  note ' + text) },
    error(error) { current.checks.push({ label: 'scenario finished without an error', ok: false, detail: String(error && error.message || error).slice(0, 300) }); console.log('  FAIL error — ' + String(error && error.message || error).slice(0, 300)) },
    async shot(page, name) { await page.screenshot({ path: join(outDir, current.id + '-' + name + '.png'), fullPage: true }).catch(function () {}) },
    save() {
      writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2))
      const rows = results.map(function (s) { const failed = s.checks.filter(function (c) { return !c.ok }).length; return (failed ? 'FAIL' : 'pass') + '  ' + s.id + '  ' + s.title + '  (' + (s.checks.length - failed) + '/' + s.checks.length + ')' })
      writeFileSync(join(outDir, 'summary.txt'), rows.join('\n') + '\n')
      return rows
    },
  }
}

export async function bodyText(page) { const text = await page.innerText('body'); const i = text.indexOf('Settle\n'); return i >= 0 ? text.slice(i + 7) : text }
export async function tab(page, name) { await page.getByRole('tab', { name, exact: true }).click(); await page.waitForTimeout(900) }
export async function setMonth(page, ym) { const input = page.getByLabel('Header reconciliation month'); if (await input.inputValue() !== ym) { await input.fill(ym); await page.waitForTimeout(1200) } }
export async function waitFor(page, pattern, ms = 25000) {
  const started = Date.now()
  while (Date.now() - started < ms) { const text = await page.innerText('body'); if (pattern.test(text)) return Math.round((Date.now() - started) / 1000); await page.waitForTimeout(1000) }
  return -1
}
export async function importStatement(page, bank, text) {
  await tab(page, 'Import')
  await page.getByLabel('Supported bank').selectOption({ label: bank })
  await page.getByLabel('Statement text').fill(text)
  await page.getByRole('button', { name: 'Parse and add' }).click()
  await page.waitForTimeout(1000)
  return (await page.innerText('body')).match(/Added \d+[^\n]*/)?.[0] || ''
}
export async function decide(page, merchant, share) {
  await tab(page, 'Review')
  await page.getByRole('button', { name: /^All transactions/ }).click().catch(function () {})
  await page.locator('article', { hasText: merchant }).first().getByRole('button', { name: share, exact: true }).click()
  await page.waitForTimeout(400)
}
export async function settleLine(page) { await tab(page, 'Settle'); await page.waitForTimeout(800); return (await page.innerText('body')).match(/Fictional . pays Fictional . \$[\d.]+|are square/)?.[0] || '' }
export async function signIn(page, baseUrl, email, password) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Sign in' }).first().click()
  await page.fill('input[name=identifier]', email)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.waitForTimeout(1500)
  if (await page.locator('input[name=password]').isVisible()) { await page.fill('input[name=password]', password); await page.getByRole('button', { name: 'Continue', exact: true }).click() }
  await page.waitForTimeout(3500)
  if (/Check your email|verification code/i.test(await page.innerText('body'))) {
    await page.locator('input[autocomplete="one-time-code"], input[name=code], input[inputmode=numeric]').first().click()
    await page.keyboard.type('424242') // Clerk's fixed code for +clerk_test addresses
    await page.waitForTimeout(1000)
    const next = page.getByRole('button', { name: 'Continue', exact: true })
    if (await next.isVisible().catch(function () { return false })) await next.click().catch(function () {})
    await page.waitForTimeout(4000)
  }
}
