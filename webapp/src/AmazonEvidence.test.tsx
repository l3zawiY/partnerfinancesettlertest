import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AmazonMatch, AmazonOrder } from '../shared/amazon'
import type { LedgerRow } from '../shared/refunds'
import AmazonEvidence from './AmazonEvidence'
import type { PrivateWorkspace } from './usePrivateWorkspace'

const order: AmazonOrder = { orderId: 'order_1', orderDate: '2026-07-10', total: 40, products: ['Fictional kitchen tool — demonstration only'], monthlyPayments: false, subscription: false }
const first = { id: 'txn_first', merchant: 'Amazon Marketplace', date: '2026-07-12', amount: 40 } as unknown as LedgerRow
const second = { id: 'txn_second', merchant: 'Amazon Marketplace', date: '2026-07-13', amount: 40 } as unknown as LedgerRow
const matches: AmazonMatch[] = [{ txnId: 'txn_first', kind: 'exact', orderIds: ['order_1'], evidence: 'Exact total.' }, { txnId: 'txn_second', kind: 'exact', orderIds: ['order_1'], evidence: 'Exact total.' }]

function workspaceWith(decisions: Record<string, { status: 'confirmed'; orderId: string }>): PrivateWorkspace & { confirmAmazon: ReturnType<typeof vi.fn> } {
  return { ledger: [first, second], amazonMatches: matches, amazonContext: { orders: [order], decisions, advertisedOrderCount: null, duplicateBlocks: 0, invalidBlocks: 0 }, confirmAmazon: vi.fn(), setAmazonDecision: vi.fn() } as unknown as PrivateWorkspace & { confirmAmazon: ReturnType<typeof vi.fn> }
}

describe('occupied Amazon evidence in private Review', function () {
  it('labels an order already confirmed elsewhere, names that charge, and disables the conflicting action', async function () {
    const user = userEvent.setup()
    const workspace = workspaceWith({ txn_first: { status: 'confirmed', orderId: 'order_1' } })
    render(<AmazonEvidence row={second} workspace={workspace} />)
    expect(screen.getByText('Likely Amazon order')).toBeVisible()
    expect(screen.getByRole('note')).toHaveTextContent('Already used for Amazon Marketplace on 2026-07-12 ($40.00). To use it here instead, open that charge’s Details and choose Change match first.')
    const button = screen.getByRole('button', { name: 'Already used' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(workspace.confirmAmazon).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Reject suggestion' })).toBeEnabled()
  })

  it('keeps a free order actionable and the confirming charge changeable', async function () {
    const user = userEvent.setup()
    const free = workspaceWith({})
    const { unmount } = render(<AmazonEvidence row={second} workspace={free} />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use this order' }))
    expect(free.confirmAmazon).toHaveBeenCalledWith('txn_second', 'order_1')
    unmount()
    render(<AmazonEvidence row={first} workspace={workspaceWith({ txn_first: { status: 'confirmed', orderId: 'order_1' } })} />)
    expect(screen.getByText('Amazon order confirmed')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Change match' })).toBeEnabled()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
