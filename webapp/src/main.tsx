import { ClerkProvider } from '@clerk/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BROWSER_CLERK_TELEMETRY } from '../shared/telemetry'
import App from './App'
import './styles.css'

if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in webapp/.env.local')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider telemetry={BROWSER_CLERK_TELEMETRY}>
      <App />
    </ClerkProvider>
  </StrictMode>,
)
