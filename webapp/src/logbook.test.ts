import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureLogbook, flush, logActivity, logBrowserError } from './logbook'

describe('browser pilot logbook', function () {
  afterEach(function () { configureLogbook(null); vi.unstubAllGlobals() })

  it('sends nothing until a signed-in household session turns it on', async function () {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    logActivity('diagnostic_copied')
    await flush()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends allowlisted events and only the type and location of an error', async function () {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    configureLogbook(async () => 'fixture-token')
    logActivity('statement_imported', { month: '2026-07', count: 12 })
    const error = new TypeError('Cannot read Fictional Cafe $12.50')
    error.stack = 'TypeError: Cannot read Fictional Cafe $12.50\n    at decide (' + window.location.origin + '/assets/index-A.js:3:4)'
    logBrowserError(error)
    await flush()
    expect(fetch).toHaveBeenCalledTimes(1)
    const init = fetch.mock.calls[0]![1]!
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer fixture-token')
    const body = JSON.parse(String(init.body)) as { events: Record<string, unknown>[] }
    expect(body.events[0]).toMatchObject({ event: 'statement_imported', month: '2026-07', count: 12 })
    expect(body.events[1]).toMatchObject({ event: 'browser_error', errorType: 'TypeError', codeLocation: 'index-A.js:3:4' })
    expect(String(init.body)).not.toContain('Fictional')
  })

  it('keeps working when sending fails', async function () {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    configureLogbook(async () => 'fixture-token')
    logActivity('session_loaded')
    await expect(flush()).resolves.toBeUndefined()
  })
})
