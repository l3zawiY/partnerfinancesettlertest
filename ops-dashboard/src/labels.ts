// Plain-language names for the logbook's fixed event, error, and screen names (from
// webapp/shared/logbook.ts), and for the Workers and databases. Unknown names show as-is.

export const ACTIVITY_LABELS: Record<string, string> = {
  statement_imported: 'Imported a bank statement',
  review_submitted: 'Finished reviewing transactions',
  groups_applied: 'Applied grouping rules',
  self_test_run: 'Ran the self-test',
  diagnostic_copied: 'Copied a diagnostic report',
  session_downloaded: 'Downloaded a private session file',
  session_loaded: 'Loaded a private session file',
  private_draft_deleted: 'Deleted a private draft',
  household_initialized: 'Created the household',
  partner_invited: 'Invited the partner',
  partner_joined: 'Partner joined',
  submitted: 'Submitted a month',
  replaced: 'Replaced a submission',
  withdrew: 'Withdrew a submission',
  month_closed: 'Closed a month',
  archives_exported: 'Downloaded closed archives',
  archives_restored: 'Restored closed archives',
  history_deleted: 'Deleted shared history',
  period_cancelled: 'Cancelled an abandoned month',
}

export const ERROR_LABELS: Record<string, string> = {
  AuthenticationUnavailable: 'Sign-in service (Clerk) did not answer',
  StorageDailyLimit: 'Free daily database limit reached',
  StorageUnavailable: 'Database was briefly unavailable',
  InternalError: 'Unexpected problem on the server',
  ServiceUnavailable: 'Server was temporarily unavailable',
}

export const SCREEN_LABELS: Record<string, string> = {
  'signed-out': 'Sign-in screen',
  pairing: 'Pairing screen',
  setup: 'Setup screen',
  import: 'Import screen',
  review: 'Review screen',
  share: 'Share screen',
  settle: 'Settle screen',
  files: 'Rules & Files screen',
  other: 'Another screen',
}

export const WORKER_LABELS: Record<string, string> = {
  'split-ledger-production': 'The app (real pilot)',
  'split-ledger-staging': 'Test copy of the app (fictional)',
  'tallywithus-landing': 'Public page',
  'tallywithus-ops': 'This dashboard',
}

export const DATABASE_LABELS: Record<string, string> = {
  'split-ledger-production': 'App data (real pilot)',
  'split-ledger-staging': 'App data (test copy, fictional)',
  'split-ledger-telemetry': 'Logbook (real pilot)',
  'split-ledger-telemetry-staging': 'Logbook (test copy, fictional)',
}

export function label(labels: Record<string, string>, name: string | null | undefined): string {
  if (!name) return '—'
  return Object.prototype.hasOwnProperty.call(labels, name) ? labels[name] : name
}

/** What went wrong, in plain words: a known server error, or a browser bug by its type. */
export function errorLabel(source: string | null, errorType: string | null): string {
  if (errorType && Object.prototype.hasOwnProperty.call(ERROR_LABELS, errorType)) return ERROR_LABELS[errorType]
  if (source === 'browser') return 'The page hit a bug in the browser'
  return errorType ?? 'Unknown problem'
}
