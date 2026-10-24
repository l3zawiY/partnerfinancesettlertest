import { describe, expect, it } from 'vitest'
import { amazonConfirmationConflict, amazonOccupiedBy, type AmazonDecision, type AmazonMatch } from './amazon'

const exact = function (txnId: string, orderId: string): AmazonMatch { return { txnId, kind: 'exact', orderIds: [orderId], evidence: 'Exact total.' } }
const split = function (txnId: string, orderId: string): AmazonMatch { return { txnId, kind: 'split-order', orderIds: [orderId], evidence: 'Part of one split order.' } }

describe('occupied Amazon evidence', function () {
  it('names the charge that already confirmed the order', function () {
    const matches = [exact('txn_first', 'order_1'), exact('txn_second', 'order_1')]
    const decisions: Record<string, AmazonDecision> = { txn_first: { status: 'confirmed', orderId: 'order_1' } }
    expect(amazonOccupiedBy('txn_second', 'order_1', matches, decisions)).toBe('txn_first')
    expect(amazonConfirmationConflict('txn_second', 'order_1', matches, decisions)).toBe(true)
    // The confirming charge itself, a different order, and a rejected decision are all free.
    expect(amazonOccupiedBy('txn_first', 'order_1', matches, decisions)).toBeNull()
    expect(amazonOccupiedBy('txn_second', 'order_2', matches, decisions)).toBeNull()
    expect(amazonOccupiedBy('txn_second', 'order_1', matches, { txn_first: { status: 'rejected' } })).toBeNull()
  })

  it('lets both recognised parts of one split order confirm the same order', function () {
    const matches = [split('txn_part_a', 'order_split'), split('txn_part_b', 'order_split'), exact('txn_other', 'order_split')]
    const decisions: Record<string, AmazonDecision> = { txn_part_a: { status: 'confirmed', orderId: 'order_split' } }
    expect(amazonOccupiedBy('txn_part_b', 'order_split', matches, decisions)).toBeNull()
    expect(amazonOccupiedBy('txn_other', 'order_split', matches, decisions)).toBe('txn_part_a')
  })
})
