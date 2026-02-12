"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";
import "../../modal.css";

const STATUS_COLORS = {
  ACTIVE: { bg: "rgba(34, 197, 94, 0.1)", border: "rgba(34, 197, 94, 0.3)", text: "#22c55e" },
  INACTIVE: { bg: "rgba(107, 114, 128, 0.1)", border: "rgba(107, 114, 128, 0.3)", text: "#6b7280" },
};

const PAYMENT_TERMS_OPTIONS = [
  { value: 'DUE_ON_RECEIPT', label: 'Due on Receipt' },
  { value: 'NET15', label: 'Net 15' },
  { value: 'NET30', label: 'Net 30' },
  { value: 'NET60', label: 'Net 60' },
  { value: 'CUSTOM', label: 'Custom' }
];

const CONTACT_ROLES = [
  { value: 'PRIMARY', label: 'Primary Contact' },
  { value: 'BILLING', label: 'Billing Contact' },
  { value: 'SHIPPING', label: 'Shipping Contact' },
  { value: 'TECHNICAL', label: 'Technical Contact' },
  { value: 'OTHER', label: 'Other' }
];

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [customer, setCustomer] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [salesReps, setSalesReps] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [showPortalUrl, setShowPortalUrl] = useState(false);

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", message: "", onConfirm: null });
  const [pendingDeleteContactId, setPendingDeleteContactId] = useState(null);

  const [formData, setFormData] = useState({});
  const [originalFormData, setOriginalFormData] = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [contactForm, setContactForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "OTHER",
    isPrimary: false,
    notes: ""
  });

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }
    if (params.id) {
      loadCustomer();
      loadContacts();
      loadActivities();
      loadSalesReps();
    }
  }, [user, authLoading, router, params.id]);

  // Detect unsaved changes
  useEffect(() => {
    if (!isEditing || !originalFormData || Object.keys(originalFormData).length === 0) {
      setHasUnsavedChanges(false);
      return;
    }
    const changed = Object.keys(formData).some(key => formData[key] !== originalFormData[key]);
    setHasUnsavedChanges(changed);
  }, [formData, originalFormData, isEditing]);

  // Browser beforeunload warning
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges && isEditing) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, isEditing]);

  // Intercept all link clicks when there are unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges || !isEditing) return;

    const handleClick = (e) => {
      // Find if click was on or inside a link
      const link = e.target.closest('a[href]');
      if (link) {
        const href = link.getAttribute('href');
        // Only intercept internal navigation links
        if (href && href.startsWith('/')) {
          e.preventDefault();
          e.stopPropagation();
          setPendingNavigation(href);
          setShowUnsavedModal(true);
        }
      }
    };

    // Use capture phase to intercept before Next.js handles it
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [hasUnsavedChanges, isEditing]);

  async function loadSalesReps() {
    try {
      const res = await fetch("/api/sales-reps", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSalesReps(data);
      }
    } catch (e) {
      console.error("Error loading sales reps:", e);
    }
  }

  async function loadCustomer() {
    try {
      const res = await fetch(`/api/customers/${params.id}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 404) {
          setError("Customer not found");
          setLoading(false);
          return;
        }
        throw new Error("Failed to load customer");
      }

      const data = await res.json();
      setCustomer(data);
      const initialFormData = {
        companyName: data.companyName || "",
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        email: data.email || "",
        phone: data.phone || "",
        billingAddress: data.billingAddress || "",
        billingCity: data.billingCity || "",
        billingState: data.billingState || "",
        billingZipCode: data.billingZipCode || "",
        billingCountry: data.billingCountry || "USA",
        shippingAddress: data.shippingAddress || "",
        shippingCity: data.shippingCity || "",
        shippingState: data.shippingState || "",
        shippingZipCode: data.shippingZipCode || "",
        shippingCountry: data.shippingCountry || "USA",
        sameAsBilling: data.sameAsBilling ?? true,
        paymentTerms: data.paymentTerms || "NET30",
        taxExempt: data.taxExempt || false,
        taxExemptId: data.taxExemptId || "",
        tags: Array.isArray(data.tags) ? data.tags.join(", ") : (data.tags || ""),
        notes: data.notes || "",
        status: data.status || "ACTIVE",
        assignedToId: data.assignedToId || ""
      };
      setFormData(initialFormData);
      setOriginalFormData(initialFormData);
      setHasUnsavedChanges(false);
    } catch (e) {
      console.error("Error loading customer:", e);
      setError("Failed to load customer");
    } finally {
      setLoading(false);
    }
  }

  async function loadContacts() {
    try {
      const res = await fetch(`/api/customers/${params.id}/contacts`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
    } catch (e) {
      console.error("Error loading contacts:", e);
    }
  }

  async function loadActivities() {
    setActivitiesLoading(true);
    try {
      const res = await fetch(`/api/customers/${params.id}/activity?limit=20`, {
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
      }
    } catch (e) {
      console.error("Error loading activities:", e);
    } finally {
      setActivitiesLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const submitData = {
        ...formData,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        assignedToId: formData.assignedToId || null
      };

      const res = await fetch(`/api/customers/${params.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(submitData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update customer");
      }

      setCustomer(data);
      setIsEditing(false);
      setSuccess("Customer updated successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function showConfirm(title, message, onConfirm) {
    setConfirmConfig({ title, message, onConfirm });
    setShowConfirmModal(true);
  }

  function handleNavigationAttempt(destination) {
    if (hasUnsavedChanges && isEditing) {
      setPendingNavigation(destination);
      setShowUnsavedModal(true);
    } else {
      router.push(destination);
    }
  }

  function confirmDiscardChanges() {
    setShowUnsavedModal(false);
    setHasUnsavedChanges(false);
    setIsEditing(false);
    if (pendingNavigation) {
      router.push(pendingNavigation);
    } else {
      // Just canceling edit mode, reload original data
      loadCustomer();
    }
    setPendingNavigation(null);
  }

  function cancelDiscardChanges() {
    setShowUnsavedModal(false);
    setPendingNavigation(null);
  }

  async function handleStatusToggle() {
    const newStatus = customer.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch(`/api/customers/${params.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update status");
      }

      setCustomer(data);
      setFormData(prev => ({ ...prev, status: newStatus }));
      setOriginalFormData(prev => ({ ...prev, status: newStatus }));
      setSuccess(`Customer ${newStatus === 'ACTIVE' ? 'activated' : 'deactivated'}`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  function confirmDeleteCustomer() {
    showConfirm("Delete Customer", "Are you sure you want to delete this customer? This action cannot be undone.", () => handleDelete());
  }

  function confirmRegenerateToken() {
    showConfirm("Regenerate Portal Token", "Regenerating the portal token will invalidate any existing portal links. Continue?", () => handleRegenerateToken());
  }

  async function handleDelete() {
    setShowConfirmModal(false);
    try {
      const res = await fetch(`/api/customers/${params.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete customer");
      }

      router.push("/invoicing/customers");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRegenerateToken() {
    setShowConfirmModal(false);
    try {
      const res = await fetch(`/api/customers/${params.id}/regenerate-portal-token`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to regenerate token");
      }

      setCustomer(prev => ({ ...prev, portalToken: data.portalToken }));
      setSuccess("Portal token regenerated");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  function openContactModal(contact = null) {
    if (contact) {
      setEditingContact(contact);
      setContactForm({
        firstName: contact.firstName || "",
        lastName: contact.lastName || "",
        email: contact.email || "",
        phone: contact.phone || "",
        role: contact.role || "OTHER",
        isPrimary: contact.isPrimary || false,
        notes: contact.notes || ""
      });
    } else {
      setEditingContact(null);
      setContactForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        role: "OTHER",
        isPrimary: contacts.length === 0,
        notes: ""
      });
    }
    setShowContactModal(true);
  }

  async function handleSaveContact(e) {
    e.preventDefault();
    setSaving(true);

    try {
      const url = editingContact
        ? `/api/customers/${params.id}/contacts/${editingContact.id}`
        : `/api/customers/${params.id}/contacts`;
      const method = editingContact ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(contactForm),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save contact");
      }

      await loadContacts();
      setShowContactModal(false);
      setSuccess(editingContact ? "Contact updated" : "Contact added");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteContact(contactId) {
    setPendingDeleteContactId(contactId);
    showConfirm("Delete Contact", "Are you sure you want to delete this contact?", () => handleDeleteContact(contactId));
  }

  async function handleDeleteContact(contactId) {
    setShowConfirmModal(false);
    const idToDelete = contactId || pendingDeleteContactId;
    setPendingDeleteContactId(null);
    if (!idToDelete) return;

    try {
      const res = await fetch(`/api/customers/${params.id}/contacts/${idToDelete}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete contact");
      }

      await loadContacts();
      setSuccess("Contact deleted");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "14px"
  };

  const labelStyle = {
    display: "block",
    marginBottom: "6px",
    fontSize: "13px",
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.7)"
  };

  const sectionStyle = {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "12px",
    padding: 24,
    marginBottom: 24
  };

  const infoRowStyle = {
    display: "flex",
    justifyContent: "space-between",
    padding: "12px 0",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)"
  };

  function getActivityColor(type) {
    const colors = {
      created: "#22c55e",
      updated: "#3b82f6",
      sent: "#8b5cf6",
      viewed: "#6366f1",
      signed: "#22c55e",
      paid: "#22c55e",
      comment: "#f59e0b",
      status_change: "#f97316",
      assigned: "#06b6d4",
      reminder_created: "#f59e0b",
      converted: "#22c55e",
      order_created: "#dc2626"
    };
    return colors[type] || "#6b7280";
  }

  function formatActivityType(type) {
    const labels = {
      created: "Created",
      updated: "Updated",
      sent: "Sent",
      viewed: "Viewed",
      signed: "Signed",
      paid: "Payment",
      comment: "Comment",
      status_change: "Status",
      assigned: "Assigned",
      reminder_created: "Reminder",
      converted: "Converted",
      order_created: "Order"
    };
    return labels[type] || type;
  }

  function formatActivityDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  if (authLoading || !user) return null;

  if (loading) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>
            Loading customer...
          </div>
        </div>
      </>
    );
  }

  if (!customer) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>404</div>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "20px" }}>Customer not found</p>
            <Link
              href="/invoicing/customers"
              style={{
                display: "inline-block",
                padding: "10px 20px",
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                borderRadius: "8px",
                color: "white",
                textDecoration: "none",
                fontSize: "14px"
              }}
            >
              Back to Customers
            </Link>
          </div>
        </div>
      </>
    );
  }

  const statusColor = STATUS_COLORS[customer.status] || STATUS_COLORS.ACTIVE;
  const displayName = customer.companyName || `${customer.firstName} ${customer.lastName}`;
  const tags = Array.isArray(customer.tags) ? customer.tags :
    (typeof customer.tags === 'string' && customer.tags ? JSON.parse(customer.tags) : []);

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => handleNavigationAttempt("/invoicing/customers")}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.5)",
              cursor: "pointer",
              fontSize: "13px",
              display: "block",
              marginBottom: 8,
              padding: 0,
              textAlign: "left"
            }}
          >
            ← Back to Customers
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626" }}>
                  {displayName}
                </h1>
                <button
                  onClick={handleStatusToggle}
                  title={`Click to ${customer.status === 'ACTIVE' ? 'deactivate' : 'activate'} customer`}
                  style={{
                    padding: "4px 10px",
                    background: statusColor.bg,
                    border: `1px solid ${statusColor.border}`,
                    borderRadius: "6px",
                    color: statusColor.text,
                    fontSize: "12px",
                    fontWeight: "500",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.opacity = "0.8";
                    e.target.style.transform = "scale(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.opacity = "1";
                    e.target.style.transform = "scale(1)";
                  }}
                >
                  {customer.status}
                </button>
              </div>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", fontFamily: "monospace" }}>
                {customer.customerNumber}
              </p>
              {tags.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {tags.map((tag, i) => (
                    <span key={i} style={{
                      padding: "2px 8px",
                      background: "rgba(220, 38, 38, 0.1)",
                      border: "1px solid rgba(220, 38, 38, 0.3)",
                      borderRadius: "4px",
                      color: "#dc2626",
                      fontSize: "11px"
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {!isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{
                      padding: "8px 16px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      color: "rgba(255, 255, 255, 0.9)",
                      cursor: "pointer",
                      fontSize: "14px"
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={confirmDeleteCustomer}
                    style={{
                      padding: "8px 16px",
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: "8px",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: "14px"
                    }}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      if (hasUnsavedChanges) {
                        setShowUnsavedModal(true);
                        setPendingNavigation(null); // null means just cancel editing, don't navigate
                      } else {
                        setIsEditing(false);
                        loadCustomer();
                      }
                    }}
                    style={{
                      padding: "8px 16px",
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "8px",
                      color: "rgba(255, 255, 255, 0.9)",
                      cursor: "pointer",
                      fontSize: "14px"
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      padding: "8px 16px",
                      background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                      border: "none",
                      borderRadius: "8px",
                      color: "white",
                      cursor: saving ? "not-allowed" : "pointer",
                      fontSize: "14px",
                      fontWeight: "600",
                      opacity: saving ? 0.7 : 1
                    }}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            padding: "12px 16px",
            marginBottom: "20px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            color: "#ef4444"
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            padding: "12px 16px",
            marginBottom: "20px",
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            borderRadius: "8px",
            color: "#22c55e"
          }}>
            {success}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Left Column */}
          <div>
            {/* Company & Contact Info */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                {isEditing ? "Company & Contact" : "Company Information"}
              </h2>
              {isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Company Name</label>
                    <input
                      type="text"
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={labelStyle}>First Name *</label>
                      <input
                        type="text"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        style={inputStyle}
                        required
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Last Name *</label>
                      <input
                        type="text"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        style={inputStyle}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      style={inputStyle}
                      required
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  </div>
              ) : (
                <>
                  {customer.companyName && (
                    <div style={infoRowStyle}>
                      <span style={{ color: "rgba(255,255,255,0.5)" }}>Company</span>
                      <span style={{ color: "rgba(255,255,255,0.9)" }}>{customer.companyName}</span>
                    </div>
                  )}
                  <div style={infoRowStyle}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Contact Name</span>
                    <span style={{ color: "rgba(255,255,255,0.9)" }}>{customer.firstName} {customer.lastName}</span>
                  </div>
                  <div style={infoRowStyle}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Email</span>
                    <a href={`mailto:${customer.email}`} style={{ color: "#dc2626" }}>{customer.email}</a>
                  </div>
                  <div style={{ ...infoRowStyle, borderBottom: "none" }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Phone</span>
                    <span style={{ color: "rgba(255,255,255,0.9)" }}>{customer.phone || "—"}</span>
                  </div>
                </>
              )}
            </div>

            {/* Billing Address */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                Billing Address
              </h2>
              {isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Street Address</label>
                    <input
                      type="text"
                      value={formData.billingAddress}
                      onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={labelStyle}>City</label>
                      <input
                        type="text"
                        value={formData.billingCity}
                        onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>State</label>
                      <input
                        type="text"
                        value={formData.billingState}
                        onChange={(e) => setFormData({ ...formData, billingState: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>ZIP Code</label>
                      <input
                        type="text"
                        value={formData.billingZipCode}
                        onChange={(e) => setFormData({ ...formData, billingZipCode: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Country</label>
                      <input
                        type="text"
                        value={formData.billingCountry}
                        onChange={(e) => setFormData({ ...formData, billingCountry: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: "rgba(255,255,255,0.9)", lineHeight: 1.6 }}>
                  {customer.billingAddress ? (
                    <>
                      <div>{customer.billingAddress}</div>
                      <div>{customer.billingCity}, {customer.billingState} {customer.billingZipCode}</div>
                      <div>{customer.billingCountry}</div>
                    </>
                  ) : (
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>No billing address set</span>
                  )}
                </div>
              )}
            </div>

            {/* Shipping Address */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                Shipping Address
              </h2>
              {isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={formData.sameAsBilling}
                      onChange={(e) => setFormData({ ...formData, sameAsBilling: e.target.checked })}
                      style={{ width: 16, height: 16 }}
                    />
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>
                      Same as billing address
                    </span>
                  </label>
                  {!formData.sameAsBilling && (
                    <>
                      <div>
                        <label style={labelStyle}>Street Address</label>
                        <input
                          type="text"
                          value={formData.shippingAddress}
                          onChange={(e) => setFormData({ ...formData, shippingAddress: e.target.value })}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={labelStyle}>City</label>
                          <input
                            type="text"
                            value={formData.shippingCity}
                            onChange={(e) => setFormData({ ...formData, shippingCity: e.target.value })}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>State</label>
                          <input
                            type="text"
                            value={formData.shippingState}
                            onChange={(e) => setFormData({ ...formData, shippingState: e.target.value })}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>ZIP Code</label>
                          <input
                            type="text"
                            value={formData.shippingZipCode}
                            onChange={(e) => setFormData({ ...formData, shippingZipCode: e.target.value })}
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={labelStyle}>Country</label>
                          <input
                            type="text"
                            value={formData.shippingCountry}
                            onChange={(e) => setFormData({ ...formData, shippingCountry: e.target.value })}
                            style={inputStyle}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ color: "rgba(255,255,255,0.9)", lineHeight: 1.6 }}>
                  {customer.sameAsBilling ? (
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Same as billing address</span>
                  ) : customer.shippingAddress ? (
                    <>
                      <div>{customer.shippingAddress}</div>
                      <div>{customer.shippingCity}, {customer.shippingState} {customer.shippingZipCode}</div>
                      <div>{customer.shippingCountry}</div>
                    </>
                  ) : (
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>No shipping address set</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div>
            {/* Sales Rep Assignment */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                Sales Rep
              </h2>
              {isEditing ? (
                <select
                  value={formData.assignedToId}
                  onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">-- Unassigned --</option>
                  {salesReps.map((rep) => (
                    <option key={rep.id} value={rep.id}>{rep.name}</option>
                  ))}
                </select>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: customer.assignedTo ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)" : "rgba(255,255,255,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    fontWeight: "600",
                    color: "white"
                  }}>
                    {customer.assignedTo ? customer.assignedTo.name.charAt(0).toUpperCase() : "?"}
                  </div>
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500" }}>
                      {customer.assignedTo?.name || "Unassigned"}
                    </div>
                    {customer.assignedTo?.email && (
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
                        {customer.assignedTo.email}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Payment Settings */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                Payment Settings
              </h2>
              {isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Payment Terms</label>
                    <select
                      value={formData.paymentTerms}
                      onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                      style={inputStyle}
                    >
                      {PAYMENT_TERMS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={formData.taxExempt}
                      onChange={(e) => setFormData({ ...formData, taxExempt: e.target.checked })}
                      style={{ width: 16, height: 16 }}
                    />
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px" }}>Tax Exempt</span>
                  </label>
                  {formData.taxExempt && (
                    <div>
                      <label style={labelStyle}>Tax Exempt Number</label>
                      <input
                        type="text"
                        value={formData.taxExemptId}
                        onChange={(e) => setFormData({ ...formData, taxExemptId: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div style={infoRowStyle}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Payment Terms</span>
                    <span style={{ color: "rgba(255,255,255,0.9)" }}>
                      {PAYMENT_TERMS_OPTIONS.find(o => o.value === customer.paymentTerms)?.label || customer.paymentTerms}
                    </span>
                  </div>
                  <div style={{ ...infoRowStyle, borderBottom: "none" }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Tax Exempt</span>
                    <span style={{ color: "rgba(255,255,255,0.9)" }}>
                      {customer.taxExempt ? `Yes (${customer.taxExemptId || 'No number'})` : "No"}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Contacts */}
            <div style={sectionStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>
                  Contacts
                </h2>
                <button
                  onClick={() => openContactModal()}
                  style={{
                    padding: "6px 12px",
                    background: "rgba(220, 38, 38, 0.1)",
                    border: "1px solid rgba(220, 38, 38, 0.3)",
                    borderRadius: "6px",
                    color: "#dc2626",
                    cursor: "pointer",
                    fontSize: "13px"
                  }}
                >
                  + Add Contact
                </button>
              </div>
              {contacts.length === 0 ? (
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
                  No additional contacts
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {contacts.map(contact => (
                    <div
                      key={contact.id}
                      style={{
                        padding: 12,
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: "8px"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: "500" }}>
                              {contact.firstName} {contact.lastName}
                            </span>
                            {contact.isPrimary && (
                              <span style={{
                                padding: "2px 6px",
                                background: "rgba(220, 38, 38, 0.1)",
                                border: "1px solid rgba(220, 38, 38, 0.3)",
                                borderRadius: "4px",
                                color: "#dc2626",
                                fontSize: "10px"
                              }}>
                                PRIMARY
                              </span>
                            )}
                            <span style={{
                              padding: "2px 6px",
                              background: "rgba(255, 255, 255, 0.05)",
                              borderRadius: "4px",
                              color: "rgba(255,255,255,0.5)",
                              fontSize: "10px"
                            }}>
                              {CONTACT_ROLES.find(r => r.value === contact.role)?.label || contact.role}
                            </span>
                          </div>
                          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
                            {contact.email && <div>{contact.email}</div>}
                            {contact.phone && <div>{contact.phone}</div>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => openContactModal(contact)}
                            style={{
                              padding: "4px 8px",
                              background: "transparent",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              borderRadius: "4px",
                              color: "rgba(255,255,255,0.7)",
                              cursor: "pointer",
                              fontSize: "12px"
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => confirmDeleteContact(contact.id)}
                            style={{
                              padding: "4px 8px",
                              background: "transparent",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              borderRadius: "4px",
                              color: "#ef4444",
                              cursor: "pointer",
                              fontSize: "12px"
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Portal Access */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                Customer Portal
              </h2>
              {customer.portalToken ? (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <button
                      onClick={() => setShowPortalUrl(!showPortalUrl)}
                      style={{
                        padding: "8px 12px",
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "6px",
                        color: "rgba(255,255,255,0.9)",
                        cursor: "pointer",
                        fontSize: "13px",
                        width: "100%",
                        textAlign: "left"
                      }}
                    >
                      {showPortalUrl ? "Hide Portal URL" : "Show Portal URL"}
                    </button>
                  </div>
                  {showPortalUrl && (
                    <div style={{
                      padding: 12,
                      background: "rgba(0, 0, 0, 0.2)",
                      borderRadius: "6px",
                      marginBottom: 12,
                      wordBreak: "break-all",
                      fontSize: "12px",
                      fontFamily: "monospace",
                      color: "rgba(255,255,255,0.7)"
                    }}>
                      {typeof window !== 'undefined' ? `${window.location.origin}/portal/${customer.portalToken}` : `/portal/${customer.portalToken}`}
                    </div>
                  )}
                  <button
                    onClick={confirmRegenerateToken}
                    style={{
                      padding: "8px 12px",
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      borderRadius: "6px",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: "13px"
                    }}
                  >
                    Regenerate Token
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", marginBottom: 12 }}>
                    No portal access configured
                  </p>
                  <button
                    onClick={confirmRegenerateToken}
                    style={{
                      padding: "8px 12px",
                      background: "rgba(220, 38, 38, 0.1)",
                      border: "1px solid rgba(220, 38, 38, 0.3)",
                      borderRadius: "6px",
                      color: "#dc2626",
                      cursor: "pointer",
                      fontSize: "13px"
                    }}
                  >
                    Generate Portal Token
                  </button>
                </div>
              )}
            </div>

            {/* Notes & Tags */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
                Notes & Tags
              </h2>
              {isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Tags</label>
                    <input
                      type="text"
                      value={formData.tags}
                      onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                      style={inputStyle}
                      placeholder="VIP, wholesale, referral (comma-separated)"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>
                  {customer.notes || <span style={{ color: "rgba(255,255,255,0.4)" }}>No notes</span>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Activity Timeline - Full Width */}
        <div style={{ ...sectionStyle, marginTop: 0 }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "rgba(255,255,255,0.9)", marginBottom: 16 }}>
            Activity Timeline
          </h2>
          {activitiesLoading ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.5)" }}>
              Loading activity...
            </div>
          ) : activities.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.5)" }}>
              No activity recorded yet
            </div>
          ) : (
            <div style={{ position: "relative", paddingLeft: 24 }}>
              {/* Timeline line */}
              <div style={{
                position: "absolute",
                left: 7,
                top: 8,
                bottom: 8,
                width: 2,
                background: "rgba(220, 38, 38, 0.2)"
              }} />

              {activities.map((activity, index) => (
                <div
                  key={activity.id}
                  style={{
                    position: "relative",
                    paddingBottom: index === activities.length - 1 ? 0 : 16,
                    marginBottom: index === activities.length - 1 ? 0 : 16
                  }}
                >
                  {/* Timeline dot */}
                  <div style={{
                    position: "absolute",
                    left: -20,
                    top: 6,
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: getActivityColor(activity.type),
                    border: "2px solid #1a1a1a"
                  }} />

                  <div style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    borderRadius: 8,
                    padding: 12
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          padding: "2px 8px",
                          background: `${getActivityColor(activity.type)}20`,
                          border: `1px solid ${getActivityColor(activity.type)}40`,
                          borderRadius: 4,
                          color: getActivityColor(activity.type),
                          fontSize: 11,
                          fontWeight: 500,
                          textTransform: "uppercase"
                        }}>
                          {formatActivityType(activity.type)}
                        </span>
                        {activity.estimate && (
                          <Link
                            href={`/invoicing/estimates/${activity.estimate.id}`}
                            style={{ color: "#dc2626", fontSize: 12 }}
                          >
                            {activity.estimate.estimateNumber}
                          </Link>
                        )}
                        {activity.invoice && (
                          <Link
                            href={`/invoicing/invoices/${activity.invoice.id}`}
                            style={{ color: "#dc2626", fontSize: 12 }}
                          >
                            {activity.invoice.invoiceNumber}
                          </Link>
                        )}
                        {activity.payment && (
                          <span style={{ color: "#22c55e", fontSize: 12 }}>
                            ${activity.payment.amount?.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                        {formatActivityDate(activity.createdAt)}
                      </span>
                    </div>
                    <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, margin: 0 }}>
                      {activity.description}
                    </p>
                    {activity.performedBy && (
                      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 4, marginBottom: 0 }}>
                        by {activity.performedBy.name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contact Modal */}
      {showContactModal && (
        <div className="modal-overlay" onClick={() => setShowContactModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingContact ? "Edit Contact" : "Add Contact"}</h2>
            <form onSubmit={handleSaveContact}>
              <div className="modal-form-row">
                <div className="modal-form-group">
                  <label>First Name *</label>
                  <input
                    type="text"
                    value={contactForm.firstName}
                    onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                    required
                  />
                </div>
                <div className="modal-form-group">
                  <label>Last Name *</label>
                  <input
                    type="text"
                    value={contactForm.lastName}
                    onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="modal-form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                />
              </div>
              <div className="modal-form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                />
              </div>
              <div className="modal-form-group">
                <label>Role</label>
                <select
                  value={contactForm.role}
                  onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
                >
                  {CONTACT_ROLES.map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>
              <div className="modal-form-group">
                <label className="modal-checkbox-label">
                  <input
                    type="checkbox"
                    checked={contactForm.isPrimary}
                    onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
                  />
                  Primary Contact
                </label>
              </div>
              <div className="modal-form-group">
                <label>Notes</label>
                <textarea
                  value={contactForm.notes}
                  onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-btn cancel" onClick={() => setShowContactModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="modal-btn primary" disabled={saving}>
                  {saving ? "Saving..." : (editingContact ? "Update Contact" : "Add Contact")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{confirmConfig.title}</h2>
            <p className="modal-confirm-text">{confirmConfig.message}</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button className="modal-btn danger" onClick={confirmConfig.onConfirm}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Modal */}
      {showUnsavedModal && (
        <div className="modal-overlay" onClick={cancelDiscardChanges}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Unsaved Changes</h2>
            <p className="modal-confirm-text">
              You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
            </p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={cancelDiscardChanges}>
                Keep Editing
              </button>
              <button className="modal-btn danger" onClick={confirmDiscardChanges}>
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
