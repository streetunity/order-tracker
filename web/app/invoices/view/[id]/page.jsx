export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import PayButton from './PayButton';

const RED = '#dc2626';

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function fmtDate(d) {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const STATUS_COLORS = {
  DRAFT:   { bg: '#f3f4f6', text: '#6b7280', label: 'Draft' },
  SENT:    { bg: '#eff6ff', text: '#2563eb', label: 'Sent' },
  VIEWED:  { bg: '#f5f3ff', text: '#7c3aed', label: 'Viewed' },
  PARTIAL: { bg: '#fffbeb', text: '#d97706', label: 'Partially Paid' },
  PAID:    { bg: '#f0fdf4', text: '#15803d', label: 'Paid' },
  OVERDUE: { bg: '#fef2f2', text: '#dc2626', label: 'Overdue' },
  VOID:    { bg: '#f9fafb', text: '#9ca3af', label: 'Void' },
};

export default async function PublicInvoiceViewPage({ params }) {
  let invoice;
  try {
    const res = await fetch(`http://localhost:4000/public/view-invoice/${params.id}`, { cache: 'no-store' });
    if (!res.ok) return notFound();
    invoice = await res.json();
  } catch {
    return notFound();
  }

  if (!invoice || invoice.error) return notFound();

  const customer     = invoice.customer  || {};
  const company      = invoice.company   || {};
  const items        = invoice.items     || [];
  const schedule     = invoice.paymentSchedule || [];
  const customerName = customer.companyName ||
                       `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
                       'Valued Customer';
  const companyName  = company.companyName || 'Stealth Machine Tools';
  const logoUrl      = company.logoUrl || null;

  const isOverdue = invoice.dueDate && new Date(invoice.dueDate) < new Date() && !['PAID','VOID'].includes(invoice.status);
  const isPaid    = invoice.status === 'PAID';
  const isVoid    = invoice.status === 'VOID';
  const statusMeta = STATUS_COLORS[invoice.status] || STATUS_COLORS.SENT;

  const paymentTermsLabel = {
    NET15: 'Net 15', NET30: 'Net 30', NET60: 'Net 60',
    DUE_ON_RECEIPT: 'Due on Receipt', CUSTOM: 'Custom',
  }[invoice.paymentTerms] || invoice.paymentTerms || 'Net 30';

  return (
    <html lang="en" style={{ colorScheme: 'light' }}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light" />
        <title>{`Invoice ${invoice.invoiceNumber} \u2014 ${companyName}`}</title>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html { color-scheme: light; }
          body { font-family: Arial, Helvetica, sans-serif; background: #f4f4f4 !important; color: #333333 !important; }

          .wrap { max-width: 800px; margin: 24px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.10); }

          /* Header */
          .header { background: ${RED}; padding: 24px 28px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
          .header.logo-header { background: #000000; }
          .header-left { display: flex; align-items: center; gap: 16px; min-width: 0; }
          .header-logo { height: 52px; width: auto; display: block; flex-shrink: 0; }
          .header-text { display: flex; flex-direction: column; justify-content: center; }
          .header-company { color: #ffffff; font-size: 20px; font-weight: 700; line-height: 1.2; }
          .header-sub { color: rgba(255,255,255,0.75); font-size: 12px; margin-top: 3px; }
          .header-right { text-align: right; flex-shrink: 0; }
          .inv-number { color: #ffffff; font-size: 16px; font-weight: 700; font-family: monospace; word-break: break-all; }
          .inv-label { color: rgba(255,255,255,0.65); font-size: 11px; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px; }
          .status-badge { display: inline-block; margin-top: 6px; padding: 3px 10px; background: rgba(255,255,255,0.2); border-radius: 20px; color: #ffffff; font-size: 11px; font-weight: 600; white-space: nowrap; }
          .status-badge.paid { background: #16a34a; }
          .status-badge.overdue { background: #991b1b; }

          /* Info grid */
          .info-row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #eeeeee; background: #ffffff; }
          .info-cell { padding: 16px 20px; background: #ffffff; }
          .info-cell:first-child { border-right: 1px solid #eeeeee; }
          .info-label { font-size: 10px; font-weight: 700; color: #999999; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 6px; }
          .info-value { font-size: 13px; color: #333333; line-height: 1.6; }
          .info-value strong { color: #111111; }
          .detail-row { display: flex; justify-content: space-between; margin-bottom: 4px; gap: 8px; }
          .detail-label { color: #666666; white-space: nowrap; }
          .detail-val { font-weight: 600; color: #111111; text-align: right; }
          .detail-val.overdue { color: ${RED}; }

          /* Balance due banner */
          .balance-banner { padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eeeeee; }
          .balance-banner.unpaid { background: #fff8f8; }
          .balance-banner.paid   { background: #f0fdf4; }
          .balance-label { font-size: 13px; font-weight: 600; color: #555; }
          .balance-amount { font-size: 20px; font-weight: 800; }
          .balance-amount.unpaid { color: ${RED}; }
          .balance-amount.paid   { color: #15803d; }

          /* Items table */
          .items-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; background: #ffffff; }
          table.items { width: 100%; border-collapse: collapse; min-width: 480px; background: #ffffff; }
          table.items thead tr { background: ${RED} !important; }
          table.items thead th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; color: #ffffff !important; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; background: ${RED} !important; }
          table.items thead th.right { text-align: right; }
          table.items tbody tr { border-bottom: 1px solid #eeeeee; background: #ffffff !important; }
          table.items tbody tr:nth-child(even) { background: #fafafa !important; }
          table.items tbody tr:last-child { border-bottom: none; }
          table.items tbody td { padding: 12px 14px; font-size: 14px; vertical-align: top; color: #333333 !important; background: transparent; }
          table.items tbody td.right { text-align: right; white-space: nowrap; }
          .item-name { font-weight: 700; color: ${RED} !important; font-size: 14px; }
          .item-sku  { font-size: 11px; color: #ffffff !important; background: #444444 !important; display: inline-block; padding: 2px 7px; border-radius: 3px; margin-top: 3px; font-family: monospace; }
          .item-desc { font-size: 12px; color: #333333 !important; margin-top: 5px; line-height: 1.5; }

          /* Payment schedule */
          .schedule-section { padding: 16px 20px; background: #fafafa; border-top: 1px solid #eeeeee; }
          .schedule-title { font-size: 12px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 10px; }
          table.schedule { width: 100%; border-collapse: collapse; }
          table.schedule th { font-size: 11px; font-weight: 600; color: #999; text-transform: uppercase; padding: 6px 10px; text-align: left; background: transparent; border-bottom: 1px solid #e5e7eb; }
          table.schedule th.right { text-align: right; }
          table.schedule td { padding: 8px 10px; font-size: 13px; color: #333; border-bottom: 1px solid #f0f0f0; }
          table.schedule td.right { text-align: right; }
          .sched-paid   { display: inline-block; padding: 2px 8px; background: #dcfce7; color: #15803d; border-radius: 12px; font-size: 10px; font-weight: 700; }
          .sched-unpaid { display: inline-block; padding: 2px 8px; background: #fef9c3; color: #a16207; border-radius: 12px; font-size: 10px; font-weight: 700; }

          /* Totals */
          .totals-section { background: #111111; padding: 0; }
          .totals-table { width: 100%; border-collapse: collapse; }
          .totals-table td { padding: 10px 20px; font-size: 14px; background: #111111 !important; border-bottom: 1px solid #222222; }
          .totals-table td.label-cell { color: #aaaaaa !important; }
          .totals-table td.value-cell { text-align: right; color: #ffffff !important; }
          .totals-table td.discount-cell { text-align: right; color: #4ade80 !important; }
          .totals-table td.paid-cell { text-align: right; color: #4ade80 !important; }
          .totals-total td { font-size: 18px; font-weight: 700; border-top: none; border-bottom: none; padding: 14px 20px; background: #000000 !important; }
          .totals-total td.label-cell { color: #ffffff !important; }
          .totals-total td.value-cell { color: ${RED} !important; }
          .totals-total td.paid-value { color: #4ade80 !important; }

          /* Notes */
          .notes-section { padding: 16px 20px; background: #f8f8f8; border-top: 1px solid #eeeeee; }
          .notes-label { font-size: 10px; font-weight: 700; color: #999999; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 6px; }
          .notes-text { font-size: 13px; color: #333333 !important; white-space: pre-wrap; line-height: 1.7; }

          /* Footer */
          .footer { padding: 16px 20px; background: #f0f0f0; text-align: center; font-size: 12px; color: #777777; border-top: 1px solid #dddddd; }

          @media (max-width: 600px) {
            .wrap { margin: 0; border-radius: 0; }
            .header { padding: 16px; }
            .header-logo { height: 40px; }
            .header-company { font-size: 16px; }
            .header-left { gap: 12px; }
            .info-row { grid-template-columns: 1fr; }
            .info-cell:first-child { border-right: none; border-bottom: 1px solid #eeeeee; }
            .info-cell { padding: 14px 16px; }
            .balance-banner { flex-direction: column; align-items: flex-start; gap: 4px; }
            .notes-section { padding: 14px 16px; }
            .footer { padding: 14px 16px; }
          }
        `}</style>
      </head>
      <body>
        <div className="wrap">

          {/* Header */}
          <div className={`header${logoUrl ? ' logo-header' : ''}`}>
            <div className="header-left">
              {logoUrl && <img src={logoUrl} alt={companyName} className="header-logo" />}
              <div className="header-text">
                <div className="header-company">{companyName}</div>
                {company.phone && <div className="header-sub">{company.phone}</div>}
                {company.email && !company.phone && <div className="header-sub">{company.email}</div>}
              </div>
            </div>
            <div className="header-right">
              <div className="inv-label">Invoice</div>
              <div className="inv-number">{invoice.invoiceNumber}</div>
              <div className={`status-badge${isPaid ? ' paid' : isOverdue ? ' overdue' : ''}`}>
                {isPaid ? 'Paid' : isOverdue ? 'Overdue' : statusMeta.label}
              </div>
            </div>
          </div>

          {/* Balance due banner */}
          <div className={`balance-banner ${isPaid ? 'paid' : 'unpaid'}`}>
            <div>
              <div className="balance-label">{isPaid ? 'Invoice Paid' : 'Balance Due'}</div>
              {!isPaid && invoice.dueDate && (
                <div style={{ fontSize: 12, color: isOverdue ? RED : '#888', marginTop: 2 }}>
                  {isOverdue ? `\u26a0\ufe0f Overdue since ${fmtDate(invoice.dueDate)}` : `Due ${fmtDate(invoice.dueDate)}`}
                </div>
              )}
            </div>
            <div className={`balance-amount ${isPaid ? 'paid' : 'unpaid'}`}>
              {isPaid ? '\u2713 ' + fmt(invoice.total) : fmt(invoice.balanceDue)}
            </div>
          </div>

          {/* Bill To + Details */}
          <div className="info-row">
            <div className="info-cell">
              <div className="info-label">Bill To</div>
              <div className="info-value">
                <strong>{customerName}</strong>
                {customer.email && <><br /><span style={{ color: '#555555' }}>{customer.email}</span></>}
                {customer.phone && <><br /><span style={{ color: '#555555' }}>{customer.phone}</span></>}
                {(customer.billingAddress || customer.address) && (
                  <><br /><span style={{ color: '#555555' }}>{customer.billingAddress || customer.address}</span></>
                )}
              </div>
            </div>
            <div className="info-cell">
              <div className="info-label">Invoice Details</div>
              <div className="info-value">
                <div className="detail-row">
                  <span className="detail-label">Invoice Date</span>
                  <span className="detail-val">{fmtDate(invoice.invoiceDate)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Due Date</span>
                  <span className={`detail-val${isOverdue ? ' overdue' : ''}`}>{fmtDate(invoice.dueDate)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Payment Terms</span>
                  <span className="detail-val">{paymentTermsLabel}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Prepared By</span>
                  <span className="detail-val">{invoice.createdBy?.name || companyName}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Overdue warning */}
          {isOverdue && (
            <div style={{ padding: '10px 20px', background: '#fff3f3', borderBottom: '1px solid #fcc', fontSize: 13, color: '#990000', fontWeight: 500 }}>
              \u26a0\ufe0f This invoice was due on {fmtDate(invoice.dueDate)}. Please submit payment as soon as possible.
            </div>
          )}

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

          {/* Payment Schedule (if applicable) */}
          {schedule.length > 0 && (
            <div className="schedule-section">
              <div className="schedule-title">Payment Schedule</div>
              <table className="schedule">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Due</th>
                    <th className="right">Amount</th>
                    <th className="right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((s, i) => (
                    <tr key={s.id || i}>
                      <td>{s.description}</td>
                      <td style={{ color: '#666', whiteSpace: 'nowrap' }}>{fmtDate(s.dueDate)}</td>
                      <td className="right" style={{ fontWeight: 600 }}>{fmt(s.amount)}</td>
                      <td className="right">
                        <span className={s.status === 'PAID' ? 'sched-paid' : 'sched-unpaid'}>
                          {s.status === 'PAID' ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div className="totals-section">
            <table className="totals-table">
              <tbody>
                <tr>
                  <td className="label-cell">Subtotal</td>
                  <td className="value-cell">{fmt(invoice.subtotal)}</td>
                </tr>
                {invoice.discountAmount > 0 && (
                  <tr>
                    <td className="label-cell">Discount</td>
                    <td className="discount-cell">-{fmt(invoice.discountAmount)}</td>
                  </tr>
                )}
                {invoice.taxAmount > 0 && (
                  <tr>
                    <td className="label-cell">Tax ({invoice.taxRate}%)</td>
                    <td className="value-cell">{fmt(invoice.taxAmount)}</td>
                  </tr>
                )}
                {invoice.shippingAmount > 0 && (
                  <tr>
                    <td className="label-cell">Shipping</td>
                    <td className="value-cell">{fmt(invoice.shippingAmount)}</td>
                  </tr>
                )}
                <tr>
                  <td className="label-cell">Invoice Total</td>
                  <td className="value-cell">{fmt(invoice.total)}</td>
                </tr>
                {invoice.amountPaid > 0 && (
                  <tr>
                    <td className="label-cell">Amount Paid</td>
                    <td className="paid-cell discount-cell">-{fmt(invoice.amountPaid)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="totals-total">
                  <td className="label-cell">Balance Due</td>
                  <td className={isPaid ? 'paid-value' : 'value-cell'}>
                    {isPaid ? '\u2713 Paid in Full' : fmt(invoice.balanceDue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="notes-section">
              <div className="notes-label">Notes</div>
              <div className="notes-text">{invoice.notes}</div>
            </div>
          )}

          {/* Terms */}
          {invoice.termsConditions && (
            <div className="notes-section">
              <div className="notes-label">Terms &amp; Conditions</div>
              <div className="notes-text">{invoice.termsConditions}</div>
            </div>
          )}

          {/* Pay CTA */}
          <PayButton
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoiceNumber}
            balanceDue={invoice.balanceDue}
            initialStatus={invoice.status}
            paymentSchedule={schedule}
          />

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
