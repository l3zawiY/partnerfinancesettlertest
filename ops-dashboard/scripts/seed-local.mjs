// Fills the LOCAL copy of the logbook databases with fictional rows for trying the page.
// Always uses --local: it never touches Cloudflare's hosted databases.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const schema = fileURLToPath(new URL('../../webapp/logbook-migrations/0001_logbook.sql', import.meta.url))
const seed = fileURLToPath(new URL('./fictional-logbook.sql', import.meta.url))
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }
for (const database of ['split-ledger-telemetry', 'split-ledger-telemetry-staging']) {
  execFileSync('npx', ['wrangler', 'd1', 'execute', database, '--local', '--command', 'DROP TABLE IF EXISTS logbook'], { stdio: 'inherit', env })
  for (const file of [schema, seed]) {
    execFileSync('npx', ['wrangler', 'd1', 'execute', database, '--local', '--file', file], { stdio: 'inherit', env })
  }
}
