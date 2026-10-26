// Refuses a deploy unless the configuration binds only the logbook databases and the
// settings the page needs are present. Run by `npm run deploy` before `wrangler deploy`.
import { readFileSync } from 'node:fs'
import { allowedDatabases, readConfig } from './config.mjs'

const problems = []
const config = readConfig(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
for (const database of config.d1_databases ?? []) {
  const allowed = allowedDatabases.find((entry) => entry.binding === database.binding)
  if (!allowed || allowed.database_name !== database.database_name || allowed.database_id !== database.database_id) {
    problems.push(`database binding ${database.binding} (${database.database_name}) is not one of the logbook databases`)
  }
}
if (config.env) problems.push('named environments are not used here')
if (config.workers_dev !== false || config.preview_urls !== false) problems.push('workers.dev and preview addresses must stay off')
if (!process.env.CLOUDFLARE_ACCOUNT_ID) problems.push('CLOUDFLARE_ACCOUNT_ID is not set')
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(process.env.OWNER_EMAIL ?? '')) problems.push('OWNER_EMAIL is not set to an email address')
if (process.env.CONFIRM_DEPLOY !== 'yes') problems.push('CONFIRM_DEPLOY=yes is required (the owner approves each deploy)')

if (problems.length) {
  console.error(`Deploy refused:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('Deploy guard passed: only logbook databases are bound.')
