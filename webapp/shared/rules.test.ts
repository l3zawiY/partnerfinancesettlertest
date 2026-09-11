import { describe, expect, it } from 'vitest'
import { removeRule, type MerchantRule } from './rules'

describe('removeRule', function () {
  it('removes only the selected remembered rule', function () {
    const rules: MerchantRule[] = [{ type: 'family', pattern: 'fictional-a', label: 'Fictional A', share: .5 }, { type: 'key', pattern: 'FICTIONAL B', label: 'Fictional B', share: 1 }]
    expect(removeRule(rules, rules[0]!)).toEqual([rules[1]])
    expect(removeRule(rules, { type: 'key', pattern: 'MISSING' })).toEqual(rules)
  })
})
