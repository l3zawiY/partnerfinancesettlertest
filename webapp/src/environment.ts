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

export interface EnvironmentLabels { banner: string; footer: string; signedOut: string; realDataAllowed: boolean }

export function environmentLabels(where: Deployment = deployment()): EnvironmentLabels {
  if (where === 'production') return { banner: 'Private pilot', footer: 'Private pilot · your complete ledger stays in this browser', signedOut: 'Sign in to open your household workspace.', realDataAllowed: true }
  if (where === 'staging') return { banner: 'Staging · fictional data only', footer: 'Staging · fictional data only', signedOut: 'Sign in to open the household workspace. This is the staging copy: use fictional data only.', realDataAllowed: false }
  return { banner: 'Web-service experiment · fictional data only', footer: 'Local API · fictional data only', signedOut: 'Sign in to open the household workspace. Use fictional data only during this experiment.', realDataAllowed: false }
}
