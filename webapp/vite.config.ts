import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { securityHeaders } from './securityHeaders'

export default defineConfig(function ({ mode }) {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  return { plugins: [react(), cloudflare(), securityHeaders(env.VITE_CLERK_PUBLISHABLE_KEY)] }
})
