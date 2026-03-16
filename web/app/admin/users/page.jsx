"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import { UserTable } from "./UserTable";
import { UserModal } from "./UserModal";
import {
  getRoleDisplayName,
  getAssignableRoles as getLocalAssignableRoles,
  canEditRole,
  canDeactivateUser
} from "../../../lib/roleUtils";
import "./users.css";

const TABS = [
  { id: 'system',       label: 'System Users',         addLabel: 'Add New User',             defaultRole: 'AGENT' },
  { id: 'manufacturer', label: 'Manufacturer Accounts', addLabel: 'Add Manufacturer Account',  defaultRole: 'MANUFACTURER' },
  { id: 'broker',       label: 'Broker Accounts',       addLabel: 'Add Broker Account',        defaultRole: 'BROKER' },
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
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'AGENT',
    showInSalesRepDropdown: true
  });
  const [error, setError] = useState('');
  const router = useRouter();

  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState(null);

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
    } catch (e) {
      console.error('Failed to parse user:', e);
      router.push('/login');
    }
  }, []);

  async function loadUsers() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) { if (res.status === 401) { router.push('/login'); return; } throw new Error('Failed to load users'); }
      setUsers(await res.json());
    } catch (e) {
      console.error('Failed to load users:', e);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  async function loadAssignableRoles() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/users/roles/assignable', { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setAssignableRoles(await res.json());
    } catch (e) { console.error('Failed to load assignable roles from API:', e); }
  }

  const { regularUsers, manufacturerUsers, brokerUsers } = useMemo(() => {
    const filtered = showInactive ? users : users.filter(u => u.isActive);
    return {
      regularUsers:     filtered.filter(u => u.role !== 'MANUFACTURER' && u.role !== 'BROKER'),
      manufacturerUsers: filtered.filter(u => u.role === 'MANUFACTURER'),
      brokerUsers:       filtered.filter(u => u.role === 'BROKER'),
    };
  }, [users, showInactive]);

  const canEdit     = (t) => !currentUser ? false : currentUser.id === t.id || canEditRole(currentUser.role, t.role);
  const canDeactivate = (t) => !currentUser ? false : currentUser.id !== t.id && canDeactivateUser(currentUser.role, t.role);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const token = localStorage.getItem('token');
      const url    = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PATCH' : 'POST';
      const body   = { ...formData };
      if (editingUser && !body.password) delete body.password;
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save user');
      await loadUsers();
      closeModal();
    } catch (e) { setError(e.message); }
  }

  async function toggleSalesRep(user) {
    try {
      setTogglingUserId(user.id);
      const token = localStorage.getItem('token');
      const res  = await fetch(`/api/users/${user.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ showInSalesRepDropdown: !user.showInSalesRepDropdown }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update sales rep status');
      await loadUsers();
    } catch (e) { setError(e.message || 'Failed to update sales rep status'); }
    finally { setTogglingUserId(null); }
  }

  function deactivateUser(user) {
    if (!canDeactivate(user)) { setError(`You cannot deactivate users with role ${getRoleDisplayName(user.role)}`); return; }
    setPendingDeactivate(user);
    setShowDeactivateConfirm(true);
  }

  async function executeDeactivate() {
    if (!pendingDeactivate) return;
    try {
      const token = localStorage.getItem('token');
      const res  = await fetch(`/api/users/${pendingDeactivate.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ isActive: false }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to deactivate user');
      await loadUsers();
      setShowDeactivateConfirm(false);
      setPendingDeactivate(null);
    } catch (e) { setError(e.message || 'Failed to deactivate user'); }
  }

  function cancelDeactivate() { setShowDeactivateConfirm(false); setPendingDeactivate(null); }

  function openAddModal() {
    const tab = TABS.find(t => t.id === activeTab);
    setFormData({ name: '', email: '', password: '', role: tab?.defaultRole || 'AGENT', showInSalesRepDropdown: tab?.id === 'system' });
    setEditingUser(null);
    setError('');
    setShowAddModal(true);
  }

  function openEditModal(user) {
    if (!canEdit(user)) { setError(`You cannot edit users with role ${getRoleDisplayName(user.role)}`); return; }
    setFormData({ name: user.name, email: user.email, password: '', role: user.role, showInSalesRepDropdown: user.showInSalesRepDropdown ?? true });
    setEditingUser(user);
    setError('');
    setShowAddModal(true);
  }

  function closeModal() {
    setShowAddModal(false);
    setEditingUser(null);
    setFormData({ name: '', email: '', password: '', role: 'AGENT', showInSalesRepDropdown: true });
    setError('');
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#a0a0a0' }}>Loading users...</div>;
  }

  const inactiveCount = users.filter(u => !u.isActive).length;
  const currentTab    = TABS.find(t => t.id === activeTab);
  const activeUsers   = activeTab === 'system' ? regularUsers : activeTab === 'manufacturer' ? manufacturerUsers : brokerUsers;
  const hideSalesRep  = activeTab !== 'system';

  // tab style helpers
  const tabStyle = (id) => ({
    padding: '10px 20px',
    background: 'none',
    border: 'none',
    borderBottom: activeTab === id ? '2px solid #dc2626' : '2px solid transparent',
    color: activeTab === id ? '#dc2626' : 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: activeTab === id ? 600 : 400,
    marginBottom: -1,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '80px 16px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 className="h1" style={{ margin: 0 }}>User Management</h1>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '14px', color: '#e4e4e4', cursor: 'pointer' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            Show inactive users
            {inactiveCount > 0 && <span style={{ color: '#a0a0a0', fontSize: '12px' }}>({inactiveCount} hidden)</span>}
          </label>
        </div>

        {error && (
          <div style={{ padding: '10px', marginBottom: 16, backgroundColor: '#7f1d1d', border: '1px solid #991b1b', borderRadius: 6, color: '#fecaca' }}>
            {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: '#fecaca', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 20 }}>
          {TABS.map(tab => (
            <button key={tab.id} style={tabStyle(tab.id)} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
              <span style={{ marginLeft: 6, fontSize: 12, opacity: 0.6 }}>
                ({tab.id === 'system' ? regularUsers.length : tab.id === 'manufacturer' ? manufacturerUsers.length : brokerUsers.length})
              </span>
            </button>
          ))}
          {/* Add button pushed right */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingBottom: 2 }}>
            <button onClick={openAddModal} className="btn primary" style={{ fontSize: 13, padding: '7px 16px' }}>
              {currentTab?.addLabel || 'Add New User'}
            </button>
          </div>
        </div>

        {/* Tab description */}
        {activeTab === 'manufacturer' && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
            Login accounts for manufacturers. To manage manufacturer entities and item assignments, visit the{' '}
            <a href="/admin/manufacturers" style={{ color: '#dc2626', textDecoration: 'none' }}>Manufacturers page</a>.
          </p>
        )}
        {activeTab === 'broker' && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
            Read-only broker portal accounts. Brokers can view assigned shipments and documents.
          </p>
        )}

        <UserTable
          users={activeUsers}
          currentUser={currentUser}
          onEdit={openEditModal}
          onDeactivate={deactivateUser}
          onToggleSalesRep={toggleSalesRep}
          togglingUserId={togglingUserId}
          showInactive={showInactive}
          hideSalesRep={hideSalesRep}
        />

        <UserModal
          show={showAddModal}
          editingUser={editingUser}
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmit}
          onClose={closeModal}
          error={error}
          assignableRoles={assignableRoles}
          currentUser={currentUser}
        />

        {/* Deactivate Confirmation Modal */}
        {showDeactivateConfirm && pendingDeactivate && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={cancelDeactivate}>
            <div style={{ backgroundColor: '#1f1f1f', border: '1px solid #404040', borderRadius: 8, padding: '2rem', maxWidth: 500, width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: 20, fontWeight: 600, color: '#fff', marginTop: 0, marginBottom: '1rem' }}>Deactivate User</h3>
              <p style={{ fontSize: 14, marginBottom: '1rem', color: '#d1d5db' }}>Are you sure you want to deactivate <strong>{pendingDeactivate.name}</strong>?</p>
              <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, marginBottom: '1rem' }}>
                <p style={{ margin: 0, fontSize: 14, color: '#ef4444' }}><strong>Note:</strong> This user will no longer be able to log in until reactivated.</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button onClick={cancelDeactivate} style={{ background: '#2d2d2d', color: '#fff', border: '1px solid #404040', padding: '0.5rem 1.5rem', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
                <button onClick={executeDeactivate} style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', padding: '0.5rem 1.5rem', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>Deactivate User</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
