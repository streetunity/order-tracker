'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import TopNav from '@/components/TopNav';
import InvoicingNav from '@/components/InvoicingNav';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

const EVENT_COLORS = {
  INSTALL:  { bg: '#dc2626', border: '#b91c1c', text: '#fff' },
  TIME_OFF: { bg: '#f59e0b', border: '#d97706', text: '#000' },
  BLOCKED:  { bg: '#525252', border: '#404040', text: '#e4e4e4' },
  OTHER:    { bg: '#2563eb', border: '#1d4ed8', text: '#fff' },
};

const TYPE_LABELS = {
  INSTALL:  'Install',
  TIME_OFF: 'Out of Office',
  BLOCKED:  'Blocked',
  OTHER:    'Other',
};

const CREATE_PERMISSIONS = {
  INSTALL:  ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'AGENT'],
  TIME_OFF: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'AGENT'],
  BLOCKED:  ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
  OTHER:    ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'AGENT'],
};

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'];
const NAV_HEIGHT = 64;

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

function formatDisplayDateTime(startStr, endStr) {
  const start = new Date(startStr);
  const end   = new Date(endStr);
  const date  = start.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const fmtT  = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date} \u00b7 ${fmtT(start)} \u2013 ${fmtT(end)}`;
}

function toInputDate(dateOrStr) {
  if (!dateOrStr) return '';
  const d = new Date(dateOrStr);
  return [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')].join('-');
}

function toInputTime(dateOrStr) {
  if (!dateOrStr) return '09:00';
  const d = new Date(dateOrStr);
  return [String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0')].join(':');
}

function toDateStr(dateOrStr) { return toInputDate(dateOrStr); }

function fcEndDate(dateStr) {
  if (!dateStr) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return [next.getUTCFullYear(), String(next.getUTCMonth()+1).padStart(2,'0'), String(next.getUTCDate()).padStart(2,'0')].join('-');
}

function buildEventTitle(event) {
  if (event.type === 'INSTALL') {
    if (!event.order) return event.title;
    const acct = event.order.account;
    const label = acct?.contactName ? `${acct.name} \u2014 ${acct.contactName}` : (acct?.name || 'Install');
    return `Install \u2014 ${label}`;
  }
  if (event.type === 'TIME_OFF') {
    const name = event.user?.name;
    if (name) return `${name} \u2014 Out of Office`;
    return event.title.replace(/\u2014 Time Off$/, '\u2014 Out of Office');
  }
  return event.title;
}

const inputSt = {
  width: '100%', padding: '10px 12px', background: '#0f0f0f',
  border: '1px solid #333', borderRadius: '6px', color: '#e4e4e4',
  fontSize: '14px', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};

const btnBase = {
  padding: '9px 20px', borderRadius: '6px', fontSize: '14px',
  cursor: 'pointer', fontWeight: 600, border: 'none', fontFamily: 'inherit',
};

function Overlay({ children, onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#171717', border: '1px solid #2a2a2a', borderRadius: '14px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function ModalHead({ title, badge, badgeColor, onClose }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #222' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h2 style={{ color: '#f0f0f0', fontSize: '17px', fontWeight: 700, margin: 0, letterSpacing: '-0.2px' }}>{title}</h2>
        {badge && <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '10px', fontWeight: 700, background: badgeColor || '#333', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{badge}</span>}
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '4px', borderRadius: '4px' }}>&times;</button>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '7px' }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: '11px', color: '#555', margin: '5px 0 0', lineHeight: 1.4 }}>{hint}</p>}
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #1e1e1e' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>{label}</div>
      <div style={{ fontSize: '15px', color: '#e4e4e4', lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  return <div style={{ padding: '10px 14px', background: '#2d0a0a', border: '1px solid #7f1d1d', borderRadius: '6px', color: '#fca5a5', fontSize: '13px', marginBottom: '16px' }}>{msg}</div>;
}

function TypeTabs({ value, onChange, canCreate }) {
  const types = [
    { key: 'INSTALL',  color: '#dc2626' },
    { key: 'TIME_OFF', color: '#f59e0b' },
    { key: 'OTHER',    color: '#2563eb' },
    { key: 'BLOCKED',  color: '#525252' },
  ].filter(t => canCreate(t.key));

  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '22px' }}>
      {types.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          flex: 1, padding: '13px 8px', borderRadius: '10px',
          border: `1.5px solid ${value === t.key ? t.color : '#222'}`,
          background: value === t.key ? t.color + '18' : '#0f0f0f',
          color: value === t.key ? '#e4e4e4' : '#555',
          cursor: 'pointer', fontSize: '13px', fontWeight: value === t.key ? 700 : 500,
          transition: 'all 0.15s', fontFamily: 'inherit',
        }}>
          <span style={{ display: 'block', width: '9px', height: '9px', borderRadius: '50%', background: t.color, margin: '0 auto 7px', opacity: value === t.key ? 1 : 0.5 }} />
          {TYPE_LABELS[t.key]}
        </button>
      ))}
    </div>
  );
}

function AssigneePicker({ users, selected, onChange }) {
  const [search, setSearch] = useState('');
  const filtered = search.length > 0 ? users.filter(u => u.name.toLowerCase().includes(search.toLowerCase())) : [];
  const toggle = id => onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);

  return (
    <div style={{ position: 'relative' }}>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {selected.map(id => {
            const u = users.find(u => u.id === id);
            return (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: '99px', fontSize: '12px', color: '#fca5a5' }}>
                {u?.name || id}
                <button onClick={() => toggle(id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}>&times;</button>
              </span>
            );
          })}
        </div>
      )}
      <input type="text" placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} style={inputSt} />
      {search.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', border: '1px solid #2a2a2a', borderTop: 'none', borderRadius: '0 0 8px 8px', zIndex: 20, maxHeight: '200px', overflowY: 'auto' }}>
          {filtered.length === 0
            ? <div style={{ padding: '10px 14px', color: '#555', fontSize: '13px' }}>No employees found</div>
            : filtered.map(u => (
              <button key={u.id} onClick={() => { toggle(u.id); setSearch(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', padding: '10px 14px', background: selected.includes(u.id) ? '#222' : 'none', border: 'none', borderBottom: '1px solid #1e1e1e', color: '#e4e4e4', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}
                onMouseEnter={e => e.currentTarget.style.background = '#252525'}
                onMouseLeave={e => e.currentTarget.style.background = selected.includes(u.id) ? '#222' : 'none'}
              >
                <span style={{ width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, background: selected.includes(u.id) ? '#dc2626' : '#222', border: `1px solid ${selected.includes(u.id) ? '#dc2626' : '#3a3a3a'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selected.includes(u.id) && <span style={{ color: '#fff', fontSize: '10px', lineHeight: 1 }}>&#10003;</span>}
                </span>
                {u.name}
              </button>
            ))
          }
        </div>
      )}
    </div>
  );
}

function CreateEditModal({
  mode, formType, setFormType,
  formStart, setFormStart, formEnd, setFormEnd,
  formAllDay, setFormAllDay,
  formStartTime, setFormStartTime, formEndTime, setFormEndTime,
  formTitle, setFormTitle, formNotes, setFormNotes,
  formUserId, setFormUserId,
  formAssigneeIds, setFormAssigneeIds,
  orderSearch, setOrderSearch, orderResults, orderLoading,
  selectedOrder, setSelectedOrder, setFormOrderId,
  users, user, isAdmin, canCreate, saving, err,
  onSave, onCancel,
}) {
  const typeLabel = TYPE_LABELS[formType] || formType;
  const supportsTime = formType !== 'TIME_OFF';
  const isAllDay = !supportsTime || formAllDay;

  return (
    <>
      <ModalHead title={mode === 'create' ? 'New Event' : `Edit ${typeLabel}`} onClose={onCancel} />
      <div style={{ padding: '24px' }}>
        {mode === 'create' && <TypeTabs value={formType} onChange={t => { setFormType(t); if (t === 'TIME_OFF') setFormAllDay(true); }} canCreate={canCreate} />}

        {formType === 'INSTALL' && (
          <Field label="Order (Optional)" hint="Link to a board order, or leave blank for jobs not yet on the board.">
            {selectedOrder ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#0f0f0f', border: '1px solid #dc2626', borderRadius: '8px' }}>
                <span style={{ color: '#e4e4e4', fontSize: '14px', flex: 1 }}>{selectedOrder.label}</span>
                <button onClick={() => { setSelectedOrder(null); setFormOrderId(''); setOrderSearch(''); }} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '18px' }}>&times;</button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input type="text" placeholder="Search by customer name or contact..." value={orderSearch} onChange={e => setOrderSearch(e.target.value)} style={inputSt} />
                {(orderResults.length > 0 || orderLoading) && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', border: '1px solid #2a2a2a', borderTop: 'none', borderRadius: '0 0 8px 8px', zIndex: 20, maxHeight: '220px', overflowY: 'auto' }}>
                    {orderLoading && <div style={{ padding: '10px 14px', color: '#555', fontSize: '13px' }}>Searching...</div>}
                    {orderResults.map(o => (
                      <button key={o.id} onClick={() => { setSelectedOrder(o); setFormOrderId(o.id); setOrderSearch(''); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', color: '#e4e4e4', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #1e1e1e', fontFamily: 'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#222'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >{o.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Field>
        )}

        {formType === 'INSTALL' && !selectedOrder && (
          <Field label="Description" hint="Shown on the calendar tile, e.g. Tech Support, Training Session">
            <input type="text" placeholder="e.g. Tech Support Visit" value={formTitle} onChange={e => setFormTitle(e.target.value)} style={inputSt} />
          </Field>
        )}

        {formType === 'INSTALL' && (
          <Field label="Assigned Employees" hint="Search and select one or more team members.">
            <AssigneePicker users={users} selected={formAssigneeIds} onChange={setFormAssigneeIds} />
          </Field>
        )}

        {formType === 'TIME_OFF' && (
          <Field label="Team Member">
            {isAdmin
              ? <select value={formUserId} onChange={e => setFormUserId(e.target.value)} style={inputSt}><option value="">Select team member...</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              : <input type="text" value={user?.name || ''} disabled style={{ ...inputSt, color: '#555' }} />
            }
          </Field>
        )}

        {formType === 'BLOCKED' && (
          <Field label="Title">
            <input type="text" placeholder="e.g. Company Holiday, Shop Closed..." value={formTitle} onChange={e => setFormTitle(e.target.value)} style={inputSt} />
          </Field>
        )}

        {formType === 'OTHER' && (
          <Field label="Event Label" hint="Describe the event, e.g. On Site Demo, Customer Visit, Product Meeting">
            <input type="text" placeholder="e.g. On Site Demo" value={formTitle} onChange={e => setFormTitle(e.target.value)} style={inputSt} autoFocus />
          </Field>
        )}

        {supportsTime && (
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={formAllDay} onChange={e => setFormAllDay(e.target.checked)} style={{ accentColor: '#dc2626', width: '15px', height: '15px' }} />
              <span style={{ fontSize: '13px', color: '#888', userSelect: 'none' }}>All day event</span>
            </label>
          </div>
        )}

        {isAllDay ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Start Date"><input type="date" value={formStart} onChange={e => { setFormStart(e.target.value); if (!formEnd || formEnd < e.target.value) setFormEnd(e.target.value); }} style={inputSt} /></Field>
            <Field label="End Date"><input type="date" value={formEnd} min={formStart} onChange={e => setFormEnd(e.target.value)} style={inputSt} /></Field>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <Field label="Date"><input type="date" value={formStart} onChange={e => setFormStart(e.target.value)} style={inputSt} /></Field>
            <Field label="Start Time"><input type="time" value={formStartTime} onChange={e => setFormStartTime(e.target.value)} style={inputSt} /></Field>
            <Field label="End Time"><input type="time" value={formEndTime} onChange={e => setFormEndTime(e.target.value)} style={inputSt} /></Field>
          </div>
        )}

        {(formType === 'INSTALL' || formType === 'OTHER') && (
          <Field label="Notes (Optional)">
            <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Additional details..." rows={3} style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }} />
          </Field>
        )}

        <ErrBox msg={err} />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button onClick={onCancel} style={{ ...btnBase, background: '#1a1a1a', color: '#888', border: '1px solid #2a2a2a', fontWeight: 500 }}>Cancel</button>
          <button onClick={onSave} disabled={saving} style={{ ...btnBase, background: '#dc2626', color: '#fff', opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving...' : mode === 'create' ? 'Create Event' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}

function ViewModal({ event, user, isAdmin, users, saving, err, onEdit, onDelete, onResend, onClose }) {
  const color      = EVENT_COLORS[event.type] || { bg: '#888' };
  const canEdit    = isAdmin || event.createdById === user?.id;
  const isSameDay  = toDateStr(event.startDate) === toDateStr(event.endDate);
  const badgeLabel = TYPE_LABELS[event.type] || event.type;
  const assignees  = (event.assignees || []).map(a => ({ id: a.id, name: a.name || users.find(u => u.id === a.id)?.name || a.id }));
  const displayTitle = buildEventTitle(event);

  return (
    <>
      <ModalHead title={displayTitle} badge={badgeLabel} badgeColor={color.bg} onClose={onClose} />
      <div style={{ padding: '24px' }}>
        <InfoRow label="Date">
          {event.allDay === false
            ? formatDisplayDateTime(event.startDate, event.endDate)
            : isSameDay ? formatDisplayDate(event.startDate)
              : `${formatDisplayDate(event.startDate)} \u2192 ${formatDisplayDate(event.endDate)}`
          }
        </InfoRow>

        {event.type === 'INSTALL' && event.order && (
          <InfoRow label="Customer">
            {event.order.account?.name}
            {event.order.account?.contactName && <span style={{ color: '#888', fontSize: '14px' }}> \u2014 {event.order.account.contactName}</span>}
          </InfoRow>
        )}

        {event.type === 'INSTALL' && assignees.length > 0 && (
          <InfoRow label="Assigned Employees">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {assignees.map(a => <span key={a.id} style={{ padding: '4px 12px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '99px', fontSize: '13px', color: '#d0d0d0' }}>{a.name}</span>)}
            </div>
          </InfoRow>
        )}

        {event.type === 'TIME_OFF' && event.user && <InfoRow label="Team Member">{event.user.name}</InfoRow>}
        {event.notes && <InfoRow label="Notes">{event.notes}</InfoRow>}

        {event.type === 'INSTALL' && (
          <InfoRow label="Customer Notification">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: event.customerNotified ? '#10b981' : '#f59e0b' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
              {event.customerNotified ? 'Email sent' : 'Not yet notified'}
            </span>
          </InfoRow>
        )}

        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>Created By</div>
          <div style={{ fontSize: '15px', color: '#e4e4e4' }}>{event.createdBy?.name || '\u2014'}</div>
        </div>

        <ErrBox msg={err} />
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
          {canEdit && (
            <>
              <button onClick={onEdit} style={{ ...btnBase, background: '#1a1a1a', color: '#d0d0d0', border: '1px solid #2a2a2a', fontWeight: 500, fontSize: '13px', padding: '8px 16px' }}>Edit</button>
              <button onClick={onDelete} style={{ ...btnBase, background: '#1a0808', color: '#fca5a5', border: '1px solid #5a1515', fontWeight: 500, fontSize: '13px', padding: '8px 16px' }}>Delete</button>
            </>
          )}
          {event.type === 'INSTALL' && canEdit && (
            <button onClick={onResend} disabled={saving} style={{ ...btnBase, background: '#0a1525', color: '#93c5fd', border: '1px solid #1e3a5f', fontWeight: 500, fontSize: '13px', padding: '8px 16px', opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Sending...' : event.customerNotified ? 'Resend Email' : 'Send Email'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function ConfirmDeleteModal({ event, saving, err, onConfirm, onCancel }) {
  return (
    <>
      <ModalHead title="Delete Event" onClose={onCancel} />
      <div style={{ padding: '24px' }}>
        <p style={{ color: '#c0c0c0', fontSize: '15px', lineHeight: 1.6, margin: '0 0 16px' }}>
          Are you sure you want to delete <strong style={{ color: '#f0f0f0' }}>{buildEventTitle(event)}</strong>?
        </p>
        <ErrBox msg={err} />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ ...btnBase, background: '#1a1a1a', color: '#888', border: '1px solid #2a2a2a', fontWeight: 500 }}>Cancel</button>
          <button onClick={onConfirm} disabled={saving} style={{ ...btnBase, background: '#dc2626', color: '#fff', opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </>
  );
}

export default function CalendarPage() {
  const { user, loading: authLoading } = useAuth();
  const calendarRef = useRef(null);
  const searchParams = useSearchParams();
  const fromInvoicing = searchParams.get('from') === 'invoicing';

  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [users,   setUsers]   = useState([]);
  const [modal,         setModal]         = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [formType,        setFormType]        = useState('INSTALL');
  const [formAllDay,      setFormAllDay]      = useState(true);
  const [formStart,       setFormStart]       = useState('');
  const [formEnd,         setFormEnd]         = useState('');
  const [formStartTime,   setFormStartTime]   = useState('09:00');
  const [formEndTime,     setFormEndTime]     = useState('10:00');
  const [formTitle,       setFormTitle]       = useState('');
  const [formNotes,       setFormNotes]       = useState('');
  const [formUserId,      setFormUserId]      = useState('');
  const [formOrderId,     setFormOrderId]     = useState('');
  const [formAssigneeIds, setFormAssigneeIds] = useState([]);
  const [selectedOrder,   setSelectedOrder]   = useState(null);
  const [orderSearch,     setOrderSearch]     = useState('');
  const [orderResults,    setOrderResults]    = useState([]);
  const [orderLoading,    setOrderLoading]    = useState(false);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const isAdmin   = user && ADMIN_ROLES.includes(user.role);
  const canCreate = type => user && CREATE_PERMISSIONS[type]?.includes(user.role);

  useEffect(() => {
    if (!user) return;
    fetch('/api/users/internal', { headers: getAuthHeaders() })
      .then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
  }, [user]);

  const fetchEvents = useCallback(async (start, end) => {
    if (!user) return;
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (start) p.set('start', start instanceof Date ? start.toISOString() : start);
      if (end)   p.set('end',   end   instanceof Date ? end.toISOString()   : end);
      const res = await fetch(`/api/calendar/events?${p}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to load events');
      const data = await res.json();
      setEvents(data.map(e => {
        let tileTitle = buildEventTitle(e);
        if (e.type === 'INSTALL' && e.assignees?.length > 0) {
          const firstNames = e.assignees.map(a => a.name.split(' ')[0]).join(', ');
          tileTitle = `${tileTitle} \u00b7 ${firstNames}`;
        }
        if (e.allDay !== false) {
          const startStr = toDateStr(e.startDate);
          const endStr   = toDateStr(e.endDate);
          return {
            id: e.id, title: tileTitle, allDay: true,
            start: startStr, end: fcEndDate(endStr),
            backgroundColor: EVENT_COLORS[e.type]?.bg    || '#888',
            borderColor:     EVENT_COLORS[e.type]?.border || '#666',
            textColor:       EVENT_COLORS[e.type]?.text   || '#fff',
            extendedProps: e,
          };
        } else {
          return {
            id: e.id, title: tileTitle, allDay: false,
            start: e.startDate, end: e.endDate,
            backgroundColor: EVENT_COLORS[e.type]?.bg    || '#888',
            borderColor:     EVENT_COLORS[e.type]?.border || '#666',
            textColor:       EVENT_COLORS[e.type]?.text   || '#fff',
            extendedProps: e,
          };
        }
      }));
    } catch (e) {
      console.error('[CALENDAR] fetchEvents error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { if (user) fetchEvents(null, null); }, [user, fetchEvents]);

  useEffect(() => {
    if (formType !== 'INSTALL' || orderSearch.length < 2) { setOrderResults([]); return; }
    const t = setTimeout(async () => {
      setOrderLoading(true);
      try {
        const res = await fetch(`/api/calendar/orders/search?q=${encodeURIComponent(orderSearch)}`, { headers: getAuthHeaders() });
        if (res.ok) setOrderResults(await res.json());
      } catch {}
      setOrderLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [orderSearch, formType]);

  function openCreate(dateStr, isAllDay = true, startTime = null, endTime = null) {
    const defaultType = canCreate('INSTALL') ? 'INSTALL' : canCreate('TIME_OFF') ? 'TIME_OFF' : canCreate('OTHER') ? 'OTHER' : 'BLOCKED';
    setFormType(defaultType);
    setFormAllDay(defaultType === 'TIME_OFF' ? true : isAllDay);
    setFormStart(String(dateStr).substring(0, 10));
    setFormEnd(String(dateStr).substring(0, 10));
    setFormStartTime(startTime || '09:00');
    setFormEndTime(endTime || '10:00');
    setFormTitle(''); setFormNotes('');
    setFormUserId(user?.id || ''); setFormOrderId('');
    setFormAssigneeIds([]); setSelectedOrder(null);
    setOrderSearch(''); setOrderResults([]);
    setErr('');
    setModal('create');
  }

  function openView(info) {
    setSelectedEvent(info.event?.extendedProps || info.extendedProps);
    setErr('');
    setModal('view');
  }

  function openEdit() {
    const e = selectedEvent;
    const isAllDay = e.allDay !== false;
    setFormType(e.type);
    setFormAllDay(isAllDay);
    setFormStart(toInputDate(e.startDate));
    setFormEnd(toInputDate(e.endDate));
    setFormStartTime(isAllDay ? '09:00' : toInputTime(e.startDate));
    setFormEndTime(isAllDay ? '10:00' : toInputTime(e.endDate));
    setFormNotes(e.notes || '');
    setFormUserId(e.userId || '');
    setFormOrderId(e.orderId || '');
    setFormAssigneeIds(Array.isArray(e.assigneeIds) ? e.assigneeIds : []);
    const acct = e.order?.account;
    if (e.type === 'INSTALL' && !e.order) {
      const prefix = 'Install \u2014 ';
      setFormTitle(e.title?.startsWith(prefix) ? e.title.slice(prefix.length) : '');
    } else {
      setFormTitle(e.title || '');
    }
    setSelectedOrder(e.order ? { id: e.order.id, label: acct?.contactName ? `${acct.name} \u2014 ${acct.contactName}` : (acct?.name || e.order.id) } : null);
    setOrderSearch(''); setOrderResults([]);
    setErr('');
    setModal('edit');
  }

  async function handleSave() {
    setErr('');
    if (!formStart) { setErr('Start date is required'); return; }
    if ((formType === 'BLOCKED' || formType === 'OTHER') && !formTitle.trim()) {
      setErr('Label is required');
      return;
    }

    const isAllDay = formType === 'TIME_OFF' ? true : formAllDay;

    let autoTitle = formTitle.trim();
    if (formType === 'INSTALL') {
      autoTitle = selectedOrder
        ? `Install \u2014 ${selectedOrder.label}`
        : `Install${formTitle.trim() ? ` \u2014 ${formTitle.trim()}` : ''}`;
    } else if (formType === 'TIME_OFF') {
      const tUser = users.find(u => u.id === formUserId);
      autoTitle = `${tUser?.name || user?.name || 'Team Member'} \u2014 Out of Office`;
    }

    const startDate = isAllDay ? formStart : `${formStart}T${formStartTime}:00`;
    const endDate   = isAllDay ? (formEnd || formStart) : `${formStart}T${formEndTime}:00`;

    setSaving(true);
    try {
      const body = {
        type: formType, title: autoTitle, startDate, endDate, allDay: isAllDay,
        notes: formNotes || null,
        ...(formType === 'INSTALL'  && { orderId: formOrderId || null, assigneeIds: formAssigneeIds }),
        ...(formType === 'TIME_OFF' && { userId: formUserId || user?.id }),
      };
      const isEdit = modal === 'edit';
      const res = await fetch(
        isEdit ? `/api/calendar/events/${selectedEvent.id}` : '/api/calendar/events',
        { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, body: JSON.stringify(body) }
      );
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Save failed'); }
      setModal(null);
      fetchEvents(null, null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      const res = await fetch(`/api/calendar/events/${selectedEvent.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Delete failed');
      setModal(null); fetchEvents(null, null);
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  async function handleResend() {
    setSaving(true); setErr('');
    try {
      const res = await fetch(`/api/calendar/events/${selectedEvent.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ resendEmail: true }),
      });
      if (!res.ok) throw new Error('Send failed');
      setModal(null); fetchEvents(null, null);
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  if (authLoading) return <div style={{ padding: '80px', textAlign: 'center', color: '#555' }}>Loading...</div>;
  if (!user) return null;

  const sharedModalProps = {
    formType, setFormType, formStart, setFormStart, formEnd, setFormEnd,
    formAllDay, setFormAllDay, formStartTime, setFormStartTime, formEndTime, setFormEndTime,
    formTitle, setFormTitle, formNotes, setFormNotes,
    formUserId, setFormUserId, formAssigneeIds, setFormAssigneeIds,
    orderSearch, setOrderSearch, orderResults, orderLoading,
    selectedOrder, setSelectedOrder, setFormOrderId,
    users, user, isAdmin, canCreate, saving, err,
  };

  return (
    <>
      {fromInvoicing ? <InvoicingNav /> : <TopNav />}

      <div style={{
        height: `calc(100vh - ${NAV_HEIGHT}px)`,
        display: 'flex', flexDirection: 'column',
        background: '#0a0a0a', overflow: 'hidden', boxSizing: 'border-box',
      }}>

        <style>{`
          .cal-wrap .fc { color: #d0d0d0; font-family: inherit; }
          .cal-wrap .fc-toolbar-title { color: #f0f0f0; font-size: 20px; font-weight: 700; letter-spacing: -0.4px; }
          .cal-wrap .fc-scrollgrid, .cal-wrap td, .cal-wrap th { border-color: #1a1a1a !important; }
          .cal-wrap .fc-col-header-cell { background: #0d0d0d; border-bottom: 1px solid #1a1a1a !important; }
          .cal-wrap .fc-col-header-cell-cushion { color: #555 !important; text-decoration: none; font-size: 11px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; padding: 10px 0 9px; display: block; }
          .cal-wrap .fc-daygrid-day { background: #0d0d0d; transition: background 0.12s; }
          .cal-wrap .fc-daygrid-day:hover { background: #131313; }
          .cal-wrap .fc-daygrid-day-top { padding: 8px 10px 2px; justify-content: flex-end; }
          .cal-wrap .fc-daygrid-day-number { color: #555; text-decoration: none; font-size: 13px; font-weight: 500; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.12s; }
          .cal-wrap .fc-day-other { background: #090909; }
          .cal-wrap .fc-day-other .fc-daygrid-day-number { color: #252525; }
          .cal-wrap .fc-day-today { background: rgba(220,38,38,0.05) !important; }
          .cal-wrap .fc-day-today .fc-daygrid-day-number { background: #dc2626; color: #fff !important; font-weight: 700; }
          .cal-wrap .fc-event { border-radius: 6px; padding: 3px 8px; font-size: 11.5px; font-weight: 600; cursor: pointer; transition: opacity 0.12s; border: none !important; }
          .cal-wrap .fc-event:hover { opacity: 0.82; }
          .cal-wrap .fc-daygrid-event { margin: 1px 4px 1px; }
          .cal-wrap .fc-event-main { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .cal-wrap .fc-more-link { color: #dc2626; font-size: 11px; font-weight: 700; padding: 1px 6px; margin: 0 4px; border-radius: 4px; }
          .cal-wrap .fc-more-link:hover { background: rgba(220,38,38,0.12); }
          .cal-wrap .fc-popover { background: #141414 !important; border: 1px solid #222 !important; border-radius: 12px !important; box-shadow: 0 20px 50px rgba(0,0,0,0.8) !important; overflow: hidden; }
          .cal-wrap .fc-popover-header { background: #0f0f0f !important; border-bottom: 1px solid #1a1a1a !important; }
          .cal-wrap .fc-popover-title { background: transparent !important; color: #d0d0d0 !important; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; padding: 10px 14px; }
          .cal-wrap .fc-popover-close { color: #555 !important; }
          .cal-wrap .fc-popover-body { background: #141414 !important; padding: 8px 8px 10px; }
          .cal-wrap .fc-button { background: #161616 !important; border: 1px solid #252525 !important; color: #888 !important; font-size: 12px !important; font-weight: 600 !important; padding: 7px 15px !important; border-radius: 6px !important; box-shadow: none !important; transition: all 0.12s !important; letter-spacing: 0.02em; }
          .cal-wrap .fc-button:hover { background: #202020 !important; border-color: #333 !important; color: #d0d0d0 !important; }
          .cal-wrap .fc-button-active, .cal-wrap .fc-button:focus { background: #dc2626 !important; border-color: #dc2626 !important; color: #fff !important; box-shadow: none !important; }
          .cal-wrap .fc-button-group .fc-button { border-radius: 0 !important; border-left-width: 0 !important; }
          .cal-wrap .fc-button-group .fc-button:first-child { border-radius: 6px 0 0 6px !important; border-left-width: 1px !important; }
          .cal-wrap .fc-button-group .fc-button:last-child { border-radius: 0 6px 6px 0 !important; }
          .cal-wrap .fc-toolbar { margin-bottom: 0 !important; }
          .cal-wrap .fc-header-toolbar { padding-bottom: 16px; border-bottom: 1px solid #141414; margin-bottom: 0 !important; }
          .cal-wrap .fc-timegrid-slot { height: 44px !important; background: #0d0d0d; border-color: #141414 !important; }
          .cal-wrap .fc-timegrid-slot-minor { border-top-color: #111 !important; border-top-style: dashed !important; }
          .cal-wrap .fc-timegrid-slot-label { background: #090909; border-right: 1px solid #1a1a1a !important; }
          .cal-wrap .fc-timegrid-slot-label-cushion { color: #383838; font-size: 11px; font-weight: 600; padding-right: 10px; }
          .cal-wrap .fc-timegrid-col { background: #0d0d0d; }
          .cal-wrap .fc-timegrid-col.fc-day-today { background: rgba(220,38,38,0.03) !important; }
          .cal-wrap .fc-timegrid-divider { background: #141414 !important; height: 3px !important; }
          .cal-wrap .fc-timegrid-now-indicator-line { border-color: #dc2626 !important; border-width: 2px !important; }
          .cal-wrap .fc-timegrid-now-indicator-arrow { border-top-color: #dc2626 !important; border-bottom-color: #dc2626 !important; }
          .cal-wrap .fc-daygrid-body { background: #0d0d0d; }
          .cal-wrap .fc, .cal-wrap .fc-view-harness { height: 100% !important; }
        `}</style>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 32px 14px', flexShrink: 0 }}>
          <div>
            <h1 style={{ color: '#f0f0f0', fontSize: '24px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>Calendar</h1>
            <p style={{ color: '#444', fontSize: '13px', margin: '3px 0 0', fontWeight: 500 }}>Schedule installations and manage team availability</p>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {Object.entries(EVENT_COLORS).map(([type, c]) => (
              <span key={type} style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '4px 9px', borderRadius: '99px',
                background: '#141414', border: '1px solid #222',
                fontSize: '11px', fontWeight: 600, color: '#555',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: c.bg, flexShrink: 0 }} />
                {TYPE_LABELS[type]}
              </span>
            ))}
          </div>
        </div>

        <div
          className="cal-wrap"
          style={{
            flex: 1, minHeight: 0,
            margin: '0 32px 20px',
            borderRadius: '16px', border: '1px solid #1a1a1a',
            background: '#0d0d0d', overflow: 'hidden',
            padding: '18px 20px 0', boxSizing: 'border-box',
          }}
        >
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
            buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
            events={events}
            height="100%"
            fixedWeekCount={false}
            dayMaxEvents={4}
            slotMinTime="05:00:00"
            slotMaxTime="19:00:00"
            slotLabelInterval="01:00:00"
            nowIndicator={true}
            dateClick={info => {
              if (!canCreate('INSTALL') && !canCreate('TIME_OFF') && !canCreate('OTHER') && !canCreate('BLOCKED')) return;
              if (info.allDay) {
                openCreate(info.dateStr, true);
              } else {
                const d    = info.date;
                const hS   = String(d.getHours()).padStart(2, '0');
                const mS   = String(d.getMinutes()).padStart(2, '0');
                const dEnd = new Date(d.getTime() + 60 * 60 * 1000);
                const hE   = String(dEnd.getHours()).padStart(2, '0');
                const mE   = String(dEnd.getMinutes()).padStart(2, '0');
                openCreate(info.dateStr, false, `${hS}:${mS}`, `${hE}:${mE}`);
              }
            }}
            eventClick={info => openView(info)}
            datesSet={info => fetchEvents(info.start, info.end)}
          />
        </div>

        {modal === 'create' && (
          <Overlay onClose={() => !saving && setModal(null)}>
            <CreateEditModal mode="create" {...sharedModalProps} onSave={handleSave} onCancel={() => setModal(null)} />
          </Overlay>
        )}
        {modal === 'view' && selectedEvent && (
          <Overlay onClose={() => !saving && setModal(null)}>
            <ViewModal event={selectedEvent} user={user} isAdmin={isAdmin} users={users} saving={saving} err={err}
              onEdit={openEdit} onDelete={() => { setErr(''); setModal('confirm-delete'); }} onResend={handleResend} onClose={() => setModal(null)} />
          </Overlay>
        )}
        {modal === 'edit' && (
          <Overlay onClose={() => !saving && setModal('view')}>
            <CreateEditModal mode="edit" {...sharedModalProps} setFormType={() => {}} onSave={handleSave} onCancel={() => setModal('view')} />
          </Overlay>
        )}
        {modal === 'confirm-delete' && selectedEvent && (
          <Overlay onClose={() => !saving && setModal('view')}>
            <ConfirmDeleteModal event={selectedEvent} saving={saving} err={err} onConfirm={handleDelete} onCancel={() => setModal('view')} />
          </Overlay>
        )}
      </div>
    </>
  );
}
