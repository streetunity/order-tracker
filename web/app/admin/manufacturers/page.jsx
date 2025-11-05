"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { ManufacturerTable } from "./ManufacturerTable";
import { ManufacturerModal } from "./ManufacturerModal";
import "./manufacturers.css";

export default function ManufacturersPage() {
  const [manufacturers, setManufacturers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingManufacturer, setEditingManufacturer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    contactInfo: '',
    notes: '',
    createUserAccount: false,
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const router = useRouter();

  // Toggle status confirmation modal state
  const [showToggleConfirm, setShowToggleConfirm] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (!token || !storedUser) {
      router.push('/login');
      return;
    }
    
    loadManufacturers();
  }, []);

  async function loadManufacturers() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/manufacturers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to load manufacturers');
      }
      
      const data = await res.json();
      setManufacturers(data);
    } catch (e) {
      console.error('Failed to load manufacturers:', e);
      setError('Failed to load manufacturers');
    } finally {
      setLoading(false);
    }
  }

  const filteredManufacturers = useMemo(() => {
    return showInactive ? manufacturers : manufacturers.filter(mfg => mfg.isActive);
  }, [manufacturers, showInactive]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    
    try {
      const token = localStorage.getItem('token');
      const url = editingManufacturer ? `/api/manufacturers/${editingManufacturer.id}` : '/api/manufacturers';
      const method = editingManufacturer ? 'PATCH' : 'POST';
      
      const body = { ...formData };
      
      // Clean up fields that shouldn't be sent
      if (editingManufacturer) {
        // When editing, don't send user account fields
        delete body.createUserAccount;
        delete body.email;
        delete body.password;
      } else if (!body.createUserAccount) {
        // When creating without user account, don't send email/password
        delete body.email;
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
      if (!res.ok) throw new Error(data.error || 'Failed to save manufacturer');
      
      await loadManufacturers();
      closeModal();
    } catch (e) {
      setError(e.message);
    }
  }

  function toggleManufacturerStatus(manufacturer) {
    setPendingToggle(manufacturer);
    setShowToggleConfirm(true);
  }

  async function executeToggle() {
    if (!pendingToggle) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/manufacturers/${pendingToggle.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: !pendingToggle.isActive })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update manufacturer status');

      await loadManufacturers();
      setShowToggleConfirm(false);
      setPendingToggle(null);
    } catch (e) {
      setError(e.message || 'Failed to update manufacturer status');
    }
  }

  function cancelToggle() {
    setShowToggleConfirm(false);
    setPendingToggle(null);
  }

  function deactivateManufacturer(manufacturer) {
    setPendingToggle(manufacturer);
    setShowToggleConfirm(true);
  }

  function openAddModal() {
    setFormData({
      name: '',
      contactInfo: '',
      notes: '',
      createUserAccount: false,
      email: '',
      password: ''
    });
    setEditingManufacturer(null);
    setError('');
    setShowAddModal(true);
  }

  function openEditModal(manufacturer) {
    setFormData({
      name: manufacturer.name,
      contactInfo: manufacturer.contactInfo || '',
      notes: manufacturer.notes || '',
      createUserAccount: false,
      email: '',
      password: ''
    });
    setEditingManufacturer(manufacturer);
    setError('');
    setShowAddModal(true);
  }

  function closeModal() {
    setShowAddModal(false);
    setEditingManufacturer(null);
    setFormData({
      name: '',
      contactInfo: '',
      notes: '',
      createUserAccount: false,
      email: '',
      password: ''
    });
    setError('');
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#a0a0a0' }}>
        Loading manufacturers...
      </div>
    );
  }

  const inactiveCount = manufacturers.filter(m => !m.isActive).length;

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: 16 }}>
        <h1 className="h1" style={{ margin: 0, marginBottom: 12 }}>Manufacturer Management</h1>
        
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={openAddModal} className="btn primary">Add New Manufacturer</button>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '14px', color: '#e4e4e4', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            Show inactive manufacturers
            {inactiveCount > 0 && <span style={{ color: '#a0a0a0', fontSize: '12px' }}>({inactiveCount} hidden)</span>}
          </label>
        </div>

        {error && (
          <div style={{ padding: "10px", marginBottom: "20px", backgroundColor: "#7f1d1d", border: "1px solid #991b1b", borderRadius: "6px", color: "#fecaca" }}>
            {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: '#fecaca', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
          </div>
        )}

        <ManufacturerTable 
          manufacturers={filteredManufacturers}
          onEdit={openEditModal}
          onDeactivate={deactivateManufacturer}
          showInactive={showInactive}
        />

        <ManufacturerModal
          show={showAddModal}
          editingManufacturer={editingManufacturer}
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmit}
          onClose={closeModal}
          error={error}
        />

        {/* Toggle Status Confirmation Modal */}
        {showToggleConfirm && pendingToggle && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1100
            }}
            onClick={cancelToggle}
          >
            <div
              style={{
                backgroundColor: "#1f1f1f",
                border: "1px solid #404040",
                borderRadius: "8px",
                padding: "2rem",
                maxWidth: "500px",
                width: "90%",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
                {pendingToggle.isActive ? 'Deactivate' : 'Reactivate'} Manufacturer
              </h3>
              <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
                Are you sure you want to {pendingToggle.isActive ? 'deactivate' : 'reactivate'} <strong>{pendingToggle.name}</strong>?
              </p>
              <div style={{
                padding: "1rem",
                backgroundColor: pendingToggle.isActive ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)",
                border: `1px solid ${pendingToggle.isActive ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
                borderRadius: "6px",
                marginBottom: "1rem"
              }}>
                <p style={{ margin: "0", fontSize: "14px", color: pendingToggle.isActive ? "#ef4444" : "#10b981" }}>
                  <strong>Note:</strong> {pendingToggle.isActive
                    ? 'This manufacturer will be deactivated and hidden from the list.'
                    : 'This manufacturer will be reactivated and visible again.'}
                </p>
              </div>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
                <button
                  onClick={cancelToggle}
                  style={{
                    background: "#2d2d2d",
                    color: "#fff",
                    border: "1px solid #404040",
                    padding: "0.5rem 1.5rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={executeToggle}
                  style={{
                    backgroundColor: pendingToggle.isActive ? "#dc2626" : "#10b981",
                    color: "white",
                    border: "none",
                    padding: "0.5rem 1.5rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  {pendingToggle.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}