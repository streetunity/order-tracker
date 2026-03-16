"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import { UserTable } from "./UserTable";
import { UserModal } from "./UserModal";
import { ManufacturerTable } from "../manufacturers/ManufacturerTable";
import { ManufacturerModal } from "../manufacturers/ManufacturerModal";
import {
  getRoleDisplayName,
  getAssignableRoles as getLocalAssignableRoles,
  canEditRole,
  canDeactivateUser
} from "../../../lib/roleUtils";
import "./users.css";

const TABS = [
  { id: 'system',       label: 'System Users',         addLabel: 'Add New User',         defaultRole: 'AGENT' },
  { id: 'manufacturer', label: 'Manufacturer Accounts', addLabel: 'Add New Manufacturer', defaultRole: 'MANUFACTURER' },
  { id: 'broker',       label: 'Broker Accounts',       addLabel: 'Add Broker Account',   defaultRole: 'BROKER' },
];

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [activeTab, setActiveTab] = useState('system');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [assignableRoles, setAssignableRoles] = useState([]);
  const [togglingUserId, setTogglingUserId] = useState(null);
  const [userFormData, setUserFormData] = useState({ name: '', email: '', password: '', role: 'AGENT', showInSalesRepDropdown: true });
  const [userError, setUserError] = useState('');
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState(null);
  const [manufacturers, setManufacturers] = useState([]);
  const [mfgLoading, setMfgLoading] = useState(false);
  const [mfgLoaded, setMfgLoaded] = useState(false);
  const [showMfgModal, setShowMfgModal] = useState(false);
  const [editingMfg, setEditingMfg] = useState(null);
  const [mfgFormData, setMfgFormData] = useState({ name: '', contactInfo: '', notes: '', createUserAccount: false, email: '', password: '' });
  const [mfgError, setMfgError] = useState('');
  const [showMfgToggleConfirm, setShowMfgToggleConfirm] = useState(false);
  const [pendingMfgToggle, setPendingMfgToggle] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (!token || !storedUser) { router.push('/login'); return; }
    try {
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
      const localRoles = getLocalAssignableRoles(user.role);
      setAssignableRoles(localRoles.map(r => ({ value: r, label: getRoleDisplayName(r) })));
      loadUsers();
      loadAssignableRoles();
    } catch (e) { console.error('Failed to parse user:', e); router.push('/login'); }
  }, []);

  useEffect(() => {
    if (activeTab === 'manufacturer' && !mfgLoaded) loadManufacturers();
  }, [activeTab]);

  async function loadUsers() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) { if (res.status === 401) { router.push('/login'); return; } throw new Error('Failed to load users'); }
      setUsers(await res.json());
    } catch (e) { setUserError('Failed to load users'); }
    finally { setLoading(false); }
  }

  async function loadAssignableRoles() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/users/roles/assignable', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setAssignableRoles(await res.json());
    } catch (e) { console.error('Failed to load assignable roles:', e); }
  }

  async function loadManufacturers() {
    setMfgLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/manufacturers', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load manufacturers');
      setManufacturers(await res.json()); setMfgLoaded(true);
    } catch (e) { setMfgError('Failed to load manufacturers'); }
    finally { setMfgLoading(false); }
  }

  const { regularUsers, brokerUsers } = useMemo(() => {
    const filtered = showInactive ? users : users.filter(u => u.isActive);
    return {
      regularUsers: filtered.filter(u => u.role !== 'MANUFACTURER' && u.role !== 'BROKER'),
      brokerUsers:  filtered.filter(u => u.role === 'BROKER'),
    };
  }, [users, showInactive]);

  const filteredManufacturers = useMemo(() => {
    return showInactive ? manufacturers : manufacturers.filter(m => m.isActive);
  }, [manufacturers, showInactive]);

  const canEdit       = (t) => !currentUser ? false : currentUser.id === t.id || canEditRole(currentUser.role, t.role);
  const canDeactivate = (t) => !currentUser ? false : currentUser.id !== t.id && canDeactivateUser(currentUser.role, t.role);

  async function handleUserSubmit(e) {
    e.preventDefault(); setUserError('');
    try {
      const token = localStorage.getItem('token');
      const url    = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PATCH' : 'POST';
      const body   = { ...userFormData };
      if (editingUser && !body.password) delete body.password;
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save user');
      await loadUsers(); closeUserModal();
    } catch (e) { setUserError(e.message); }
  }

  async function toggleSalesRep(user) {
    try {
      setTogglingUserId(user.id);
      const token = localStorage.getItem('token');
      const res  = await fetch(`/api/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ showInSalesRepDropdown: !user.showInSalesRepDropdown }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      await loadUsers();
    } catch (e) { setUserError(e.message); }
    finally { setTogglingUserId(null); }
  }

  function deactivateUser(user) {
    if (!canDeactivate(user)) { setUserError(`You cannot deactivate users with role ${getRoleDisplayName(user.role)}`); return; }
    setPendingDeactivate(user); setShowDeactivateConfirm(true);
  }

  async function executeDeactivate() {
    if (!pendingDeactivate) return;
    try {
      const token = localStorage.getItem('token');
      const res  = await fetch(`/api/users/${pendingDeactivate.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ isActive: false }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to deactivate user');
      await loadUsers(); setShowDeactivateConfirm(false); setPendingDeactivate(null);
    } catch (e) { setUserError(e.message); }
  }

  function openUserAddModal() {
    const tab = TABS.find(t => t.id === activeTab);
    setUserFormData({ name: '', email: '', password: '', role: tab?.defaultRole || 'AGENT', showInSalesRepDropdown: false });
    setEditingUser(null); setUserError(''); setShowAddModal(true);
  }

  function openUserEditModal(user) {
    if (!canEdit(user)) { setUserError(`You cannot edit users with role ${getRoleDisplayName(user.role)}`); return; }
    setUserFormData({ name: user.name, email: user.email, password: '', role: user.role, showInSalesRepDropdown: user.showInSalesRepDropdown ?? false });
    setEditingUser(user); setUserError(''); setShowAddModal(true);
  }

  function closeUserModal() {
    setShowAddModal(false); setEditingUser(null);
    setUserFormData({ name: '', email: '', password: '', role: 'AGENT', showInSalesRepDropdown: true }); setUserError('');
  }

  async function handleMfgSubmit(e) {
    e.preventDefault(); setMfgError('');
    try {
      const token = localStorage.getItem('token');
      const url    = editingMfg ? `/api/manufacturers/${editingMfg.id}` : '/api/manufacturers';
      const method = editingMfg ? 'PATCH' : 'POST';
      const body   = { ...mfgFormData };
      if (editingMfg) { delete body.createUserAccount; delete body.email; delete body.password; }
      else if (!body.createUserAccount) { delete body.email; delete body.password; }
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save manufacturer');
      await loadManufacturers(); closeMfgModal();
    } catch (e) { setMfgError(e.message); }
  }

  function deactivateMfg(mfg) { setPendingMfgToggle(mfg); setShowMfgToggleConfirm(true); }

  async function executeMfgToggle() {
    if (!pendingMfgToggle) return;
    try {
      const token = localStorage.getItem('token');
      const res  = await fetch(`/api/manufacturers/${pendingMfgToggle.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ isActive: !pendingMfgToggle.isActive }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      await loadManufacturers(); setShowMfgToggleConfirm(false); setPendingMfgToggle(null);
    } catch (e) { setMfgError(e.message); }
  }

  function openMfgAddModal() {
    setMfgFormData({ name: '', contactInfo: '', notes: '', createUserAccount: false, email: '', password: '' });
    setEditingMfg(null); setMfgError(''); setShowMfgModal(true);
  }

  function openMfgEditModal(mfg) {
    setMfgFormData({ name: mfg.name, contactInfo: mfg.contactInfo || '', notes: mfg.notes || '', createUserAccount: false, email: '', password: '' });
    setEditingMfg(mfg); setMfgError(''); setShowMfgModal(true);
  }

  function closeMfgModal() {
    setShowMfgModal(false); setEditingMfg(null);
    setMfgFormData({ name: '', contactInfo: '', notes: '', createUserAccount: false, email: '', password: '' }); setMfgError('');
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#a0a0a0' }}>Loading...</div>;

  const inactiveUserCount = users.filter(u => !u.isActive).length;
  const inactiveMfgCount  = manufacturers.filter(m => !m.isActive).length;
  const currentTab = TABS.find(t => t.id === activeTab);
  const isMfgTab   = activeTab === 'manufacturer';
  const isBrokerTab = activeTab === 'broker';
  const error = isMfgTab ? mfgError : userError;
  const setError = isMfgTab ? setMfgError : setUserError;

  const tabStyle = (id) => ({
    padding: '8px 16px', background: 'none', border: 'none',
    borderBottom: activeTab === id ? '2px solid #dc2626' : '2px solid transparent',
    color: activeTab === id ? '#dc2626' : 'rgba(255,255,255,0.5)',
    cursor: 'pointer', fontSize: 13, fontWeight: activeTab === id ? 600 : 400,
    marginBottom: -1, transition: 'all 0.15s', whiteSpace: 'nowrap',
  });

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 16px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>User Management</h1>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ width: 15, height: 15, cursor: 'pointer' }} />
            Show inactive
            {(inactiveUserCount > 0 || inactiveMfgCount > 0) && (
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>({isMfgTab ? inactiveMfgCount : inactiveUserCount} hidden)</span>
            )}
          </label>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', marginBottom: 16, backgroundColor: '#7f1d1d', border: '1px solid #991b1b', borderRadius: 6, color: '#fecaca', fontSize: 13 }}>
            {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: '#fecaca', cursor: 'pointer', fontWeight: 'bold' }}>&#215;</button>
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 20 }}>
          {TABS.map(tab => (
            <button key={tab.id} style={tabStyle(tab.id)} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.6 }}>
                ({tab.id === 'system' ? regularUsers.length : tab.id === 'manufacturer' ? filteredManufacturers.length : brokerUsers.length})
              </span>
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingBottom: 2 }}>
            <button
              onClick={isMfgTab ? openMfgAddModal : openUserAddModal}
              style={{ padding: '7px 16px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.28)', borderRadius: 7, color: '#dc2626', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              {currentTab?.addLabel || 'Add'}
            </button>
          </div>
        </div>

        {isMfgTab && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>Manufacturer entities with their assigned order items. Click Edit to update contact info or notes.</p>}
        {isBrokerTab && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>Read-only broker portal accounts. Brokers can view assigned shipments and documents.</p>}

        {isMfgTab && (mfgLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Loading manufacturers...</div>
        ) : (
          <ManufacturerTable manufacturers={filteredManufacturers} onEdit={openMfgEditModal} onDeactivate={deactivateMfg} showInactive={showInactive} />
        ))}

        {activeTab === 'system' && (
          <UserTable users={regularUsers} currentUser={currentUser} onEdit={openUserEditModal} onDeactivate={deactivateUser} onToggleSalesRep={toggleSalesRep} togglingUserId={togglingUserId} showInactive={showInactive} hideSalesRep={false} />
        )}

        {isBrokerTab && (
          <UserTable users={brokerUsers} currentUser={currentUser} onEdit={openUserEditModal} onDeactivate={deactivateUser} onToggleSalesRep={toggleSalesRep} togglingUserId={togglingUserId} showInactive={showInactive} hideSalesRep={true} />
        )}

        <UserModal show={showAddModal} editingUser={editingUser} formData={userFormData} setFormData={setUserFormData} onSubmit={handleUserSubmit} onClose={closeUserModal} error={userError} assignableRoles={assignableRoles} currentUser={currentUser} hideSalesRep={isBrokerTab} />
        <ManufacturerModal show={showMfgModal} editingManufacturer={editingMfg} formData={mfgFormData} setFormData={setMfgFormData} onSubmit={handleMfgSubmit} onClose={closeMfgModal} error={mfgError} />

        {showDeactivateConfirm && pendingDeactivate && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => { setShowDeactivateConfirm(false); setPendingDeactivate(null); }}>
            <div style={{ backgroundColor: '#1f1f1f', border: '1px solid #404040', borderRadius: 8, padding: '2rem', maxWidth: 500, width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: 20, fontWeight: 600, color: '#fff', marginTop: 0, marginBottom: '1rem' }}>Deactivate User</h3>
              <p style={{ fontSize: 14, marginBottom: '1rem', color: '#d1d5db' }}>Are you sure you want to deactivate <strong>{pendingDeactivate.name}</strong>?</p>
              <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, marginBottom: '1rem' }}>
                <p style={{ margin: 0, fontSize: 14, color: '#ef4444' }}><strong>Note:</strong> This user will no longer be able to log in until reactivated.</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button onClick={() => { setShowDeactivateConfirm(false); setPendingDeactivate(null); }} style={{ background: '#2d2d2d', color: '#fff', border: '1px solid #404040', padding: '0.5rem 1.5rem', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
                <button onClick={executeDeactivate} style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', padding: '0.5rem 1.5rem', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>Deactivate</button>
              </div>
            </div>
          </div>
        )}

        {showMfgToggleConfirm && pendingMfgToggle && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => { setShowMfgToggleConfirm(false); setPendingMfgToggle(null); }}>
            <div style={{ backgroundColor: '#1f1f1f', border: '1px solid #404040', borderRadius: 8, padding: '2rem', maxWidth: 500, width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: 20, fontWeight: 600, color: '#fff', marginTop: 0, marginBottom: '1rem' }}>{pendingMfgToggle.isActive ? 'Deactivate' : 'Reactivate'} Manufacturer</h3>
              <p style={{ fontSize: 14, marginBottom: '1rem', color: '#d1d5db' }}>Are you sure you want to {pendingMfgToggle.isActive ? 'deactivate' : 'reactivate'} <strong>{pendingMfgToggle.name}</strong>?</p>
              <div style={{ padding: '1rem', backgroundColor: pendingMfgToggle.isActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: `1px solid ${pendingMfgToggle.isActive ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`, borderRadius: 6, marginBottom: '1rem' }}>
                <p style={{ margin: 0, fontSize: 14, color: pendingMfgToggle.isActive ? '#ef4444' : '#10b981' }}><strong>Note:</strong> {pendingMfgToggle.isActive ? 'This manufacturer will be deactivated and hidden from the list.' : 'This manufacturer will be reactivated and visible again.'}</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button onClick={() => { setShowMfgToggleConfirm(false); setPendingMfgToggle(null); }} style={{ background: '#2d2d2d', color: '#fff', border: '1px solid #404040', padding: '0.5rem 1.5rem', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
                <button onClick={executeMfgToggle} style={{ backgroundColor: pendingMfgToggle.isActive ? '#dc2626' : '#10b981', color: 'white', border: 'none', padding: '0.5rem 1.5rem', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>{pendingMfgToggle.isActive ? 'Deactivate' : 'Reactivate'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
