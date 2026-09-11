import { ClerkProvider } from '@clerk/react'
import type { ReactNode } from 'react'
import { BROWSER_CLERK_TELEMETRY } from '../shared/telemetry'

export default function AppProviders({ children }: { children: ReactNode }) {
  return <ClerkProvider telemetry={BROWSER_CLERK_TELEMETRY}>{children}</ClerkProvider>
}
