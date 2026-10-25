import { execSync } from 'node:child_process'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { securityHeaders } from './securityHeaders'

export default defineConfig(function ({ mode }) {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  // The short commit id labels logbook rows (WEB-048) so an error can be tied to a build.
  let version = 'dev'
  try { version = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev' } catch { /* not a Git checkout */ }
  return { define: { __APP_VERSION__: JSON.stringify(version) }, plugins: [react(), cloudflare(), securityHeaders(env.VITE_CLERK_PUBLISHABLE_KEY)] }
})
