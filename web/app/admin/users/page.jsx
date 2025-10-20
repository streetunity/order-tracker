"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  getRoleDisplayName, 
  getRoleBadgeColor,
  getAssignableRoles as getLocalAssignableRoles,
  canEditRole,
  canDeactivateUser 
} from "../../../lib/roleUtils";

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
      
      // Set fallback roles immediately from local utility
      const localRoles = getLocalAssignableRoles(user.role);
      const rolesWithLabels = localRoles.map(role => ({
        value: role,
        label: getRoleDisplayName(role)
      }));
      setAssignableRoles(rolesWithLabels);
      
      loadUsers();
      loadAssignableRoles(); // Try to get from API as well
    } catch (e) {
      console.error('Failed to parse user:', e);
      router.push('/login');
    }
  }, []);

  async function loadUsers() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
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
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const roles = await res.json();
        setAssignableRoles(roles);
      } else {
        // Fallback already set in useEffect
        console.log('Using local role utility for assignable roles');
      }
    } catch (e) {
      console.error('Failed to load assignable roles from API:', e);
      // Fallback already set in useEffect
    }
  }

  // Filter users based on showInactive toggle
  const filteredUsers = useMemo(() => {
    if (showInactive) {
      return users; // Show all users including inactive
    }
    return users.filter(user => user.isActive); // Only show active users
  }, [users, showInactive]);

  // Check if current user can perform actions on target user
  const canEdit = (targetUser) => {
    if (!currentUser) return false;
    // Users can always edit themselves (name, email, password)
    if (currentUser.id === targetUser.id) return true;
    // Otherwise check role hierarchy
    return canEditRole(currentUser.role, targetUser.role);
  };

  const canDeactivate = (targetUser) => {
    if (!currentUser) return false;
    // Cannot deactivate yourself
    if (currentUser.id === targetUser.id) return false;
    // Check role hierarchy
    return canDeactivateUser(currentUser.role, targetUser.role);
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    
    try {
      const token = localStorage.getItem('token');
      const url = editingUser 
        ? `/api/users/${editingUser.id}` 
        : '/api/users';
      
      const method = editingUser ? 'PATCH' : 'POST';
      
      // Don't send password if editing and it's empty
      const body = { ...formData };
      if (editingUser && !body.password) {
        delete body.password;
      }
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save user');
      }
      
      await loadUsers();
      closeModal();
    } catch (e) {
      setError(e.message);
    }
  }

  async function toggleUserStatus(user) {
    // Check permission before allowing toggle
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
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user status');
      }
      
      await loadUsers();
    } catch (e) {
      console.error('Failed to toggle user status:', e);
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
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update sales rep status');
      }
      
      await loadUsers();
    } catch (e) {
      console.error('Failed to toggle sales rep:', e);
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
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to deactivate user');
      }
      
      await loadUsers();
    } catch (e) {
      console.error('Failed to deactivate user:', e);
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
    // Check if user can be edited
    if (!canEdit(user)) {
      setError(`You cannot edit users with role ${getRoleDisplayName(user.role)}`);
      return;
    }

    setFormData({
      name: user.name,
      email: user.email,
      password: '', // Don't populate password when editing
      role: user.role,
      canBeSalesRep: user.canBeSalesRep === null || user.canBeSalesRep === undefined ? true : Boolean(user.canBeSalesRep)
    });
    setEditingUser(user);
    setError('');
    setShowAddModal(true);
  }

  function closeModal() {
    setShowAddModal(false);
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'AGENT',
      canBeSalesRep: true
    });
    setError('');
  }

  const formatDate = (date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        color: '#a0a0a0'
      }}>
        <div>Loading users...</div>
      </div>
    );
  }

  // Count inactive users
  const inactiveCount = users.filter(u => !u.isActive).length;

  // Get assignable role names for display
  const assignableRoleNames = assignableRoles
    .map(r => r.label)
    .join(', ');

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: 16 }}>
      {/* Header matching customers page */}
      <h1 className="h1" style={{ margin: 0, marginBottom: 12 }}>User Management</h1>
      
      {/* Navigation buttons and toggle */}
      <div style={{ 
        marginBottom: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <button
            onClick={openAddModal}
            className="btn primary"
          >
            Add New User
          </button>
          <Link href="/admin/board" className="btn" style={{ marginLeft: 8 }}>
            Back to Board
          </Link>
        </div>
        
        {/* Show Inactive Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6,
            fontSize: '14px',
            color: '#e4e4e4',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                cursor: 'pointer'
              }}
            />
            Show inactive users
            {inactiveCount > 0 && (
              <span style={{ 
                color: '#a0a0a0',
                fontSize: '12px'
              }}>
                ({inactiveCount} hidden)
              </span>
            )}
          </label>
        </div>
      </div>

      {error && (
        <div style={{
          padding: "10px",
          marginBottom: "20px",
          backgroundColor: "#7f1d1d",
          border: "1px solid #991b1b",
          borderRadius: "6px",
          color: "#fecaca"
        }}>
          {error}
          <button
            onClick={() => setError('')}
            style={{
              float: 'right',
              background: 'none',
              border: 'none',
              color: '#fecaca',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Table with dark theme styling */}
      <div style={{
        backgroundColor: "#2d2d2d",
        borderRadius: "8px",
        border: "1px solid #404040",
        overflow: "hidden"
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "16%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead style={{ backgroundColor: "#383838" }}>
            <tr>
              <th style={{
                padding: "12px 16px",
                textAlign: "left",
                fontSize: "12px",
                fontWeight: "500",
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid #404040"
              }}>
                Name
              </th>
              <th style={{
                padding: "12px 16px",
                textAlign: "left",
                fontSize: "12px",
                fontWeight: "500",
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid #404040"
              }}>
                Email
              </th>
              <th style={{
                padding: "12px 16px",
                textAlign: "left",
                fontSize: "12px",
                fontWeight: "500",
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid #404040"
              }}>
                Role
              </th>
              <th style={{
                padding: "12px 16px",
                textAlign: "center",
                fontSize: "12px",
                fontWeight: "500",
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid #404040"
              }}>
                Sales Rep
              </th>
              <th style={{
                padding: "12px 16px",
                textAlign: "left",
                fontSize: "12px",
                fontWeight: "500",
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid #404040"
              }}>
                Status
              </th>
              <th style={{
                padding: "12px 16px",
                textAlign: "left",
                fontSize: "12px",
                fontWeight: "500",
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid #404040"
              }}>
                Last Login
              </th>
              <th style={{
                padding: "12px 16px",
                textAlign: "left",
                fontSize: "12px",
                fontWeight: "500",
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid #404040"
              }}>
                Created
              </th>
              <th style={{
                padding: "12px 8px",
                textAlign: "right",
                fontSize: "12px",
                fontWeight: "500",
                color: "#ffffff",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid #404040"
              }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="8" style={{
                  padding: "32px",
                  textAlign: "center",
                  color: "#a0a0a0",
                  fontSize: "14px"
                }}>
                  {showInactive ? 'No users found' : 'No active users found. Check "Show inactive users" to see all users.'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((user, index) => {
                const roleBadge = getRoleBadgeColor(user.role);
                const canEditThisUser = canEdit(user);
                const canDeactivateThisUser = canDeactivate(user);
                const isSelf = currentUser?.id === user.id;
                const isTogglingThisUser = togglingUserId === user.id;
                const isSalesRep = Boolean(user.canBeSalesRep);

                return (
                  <tr key={user.id} style={{
                    borderBottom: index < filteredUsers.length - 1 ? "1px solid #404040" : "none",
                    opacity: !user.isActive ? 0.6 : 1
                  }}>
                    <td style={{
                      padding: "16px",
                      color: "#e4e4e4",
                      fontSize: "14px",
                      fontWeight: "500"
                    }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {user.name}
                        {isSelf && (
                          <span style={{
                            marginLeft: "8px",
                            fontSize: "11px",
                            color: "#60a5fa",
                            fontWeight: "normal"
                          }}>
                            (You)
                          </span>
                        )}
                        {!user.isActive && (
                          <span style={{
                            marginLeft: "8px",
                            fontSize: "11px",
                            color: "#f87171",
                            fontWeight: "normal"
                          }}>
                            (Inactive)
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{
                      padding: "16px",
                      color: "#a0a0a0",
                      fontSize: "14px"
                    }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {user.email}
                      </div>
                    </td>
                    <td style={{
                      padding: "16px",
                      fontSize: "14px"
                    }}>
                      <span style={{
                        padding: "4px 10px",
                        borderRadius: "9999px",
                        fontSize: "11px",
                        fontWeight: "600",
                        backgroundColor: roleBadge.bg,
                        color: roleBadge.text,
                        whiteSpace: "nowrap",
                        display: "inline-block"
                      }}>
                        {getRoleDisplayName(user.role)}
                      </span>
                    </td>
                    <td style={{
                      padding: "16px",
                      textAlign: "center",
                      fontSize: "14px"
                    }}>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <input
                          type="checkbox"
                          checked={isSalesRep}
                          onChange={() => toggleSalesRep(user)}
                          disabled={isTogglingThisUser}
                          style={{
                            width: "18px",
                            height: "18px",
                            cursor: isTogglingThisUser ? "wait" : "pointer",
                            opacity: isTogglingThisUser ? 0.5 : 1
                          }}
                          title={isSalesRep ? "Remove from sales rep dropdown" : "Add to sales rep dropdown"}
                        />
                        {isTogglingThisUser && (
                          <span style={{
                            position: 'absolute',
                            top: '-20px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            fontSize: '10px',
                            color: '#60a5fa',
                            whiteSpace: 'nowrap'
                          }}>
                            Saving...
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{
                      padding: "16px",
                      fontSize: "14px"
                    }}>
                      <button
                        onClick={() => toggleUserStatus(user)}
                        disabled={user.isActive && !canDeactivateThisUser}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "9999px",
                          fontSize: "12px",
                          fontWeight: "600",
                          backgroundColor: user.isActive ? "#14532d" : "#7f1d1d",
                          color: user.isActive ? "#86efac" : "#fecaca",
                          border: "none",
                          cursor: (user.isActive && !canDeactivateThisUser) ? "not-allowed" : "pointer",
                          opacity: (user.isActive && !canDeactivateThisUser) ? 0.5 : 1,
                          whiteSpace: "nowrap"
                        }}
                        title={
                          user.isActive 
                            ? (canDeactivateThisUser ? 'Click to deactivate' : 'Insufficient permissions')
                            : 'Click to reactivate'
                        }
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td style={{
                      padding: "16px",
                      color: "#a0a0a0",
                      fontSize: "13px"
                    }}>
                      <div style={{ whiteSpace: "nowrap" }}>
                        {formatDate(user.lastLogin)}
                      </div>
                    </td>
                    <td style={{
                      padding: "16px",
                      color: "#a0a0a0",
                      fontSize: "13px"
                    }}>
                      <div style={{ whiteSpace: "nowrap" }}>
                        {formatDate(user.createdAt)}
                      </div>
                    </td>
                    <td style={{
                      padding: "16px 8px",
                      textAlign: "right",
                      fontSize: "13px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", whiteSpace: "nowrap" }}>
                        <button
                          onClick={() => openEditModal(user)}
                          disabled={!canEditThisUser}
                          style={{
                            color: canEditThisUser ? "#60a5fa" : "#6b7280",
                            background: "none",
                            border: "none",
                            cursor: canEditThisUser ? "pointer" : "not-allowed",
                            textDecoration: canEditThisUser ? "underline" : "none",
                            opacity: canEditThisUser ? 1 : 0.5,
                            padding: 0
                          }}
                          title={canEditThisUser ? 'Edit user' : 'Insufficient permissions'}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deactivateUser(user)}
                          disabled={!canDeactivateThisUser || !user.isActive}
                          style={{
                            color: (canDeactivateThisUser && user.isActive) ? "#f87171" : "#6b7280",
                            background: "none",
                            border: "none",
                            cursor: (canDeactivateThisUser && user.isActive) ? "pointer" : "not-allowed",
                            textDecoration: (canDeactivateThisUser && user.isActive) ? "underline" : "none",
                            opacity: (canDeactivateThisUser && user.isActive) ? 1 : 0.5,
                            padding: 0
                          }}
                          title={
                            !user.isActive 
                              ? 'User already inactive' 
                              : (canDeactivateThisUser ? 'Deactivate user' : 'Insufficient permissions')
                          }
                        >
                          {user.isActive ? 'Deactivate' : 'Inactive'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit User Modal - keeping existing modal code */}
      {showAddModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: "#2d2d2d",
            borderRadius: "8px",
            padding: "24px",
            width: "100%",
            maxWidth: "448px",
            border: "1px solid #404040"
          }}>
            <h2 style={{
              fontSize: "20px",
              fontWeight: "bold",
              marginBottom: "16px",
              color: "#e4e4e4"
            }}>
              {editingUser ? 'Edit User' : 'Add New User'}
            </h2>
            
            {error && (
              <div style={{
                marginBottom: "16px",
                padding: "8px",
                backgroundColor: "#7f1d1d",
                color: "#fecaca",
                borderRadius: "4px",
                fontSize: "14px",
                border: "1px solid #991b1b"
              }}>
                {error}
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#e4e4e4",
                  marginBottom: "4px"
                }}>
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #404040",
                    borderRadius: "4px",
                    backgroundColor: "#383838",
                    color: "#e4e4e4",
                    fontSize: "14px"
                  }}
                />
              </div>
              
              <div style={{ marginBottom: "16px" }}>
                <label style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#e4e4e4",
                  marginBottom: "4px"
                }}>
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #404040",
                    borderRadius: "4px",
                    backgroundColor: "#383838",
                    color: "#e4e4e4",
                    fontSize: "14px"
                  }}
                />
              </div>
              
              <div style={{ marginBottom: "16px" }}>
                <label style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#e4e4e4",
                  marginBottom: "4px"
                }}>
                  Password {editingUser && <span style={{ color: "#a0a0a0" }}>(leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #404040",
                    borderRadius: "4px",
                    backgroundColor: "#383838",
                    color: "#e4e4e4",
                    fontSize: "14px"
                  }}
                  placeholder={editingUser ? 'Leave blank to keep current password' : ''}
                />
              </div>
              
              <div style={{ marginBottom: "16px" }}>
                <label style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#e4e4e4",
                  marginBottom: "4px"
                }}>
                  Role
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  disabled={editingUser && currentUser?.id === editingUser.id}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #404040",
                    borderRadius: "4px",
                    backgroundColor: "#383838",
                    color: "#e4e4e4",
                    fontSize: "14px",
                    cursor: (editingUser && currentUser?.id === editingUser.id) ? "not-allowed" : "pointer",
                    opacity: (editingUser && currentUser?.id === editingUser.id) ? 0.6 : 1
                  }}
                >
                  {assignableRoles.length > 0 ? (
                    assignableRoles.map(role => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))
                  ) : (
                    // Fallback if assignableRoles is empty
                    <>
                      <option value="AGENT">Agent</option>
                      <option value="ADMIN">Admin</option>
                      <option value="ACCOUNTANT">Accountant</option>
                      <option value="SUPER_ADMIN">Super Admin</option>
                    </>
                  )}
                </select>
                {editingUser && currentUser?.id === editingUser.id && (
                  <div style={{ 
                    marginTop: "4px", 
                    fontSize: "12px", 
                    color: "#a0a0a0" 
                  }}>
                    You cannot change your own role
                  </div>
                )}
                {assignableRoles.length > 0 && !(editingUser && currentUser?.id === editingUser.id) && (
                  <div style={{ 
                    marginTop: "4px", 
                    fontSize: "12px", 
                    color: "#a0a0a0" 
                  }}>
                    You can assign: {assignableRoleNames}
                  </div>
                )}
              </div>
              
              <div style={{ marginBottom: "16px" }}>
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "#e4e4e4",
                  cursor: "pointer"
                }}>
                  <input
                    type="checkbox"
                    checked={formData.canBeSalesRep}
                    onChange={(e) => setFormData({ ...formData, canBeSalesRep: e.target.checked })}
                    style={{
                      width: "16px",
                      height: "16px",
                      cursor: "pointer"
                    }}
                  />
                  Show in Sales Rep dropdown
                </label>
                <div style={{ 
                  marginTop: "4px", 
                  marginLeft: "24px",
                  fontSize: "12px", 
                  color: "#a0a0a0" 
                }}>
                  When checked, this user will appear as an option in the "Sales Person" field when adding/editing orders
                </div>
              </div>
              
              <div style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px"
              }}>
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                >
                  {editingUser ? 'Update' : 'Create'} User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
