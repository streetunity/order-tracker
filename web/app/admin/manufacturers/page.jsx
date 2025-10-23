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

  async function toggleManufacturerStatus(manufacturer) {
    if (!confirm(`Are you sure you want to ${manufacturer.isActive ? 'deactivate' : 'reactivate'} ${manufacturer.name}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/manufacturers/${manufacturer.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: !manufacturer.isActive })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update manufacturer status');
      
      await loadManufacturers();
    } catch (e) {
      setError(e.message || 'Failed to update manufacturer status');
    }
  }

  async function deactivateManufacturer(manufacturer) {
    if (!confirm(`Are you sure you want to deactivate ${manufacturer.name}?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/manufacturers/${manufacturer.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: false })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to deactivate manufacturer');
      
      await loadManufacturers();
    } catch (e) {
      setError(e.message || 'Failed to deactivate manufacturer');
    }
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
      </div>
    </>
  );
}