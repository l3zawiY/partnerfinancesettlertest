import { ClerkProvider } from '@clerk/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in webapp/.env.local')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider>
      <App />
    </ClerkProvider>
  </StrictMode>,
)
