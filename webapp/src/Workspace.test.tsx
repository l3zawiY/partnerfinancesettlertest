import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubmissionCommand } from '../shared/workflow'
import Workspace from './Workspace'
import { LocalWorkflowGateway } from './workflow/LocalWorkflowGateway'

class CapturingGateway extends LocalWorkflowGateway {
  submitted: SubmissionCommand | null = null
  override async submit(command: SubmissionCommand) {
    this.submitted = command
    return super.submit(command)
  }
}

class MemberGateway extends LocalWorkflowGateway {
  override async getCapabilities() { return { canAdministerSharedHistory: false } }
}

describe('complete fictional workspace', function () {
  beforeEach(function () {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(function () { return 'blob:fictional' }) })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {})
  })

  it('navigates, reviews correctly, protects privacy, recovers, and closes', async function () {
    const user = userEvent.setup()
    const gateway = new CapturingGateway('fictional-workflow-test', function () { return '2026-08-01T00:00:00.000Z' })
    render(<Workspace scopeKey="fictional-private-test" gateway={gateway} administration={gateway} simulation={gateway} />)

    expect(screen.getByRole('heading', { name: 'Set up this month' })).toBeVisible()
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Rules & Files' })).toBeVisible()
    expect(screen.queryByText(/Private draft in progress/)).not.toBeInTheDocument()
    screen.getByRole('tab', { name: 'Import' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: 'Import a statement' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Load fictional TD sample' }))
    await user.click(screen.getByRole('button', { name: 'Parse and add' }))
    expect(await screen.findByText(/Added 3/)).toBeVisible()

    await user.click(screen.getByRole('tab', { name: 'Review' }))
    expect(screen.getAllByText(/Needs a decision before this month can settle/)).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Mine' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '70/30' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '50/50' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '30/70' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Theirs' })).toHaveLength(2)
    const creditArticle = screen.getByText('Annual Cash Back').closest('article')!
    expect(within(creditArticle).queryByRole('button', { name: 'Mine' })).not.toBeInTheDocument()
    expect(within(creditArticle).getByText(/cashback and rewards/)).toBeVisible()

    const restaurant = screen.getByText('Sample Restaurant').closest('article')!
    await user.click(within(restaurant).getByRole('button', { name: 'Details' }))
    expect(within(restaurant).getByText('Imported card')).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Reapply rules/ }))
    await user.click(within(restaurant).getByRole('button', { name: '50/50' }))
    await user.click(within(screen.getByText('Sample Restaurant').closest('article')!).getByRole('button', { name: /Remember this split/ }))
    const book = screen.getByText('Sample Book Shop').closest('article')!
    await user.type(within(book).getByLabelText('Custom payer share for Sample Book Shop'), '65')
    await user.click(within(book).getByRole('button', { name: 'Apply custom' }))
    expect(screen.getByText('Shared 35% to partner')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Rules & Files' }))
    expect(screen.getByText('Sample Restaurant')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove rule for Sample Restaurant' }))
    expect(screen.getByText(/No rules yet/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Download closed shared archives' })).toBeVisible()

    await user.click(screen.getByRole('tab', { name: 'Share / Status' }))
    expect(screen.getByText(/Card labels, raw descriptions, rules/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Simulate fictional partner submission' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Submit shared projection' }))
    await waitFor(function () { expect(screen.getByText('Submitted')).toBeVisible() })
    expect(screen.getByRole('button', { name: 'Simulate fictional partner submission' })).toBeEnabled()
    const captured = gateway.submitted?.projection
    expect(captured).toBeTruthy()
    expect(Object.keys(captured || {}).sort()).toEqual(['format', 'generated', 'items', 'owner', 'period', 'toolVersion', 'totals'])
    expect(JSON.stringify(captured)).not.toMatch(/raw|card|rule|amazon|product|orderId|decisions|privateRows/i)

    await user.click(screen.getByRole('button', { name: 'Replace submission' }))
    expect(await screen.findByText('Replaced')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Withdraw' }))
    expect(await screen.findByText('Withdrawn')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Submit shared projection' }))
    expect(await screen.findByText('Submitted')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Simulate fictional partner submission' }))
    expect((await screen.findAllByText('Partner ready')).length).toBeGreaterThanOrEqual(1)
    await user.click(screen.getByRole('button', { name: 'Simulate partner change (stale)' }))
    expect(await screen.findByText(/Stale/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Refresh and review' }))
    expect((await screen.findAllByText('Partner ready')).length).toBeGreaterThanOrEqual(1)
    await user.click(screen.getByRole('button', { name: 'Continue to Settle' }))

    const close = screen.getByRole('button', { name: 'Close month and archive' })
    expect(close).toBeDisabled()
    await user.click(screen.getByLabelText(/I checked the private count/))
    expect(close).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Make next close fail (fictional)' }))
    await user.click(close)
    expect(await screen.findByRole('button', { name: 'Retry close safely' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Retry close safely' }))
    expect(await screen.findByRole('button', { name: 'Download fresh archive' })).toBeVisible()
  }, 20000)

  it('keeps simulation controls out of the connected application', async function () {
    const user = userEvent.setup()
    const gateway = new LocalWorkflowGateway('connected-contract-test')
    render(<Workspace scopeKey="connected-private-test" gateway={gateway} administration={gateway} connected />)
    expect(screen.getByText('Connected to local workflow API')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: 'Share / Status' }))
    expect(screen.getAllByText('Local API · fictional data only')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Simulate fictional partner submission' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simulate partner change (stale)' })).not.toBeInTheDocument()
  })

  it('erases only the active private scope and exposes administrator limits before action', async function () {
    const user = userEvent.setup()
    window.localStorage.setItem('unrelated-owner-data', 'keep')
    const scopeKey = 'splitledger.webapp.v1.user_a.org_a'
    const gateway = new MemberGateway('member-workflow-test')
    render(<Workspace scopeKey={scopeKey} gateway={gateway} administration={gateway} connected />)
    await user.click(screen.getByRole('button', { name: 'Rules & Files' }))
    expect(await screen.findByText(/Restore, abandoned-period cancellation, and deletion require a household administrator/)).toBeVisible()
    expect(screen.getByLabelText('Restore closed shared archives')).toBeDisabled()
    await user.type(screen.getByLabelText('Type DELETE PRIVATE DRAFT'), 'DELETE PRIVATE DRAFT')
    await user.click(screen.getByRole('button', { name: 'Delete this private browser draft' }))
    expect(window.localStorage.getItem(scopeKey)).toBeNull()
    expect(window.localStorage.getItem('unrelated-owner-data')).toBe('keep')
    expect(screen.getByText(/Auto-save is paused until reload/)).toBeVisible()
  })
})
