import { describe, expect, it } from 'vitest'
import { codeLocation, errorType, routePattern, validBrowserEvent } from './logbook'

describe('pilot logbook allowlist', function () {
  it('accepts allowed events with only their own fields', function () {
    expect(validBrowserEvent({ event: 'statement_imported', month: '2026-10', count: 212, appVersion: 'abc1234' })).toEqual({ event: 'statement_imported', month: '2026-10', count: 212, appVersion: 'abc1234' })
    expect(validBrowserEvent({ event: 'review_submitted', month: '2026-10', count: 200, durationSeconds: 1080 })).not.toBeNull()
    expect(validBrowserEvent({ event: 'browser_error', screen: 'review', errorType: 'TypeError', codeLocation: 'index-DZDR5KBA.js:12:3456' })).not.toBeNull()
  })

  it('refuses any field or value that could carry financial or personal text', function () {
    expect(validBrowserEvent({ event: 'statement_imported', merchant: 'Fictional Cafe' })).toBeNull()
    expect(validBrowserEvent({ event: 'statement_imported', amount: 12.5 })).toBeNull()
    expect(validBrowserEvent({ event: 'browser_error', message: 'Fictional Cafe $12.50' })).toBeNull()
    expect(validBrowserEvent({ event: 'browser_error', errorType: 'Fictional Cafe' })).toBeNull()
    expect(validBrowserEvent({ event: 'browser_error', codeLocation: 'Fictional Cafe $12.50' })).toBeNull()
    expect(validBrowserEvent({ event: 'browser_error', codeLocation: 'https://app.example/x.js:1:2' })).toBeNull()
    expect(validBrowserEvent({ event: 'unknown_event' })).toBeNull()
    expect(validBrowserEvent({ event: 'diagnostic_copied', count: 3 })).toBeNull()
    expect(validBrowserEvent({ event: 'statement_imported', errorType: 'TypeError' })).toBeNull()
    expect(validBrowserEvent({ event: 'statement_imported', count: 1.5 })).toBeNull()
    expect(validBrowserEvent({ event: 'statement_imported', month: 'October' })).toBeNull()
    expect(validBrowserEvent({ event: 'browser_error', screen: 'Fictional Cafe' })).toBeNull()
    expect(validBrowserEvent({ event: 'statement_imported', appVersion: 'person@example.com' })).toBeNull()
    expect(validBrowserEvent('statement_imported')).toBeNull()
  })

  it('keeps only the file, line, and column of the first frame from this application', function () {
    const stack = 'TypeError: Cannot read Fictional Cafe of undefined\n    at https://extension.example/inject.js:1:1\n    at decide (https://app.example/assets/index-DZDR5KBA.js:12:3456)\n    at https://app.example/assets/index-DZDR5KBA.js:1:2'
    expect(codeLocation(stack, 'https://app.example')).toBe('index-DZDR5KBA.js:12:3456')
    expect(codeLocation('decide@https://app.example/assets/index-A.js:3:4', 'https://app.example')).toBe('index-A.js:3:4')
    expect(codeLocation('Error: Fictional Cafe\n    at handle (index.js:40:7)', null)).toBe('index.js:40:7')
    expect(codeLocation('Error: https://app.example/assets/x.js:1:2 Fictional', 'https://app.example')).toBeNull()
    expect(codeLocation(undefined, 'https://app.example')).toBeNull()
  })

  it('names an error by its type only', function () {
    expect(errorType(new TypeError('Fictional Cafe'))).toBe('TypeError')
    expect(errorType({ name: 'Fictional Cafe $12' })).toBe('Error')
    expect(errorType('Fictional Cafe')).toBe('Error')
  })

  it('groups API routes without keeping the month in the route', function () {
    expect(routePattern('/api/workflows/2026-07/close')).toEqual({ route: '/api/workflows/:month/close', month: '2026-07' })
    expect(routePattern('/api/workflows/2026-07')).toEqual({ route: '/api/workflows/:month', month: '2026-07' })
    expect(routePattern('/api/household/pairing/join')).toEqual({ route: '/api/household/pairing/join', month: null })
    expect(routePattern('/api/Fictional Cafe')).toEqual({ route: '/api/(other)', month: null })
  })
})
