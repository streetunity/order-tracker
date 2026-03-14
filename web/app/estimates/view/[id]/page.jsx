export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';

const RED = '#cc0000';

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Server component — fetches data at request time, no client-side auth needed
export default async function PublicEstimateViewPage({ params }) {
  let estimate;
  try {
    const res = await fetch(`http://localhost:4000/public/view-estimate/${params.id}`, {
      cache: 'no-store',
    });
    if (!res.ok) return notFound();
    estimate = await res.json();
  } catch {
    return notFound();
  }

  if (!estimate || estimate.error) return notFound();

  const customer     = estimate.customer || {};
  const company      = estimate.company  || {};
  const items        = estimate.items    || [];
  const customerName = customer.companyName ||
                       `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
                       'Valued Customer';
  const companyName  = company.companyName || 'Stealth Machine Tools';

  const isExpired = estimate.expiryDate && new Date(estimate.expiryDate) < new Date();
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
        <title>{`Estimate ${estimate.estimateNumber} — ${companyName}`}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, Helvetica, sans-serif; background: #f4f4f4; color: #333; }
          .wrap { max-width: 780px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.10); }
          .header { background: ${RED}; padding: 28px 36px; display: flex; justify-content: space-between; align-items: center; }
          .header-company { color: #fff; font-size: 22px; font-weight: 700; }
          .header-sub { color: rgba(255,255,255,0.8); font-size: 13px; margin-top: 4px; }
          .header-right { text-align: right; }
          .est-number { color: #fff; font-size: 20px; font-weight: 700; font-family: monospace; }
          .status-badge { display: inline-block; margin-top: 6px; padding: 3px 10px; background: rgba(255,255,255,0.2); border-radius: 20px; color: #fff; font-size: 12px; font-weight: 600; }
          .info-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border-bottom: 1px solid #eee; }
          .info-cell { padding: 20px 28px; }
          .info-cell:first-child { border-right: 1px solid #eee; }
          .info-label { font-size: 11px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 8px; }
          .info-value { font-size: 14px; color: #333; line-height: 1.6; }
          .info-value strong { color: #111; }
          table.items { width: 100%; border-collapse: collapse; }
          table.items thead tr { background: ${RED}; }
          table.items thead th { padding: 11px 16px; text-align: left; font-size: 12px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; }
          table.items thead th.right { text-align: right; }
          table.items tbody tr { border-bottom: 1px solid #f0f0f0; }
          table.items tbody tr:last-child { border-bottom: none; }
          table.items tbody td { padding: 14px 16px; font-size: 14px; vertical-align: top; }
          table.items tbody td.right { text-align: right; }
          .item-name { font-weight: 600; color: #111; }
          .item-sku { font-size: 11px; color: #999; margin-top: 2px; font-family: monospace; }
          .item-desc { font-size: 12px; color: #666; margin-top: 4px; font-style: italic; }
          .totals-section { padding: 0 28px 24px; }
          .totals-table { width: 100%; max-width: 320px; margin-left: auto; }
          .totals-table td { padding: 7px 0; font-size: 14px; }
          .totals-table td:last-child { text-align: right; }
          .totals-total td { font-size: 17px; font-weight: 700; border-top: 2px solid #eee; padding-top: 12px; }
          .totals-total td:last-child { color: ${RED}; }
          .notes-section { padding: 20px 28px; background: #fafafa; border-top: 1px solid #eee; }
          .notes-label { font-size: 11px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 8px; }
          .notes-text { font-size: 13px; color: #555; white-space: pre-wrap; line-height: 1.7; }
          .footer { padding: 20px 28px; background: #f0f0f0; text-align: center; font-size: 12px; color: #888; }
          .pdf-bar { padding: 14px 28px; background: #fff7f7; border-top: 1px solid #fdd; border-bottom: 1px solid #fdd; display: flex; justify-content: space-between; align-items: center; }
          .pdf-bar p { font-size: 13px; color: #555; }
          .pdf-btn { display: inline-block; padding: 9px 20px; background: ${RED}; color: #fff; text-decoration: none; border-radius: 5px; font-weight: 700; font-size: 13px; }
          @media (max-width: 600px) {
            .wrap { margin: 0; border-radius: 0; }
            .header { flex-direction: column; gap: 12px; }
            .header-right { text-align: left; }
            .info-row { grid-template-columns: 1fr; }
            .info-cell:first-child { border-right: none; border-bottom: 1px solid #eee; }
          }
        `}</style>
      </head>
      <body>
        <div className="wrap">

          {/* Header */}
          <div className="header">
            <div>
              <div className="header-company">{companyName}</div>
              {company.phone && <div className="header-sub">{company.phone}</div>}
              {company.email && <div className="header-sub">{company.email}</div>}
            </div>
            <div className="header-right">
              <div className="est-number">{estimate.estimateNumber}</div>
              {estimate.version > 1 && <div style={{color:'rgba(255,255,255,0.7)',fontSize:12,marginTop:4}}>Version {estimate.version}</div>}
              <div className="status-badge">{statusLabel}</div>
            </div>
          </div>

          {/* Bill To + Dates */}
          <div className="info-row">
            <div className="info-cell">
              <div className="info-label">Prepared For</div>
              <div className="info-value">
                <strong>{customerName}</strong>
                {customer.email && <><br />{customer.email}</>}
                {customer.phone && <><br />{customer.phone}</>}
              </div>
            </div>
            <div className="info-cell">
              <div className="info-label">Estimate Details</div>
              <div className="info-value">
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{color:'#666'}}>Date</span>
                  <span><strong>{fmtDate(estimate.estimateDate)}</strong></span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{color:'#666'}}>Valid Until</span>
                  <span style={{color: isExpired ? '#c00' : '#333'}}><strong>{fmtDate(estimate.expiryDate)}</strong></span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span style={{color:'#666'}}>Prepared By</span>
                  <span><strong>{estimate.createdBy?.name || companyName}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Expired warning */}
          {isExpired && (
            <div style={{padding:'12px 28px',background:'#fff3f3',borderBottom:'1px solid #fcc',fontSize:13,color:'#a00',fontWeight:500}}>
              ⚠️ This estimate expired on {fmtDate(estimate.expiryDate)}. Please contact us for an updated quote.
            </div>
          )}

          {/* Line Items */}
          <div style={{padding:'0'}}>
            <table className="items">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="right" style={{width:70}}>Qty</th>
                  <th className="right" style={{width:120}}>Unit Price</th>
                  <th className="right" style={{width:120}}>Total</th>
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
                    <td className="right" style={{fontWeight:600}}>{fmt(item.amount || item.quantity * item.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="totals-section" style={{paddingTop:20}}>
            <table className="totals-table">
              <tbody>
                <tr>
                  <td style={{color:'#666'}}>Subtotal</td>
                  <td>{fmt(estimate.subtotal)}</td>
                </tr>
                {estimate.discountAmount > 0 && (
                  <tr>
                    <td style={{color:'#666'}}>Discount</td>
                    <td style={{color:'#16a34a'}}>-{fmt(estimate.discountAmount)}</td>
                  </tr>
                )}
                {estimate.taxAmount > 0 && (
                  <tr>
                    <td style={{color:'#666'}}>Tax ({estimate.taxRate}%)</td>
                    <td>{fmt(estimate.taxAmount)}</td>
                  </tr>
                )}
                {estimate.shippingAmount > 0 && (
                  <tr>
                    <td style={{color:'#666'}}>Shipping</td>
                    <td>{fmt(estimate.shippingAmount)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="totals-total">
                  <td>Total</td>
                  <td>{fmt(estimate.total)}</td>
                </tr>
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

          {/* Terms */}
          {estimate.termsConditions && (
            <div className="notes-section" style={{borderTop:'1px solid #eee'}}>
              <div className="notes-label">Terms &amp; Conditions</div>
              <div className="notes-text">{estimate.termsConditions}</div>
            </div>
          )}

          {/* Footer */}
          <div className="footer">
            <p>{companyName}</p>
            {company.phone && <p style={{marginTop:4}}>{company.phone}</p>}
            <p style={{marginTop:4}}>Questions? Reply to the email you received or contact your sales representative.</p>
          </div>
        </div>
      </body>
    </html>
  );
}
