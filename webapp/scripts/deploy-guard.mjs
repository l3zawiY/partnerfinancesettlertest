// Refuses a hosted build, migration, or deploy that would hit the wrong place or use the
// wrong keys. Usage: node scripts/deploy-guard.mjs <staging|production> <build|migrate|deploy>
// Plain-language failures; exits 1 on any problem. Prints no secret values.
import { readFileSync } from 'node:fs'

const [target, action] = process.argv.slice(2)
const problems = []
if (!['staging', 'production'].includes(target)) problems.push('Choose staging or production.')
if (!['build', 'migrate', 'deploy'].includes(action)) problems.push('Choose build, migrate, or deploy.')

const text = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '')
const config = JSON.parse(text)
const environment = config.env?.[target]
if (!environment) problems.push('wrangler.jsonc has no "' + target + '" environment.')
const database = environment?.d1_databases?.[0]
if (database && /NOT-SET|placeholder/i.test(database.database_id)) problems.push('The ' + target + ' database id is still a placeholder. Create the database and record its id first.')
if (target === 'production' && (environment?.routes || []).some((route) => /NOT-SET|\.invalid$/i.test(route.pattern))) problems.push('The production domain is still a placeholder.')
if (target === 'production' && environment?.workers_dev !== false) problems.push('Production must not have a workers.dev address.')

const key = target === 'production' ? process.env.VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION : process.env.VITE_CLERK_PUBLISHABLE_KEY
if (!key) problems.push('The Clerk publishable key for ' + target + ' is not set.')
else if (target === 'production' && !key.startsWith('pk_live_')) problems.push('Production needs the Clerk Production key (pk_live_...).')
else if (target === 'staging' && !key.startsWith('pk_test_')) problems.push('Staging must use the Clerk Development key (pk_test_...), never a live key.')

if (action !== 'build') {
  if (!process.env.CLOUDFLARE_API_TOKEN) problems.push('CLOUDFLARE_API_TOKEN is not set in the environment.')
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) problems.push('CLOUDFLARE_ACCOUNT_ID is not set in the environment.')
}
if (target === 'production' && action !== 'build' && process.env.CONFIRM_PRODUCTION !== 'yes') problems.push('Production changes need CONFIRM_PRODUCTION=yes, after the staging suite passed.')

if (problems.length) {
  console.error('Refused ' + (action || '?') + ' for ' + (target || '?') + ':\n- ' + problems.join('\n- '))
  process.exit(1)
}
console.log('Guard passed: ' + action + ' for ' + target + ' (' + environment.name + ', database ' + database.database_name + ').')
