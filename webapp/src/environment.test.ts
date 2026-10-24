import { describe, expect, it } from 'vitest'
import { environmentLabels } from './environment'

describe('environment labels', function () {
  it('says fictional data only everywhere except production, and never says it in production', function () {
    expect(environmentLabels('local').banner).toMatch(/fictional data only/)
    expect(environmentLabels('staging').banner).toMatch(/^Staging · fictional data only$/)
    const production = environmentLabels('production')
    expect(production.realDataAllowed).toBe(true)
    expect(JSON.stringify(production)).not.toMatch(/fictional|experiment|Local API/i)
    expect(environmentLabels('unknown').realDataAllowed).toBe(false)
  })
})
