'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

const EVENT_COLORS = {
  INSTALL:  { bg: '#dc2626', border: '#b91c1c', text: '#fff' },
  TIME_OFF: { bg: '#f59e0b', border: '#d97706', text: '#000' },
  BLOCKED:  { bg: '#525252', border: '#404040', text: '#e4e4e4' },
};

const CREATE_PERMISSIONS = {
  INSTALL:  ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'AGENT'],
  TIME_OFF: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'AGENT'],
  BLOCKED:  ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
};

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'];

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function toInputDate(dateOrStr) {
  if (!dateOrStr) return '';
  const d = new Date(dateOrStr);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
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
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        zIndex: 1000, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '16px',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px',
        width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto',
      }}>
        {children}
      </div>
    </div>
  );
}

function ModalHead({ title, badge, badgeColor, onClose }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '20px 24px', borderBottom: '1px solid #2d2d2d',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h2 style={{ color: '#e4e4e4', fontSize: '17px', fontWeight: 700, margin: 0 }}>{title}</h2>
        {badge && (
          <span style={{
            padding: '3px 9px', borderRadius: '99px', fontSize: '11px',
            fontWeight: 700, background: badgeColor || '#333', color: '#fff',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {badge}
          </span>
        )}
      </div>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '22px', lineHeight: 1, padding: '4px' }}
      >
        &times;
      </button>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{
        display: 'block', fontSize: '11px', fontWeight: 700, color: '#a0a0a0',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px',
      }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: '11px', color: '#6b7280', margin: '4px 0 0' }}>{hint}</p>}
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{
        fontSize: '11px', fontWeight: 700, color: '#dc2626',
        textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px',
      }}>
        {label}
      </div>
      <div style={{ fontSize: '15px', color: '#e4e4e4', lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      padding: '10px 14px', background: '#7f1d1d', border: '1px solid #991b1b',
      borderRadius: '6px', color: '#fecaca', fontSize: '13px', marginBottom: '16px',
    }}>
      {msg}
    </div>
  );
}

function TypeTabs({ value, onChange, canCreate }) {
  const types = [
    { key: 'INSTALL',  label: 'Install',  color: '#dc2626' },
    { key: 'TIME_OFF', label: 'Time Off', color: '#f59e0b' },
    { key: 'BLOCKED',  label: 'Blocked',  color: '#525252' },
  ].filter(t => canCreate(t.key));

  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
      {types.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            flex: 1, padding: '12px 8px', borderRadius: '8px',
            border: `2px solid ${value === t.key ? t.color : '#2d2d2d'}`,
            background: value === t.key ? t.color + '18' : '#111',
            color: value === t.key ? '#e4e4e4' : '#6b7280',
            cursor: 'pointer', fontSize: '13px',
            fontWeight: value === t.key ? 700 : 400,
            transition: 'all 0.15s', fontFamily: 'inherit',
          }}
        >
          <span style={{
            display: 'block', width: '10px', height: '10px',
            borderRadius: '50%', background: t.color, margin: '0 auto 6px',
          }} />
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Assignee multi-select ─────────────────────────────────────────────────────

function AssigneePicker({ users, selected, onChange }) {
  const [search, setSearch] = useState('');
  const filtered = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));

  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  }

  return (
    <div>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {selected.map(id => {
            const u = users.find(u => u.id === id);
            return (
              <span key={id} style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px', background: '#dc262620', border: '1px solid #dc2626',
                borderRadius: '99px', fontSize: '12px', color: '#e4e4e4',
              }}>
                {u?.name || id}
                <button onClick={() => toggle(id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}>&times;</button>
              </span>
            );
          })}
        </div>
      )}
      <input type="text" placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputSt, marginBottom: '8px' }} />
      <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #2d2d2d', borderRadius: '6px', background: '#0f0f0f' }}>
        {filtered.length === 0 && <div style={{ padding: '12px 14px', color: '#6b7280', fontSize: '13px' }}>No employees found</div>}
        {filtered.map((u, i) => (
          <label key={u.id} style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', cursor: 'pointer',
            borderBottom: i < filtered.length - 1 ? '1px solid #1f1f1f' : 'none',
            background: selected.includes(u.id) ? '#1a1a1a' : 'transparent',
          }}>
            <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} style={{ accentColor: '#dc2626', width: '15px', height: '15px', flexShrink: 0 }} />
            <span style={{ fontSize: '14px', color: '#e4e4e4' }}>{u.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Create / Edit Modal ───────────────────────────────────────────────────────

function CreateEditModal({
  mode, formType, setFormType,
  formStart, setFormStart, formEnd, setFormEnd,
  formTitle, setFormTitle, formNotes, setFormNotes,
  formUserId, setFormUserId,
  formAssigneeIds, setFormAssigneeIds,
  formSkipEmail, setFormSkipEmail,
  orderSearch, setOrderSearch,
  orderResults, orderLoading,
  selectedOrder, setSelectedOrder, setFormOrderId,
  users, user, isAdmin,
  canCreate, saving, err,
  onSave, onCancel,
}) {
  const typeLabel = { INSTALL: 'Install', TIME_OFF: 'Time Off', BLOCKED: 'Blocked' }[formType];

  return (
    <>
      <ModalHead title={mode === 'create' ? 'New Event' : `Edit ${typeLabel}`} onClose={onCancel} />
      <div style={{ padding: '24px' }}>

        {mode === 'create' && <TypeTabs value={formType} onChange={setFormType} canCreate={canCreate} />}

        {/* INSTALL: order search */}
        {formType === 'INSTALL' && (
          <Field label="Order">
            {selectedOrder ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#0f0f0f', border: '1px solid #dc2626', borderRadius: '6px' }}>
                <span style={{ color: '#e4e4e4', fontSize: '14px', flex: 1 }}>{selectedOrder.label}</span>
                <button onClick={() => { setSelectedOrder(null); setFormOrderId(''); setOrderSearch(''); }} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '18px' }}>&times;</button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input type="text" placeholder="Search by customer name or PO number..." value={orderSearch} onChange={e => setOrderSearch(e.target.value)} style={inputSt} />
                {(orderResults.length > 0 || orderLoading) && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#252525', border: '1px solid #333', borderTop: 'none', borderRadius: '0 0 6px 6px', zIndex: 20, maxHeight: '220px', overflowY: 'auto' }}>
                    {orderLoading && <div style={{ padding: '10px 14px', color: '#6b7280', fontSize: '13px' }}>Searching...</div>}
                    {orderResults.map(o => (
                      <button key={o.id} onClick={() => { setSelectedOrder(o); setFormOrderId(o.id); setOrderSearch(''); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', color: '#e4e4e4', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #2d2d2d', fontFamily: 'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#333'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >{o.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Field>
        )}

        {/* INSTALL: assigned employees */}
        {formType === 'INSTALL' && (
          <Field label="Assigned Employees" hint="Select one or more team members for this install.">
            <AssigneePicker users={users} selected={formAssigneeIds} onChange={setFormAssigneeIds} />
          </Field>
        )}

        {/* TIME_OFF: user picker */}
        {formType === 'TIME_OFF' && (
          <Field label="Team Member">
            {isAdmin ? (
              <select value={formUserId} onChange={e => setFormUserId(e.target.value)} style={inputSt}>
                <option value="">Select team member...</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : (
              <input type="text" value={user?.name || ''} disabled style={{ ...inputSt, color: '#6b7280' }} />
            )}
          </Field>
        )}

        {/* BLOCKED: title */}
        {formType === 'BLOCKED' && (
          <Field label="Title">
            <input type="text" placeholder="e.g. Company Holiday, Shop Closed..." value={formTitle} onChange={e => setFormTitle(e.target.value)} style={inputSt} />
          </Field>
        )}

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="Start Date">
            <input type="date" value={formStart} onChange={e => { setFormStart(e.target.value); if (!formEnd || formEnd < e.target.value) setFormEnd(e.target.value); }} style={inputSt} />
          </Field>
          <Field label="End Date">
            <input type="date" value={formEnd} min={formStart} onChange={e => setFormEnd(e.target.value)} style={inputSt} />
          </Field>
        </div>

        {/* Notes — INSTALL only */}
        {formType === 'INSTALL' && (
          <Field label="Notes (Optional)" hint="The customer will see this note in their install confirmation email.">
            <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="e.g. Please ensure the installation area is clear and accessible." rows={3} style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }} />
          </Field>
        )}

        {/* Skip email — INSTALL create only */}
        {formType === 'INSTALL' && mode === 'create' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '20px', padding: '12px 14px', background: '#0f0f0f', border: '1px solid #2d2d2d', borderRadius: '8px' }}>
            <input
              type="checkbox"
              checked={formSkipEmail}
              onChange={e => setFormSkipEmail(e.target.checked)}
              style={{ accentColor: '#dc2626', width: '16px', height: '16px', flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: '14px', color: '#e4e4e4', fontWeight: 500 }}>Do not notify customer</div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>No confirmation email will be sent when this install is created.</div>
            </div>
          </label>
        )}

        <ErrBox msg={err} />

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button onClick={onCancel} style={{ ...btnBase, background: '#252525', color: '#a0a0a0', border: '1px solid #333' }}>Cancel</button>
          <button onClick={onSave} disabled={saving} style={{ ...btnBase, background: '#dc2626', color: '#fff', opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving...' : mode === 'create' ? 'Create Event' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── View Modal ────────────────────────────────────────────────────────────────

function ViewModal({ event, user, isAdmin, users, saving, err, onEdit, onDelete, onResend, onClose }) {
  const color    = EVENT_COLORS[event.type] || { bg: '#888' };
  const canEdit  = isAdmin || event.createdById === user?.id;
  const isSameDay = toInputDate(event.startDate) === toInputDate(event.endDate);
  const badgeLabel = { INSTALL: 'Install', TIME_OFF: 'Time Off', BLOCKED: 'Blocked' }[event.type];

  const assignees = (event.assignees || []).map(a => ({
    id: a.id,
    name: a.name || users.find(u => u.id === a.id)?.name || a.id,
  }));

  return (
    <>
      <ModalHead title={event.title} badge={badgeLabel} badgeColor={color.bg} onClose={onClose} />
      <div style={{ padding: '24px' }}>

        <InfoRow label="Date">
          {isSameDay ? formatDisplayDate(event.startDate) : `${formatDisplayDate(event.startDate)} \u2192 ${formatDisplayDate(event.endDate)}`}
        </InfoRow>

        {event.type === 'INSTALL' && event.order && (
          <InfoRow label="Order">
            {event.order.account?.name}{event.order.poNumber ? ` \u2014 PO: ${event.order.poNumber}` : ''}
          </InfoRow>
        )}

        {event.type === 'INSTALL' && assignees.length > 0 && (
          <InfoRow label="Assigned Employees">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
              {assignees.map(a => (
                <span key={a.id} style={{ padding: '4px 12px', background: '#1f1f1f', border: '1px solid #404040', borderRadius: '99px', fontSize: '13px', color: '#e4e4e4' }}>{a.name}</span>
              ))}
            </div>
          </InfoRow>
        )}

        {event.type === 'TIME_OFF' && event.user && (
          <InfoRow label="Team Member">{event.user.name}</InfoRow>
        )}

        {event.notes && <InfoRow label="Notes">{event.notes}</InfoRow>}

        {event.type === 'INSTALL' && (
          <InfoRow label="Customer Email">
            <span style={{ color: event.customerNotified ? '#10b981' : '#f59e0b', fontSize: '13px' }}>
              {event.customerNotified ? '\u2713 Notification sent' : '\u26A0 Not notified'}
            </span>
          </InfoRow>
        )}

        <InfoRow label="Created By">{event.createdBy?.name || '\u2014'}</InfoRow>

        <ErrBox msg={err} />

        <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
          {canEdit && (
            <>
              <button onClick={onEdit} style={{ ...btnBase, background: '#252525', color: '#e4e4e4', border: '1px solid #404040', fontWeight: 400 }}>Edit</button>
              <button onClick={onDelete} style={{ ...btnBase, background: '#450a0a', color: '#fca5a5', border: '1px solid #7f1d1d', fontWeight: 400 }}>Delete</button>
            </>
          )}
          {event.type === 'INSTALL' && canEdit && (
            <button onClick={onResend} disabled={saving}
              style={{ ...btnBase, background: '#0f172a', color: '#93c5fd', border: '1px solid #1e3a5f', fontWeight: 400, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Sending...' : event.customerNotified ? 'Resend Email' : 'Send Email'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Confirm Delete ────────────────────────────────────────────────────────────

function ConfirmDeleteModal({ event, saving, err, onConfirm, onCancel }) {
  return (
    <>
      <ModalHead title="Delete Event" onClose={onCancel} />
      <div style={{ padding: '24px' }}>
        <p style={{ color: '#e4e4e4', fontSize: '15px', lineHeight: 1.6, margin: '0 0 16px' }}>Are you sure you want to delete <strong>{event.title}</strong>?</p>
        {event.type === 'INSTALL' && (
          <div style={{ padding: '12px 16px', background: '#451a03', border: '1px solid #92400e', borderRadius: '6px', color: '#fcd34d', fontSize: '13px', marginBottom: '20px' }}>
            This will remove the install date from the customer's tracking page.
          </div>
        )}
        <ErrBox msg={err} />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ ...btnBase, background: '#252525', color: '#a0a0a0', border: '1px solid #333', fontWeight: 400 }}>Cancel</button>
          <button onClick={onConfirm} disabled={saving} style={{ ...btnBase, background: '#dc2626', color: '#fff', opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { user, loading: authLoading } = useAuth();
  const calendarRef = useRef(null);

  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [users,   setUsers]   = useState([]);

  const [modal,         setModal]         = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [formType,        setFormType]        = useState('INSTALL');
  const [formStart,       setFormStart]       = useState('');
  const [formEnd,         setFormEnd]         = useState('');
  const [formTitle,       setFormTitle]       = useState('');
  const [formNotes,       setFormNotes]       = useState('');
  const [formUserId,      setFormUserId]      = useState('');
  const [formOrderId,     setFormOrderId]     = useState('');
  const [formAssigneeIds, setFormAssigneeIds] = useState([]);
  const [formSkipEmail,   setFormSkipEmail]   = useState(false);
  const [selectedOrder,   setSelectedOrder]   = useState(null);
  const [orderSearch,     setOrderSearch]     = useState('');
  const [orderResults,    setOrderResults]    = useState([]);
  const [orderLoading,    setOrderLoading]    = useState(false);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const isAdmin   = user && ADMIN_ROLES.includes(user.role);
  const canCreate = type => user && CREATE_PERMISSIONS[type]?.includes(user.role);

  // Fetch all internal employees (excludes MANUFACTURER and BROKER)
  useEffect(() => {
    if (!user) return;
    fetch('/api/users/internal', { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => setUsers(Array.isArray(d) ? d : []))
      .catch(() => {});
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
      setEvents(data.map(e => ({
        id:              e.id,
        title:           e.title,
        start:           e.startDate,
        end:             e.endDate,
        allDay:          e.allDay,
        backgroundColor: EVENT_COLORS[e.type]?.bg    || '#888',
        borderColor:     EVENT_COLORS[e.type]?.border || '#666',
        textColor:       EVENT_COLORS[e.type]?.text   || '#fff',
        extendedProps:   e,
      })));
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

  function openCreate(dateStr) {
    const defaultType = canCreate('INSTALL') ? 'INSTALL' : canCreate('TIME_OFF') ? 'TIME_OFF' : 'BLOCKED';
    setFormType(defaultType);
    setFormStart(dateStr);
    setFormEnd(dateStr);
    setFormTitle('');
    setFormNotes('');
    setFormUserId(user?.id || '');
    setFormOrderId('');
    setFormAssigneeIds([]);
    setFormSkipEmail(false);
    setSelectedOrder(null);
    setOrderSearch('');
    setOrderResults([]);
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
    setFormType(e.type);
    setFormStart(toInputDate(e.startDate));
    setFormEnd(toInputDate(e.endDate));
    setFormTitle(e.title || '');
    setFormNotes(e.notes || '');
    setFormUserId(e.userId || '');
    setFormOrderId(e.orderId || '');
    setFormAssigneeIds(Array.isArray(e.assigneeIds) ? e.assigneeIds : []);
    setFormSkipEmail(false);
    setSelectedOrder(
      e.order
        ? { id: e.order.id, label: `${e.order.account?.name || ''} \u2014 ${e.order.poNumber || e.order.id.slice(-8).toUpperCase()}` }
        : null
    );
    setOrderSearch('');
    setOrderResults([]);
    setErr('');
    setModal('edit');
  }

  async function handleSave() {
    setErr('');
    if (!formStart)                              { setErr('Start date is required'); return; }
    if (formType === 'INSTALL'  && !formOrderId) { setErr('Please select an order'); return; }
    if (formType === 'BLOCKED'  && !formTitle)   { setErr('Title is required'); return; }

    let autoTitle = formTitle;
    if (formType === 'INSTALL') {
      autoTitle = `Install \u2014 ${selectedOrder?.label || formOrderId}`;
    } else if (formType === 'TIME_OFF') {
      const tUser = users.find(u => u.id === formUserId);
      autoTitle = `${tUser?.name || user?.name || 'Team Member'} \u2014 Time Off`;
    }

    setSaving(true);
    try {
      const body = {
        type:      formType,
        title:     autoTitle,
        startDate: formStart,
        endDate:   formEnd || formStart,
        allDay:    true,
        notes:     formNotes || null,
        ...(formType === 'INSTALL'  && { orderId: formOrderId, assigneeIds: formAssigneeIds, skipEmail: formSkipEmail }),
        ...(formType === 'TIME_OFF' && { userId: formUserId || user?.id }),
      };

      const isEdit = modal === 'edit';
      const url    = isEdit ? `/api/calendar/events/${selectedEvent.id}` : '/api/calendar/events';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Save failed');
      }

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
      setModal(null);
      fetchEvents(null, null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResend() {
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`/api/calendar/events/${selectedEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ resendEmail: true }),
      });
      if (!res.ok) throw new Error('Resend failed');
      setModal(null);
      fetchEvents(null, null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <div style={{ padding: '80px', textAlign: 'center', color: '#6b7280' }}>Loading...</div>;
  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', padding: '24px 28px 60px' }}>

      <style>{`
        .cal-wrap .fc { color: #e4e4e4; }
        .cal-wrap .fc-toolbar-title { color: #e4e4e4; font-size: 18px; font-weight: 700; }
        .cal-wrap .fc-col-header-cell-cushion { color: #a0a0a0; text-decoration: none; font-weight: 600; }
        .cal-wrap .fc-daygrid-day-number { color: #a0a0a0; text-decoration: none; }
        .cal-wrap .fc-day-today { background: rgba(220,38,38,0.08) !important; }
        .cal-wrap .fc-day-today .fc-daygrid-day-number { color: #dc2626 !important; font-weight: 700; }
        .cal-wrap .fc-scrollgrid, .cal-wrap td, .cal-wrap th { border-color: #2d2d2d !important; }
        .cal-wrap .fc-daygrid-day { background: #111; transition: background 0.1s; }
        .cal-wrap .fc-daygrid-day:hover { background: #1a1a1a; }
        .cal-wrap .fc-day-other .fc-daygrid-day-number { color: #3d3d3d; }
        .cal-wrap .fc-button { background: #252525 !important; border-color: #404040 !important; color: #e4e4e4 !important; font-size: 13px !important; padding: 6px 14px !important; box-shadow: none !important; }
        .cal-wrap .fc-button:hover { background: #333 !important; border-color: #555 !important; }
        .cal-wrap .fc-button-active, .cal-wrap .fc-button:focus { background: #dc2626 !important; border-color: #dc2626 !important; box-shadow: none !important; }
        .cal-wrap .fc-event { border-radius: 5px; padding: 2px 7px; font-size: 12px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
        .cal-wrap .fc-event:hover { opacity: 0.8; }
        .cal-wrap .fc-more-link { color: #dc2626; font-size: 12px; }
        .cal-wrap .fc-popover { background: #1a1a1a !important; border-color: #404040 !important; box-shadow: 0 8px 24px rgba(0,0,0,0.5) !important; }
        .cal-wrap .fc-popover-title { background: #252525 !important; color: #e4e4e4 !important; }
        .cal-wrap .fc-popover-body  { background: #1a1a1a !important; }
        .cal-wrap .fc-timegrid-slot { background: #111; border-color: #2d2d2d !important; }
        .cal-wrap .fc-timegrid-slot-label-cushion { color: #6b7280; font-size: 12px; }
        .cal-wrap .fc-toolbar { margin-bottom: 18px !important; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ color: '#e4e4e4', fontSize: '24px', fontWeight: 700, margin: 0 }}>Calendar</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: '4px 0 0' }}>Schedule installations and manage team availability</p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          {Object.entries(EVENT_COLORS).map(([type, c]) => (
            <span key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#a0a0a0' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: c.bg, flexShrink: 0 }} />
              {{ INSTALL: 'Install', TIME_OFF: 'Time Off', BLOCKED: 'Blocked' }[type]}
            </span>
          ))}
        </div>
      </div>

      <div className="cal-wrap" style={{ background: '#111', borderRadius: '12px', padding: '20px 20px 4px', border: '1px solid #2d2d2d' }}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
          events={events}
          height="auto"
          fixedWeekCount={false}
          dayMaxEvents={4}
          dateClick={info => { if (canCreate('INSTALL') || canCreate('TIME_OFF') || canCreate('BLOCKED')) openCreate(info.dateStr); }}
          eventClick={info => openView(info)}
          datesSet={info => fetchEvents(info.start, info.end)}
        />
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '13px', marginTop: '12px' }}>Loading events...</div>}

      {modal === 'create' && (
        <Overlay onClose={() => !saving && setModal(null)}>
          <CreateEditModal
            mode="create"
            formType={formType}               setFormType={setFormType}
            formStart={formStart}             setFormStart={setFormStart}
            formEnd={formEnd}                 setFormEnd={setFormEnd}
            formTitle={formTitle}             setFormTitle={setFormTitle}
            formNotes={formNotes}             setFormNotes={setFormNotes}
            formUserId={formUserId}           setFormUserId={setFormUserId}
            formAssigneeIds={formAssigneeIds} setFormAssigneeIds={setFormAssigneeIds}
            formSkipEmail={formSkipEmail}     setFormSkipEmail={setFormSkipEmail}
            orderSearch={orderSearch}         setOrderSearch={setOrderSearch}
            orderResults={orderResults}       orderLoading={orderLoading}
            selectedOrder={selectedOrder}     setSelectedOrder={setSelectedOrder}
            setFormOrderId={setFormOrderId}
            users={users} user={user} isAdmin={isAdmin}
            canCreate={canCreate} saving={saving} err={err}
            onSave={handleSave} onCancel={() => setModal(null)}
          />
        </Overlay>
      )}

      {modal === 'view' && selectedEvent && (
        <Overlay onClose={() => !saving && setModal(null)}>
          <ViewModal
            event={selectedEvent} user={user} isAdmin={isAdmin} users={users}
            saving={saving} err={err}
            onEdit={openEdit}
            onDelete={() => { setErr(''); setModal('confirm-delete'); }}
            onResend={handleResend}
            onClose={() => setModal(null)}
          />
        </Overlay>
      )}

      {modal === 'edit' && (
        <Overlay onClose={() => !saving && setModal('view')}>
          <CreateEditModal
            mode="edit"
            formType={formType}               setFormType={() => {}}
            formStart={formStart}             setFormStart={setFormStart}
            formEnd={formEnd}                 setFormEnd={setFormEnd}
            formTitle={formTitle}             setFormTitle={setFormTitle}
            formNotes={formNotes}             setFormNotes={setFormNotes}
            formUserId={formUserId}           setFormUserId={setFormUserId}
            formAssigneeIds={formAssigneeIds} setFormAssigneeIds={setFormAssigneeIds}
            formSkipEmail={formSkipEmail}     setFormSkipEmail={setFormSkipEmail}
            orderSearch={orderSearch}         setOrderSearch={setOrderSearch}
            orderResults={orderResults}       orderLoading={orderLoading}
            selectedOrder={selectedOrder}     setSelectedOrder={setSelectedOrder}
            setFormOrderId={setFormOrderId}
            users={users} user={user} isAdmin={isAdmin}
            canCreate={canCreate} saving={saving} err={err}
            onSave={handleSave} onCancel={() => setModal('view')}
          />
        </Overlay>
      )}

      {modal === 'confirm-delete' && selectedEvent && (
        <Overlay onClose={() => !saving && setModal('view')}>
          <ConfirmDeleteModal event={selectedEvent} saving={saving} err={err} onConfirm={handleDelete} onCancel={() => setModal('view')} />
        </Overlay>
      )}
    </div>
  );
}
