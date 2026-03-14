export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import AcceptButton from './AcceptButton';

const RED = '#dc2626';

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function fmtDate(d) {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default async function PublicEstimateViewPage({ params }) {
  let estimate;
  try {
    const res = await fetch(`http://localhost:4000/public/view-estimate/${params.id}`, { cache: 'no-store' });
    if (!res.ok) return notFound();
    estimate = await res.json();
  } catch {
    return notFound();
  }

  if (!estimate || estimate.error) return notFound();

  const customer     = estimate.customer  || {};
  const company      = estimate.company   || {};
  const items        = estimate.items     || [];
  const customerName = customer.companyName ||
                       `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
                       'Valued Customer';
  const companyName  = company.companyName || 'Stealth Machine Tools';
  const logoUrl      = company.logoUrl || null;

  const isExpired  = estimate.expiryDate && new Date(estimate.expiryDate) < new Date();
  const isAccepted = estimate.status === 'ACCEPTED';
  const statusLabel = {
    DRAFT: 'Draft', SENT: 'Sent', VIEWED: 'Viewed',
    ACCEPTED: 'Accepted', DECLINED: 'Declined',
    EXPIRED: 'Expired', CONVERTED: 'Converted',
  }[estimate.status] || estimate.status;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{`Estimate ${estimate.estimateNumber} \u2014 ${companyName}`}</title>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, Helvetica, sans-serif; background: #f4f4f4; color: #333333; }

          .wrap { max-width: 800px; margin: 24px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.10); }

          /* Header */
          .header { background: ${RED}; padding: 24px 28px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
          .header.logo-header { background: #000000; }
          .header-logo { max-height: 56px; max-width: 200px; display: block; }
          .header-company { color: #ffffff; font-size: 20px; font-weight: 700; }
          .header-sub { color: rgba(255,255,255,0.8); font-size: 12px; margin-top: 3px; }
          .header-right { text-align: right; flex-shrink: 0; }
          .est-number { color: #ffffff; font-size: 16px; font-weight: 700; font-family: monospace; word-break: break-all; }
          .status-badge { display: inline-block; margin-top: 6px; padding: 3px 10px; background: rgba(255,255,255,0.2); border-radius: 20px; color: #ffffff; font-size: 11px; font-weight: 600; white-space: nowrap; }
          .status-badge.accepted { background: #16a34a; }

          /* Info grid */
          .info-row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #eeeeee; }
          .info-cell { padding: 16px 20px; }
          .info-cell:first-child { border-right: 1px solid #eeeeee; }
          .info-label { font-size: 10px; font-weight: 700; color: #999999; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 6px; }
          .info-value { font-size: 13px; color: #333333; line-height: 1.6; }
          .info-value strong { color: #111111; }
          .detail-row { display: flex; justify-content: space-between; margin-bottom: 4px; gap: 8px; }
          .detail-label { color: #666666; white-space: nowrap; }
          .detail-val { font-weight: 600; color: #111111; text-align: right; }

          /* Items table — scrollable on mobile */
          .items-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          table.items { width: 100%; border-collapse: collapse; min-width: 480px; }
          table.items thead tr { background: ${RED}; }
          table.items thead th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
          table.items thead th.right { text-align: right; }
          table.items tbody tr { border-bottom: 1px solid #f0f0f0; }
          table.items tbody tr:last-child { border-bottom: none; }
          table.items tbody td { padding: 12px 14px; font-size: 14px; vertical-align: top; color: #333333; }
          table.items tbody td.right { text-align: right; white-space: nowrap; }
          .item-name { font-weight: 700; color: ${RED}; font-size: 14px; }
          .item-sku  { font-size: 11px; color: #ffffff; background: #555555; display: inline-block; padding: 1px 6px; border-radius: 3px; margin-top: 3px; font-family: monospace; }
          .item-desc { font-size: 12px; color: #444444; margin-top: 5px; line-height: 1.5; }

          /* Totals */
          .totals-section { padding: 16px 20px 20px; }
          .totals-table { width: 100%; max-width: 300px; margin-left: auto; }
          .totals-table td { padding: 6px 0; font-size: 14px; color: #333333; }
          .totals-table td:last-child { text-align: right; }
          .totals-total td { font-size: 17px; font-weight: 700; border-top: 2px solid #eeeeee; padding-top: 10px; color: #111111; }
          .totals-total td:last-child { color: ${RED}; }

          /* Notes / Terms */
          .notes-section { padding: 16px 20px; background: #fafafa; border-top: 1px solid #eeeeee; }
          .notes-label { font-size: 10px; font-weight: 700; color: #999999; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 6px; }
          .notes-text { font-size: 13px; color: #444444; white-space: pre-wrap; line-height: 1.7; }

          /* Footer */
          .footer { padding: 16px 20px; background: #f0f0f0; text-align: center; font-size: 12px; color: #888888; }

          /* Mobile */
          @media (max-width: 600px) {
            .wrap { margin: 0; border-radius: 0; }
            .header { padding: 18px 16px; }
            .header-company { font-size: 17px; }
            .header-logo { max-height: 44px; max-width: 160px; }
            .info-row { grid-template-columns: 1fr; }
            .info-cell:first-child { border-right: none; border-bottom: 1px solid #eeeeee; }
            .info-cell { padding: 14px 16px; }
            .items-wrap { margin: 0; }
            .totals-section { padding: 14px 16px 18px; }
            .notes-section { padding: 14px 16px; }
            .footer { padding: 14px 16px; }
          }
        `}</style>
      </head>
      <body>
        <div className="wrap">

          {/* Header */}
          <div className={`header${logoUrl ? ' logo-header' : ''}`}>
            <div style={{ minWidth: 0 }}>
              {logoUrl
                ? <img src={logoUrl} alt={companyName} className="header-logo" />
                : <>
                    <div className="header-company">{companyName}</div>
                    {company.phone && <div className="header-sub">{company.phone}</div>}
                    {company.email && <div className="header-sub">{company.email}</div>}
                  </>}
            </div>
            <div className="header-right">
              <div className="est-number">{estimate.estimateNumber}</div>
              {estimate.version > 1 && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 3 }}>v{estimate.version}</div>}
              <div className={`status-badge${isAccepted ? ' accepted' : ''}`}>{statusLabel}</div>
            </div>
          </div>

          {/* Bill To + Dates */}
          <div className="info-row">
            <div className="info-cell">
              <div className="info-label">Prepared For</div>
              <div className="info-value">
                <strong>{customerName}</strong>
                {customer.email && <><br /><span style={{ color: '#555555' }}>{customer.email}</span></>}
                {customer.phone && <><br /><span style={{ color: '#555555' }}>{customer.phone}</span></>}
              </div>
            </div>
            <div className="info-cell">
              <div className="info-label">Estimate Details</div>
              <div className="info-value">
                <div className="detail-row">
                  <span className="detail-label">Date</span>
                  <span className="detail-val">{fmtDate(estimate.estimateDate)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Valid Until</span>
                  <span className="detail-val" style={{ color: isExpired ? '#cc0000' : '#111111' }}>{fmtDate(estimate.expiryDate)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Prepared By</span>
                  <span className="detail-val">{estimate.createdBy?.name || companyName}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Expired warning */}
          {isExpired && (
            <div style={{ padding: '10px 20px', background: '#fff3f3', borderBottom: '1px solid #fcc', fontSize: 13, color: '#990000', fontWeight: 500 }}>
              \u26a0\ufe0f This estimate expired on {fmtDate(estimate.expiryDate)}. Please contact us for an updated quote.
            </div>
          )}

          {/* Accept CTA (client component) */}
          <AcceptButton
            estimateId={estimate.id}
            estimateNumber={estimate.estimateNumber}
            total={estimate.total}
            initialStatus={estimate.status}
          />

          {/* Line Items */}
          <div className="items-wrap">
            <table className="items">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="right" style={{ width: 50 }}>Qty</th>
                  <th className="right" style={{ width: 110 }}>Unit Price</th>
                  <th className="right" style={{ width: 110 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id || i}>
                    <td>
                      <div className="item-name">{item.name}</div>
                      {item.sku && <div className="item-sku">{item.sku}</div>}
                      {item.description && <div className="item-desc">{item.description}</div>}
                    </td>
                    <td className="right">{item.quantity}</td>
                    <td className="right">{fmt(item.unitPrice)}</td>
                    <td className="right" style={{ fontWeight: 600 }}>{fmt(item.amount ?? item.quantity * item.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="totals-section">
            <table className="totals-table">
              <tbody>
                <tr><td style={{ color: '#666666' }}>Subtotal</td><td>{fmt(estimate.subtotal)}</td></tr>
                {estimate.discountAmount > 0 && <tr><td style={{ color: '#666666' }}>Discount</td><td style={{ color: '#16a34a' }}>-{fmt(estimate.discountAmount)}</td></tr>}
                {estimate.taxAmount > 0 && <tr><td style={{ color: '#666666' }}>Tax ({estimate.taxRate}%)</td><td>{fmt(estimate.taxAmount)}</td></tr>}
                {estimate.shippingAmount > 0 && <tr><td style={{ color: '#666666' }}>Shipping</td><td>{fmt(estimate.shippingAmount)}</td></tr>}
              </tbody>
              <tfoot>
                <tr className="totals-total"><td>Total</td><td>{fmt(estimate.total)}</td></tr>
              </tfoot>
            </table>
          </div>

          {/* Notes */}
          {estimate.notes && (
            <div className="notes-section">
              <div className="notes-label">Notes</div>
              <div className="notes-text">{estimate.notes}</div>
            </div>
          )}

          {/* Terms & Conditions */}
          {estimate.termsConditions && (
            <div className="notes-section">
              <div className="notes-label">Terms &amp; Conditions</div>
              <div className="notes-text">{estimate.termsConditions}</div>
            </div>
          )}

          {/* Footer */}
          <div className="footer">
            <p>{companyName}</p>
            {company.phone && <p style={{ marginTop: 4 }}>{company.phone}</p>}
            <p style={{ marginTop: 4 }}>Questions? Reply to the email you received or contact your sales representative.</p>
          </div>
        </div>
      </body>
    </html>
  );
}
