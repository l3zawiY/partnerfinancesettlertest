/**
 * Where this build runs: `local`, `staging`, or `production`, set at build time through
 * VITE_DEPLOYMENT for hosted builds. Labels tell people whether real data belongs here.
 */
export type Deployment = 'local' | 'staging' | 'production' | 'unknown'

export function deployment(): Deployment {
  const configured = import.meta.env.VITE_DEPLOYMENT
  if (configured === 'local' || configured === 'staging' || configured === 'production') return configured
  return typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) ? 'local' : 'unknown'
}

export interface EnvironmentLabels {
  banner: string; footer: string; signedOut: string; realDataAllowed: boolean
  /** Setup's status chip once the household service answers. */
  connected: string
  /** The pill beside the Share / Status and Settle titles. */
  pill: string
  /** Shown when the household service does not answer. */
  serviceUnavailable: string
}

const HOSTED_UNAVAILABLE = 'The Split Ledger service did not answer. Your private draft in this browser is safe; reload the page in a few minutes.'

export function environmentLabels(where: Deployment = deployment()): EnvironmentLabels {
  if (where === 'production') return { banner: 'Private pilot', footer: 'Private pilot · your complete ledger stays in this browser', signedOut: 'Sign in to open your household workspace.', realDataAllowed: true, connected: 'Connected to the household service', pill: 'Private pilot', serviceUnavailable: HOSTED_UNAVAILABLE }
  if (where === 'staging') return { banner: 'Staging · fictional data only', footer: 'Staging · fictional data only', signedOut: 'Sign in to open the household workspace. This is the staging copy: use fictional data only.', realDataAllowed: false, connected: 'Connected to the staging service', pill: 'Staging · fictional data only', serviceUnavailable: HOSTED_UNAVAILABLE }
  return { banner: 'Web-service experiment · fictional data only', footer: 'Local API · fictional data only', signedOut: 'Sign in to open the household workspace. Use fictional data only during this experiment.', realDataAllowed: false, connected: 'Connected to local workflow API', pill: 'Local API · fictional data only', serviceUnavailable: 'The local Worker did not answer. Restart the development server and reload.' }
}
