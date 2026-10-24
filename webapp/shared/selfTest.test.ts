import { describe, expect, it } from 'vitest'
import { runSelfTest } from './selfTest'

describe('in-browser self-test (WEB-029)', function () {
  it('passes every check on the built-in fictional statements', function () {
    const results = runSelfTest()
    expect(results.length).toBeGreaterThanOrEqual(30)
    expect(results.filter(function (result) { return !result.ok })).toEqual([])
  })
})
