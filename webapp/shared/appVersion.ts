declare const __APP_VERSION__: string | undefined

/** The build's short commit id, injected by vite.config.ts; "dev" in tests and type checks. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
