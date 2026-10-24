import { amazonOccupiedBy, amazonReviewState, type AmazonOrder } from '../shared/amazon'
import type { LedgerRow } from '../shared/refunds'
import type { PrivateWorkspace } from './usePrivateWorkspace'

function money(value: number): string { return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value) }

export default function AmazonEvidence({ row, workspace }: { row: LedgerRow; workspace: PrivateWorkspace }) {
  const match = workspace.amazonMatches.find(function (candidate) { return candidate.txnId === row.id }) || null
  const review = amazonReviewState(match, workspace.amazonContext.orders, workspace.amazonContext.decisions[row.id])
  if (!review) return null
  if (review.kind === 'rejected') return <div className="evidence muted"><div><strong>Amazon suggestion rejected</strong><span>This evidence no longer identifies the transaction.</span></div><button onClick={() => workspace.setAmazonDecision(row.id)}>Reconsider</button></div>
  if (review.kind === 'unmatched') return <div className="evidence muted"><div><strong>No reliable Amazon match</strong><span>{review.evidence}</span></div></div>
  return <div className={'evidence ' + (review.kind === 'exact' || review.kind === 'confirmed' ? '' : 'warning')}>
    <div className="evidence-heading"><div><strong>{review.kind === 'confirmed' ? 'Amazon order confirmed' : review.kind === 'exact' ? 'Likely Amazon order' : 'Amazon evidence needs review'}</strong><span>{review.evidence}</span></div></div>
    {review.orders.map(function (order: AmazonOrder) {
      // An order already confirmed for a different charge stays visible as evidence, but
      // it is labelled as used and cannot be confirmed twice. This names the other charge
      // inside private Review only; nothing here reaches a shared projection.
      const occupiedBy = review.kind === 'confirmed' ? null : amazonOccupiedBy(row.id, order.orderId, workspace.amazonMatches, workspace.amazonContext.decisions)
      const occupant = occupiedBy ? workspace.ledger.find(function (candidate) { return candidate.id === occupiedBy }) || null : null
      return <div className={'evidence-order' + (occupiedBy ? ' occupied' : '')} key={order.orderId}>
        <div>{order.products.map(function (product) { return <strong key={product}>{product}</strong> })}<small>Fictional order · {order.orderDate} · ${order.total.toFixed(2)}</small>
          {occupiedBy ? <small className="occupied-note" role="note">Already used for {occupant ? occupant.merchant + ' on ' + occupant.date + ' (' + money(occupant.amount) + ')' : 'another charge'}. To use it here instead, open that charge’s Details and choose Change match first.</small> : null}</div>
        {review.kind !== 'confirmed' ? <button disabled={!!occupiedBy} aria-disabled={!!occupiedBy} title={occupiedBy ? 'This order is already confirmed for another charge.' : undefined} onClick={() => workspace.confirmAmazon(row.id, order.orderId)}>{occupiedBy ? 'Already used' : 'Use this order'}</button> : null}
      </div>
    })}
    {review.kind === 'confirmed' ? <button onClick={() => workspace.setAmazonDecision(row.id)}>Change match</button> : <button onClick={() => workspace.setAmazonDecision(row.id, { status: 'rejected' })}>Reject suggestion</button>}
  </div>
}
