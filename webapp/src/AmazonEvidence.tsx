import { amazonReviewState, type AmazonOrder } from '../shared/amazon'
import type { LedgerRow } from '../shared/refunds'
import type { PrivateWorkspace } from './usePrivateWorkspace'

export default function AmazonEvidence({ row, workspace }: { row: LedgerRow; workspace: PrivateWorkspace }) {
  const match = workspace.amazonMatches.find(function (candidate) { return candidate.txnId === row.id }) || null
  const review = amazonReviewState(match, workspace.amazonContext.orders, workspace.amazonContext.decisions[row.id])
  if (!review) return null
  if (review.kind === 'rejected') return <div className="evidence muted"><div><strong>Amazon suggestion rejected</strong><span>This evidence no longer identifies the transaction.</span></div><button onClick={() => workspace.setAmazonDecision(row.id)}>Reconsider</button></div>
  if (review.kind === 'unmatched') return <div className="evidence muted"><div><strong>No reliable Amazon match</strong><span>{review.evidence}</span></div></div>
  return <div className={'evidence ' + (review.kind === 'exact' || review.kind === 'confirmed' ? '' : 'warning')}>
    <div className="evidence-heading"><div><strong>{review.kind === 'confirmed' ? 'Amazon order confirmed' : review.kind === 'exact' ? 'Likely Amazon order' : 'Amazon evidence needs review'}</strong><span>{review.evidence}</span></div></div>
    {review.orders.map(function (order: AmazonOrder) { return <div className="evidence-order" key={order.orderId}><div>{order.products.map(function (product) { return <strong key={product}>{product}</strong> })}<small>Fictional order · {order.orderDate} · ${order.total.toFixed(2)}</small></div>{review.kind !== 'confirmed' ? <button onClick={() => workspace.confirmAmazon(row.id, order.orderId)}>Use this order</button> : null}</div> })}
    {review.kind === 'confirmed' ? <button onClick={() => workspace.setAmazonDecision(row.id)}>Change match</button> : <button onClick={() => workspace.setAmazonDecision(row.id, { status: 'rejected' })}>Reject suggestion</button>}
  </div>
}
