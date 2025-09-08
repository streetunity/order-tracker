"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'AGENT'
  });
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    loadUsers();
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
      
      if (!res.ok) {
        throw new Error('Failed to update user status');
      }
      
      await loadUsers();
    } catch (e) {
      console.error('Failed to toggle user status:', e);
      setError('Failed to update user status');
    }
  }

  async function deleteUser(userId) {
    if (!confirm('Are you sure you want to deactivate this user?')) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete user');
      }
      
      await loadUsers();
    } catch (e) {
      console.error('Failed to delete user:', e);
      alert(e.message);
    }
  }

  function openAddModal() {
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'AGENT'
    });
    setEditingUser(null);
    setError('');
    setShowAddModal(true);
  }

  function openEditModal(user) {
    setFormData({
      name: user.name,
      email: user.email,
      password: '', // Don't populate password when editing
      role: user.role
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
      role: 'AGENT'
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

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: 16 }}>
      {/* Header matching customers page */}
      <h1 className="h1" style={{ margin: 0, marginBottom: 12 }}>User Management</h1>
      
      {/* Navigation buttons matching customers page */}
      <div style={{ marginBottom: 12 }}>
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
        </div>
      )}

      {/* Table with dark theme styling */}
      <div style={{
        backgroundColor: "#2d2d2d",
        borderRadius: "8px",
        border: "1px solid #404040",
        overflow: "hidden"
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ backgroundColor: "#383838" }}>
            <tr>
              <th style={{
                padding: "12px 16px",
                textAlign: "left",
                fontSize: "12px",
                fontWeight: "500",
                color: "#a0a0a0",
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
                color: "#a0a0a0",
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
                color: "#a0a0a0",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid #404040"
              }}>
                Role
              </th>
              <th style={{
                padding: "12px 16px",
                textAlign: "left",
                fontSize: "12px",
                fontWeight: "500",
                color: "#a0a0a0",
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
                color: "#a0a0a0",
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
                color: "#a0a0a0",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid #404040"
              }}>
                Created
              </th>
              <th style={{
                padding: "12px 16px",
                textAlign: "right",
                fontSize: "12px",
                fontWeight: "500",
                color: "#a0a0a0",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                borderBottom: "1px solid #404040"
              }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => (
              <tr key={user.id} style={{
                borderBottom: index < users.length - 1 ? "1px solid #404040" : "none"
              }}>
                <td style={{
                  padding: "16px",
                  color: "#e4e4e4",
                  fontSize: "14px",
                  fontWeight: "500"
                }}>
                  {user.name}
                </td>
                <td style={{
                  padding: "16px",
                  color: "#a0a0a0",
                  fontSize: "14px"
                }}>
                  {user.email}
                </td>
                <td style={{
                  padding: "16px",
                  fontSize: "14px"
                }}>
                  <span style={{
                    padding: "4px 8px",
                    borderRadius: "9999px",
                    fontSize: "12px",
                    fontWeight: "600",
                    backgroundColor: user.role === 'ADMIN' ? "#581c87" : "#404040",
                    color: user.role === 'ADMIN' ? "#e9d5ff" : "#e4e4e4"
                  }}>
                    {user.role}
                  </span>
                </td>
                <td style={{
                  padding: "16px",
                  fontSize: "14px"
                }}>
                  <button
                    onClick={() => toggleUserStatus(user)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "9999px",
                      fontSize: "12px",
                      fontWeight: "600",
                      backgroundColor: user.isActive ? "#14532d" : "#7f1d1d",
                      color: user.isActive ? "#86efac" : "#fecaca",
                      border: "none",
                      cursor: "pointer"
                    }}
                  >
                    {user.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td style={{
                  padding: "16px",
                  color: "#a0a0a0",
                  fontSize: "14px"
                }}>
                  {formatDate(user.lastLogin)}
                </td>
                <td style={{
                  padding: "16px",
                  color: "#a0a0a0",
                  fontSize: "14px"
                }}>
                  {formatDate(user.createdAt)}
                </td>
                <td style={{
                  padding: "16px",
                  textAlign: "right",
                  fontSize: "14px"
                }}>
                  <button
                    onClick={() => openEditModal(user)}
                    style={{
                      color: "#60a5fa",
                      marginRight: "12px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textDecoration: "underline"
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteUser(user.id)}
                    style={{
                      color: "#f87171",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textDecoration: "underline"
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit User Modal with dark theme */}
      {showAddModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px"
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
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #404040",
                    borderRadius: "4px",
                    backgroundColor: "#383838",
                    color: "#e4e4e4",
                    fontSize: "14px"
                  }}
                >
                  <option value="AGENT">Agent</option>
                  <option value="ADMIN">Admin</option>
                </select>
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