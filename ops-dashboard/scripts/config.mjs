// Shared by the deploy guard and the tests.

/** The only databases this Worker may bind. */
export const allowedDatabases = [
  { binding: 'TELEMETRY', database_name: 'split-ledger-telemetry', database_id: '43b0c195-6fa9-4221-ad97-6da46c9a2641' },
  { binding: 'TELEMETRY_STAGING', database_name: 'split-ledger-telemetry-staging', database_id: '6b9bcb10-2668-4d32-b348-812543979ee0' },
]

/** Parses wrangler.jsonc; comments must be on their own lines. */
export function readConfig(text) {
  return JSON.parse(text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n'))
}
