/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string
  /** local, staging, or production; set at build time for hosted builds. */
  readonly VITE_DEPLOYMENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
