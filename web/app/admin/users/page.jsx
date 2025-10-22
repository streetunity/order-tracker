"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [assignableRoles, setAssignableRoles] = useState([]);
  const [togglingUserId, setTogglingUserId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'AGENT',
    canBeSalesRep: true
  });
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (!token || !storedUser) {
      router.push('/login');
      return;
    }
    
    try {
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
      
      const localRoles = getLocalAssignableRoles(user.role);
      const rolesWithLabels = localRoles.map(role => ({
        value: role,
        label: getRoleDisplayName(role)
      }));
      setAssignableRoles(rolesWithLabels);
      
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
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to load users');
      }
      
      const data = await res.json();
      setUsers(data);
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
      const res = await fetch('/api/users/roles/assignable', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const roles = await res.json();
        setAssignableRoles(roles);
      }
    } catch (e) {
      console.error('Failed to load assignable roles from API:', e);
    }
  }

  const filteredUsers = useMemo(() => {
    return showInactive ? users : users.filter(user => user.isActive);
  }, [users, showInactive]);

  const canEdit = (targetUser) => {
    if (!currentUser) return false;
    if (currentUser.id === targetUser.id) return true;
    return canEditRole(currentUser.role, targetUser.role);
  };

  const canDeactivate = (targetUser) => {
    if (!currentUser) return false;
    if (currentUser.id === targetUser.id) return false;
    return canDeactivateUser(currentUser.role, targetUser.role);
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    
    try {
      const token = localStorage.getItem('token');
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PATCH' : 'POST';
      
      const body = { ...formData };
      if (editingUser && !body.password) delete body.password;
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save user');
      
      await loadUsers();
      closeModal();
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggleUserStatus(user) {
    if (!canDeactivate(user) && user.isActive) {
      setError(`You cannot deactivate users with role ${getRoleDisplayName(user.role)}`);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: !user.isActive })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user status');
      
      await loadUsers();
    } catch (e) {
      setError(e.message || 'Failed to update user status');
    }
  }

  async function toggleSalesRep(user) {
    try {
      setTogglingUserId(user.id);
      const token = localStorage.getItem('token');
      const newValue = !user.canBeSalesRep;
      
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ canBeSalesRep: newValue })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update sales rep status');
      
      await loadUsers();
    } catch (e) {
      setError(e.message || 'Failed to update sales rep status');
    } finally {
      setTogglingUserId(null);
    }
  }

  async function deactivateUser(user) {
    if (!canDeactivate(user)) {
      setError(`You cannot deactivate users with role ${getRoleDisplayName(user.role)}`);
      return;
    }

    if (!confirm(`Are you sure you want to deactivate ${user.name}?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: false })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to deactivate user');
      
      await loadUsers();
    } catch (e) {
      setError(e.message || 'Failed to deactivate user');
    }
  }

  function openAddModal() {
    setFormData({
      name: '',
      email: '',
      password: '',
      role: assignableRoles.length > 0 ? assignableRoles[assignableRoles.length - 1].value : 'AGENT',
      canBeSalesRep: true
    });
    setEditingUser(null);
    setError('');
    setShowAddModal(true);
  }

  function openEditModal(user) {
    if (!canEdit(user)) {
      setError(`You cannot edit users with role ${getRoleDisplayName(user.role)}`);
      return;
    }

    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      canBeSalesRep: user.canBeSalesRep ?? true
    });
    setEditingUser(user);
    setError('');
    setShowAddModal(true);
  }

  function closeModal() {
    setShowAddModal(false);
    setEditingUser(null);
    setFormData({ name: '', email: '', password: '', role: 'AGENT', canBeSalesRep: true });
    setError('');
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#a0a0a0' }}>
        Loading users...
      </div>
    );
  }

  const inactiveCount = users.filter(u => !u.isActive).length;

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: 16 }}>
        <h1 className="h1" style={{ margin: 0, marginBottom: 12 }}>User Management</h1>
        
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={openAddModal} className="btn primary">Add New User</button>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '14px', color: '#e4e4e4', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            Show inactive users
            {inactiveCount > 0 && <span style={{ color: '#a0a0a0', fontSize: '12px' }}>({inactiveCount} hidden)</span>}
          </label>
        </div>

        {error && (
          <div style={{ padding: "10px", marginBottom: "20px", backgroundColor: "#7f1d1d", border: "1px solid #991b1b", borderRadius: "6px", color: "#fecaca" }}>
            {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: '#fecaca', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        <UserTable 
          users={filteredUsers}
          currentUser={currentUser}
          onEdit={openEditModal}
          onDeactivate={deactivateUser}
          onToggleSalesRep={toggleSalesRep}
          togglingUserId={togglingUserId}
          showInactive={showInactive}
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
      </div>
    </>
  );
}