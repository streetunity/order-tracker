"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";
import "../../modal.css";

const STATUS_COLORS = {
  ACTIVE: { bg: "rgba(16, 185, 129, 0.1)", border: "rgba(16, 185, 129, 0.3)", text: "#10b981" },
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

const TABS = [
  { id: 'details', label: 'Customer Details' },
  { id: 'activity', label: 'Activity Feed' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'portal', label: 'Portal Access' },
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
  const [activeTab, setActiveTab] = useState('details');

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", message: "", onConfirm: null });
  const [pendingDeleteContactId, setPendingDeleteContactId] = useState(null);

  const [formData, setFormData] = useState({});
  const [originalFormData, setOriginalFormData] = useState({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [contactForm, setContactForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", role: "OTHER", isPrimary: false, notes: ""
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    if (params.id) {
      loadCustomer();
      loadContacts();
      loadActivities();
      loadSalesReps();
    }
  }, [user, authLoading, router, params.id]);

  useEffect(() => {
    if (!isEditing || !originalFormData || Object.keys(originalFormData).length === 0) {
      setHasUnsavedChanges(false);
      return;
    }
    const changed = Object.keys(formData).some(key => formData[key] !== originalFormData[key]);
    setHasUnsavedChanges(changed);
  }, [formData, originalFormData, isEditing]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges && isEditing) { e.preventDefault(); e.returnValue = ''; return ''; }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, isEditing]);

  useEffect(() => {
    if (!hasUnsavedChanges || !isEditing) return;
    const handleClick = (e) => {
      const link = e.target.closest('a[href]');
      if (link) {
        const href = link.getAttribute('href');
        if (href && href.startsWith('/')) {
          e.preventDefault(); e.stopPropagation();
          setPendingNavigation(href); setShowUnsavedModal(true);
        }
      }
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [hasUnsavedChanges, isEditing]);

  async function loadSalesReps() {
    try {
      const res = await fetch("/api/sales-reps", { headers: getAuthHeaders() });
      if (res.ok) setSalesReps(await res.json());
    } catch (e) { console.error("Error loading sales reps:", e); }
  }

  async function loadCustomer() {
    try {
      const res = await fetch(`/api/customers/${params.id}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        if (res.status === 404) { setError("Customer not found"); setLoading(false); return; }
        throw new Error("Failed to load customer");
      }
      const data = await res.json();
      setCustomer(data);
      const fd = {
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
      setFormData(fd);
      setOriginalFormData(fd);
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
      const res = await fetch(`/api/customers/${params.id}/contacts`, { headers: getAuthHeaders() });
      if (res.ok) setContacts(await res.json());
    } catch (e) { console.error("Error loading contacts:", e); }
  }

  async function loadActivities() {
    setActivitiesLoading(true);
    try {
      const res = await fetch(`/api/customers/${params.id}/activity?limit=20`, { headers: getAuthHeaders() });
      if (res.ok) { const data = await res.json(); setActivities(data.activities || []); }
    } catch (e) { console.error("Error loading activities:", e); }
    finally { setActivitiesLoading(false); }
  }

  async function handleSave() {
    setSaving(true); setError(""); setSuccess("");
    try {
      const submitData = {
        ...formData,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        assignedToId: formData.assignedToId || null
      };
      const res = await fetch(`/api/customers/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(submitData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update customer");
      setCustomer(data); setIsEditing(false);
      setSuccess("Customer updated successfully");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  function showConfirm(title, message, onConfirm) {
    setConfirmConfig({ title, message, onConfirm }); setShowConfirmModal(true);
  }

  function handleNavigationAttempt(destination) {
    if (hasUnsavedChanges && isEditing) { setPendingNavigation(destination); setShowUnsavedModal(true); }
    else router.push(destination);
  }

  function confirmDiscardChanges() {
    setShowUnsavedModal(false); setHasUnsavedChanges(false); setIsEditing(false);
    if (pendingNavigation) router.push(pendingNavigation);
    else loadCustomer();
    setPendingNavigation(null);
  }

  function cancelDiscardChanges() { setShowUnsavedModal(false); setPendingNavigation(null); }

  async function handleStatusToggle() {
    const newStatus = customer.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch(`/api/customers/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      setCustomer(data);
      setFormData(prev => ({ ...prev, status: newStatus }));
      setOriginalFormData(prev => ({ ...prev, status: newStatus }));
      setSuccess(`Customer ${newStatus === 'ACTIVE' ? 'activated' : 'deactivated'}`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.message); }
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
      const res = await fetch(`/api/customers/${params.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to delete customer"); }
      router.push("/invoicing/customers");
    } catch (err) { setError(err.message); }
  }

  async function handleRegenerateToken() {
    setShowConfirmModal(false);
    try {
      const res = await fetch(`/api/customers/${params.id}/regenerate-portal-token`, { method: "POST", headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to regenerate token");
      setCustomer(prev => ({ ...prev, portalToken: data.portalToken }));
      setSuccess("Portal token regenerated");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.message); }
  }

  function openContactModal(contact = null) {
    if (contact) {
      setEditingContact(contact);
      setContactForm({ firstName: contact.firstName || "", lastName: contact.lastName || "", email: contact.email || "", phone: contact.phone || "", role: contact.role || "OTHER", isPrimary: contact.isPrimary || false, notes: contact.notes || "" });
    } else {
      setEditingContact(null);
      setContactForm({ firstName: "", lastName: "", email: "", phone: "", role: "OTHER", isPrimary: contacts.length === 0, notes: "" });
    }
    setShowContactModal(true);
  }

  async function handleSaveContact(e) {
    e.preventDefault(); setSaving(true);
    try {
      const url = editingContact ? `/api/customers/${params.id}/contacts/${editingContact.id}` : `/api/customers/${params.id}/contacts`;
      const method = editingContact ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify(contactForm) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save contact");
      await loadContacts(); setShowContactModal(false);
      setSuccess(editingContact ? "Contact updated" : "Contact added");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
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
      const res = await fetch(`/api/customers/${params.id}/contacts/${idToDelete}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to delete contact"); }
      await loadContacts(); setSuccess("Contact deleted"); setTimeout(() => setSuccess(""), 3000);
    } catch (err) { setError(err.message); }
  }

  function getActivityColor(type) {
    const colors = { created: "#10b981", updated: "#3b82f6", sent: "#8b5cf6", viewed: "#6366f1", signed: "#10b981", paid: "#10b981", comment: "#f59e0b", status_change: "#f97316", assigned: "#06b6d4", reminder_created: "#f59e0b", converted: "#10b981", order_created: "#dc2626" };
    return colors[type] || "#6b7280";
  }

  function formatActivityType(type) {
    const labels = { created: "Created", updated: "Updated", sent: "Sent", viewed: "Viewed", signed: "Signed", paid: "Payment", comment: "Comment", status_change: "Status", assigned: "Assigned", reminder_created: "Reminder", converted: "Converted", order_created: "Order" };
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

  const inputStyle = { width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.9)", fontSize: "14px" };
  const labelStyle = { display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "500", color: "rgba(255,255,255,0.6)" };
  const infoRowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" };

  if (authLoading || !user) return null;

  if (loading) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>Loading customer...</div>
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
            <Link href="/invoicing/customers" style={{ display: "inline-block", padding: "10px 20px", background: "#dc2626", borderRadius: "8px", color: "white", textDecoration: "none", fontSize: "14px" }}>Back to Customers</Link>
          </div>
        </div>
      </>
    );
  }

  const statusColor = STATUS_COLORS[customer.status] || STATUS_COLORS.ACTIVE;
  const displayName = customer.companyName || `${customer.firstName} ${customer.lastName}`;
  const initials = customer.companyName
    ? customer.companyName.substring(0, 2).toUpperCase()
    : `${(customer.firstName || "?")[0]}${(customer.lastName || "")[0] || ""}`.toUpperCase();
  const tags = Array.isArray(customer.tags) ? customer.tags : (typeof customer.tags === 'string' && customer.tags ? JSON.parse(customer.tags) : []);

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80, paddingBottom: 60 }}>

        {/* Back nav */}
        <button
          onClick={() => handleNavigationAttempt("/invoicing/customers")}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "13px", marginBottom: 20, padding: 0, display: "flex", alignItems: "center", gap: 6 }}
        >
          ← Back to Customers
        </button>

        {/* ── CUSTOMER HEADER CARD ─────────────────────────────── */}
        <div style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "16px", marginBottom: 0, overflow: "hidden" }}>
          {/* Top bar: avatar + name + info + actions */}
          <div style={{ padding: "28px 32px", display: "flex", gap: 24, alignItems: "flex-start", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Avatar */}
            <div style={{ flexShrink: 0, width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", fontWeight: "700", color: "white", letterSpacing: "1px", boxShadow: "0 0 0 4px rgba(220,38,38,0.15)" }}>
              {initials}
            </div>

            {/* Name + meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                <h1 style={{ fontSize: "24px", fontWeight: "700", color: "#ffffff", margin: 0 }}>{displayName}</h1>
                <button
                  onClick={handleStatusToggle}
                  title={`Click to ${customer.status === 'ACTIVE' ? 'deactivate' : 'activate'}`}
                  style={{ padding: "3px 10px", background: statusColor.bg, border: `1px solid ${statusColor.border}`, borderRadius: "20px", color: statusColor.text, fontSize: "11px", fontWeight: "600", cursor: "pointer", letterSpacing: "0.5px", textTransform: "uppercase" }}
                >
                  {customer.status}
                </button>
                {tags.map((tag, i) => (
                  <span key={i} style={{ padding: "2px 8px", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: "12px", color: "#dc2626", fontSize: "11px" }}>{tag}</span>
                ))}
              </div>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "12px", fontFamily: "monospace", margin: "0 0 14px" }}>{customer.customerNumber}</p>

              {/* Contact strip */}
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                {customer.email && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>✉</span>
                    <a href={`mailto:${customer.email}`} style={{ color: "#dc2626", fontSize: "13px", textDecoration: "none" }}>{customer.email}</a>
                  </div>
                )}
                {customer.phone && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>☎</span>
                    <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "13px" }}>{customer.phone}</span>
                  </div>
                )}
                {customer.billingAddress && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>◎</span>
                    <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "13px" }}>
                      {customer.billingAddress}, {customer.billingCity}
                      {customer.billingState ? `, ${customer.billingState}` : ""}
                    </span>
                  </div>
                )}
                {customer.assignedTo && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "700", color: "white" }}>
                      {customer.assignedTo.name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "13px" }}>{customer.assignedTo.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ flexShrink: 0, display: "flex", gap: 8, alignItems: "center" }}>
              {!isEditing ? (
                <>
                  <button
                    onClick={() => { setIsEditing(true); setActiveTab('details'); }}
                    style={{ padding: "9px 18px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", color: "rgba(255,255,255,0.85)", cursor: "pointer", fontSize: "14px", fontWeight: "500" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={confirmDeleteCustomer}
                    style={{ padding: "9px 18px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: "8px", color: "#dc2626", cursor: "pointer", fontSize: "14px", fontWeight: "500" }}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      if (hasUnsavedChanges) { setShowUnsavedModal(true); setPendingNavigation(null); }
                      else { setIsEditing(false); loadCustomer(); }
                    }}
                    style={{ padding: "9px 18px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", color: "rgba(255,255,255,0.85)", cursor: "pointer", fontSize: "14px" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ padding: "9px 20px", background: "#dc2626", border: "none", borderRadius: "8px", color: "white", cursor: saving ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: "600", opacity: saving ? 0.7 : 1 }}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── STAT STRIP ──────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {[
              { label: "Payment Terms", value: PAYMENT_TERMS_OPTIONS.find(o => o.value === customer.paymentTerms)?.label || customer.paymentTerms || "—" },
              { label: "Tax Exempt", value: customer.taxExempt ? "Yes" : "No" },
              { label: "Additional Contacts", value: contacts.length || "0" },
              { label: "Activity Events", value: activities.length || "—" },
            ].map((stat, i) => (
              <div key={i} style={{ padding: "16px 24px", borderRight: i < 3 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 5 }}>{stat.label}</div>
                <div style={{ fontSize: "18px", fontWeight: "600", color: "rgba(255,255,255,0.85)" }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* ── TAB BAR ────────────────────────────────────────── */}
          <div style={{ display: "flex", padding: "0 32px", background: "#161616" }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "14px 20px",
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === tab.id ? "2px solid #dc2626" : "2px solid transparent",
                  color: activeTab === tab.id ? "#dc2626" : "rgba(255,255,255,0.45)",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: activeTab === tab.id ? "600" : "400",
                  letterSpacing: "0.2px",
                  transition: "all 0.15s",
                  marginBottom: "-1px"
                }}
              >
                {tab.label}
                {tab.id === 'contacts' && contacts.length > 0 && (
                  <span style={{ marginLeft: 6, padding: "1px 6px", background: activeTab === 'contacts' ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.08)", borderRadius: "10px", fontSize: "11px", color: activeTab === 'contacts' ? "#dc2626" : "rgba(255,255,255,0.4)" }}>
                    {contacts.length}
                  </span>
                )}
                {tab.id === 'activity' && activities.length > 0 && (
                  <span style={{ marginLeft: 6, padding: "1px 6px", background: activeTab === 'activity' ? "rgba(220,38,38,0.15)" : "rgba(255,255,255,0.08)", borderRadius: "10px", fontSize: "11px", color: activeTab === 'activity' ? "#dc2626" : "rgba(255,255,255,0.4)" }}>
                    {activities.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── ALERTS ──────────────────────────────────────────── */}
        {error && (
          <div style={{ padding: "12px 16px", marginTop: 16, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: "8px", color: "#dc2626", fontSize: "14px" }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ padding: "12px 16px", marginTop: 16, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "8px", color: "#10b981", fontSize: "14px" }}>
            {success}
          </div>
        )}

        {/* ── TAB CONTENT ─────────────────────────────────────── */}
        <div style={{ marginTop: 1, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)", borderTop: "none", borderRadius: "0 0 16px 16px", padding: "32px" }}>

          {/* ─ DETAILS TAB ─ */}
          {activeTab === 'details' && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
              {/* LEFT */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                {/* Company & Contact Info */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 3, height: 16, background: "#dc2626", borderRadius: 2 }} />
                    <h3 style={{ fontSize: "13px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>
                      {isEditing ? "Company & Contact" : "Company Information"}
                    </h3>
                  </div>
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={labelStyle}>Company Name</label>
                        <input type="text" value={formData.companyName} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} style={inputStyle} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={labelStyle}>First Name *</label>
                          <input type="text" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} style={inputStyle} required />
                        </div>
                        <div>
                          <label style={labelStyle}>Last Name *</label>
                          <input type="text" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} style={inputStyle} required />
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>Email *</label>
                        <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} style={inputStyle} required />
                      </div>
                      <div>
                        <label style={labelStyle}>Phone</label>
                        <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} style={inputStyle} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: "#252525", borderRadius: 10, overflow: "hidden" }}>
                      {customer.companyName && (
                        <div style={{ ...infoRowStyle, padding: "12px 16px" }}>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>Company</span>
                          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "14px", fontWeight: "500" }}>{customer.companyName}</span>
                        </div>
                      )}
                      <div style={{ ...infoRowStyle, padding: "12px 16px" }}>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>Contact Name</span>
                        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "14px" }}>{customer.firstName} {customer.lastName}</span>
                      </div>
                      <div style={{ ...infoRowStyle, padding: "12px 16px" }}>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>Email</span>
                        <a href={`mailto:${customer.email}`} style={{ color: "#dc2626", fontSize: "14px", textDecoration: "none" }}>{customer.email}</a>
                      </div>
                      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>Phone</span>
                        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "14px" }}>{customer.phone || "—"}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Billing Address */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 3, height: 16, background: "#dc2626", borderRadius: 2 }} />
                    <h3 style={{ fontSize: "13px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>Billing Address</h3>
                  </div>
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={labelStyle}>Street Address</label>
                        <input type="text" value={formData.billingAddress} onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })} style={inputStyle} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div><label style={labelStyle}>City</label><input type="text" value={formData.billingCity} onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })} style={inputStyle} /></div>
                        <div><label style={labelStyle}>State</label><input type="text" value={formData.billingState} onChange={(e) => setFormData({ ...formData, billingState: e.target.value })} style={inputStyle} /></div>
                        <div><label style={labelStyle}>ZIP Code</label><input type="text" value={formData.billingZipCode} onChange={(e) => setFormData({ ...formData, billingZipCode: e.target.value })} style={inputStyle} /></div>
                        <div><label style={labelStyle}>Country</label><input type="text" value={formData.billingCountry} onChange={(e) => setFormData({ ...formData, billingCountry: e.target.value })} style={inputStyle} /></div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: "#252525", borderRadius: 10, padding: "14px 16px" }}>
                      {customer.billingAddress ? (
                        <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "14px", lineHeight: 1.7 }}>
                          <div>{customer.billingAddress}</div>
                          <div>{customer.billingCity}{customer.billingState ? `, ${customer.billingState}` : ""} {customer.billingZipCode}</div>
                          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>{customer.billingCountry}</div>
                        </div>
                      ) : (
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>No billing address set</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Shipping Address */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 3, height: 16, background: "#dc2626", borderRadius: 2 }} />
                    <h3 style={{ fontSize: "13px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>Shipping Address</h3>
                  </div>
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input type="checkbox" checked={formData.sameAsBilling} onChange={(e) => setFormData({ ...formData, sameAsBilling: e.target.checked })} style={{ width: 16, height: 16 }} />
                        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}>Same as billing address</span>
                      </label>
                      {!formData.sameAsBilling && (
                        <>
                          <div><label style={labelStyle}>Street Address</label><input type="text" value={formData.shippingAddress} onChange={(e) => setFormData({ ...formData, shippingAddress: e.target.value })} style={inputStyle} /></div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div><label style={labelStyle}>City</label><input type="text" value={formData.shippingCity} onChange={(e) => setFormData({ ...formData, shippingCity: e.target.value })} style={inputStyle} /></div>
                            <div><label style={labelStyle}>State</label><input type="text" value={formData.shippingState} onChange={(e) => setFormData({ ...formData, shippingState: e.target.value })} style={inputStyle} /></div>
                            <div><label style={labelStyle}>ZIP Code</label><input type="text" value={formData.shippingZipCode} onChange={(e) => setFormData({ ...formData, shippingZipCode: e.target.value })} style={inputStyle} /></div>
                            <div><label style={labelStyle}>Country</label><input type="text" value={formData.shippingCountry} onChange={(e) => setFormData({ ...formData, shippingCountry: e.target.value })} style={inputStyle} /></div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{ background: "#252525", borderRadius: 10, padding: "14px 16px" }}>
                      {customer.sameAsBilling ? (
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>Same as billing address</span>
                      ) : customer.shippingAddress ? (
                        <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "14px", lineHeight: 1.7 }}>
                          <div>{customer.shippingAddress}</div>
                          <div>{customer.shippingCity}{customer.shippingState ? `, ${customer.shippingState}` : ""} {customer.shippingZipCode}</div>
                          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>{customer.shippingCountry}</div>
                        </div>
                      ) : (
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>No shipping address set</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

                {/* Sales Rep */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 3, height: 16, background: "#dc2626", borderRadius: 2 }} />
                    <h3 style={{ fontSize: "13px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>Sales Rep</h3>
                  </div>
                  {isEditing ? (
                    <select value={formData.assignedToId} onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })} style={inputStyle}>
                      <option value="">-- Unassigned --</option>
                      {salesReps.map(rep => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
                    </select>
                  ) : (
                    <div style={{ background: "#252525", borderRadius: 10, padding: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: customer.assignedTo ? "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)" : "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "700", color: "white" }}>
                          {customer.assignedTo ? customer.assignedTo.name.charAt(0).toUpperCase() : "?"}
                        </div>
                        <div>
                          <div style={{ color: "rgba(255,255,255,0.85)", fontWeight: "600", fontSize: "15px" }}>{customer.assignedTo?.name || "Unassigned"}</div>
                          {customer.assignedTo?.email && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: 2 }}>{customer.assignedTo.email}</div>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Payment Settings */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 3, height: 16, background: "#dc2626", borderRadius: 2 }} />
                    <h3 style={{ fontSize: "13px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>Payment Settings</h3>
                  </div>
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={labelStyle}>Payment Terms</label>
                        <select value={formData.paymentTerms} onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })} style={inputStyle}>
                          {PAYMENT_TERMS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input type="checkbox" checked={formData.taxExempt} onChange={(e) => setFormData({ ...formData, taxExempt: e.target.checked })} style={{ width: 16, height: 16 }} />
                        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "14px" }}>Tax Exempt</span>
                      </label>
                      {formData.taxExempt && (
                        <div>
                          <label style={labelStyle}>Tax Exempt Number</label>
                          <input type="text" value={formData.taxExemptId} onChange={(e) => setFormData({ ...formData, taxExemptId: e.target.value })} style={inputStyle} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ background: "#252525", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ ...infoRowStyle, padding: "12px 16px" }}>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>Payment Terms</span>
                        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: "14px", fontWeight: "500" }}>{PAYMENT_TERMS_OPTIONS.find(o => o.value === customer.paymentTerms)?.label || customer.paymentTerms}</span>
                      </div>
                      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>Tax Exempt</span>
                        <span style={{ color: customer.taxExempt ? "#f59e0b" : "rgba(255,255,255,0.85)", fontSize: "14px" }}>
                          {customer.taxExempt ? `Yes${customer.taxExemptId ? ` (${customer.taxExemptId})` : ""}` : "No"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes & Tags */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 3, height: 16, background: "#dc2626", borderRadius: 2 }} />
                    <h3 style={{ fontSize: "13px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>Notes & Tags</h3>
                  </div>
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={labelStyle}>Tags</label>
                        <input type="text" value={formData.tags} onChange={(e) => setFormData({ ...formData, tags: e.target.value })} style={inputStyle} placeholder="VIP, wholesale, referral (comma-separated)" />
                      </div>
                      <div>
                        <label style={labelStyle}>Notes</label>
                        <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} style={{ ...inputStyle, minHeight: "100px", resize: "vertical" }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: "#252525", borderRadius: 10, padding: "14px 16px", color: "rgba(255,255,255,0.7)", fontSize: "14px", whiteSpace: "pre-wrap", minHeight: 60 }}>
                      {customer.notes || <span style={{ color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>No notes added</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─ ACTIVITY TAB ─ */}
          {activeTab === 'activity' && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                <div style={{ width: 3, height: 16, background: "#dc2626", borderRadius: 2 }} />
                <h3 style={{ fontSize: "13px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>Activity Timeline</h3>
              </div>
              {activitiesLoading ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.4)" }}>Loading activity...</div>
              ) : activities.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: "32px", marginBottom: 12 }}>📋</div>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>No activity recorded yet</p>
                </div>
              ) : (
                <div style={{ position: "relative", paddingLeft: 28 }}>
                  <div style={{ position: "absolute", left: 8, top: 8, bottom: 8, width: 2, background: "rgba(220,38,38,0.15)", borderRadius: 1 }} />
                  {activities.map((activity, index) => (
                    <div key={activity.id} style={{ position: "relative", marginBottom: index === activities.length - 1 ? 0 : 16 }}>
                      <div style={{ position: "absolute", left: -22, top: 14, width: 12, height: 12, borderRadius: "50%", background: getActivityColor(activity.type), border: "2px solid #1a1a1a", boxShadow: `0 0 0 3px ${getActivityColor(activity.type)}20` }} />
                      <div style={{ background: "#252525", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "14px 16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ padding: "2px 9px", background: `${getActivityColor(activity.type)}18`, border: `1px solid ${getActivityColor(activity.type)}35`, borderRadius: 12, color: getActivityColor(activity.type), fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                              {formatActivityType(activity.type)}
                            </span>
                            {activity.estimate && <Link href={`/invoicing/estimates/${activity.estimate.id}`} style={{ color: "#dc2626", fontSize: 12 }}>{activity.estimate.estimateNumber}</Link>}
                            {activity.invoice && <Link href={`/invoicing/invoices/${activity.invoice.id}`} style={{ color: "#dc2626", fontSize: 12 }}>{activity.invoice.invoiceNumber}</Link>}
                            {activity.payment && <span style={{ color: "#10b981", fontSize: 12, fontWeight: 600 }}>${activity.payment.amount?.toLocaleString()}</span>}
                          </div>
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, whiteSpace: "nowrap", marginLeft: 12 }}>{formatActivityDate(activity.createdAt)}</span>
                        </div>
                        <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, margin: 0 }}>{activity.description}</p>
                        {activity.performedBy && <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 5, marginBottom: 0 }}>by {activity.performedBy.name}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─ CONTACTS TAB ─ */}
          {activeTab === 'contacts' && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 3, height: 16, background: "#dc2626", borderRadius: 2 }} />
                  <h3 style={{ fontSize: "13px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>Additional Contacts</h3>
                </div>
                <button
                  onClick={() => openContactModal()}
                  style={{ padding: "8px 16px", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: "8px", color: "#dc2626", cursor: "pointer", fontSize: "13px", fontWeight: "500" }}
                >
                  + Add Contact
                </button>
              </div>
              {contacts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: "32px", marginBottom: 12 }}>👤</div>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px", marginBottom: 16 }}>No additional contacts added yet</p>
                  <button onClick={() => openContactModal()} style={{ padding: "9px 20px", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: "8px", color: "#dc2626", cursor: "pointer", fontSize: "13px" }}>
                    Add First Contact
                  </button>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
                  {contacts.map(contact => (
                    <div key={contact.id} style={{ background: "#252525", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: "700", color: "#dc2626" }}>
                            {`${(contact.firstName || "?")[0]}${(contact.lastName || "")[0] || ""}`.toUpperCase()}
                          </div>
                          <div>
                            <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: "600", fontSize: "14px" }}>{contact.firstName} {contact.lastName}</div>
                            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                              <span style={{ padding: "2px 7px", background: "rgba(255,255,255,0.06)", borderRadius: "10px", color: "rgba(255,255,255,0.45)", fontSize: "10px" }}>
                                {CONTACT_ROLES.find(r => r.value === contact.role)?.label || contact.role}
                              </span>
                              {contact.isPrimary && (
                                <span style={{ padding: "2px 7px", background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: "10px", color: "#dc2626", fontSize: "10px", fontWeight: "600" }}>PRIMARY</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => openContactModal(contact)} style={{ padding: "5px 10px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: "12px" }}>Edit</button>
                          <button onClick={() => confirmDeleteContact(contact.id)} style={{ padding: "5px 10px", background: "transparent", border: "1px solid rgba(220,38,38,0.25)", borderRadius: "6px", color: "#dc2626", cursor: "pointer", fontSize: "12px" }}>Delete</button>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {contact.email && <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>✉ {contact.email}</div>}
                        {contact.phone && <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>☎ {contact.phone}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─ PORTAL TAB ─ */}
          {activeTab === 'portal' && (
            <div style={{ maxWidth: 560 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                <div style={{ width: 3, height: 16, background: "#dc2626", borderRadius: 2 }} />
                <h3 style={{ fontSize: "13px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.8px", margin: 0 }}>Customer Portal Access</h3>
              </div>
              <div style={{ background: "#252525", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 24 }}>
                {customer.portalToken ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "10px 14px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8 }}>
                      <span style={{ color: "#10b981", fontSize: "16px" }}>✓</span>
                      <span style={{ color: "#10b981", fontSize: "13px", fontWeight: "500" }}>Portal access is active</span>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <button
                        onClick={() => setShowPortalUrl(!showPortalUrl)}
                        style={{ padding: "10px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.8)", cursor: "pointer", fontSize: "13px", width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      >
                        <span>{showPortalUrl ? "Hide Portal URL" : "Show Portal URL"}</span>
                        <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)" }}>{showPortalUrl ? "▲" : "▼"}</span>
                      </button>
                    </div>
                    {showPortalUrl && (
                      <div style={{ padding: "12px 14px", background: "rgba(0,0,0,0.3)", borderRadius: 8, marginBottom: 16, wordBreak: "break-all", fontSize: "12px", fontFamily: "monospace", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        {typeof window !== 'undefined' ? `${window.location.origin}/portal/${customer.portalToken}` : `/portal/${customer.portalToken}`}
                      </div>
                    )}
                    <button
                      onClick={confirmRegenerateToken}
                      style={{ padding: "9px 16px", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: "8px", color: "#dc2626", cursor: "pointer", fontSize: "13px" }}
                    >
                      Regenerate Token
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ textAlign: "center", padding: "20px 0 24px" }}>
                      <div style={{ fontSize: "36px", marginBottom: 12 }}>🔐</div>
                      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", marginBottom: 20 }}>No portal access configured for this customer</p>
                      <button
                        onClick={confirmRegenerateToken}
                        style={{ padding: "10px 24px", background: "#dc2626", border: "none", borderRadius: "8px", color: "white", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}
                      >
                        Generate Portal Token
                      </button>
                    </div>
                  </>
                )}
              </div>
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
                  <input type="text" value={contactForm.firstName} onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })} required />
                </div>
                <div className="modal-form-group">
                  <label>Last Name *</label>
                  <input type="text" value={contactForm.lastName} onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })} required />
                </div>
              </div>
              <div className="modal-form-group">
                <label>Email</label>
                <input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
              </div>
              <div className="modal-form-group">
                <label>Phone</label>
                <input type="tel" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
              </div>
              <div className="modal-form-group">
                <label>Role</label>
                <select value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}>
                  {CONTACT_ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
              </div>
              <div className="modal-form-group">
                <label className="modal-checkbox-label">
                  <input type="checkbox" checked={contactForm.isPrimary} onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })} />
                  Primary Contact
                </label>
              </div>
              <div className="modal-form-group">
                <label>Notes</label>
                <textarea value={contactForm.notes} onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="modal-btn cancel" onClick={() => setShowContactModal(false)}>Cancel</button>
                <button type="submit" className="modal-btn primary" disabled={saving}>{saving ? "Saving..." : (editingContact ? "Update Contact" : "Add Contact")}</button>
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
              <button className="modal-btn cancel" onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button className="modal-btn danger" onClick={confirmConfig.onConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Modal */}
      {showUnsavedModal && (
        <div className="modal-overlay" onClick={cancelDiscardChanges}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Unsaved Changes</h2>
            <p className="modal-confirm-text">You have unsaved changes. Are you sure you want to leave? Your changes will be lost.</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={cancelDiscardChanges}>Keep Editing</button>
              <button className="modal-btn danger" onClick={confirmDiscardChanges}>Discard Changes</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
