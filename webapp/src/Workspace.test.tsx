import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    expect((await screen.findAllByText('Both submissions ready')).length).toBeGreaterThanOrEqual(1)
    await user.click(screen.getByRole('button', { name: 'Simulate partner change (stale)' }))
    expect((await screen.findAllByText(/Shared status changed/)).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Your private draft in this browser is safe/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Replace submission' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Load latest shared status' }))
    expect((await screen.findAllByText('Both submissions ready')).length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/Shared status changed/)).not.toBeInTheDocument()
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

  it('erases only the active private scope and exposes coordinator-only limits before action', async function () {
    const user = userEvent.setup()
    window.localStorage.setItem('unrelated-owner-data', 'keep')
    const scopeKey = 'splitledger.webapp.v1.user_a.org_a'
    const gateway = new MemberGateway('member-workflow-test')
    render(<Workspace scopeKey={scopeKey} gateway={gateway} administration={gateway} connected />)
    await user.click(screen.getByRole('button', { name: 'Rules & Files' }))
    expect(await screen.findByText(/Restore, abandoned-period cancellation, and deletion are for the coordinator only/)).toBeVisible()
    expect(screen.getByLabelText('Restore closed shared archives')).toBeDisabled()
    window.localStorage.setItem(scopeKey + '.month.2026-07', '{}')
    await user.type(screen.getByLabelText('Type DELETE PRIVATE DRAFT'), 'DELETE PRIVATE DRAFT')
    await user.click(screen.getByRole('button', { name: 'Delete this private browser draft' }))
    expect(window.localStorage.getItem(scopeKey)).toBeNull()
    expect(window.localStorage.getItem(scopeKey + '.month.2026-07')).toBeNull()
    expect(window.localStorage.getItem('unrelated-owner-data')).toBe('keep')
    expect(screen.getByText(/Auto-save is paused until reload/)).toBeVisible()
  })

  it('keeps the load confirmation visible after the auto-save that follows it', async function () {
    const user = userEvent.setup()
    const scopeKey = 'fictional-load-notice'
    render(<Workspace scopeKey={scopeKey} gateway={new LocalWorkflowGateway('load-notice-test')} />)
    await waitFor(function () { expect(window.localStorage.getItem(scopeKey)).not.toBeNull() })
    const emptySession = window.localStorage.getItem(scopeKey)!
    await user.click(screen.getByRole('tab', { name: 'Import' }))
    await user.click(screen.getByRole('button', { name: 'Load fictional TD sample' }))
    await user.click(screen.getByRole('button', { name: 'Parse and add' }))
    expect(await screen.findByText(/Added 3/)).toBeVisible()
    await waitFor(function () { expect(window.localStorage.getItem(scopeKey)).not.toBe(emptySession) })
    await user.click(screen.getByRole('button', { name: 'Rules & Files' }))
    await user.upload(screen.getByLabelText('Load private session'), new File([emptySession], 'session.json', { type: 'application/json' }))
    await waitFor(function () { expect(window.localStorage.getItem(scopeKey)).toBe(emptySession) })
    await new Promise(function (resolve) { setTimeout(resolve, 300) })
    expect(screen.getByText('Private session loaded and auto-save resumed.')).toBeVisible()
  })

  it('keeps each month\'s private draft when the month changes, without a confirmation', async function () {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm')
    const gateway = new LocalWorkflowGateway('per-month-workflow-test')
    render(<Workspace scopeKey="splitledger.webapp.v1.user_m.org_m" gateway={gateway} administration={gateway} connected />)
    const month = screen.getByLabelText('Header reconciliation month')
    async function importLine(line: string) {
      await user.click(screen.getByRole('tab', { name: 'Import' }))
      await user.selectOptions(screen.getByLabelText('Supported bank'), 'Other / generic paste')
      fireEvent.change(screen.getByLabelText('Statement text'), { target: { value: line } })
      await user.click(screen.getByRole('button', { name: 'Parse and add' }))
      await user.click(screen.getByRole('tab', { name: 'Review' }))
    }
    fireEvent.change(month, { target: { value: '2026-07' } })
    await importLine('2026-07-12 FICTIONAL HARDWARE $80.00')
    expect(screen.getByText('Fictional Hardware')).toBeVisible()
    fireEvent.change(month, { target: { value: '2026-08' } })
    await importLine('2026-08-05 SAMPLE BAKERY $10.00')
    expect(screen.getByText('Sample Bakery')).toBeVisible()
    expect(screen.queryByText('Fictional Hardware')).not.toBeInTheDocument()
    fireEvent.change(month, { target: { value: '2026-07' } })
    expect(await screen.findByText('Fictional Hardware')).toBeVisible()
    expect(screen.queryByText('Sample Bakery')).not.toBeInTheDocument()
    fireEvent.change(month, { target: { value: '2026-08' } })
    expect(await screen.findByText('Sample Bakery')).toBeVisible()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('applies one share to every purchase of a merchant group, like v1', async function () {
    const user = userEvent.setup()
    const gateway = new LocalWorkflowGateway('group-workflow-test')
    render(<Workspace scopeKey="splitledger.webapp.v1.user_g.org_g" gateway={gateway} administration={gateway} connected />)
    fireEvent.change(screen.getByLabelText('Header reconciliation month'), { target: { value: '2026-07' } })
    await user.click(screen.getByRole('tab', { name: 'Import' }))
    await user.selectOptions(screen.getByLabelText('Supported bank'), 'Other / generic paste')
    fireEvent.change(screen.getByLabelText('Statement text'), { target: { value: '2026-07-03 SAMPLE CAFE $12.00\n2026-07-09 SAMPLE CAFE $8.50\n2026-07-11 FICTIONAL HARDWARE $80.00' } })
    await user.click(screen.getByRole('button', { name: 'Parse and add' }))
    await user.click(screen.getByRole('tab', { name: 'Review' }))
    expect(screen.queryByRole('button', { name: /Apply 50\/50 to every/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Merchant' }))
    await user.click(screen.getByRole('button', { name: 'Apply 50/50 to every Sample Cafe purchase' }))
    expect(screen.getByText('2 of 3 decided')).toBeVisible()
    expect(screen.getAllByText(/Shared 50% to partner/)).toHaveLength(2)
  })

  it('adopts a newer draft saved in another tab and stops after another tab deletes it', async function () {
    const user = userEvent.setup()
    const scopeKey = 'splitledger.webapp.v1.user_t.org_t'
    const tab2 = render(<Workspace scopeKey={scopeKey} gateway={new LocalWorkflowGateway('tab2-workflow')} administration={new LocalWorkflowGateway('tab2-admin')} connected />)
    const tab1 = render(<Workspace scopeKey={scopeKey} gateway={new LocalWorkflowGateway('tab1-workflow')} administration={new LocalWorkflowGateway('tab1-admin')} connected />)
    const in1 = within(tab1.container), in2 = within(tab2.container)
    fireEvent.change(in1.getByLabelText('Header reconciliation month'), { target: { value: '2026-07' } })
    await user.click(in1.getByRole('tab', { name: 'Import' }))
    await user.selectOptions(in1.getByLabelText('Supported bank'), 'Other / generic paste')
    fireEvent.change(in1.getByLabelText('Statement text'), { target: { value: '2026-07-12 FICTIONAL HARDWARE $80.00' } })
    await user.click(in1.getByRole('button', { name: 'Parse and add' }))
    await waitFor(function () { expect(window.localStorage.getItem(scopeKey)).toContain('FICTIONAL HARDWARE') })
    // The browser delivers a storage event only to the other tab; jsdom needs it dispatched.
    window.dispatchEvent(new StorageEvent('storage', { key: scopeKey, newValue: window.localStorage.getItem(scopeKey) }))
    await user.click(in2.getByRole('tab', { name: 'Review' }))
    expect(await in2.findByText('Fictional Hardware')).toBeVisible()
    expect(in2.getByText(/changed in another tab of this browser/)).toBeVisible()

    window.localStorage.removeItem(scopeKey)
    window.dispatchEvent(new StorageEvent('storage', { key: scopeKey, newValue: null }))
    expect(await in2.findByText(/deleted in another tab of this browser/)).toBeVisible()
    await new Promise(function (resolve) { setTimeout(resolve, 300) })
    expect(window.localStorage.getItem(scopeKey)).toBeNull()
  })

  it('runs the self-test and shows a safe diagnostic without private content', async function () {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async function () {}) } })
    const gateway = new LocalWorkflowGateway('support-workflow-test')
    render(<Workspace scopeKey="splitledger.webapp.v1.user_s.org_s" gateway={gateway} administration={gateway} connected />)
    fireEvent.change(screen.getByLabelText('Header reconciliation month'), { target: { value: '2026-07' } })
    await user.click(screen.getByRole('tab', { name: 'Import' }))
    await user.selectOptions(screen.getByLabelText('Supported bank'), 'Other / generic paste')
    fireEvent.change(screen.getByLabelText('Statement text'), { target: { value: '2026-07-12 FICTIONAL HARDWARE $80.00' } })
    await user.click(screen.getByRole('button', { name: 'Parse and add' }))
    await user.click(screen.getByRole('button', { name: 'Rules & Files' }))
    await user.click(screen.getByRole('button', { name: 'Run self-test' }))
    expect(screen.getByText(/Self-test passed: \d+ of \d+ checks/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Copy safe diagnostic report' }))
    const report = (screen.getByLabelText('Safe diagnostic report') as HTMLTextAreaElement).value
    expect(report).toContain('split-ledger-diagnostic/v1')
    expect(report).toMatch(/"transactions": 1/)
    expect(report).not.toMatch(/HARDWARE|Hardware|2026-07|80/)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(report)
  })
})
