import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AppProviders from './AppProviders'
import { installCrashReporting } from './logbook'
import './styles.css'

if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in webapp/.env.local')
}

// Uncaught errors are reported to the pilot logbook only while a hosted household session
// has turned sending on (WEB-048); otherwise they are dropped.
installCrashReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
)
