"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useUnsavedChanges } from "@/contexts/UnsavedChangesContext";
import InvoicingNav from "@/components/InvoicingNav";
import "../../modal.css";

const STATUS_COLORS = {
  DRAFT:     { bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.3)', text: '#9ca3af' },
  SENT:      { bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)',  text: '#3b82f6' },
  VIEWED:    { bg: 'rgba(168,85,247,0.1)',  border: 'rgba(168,85,247,0.3)',  text: '#a855f7' },
  ACCEPTED:  { bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.3)',   text: '#22c55e' },
  DECLINED:  { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   text: '#ef4444' },
  EXPIRED:   { bg: 'rgba(234,179,8,0.1)',   border: 'rgba(234,179,8,0.3)',   text: '#eab308' },
  CONVERTED: { bg: 'rgba(20,184,166,0.1)',  border: 'rgba(20,184,166,0.3)',  text: '#14b8a6' },
};

// Six-dot drag handle
function GripIcon({ color }) {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" fill={color} style={{ display: "block", margin: "0 auto" }}>
      <circle cx="4" cy="4"  r="2"/>
      <circle cx="4" cy="10" r="2"/>
      <circle cx="4" cy="16" r="2"/>
      <circle cx="10" cy="4"  r="2"/>
      <circle cx="10" cy="10" r="2"/>
      <circle cx="10" cy="16" r="2"/>
    </svg>
  );
}

export default function EstimateDetailPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const { setHasUnsavedChanges: setGlobalUnsavedChanges, navigateWithWarning: globalNavigateWithWarning } = useUnsavedChanges();

  const [estimate,     setEstimate]     = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [saving,       setSaving]       = useState(false);
  const [editMode,     setEditMode]     = useState(false);
  const [versions,     setVersions]     = useState([]);
  const [showVersions, setShowVersions] = useState(false);

  // PDF & Email
  const [generatingPDF,    setGeneratingPDF]    = useState(false);
  const [sendingEmail,     setSendingEmail]     = useState(false);
  const [showSendModal,    setShowSendModal]    = useState(false);
  const [emailTo,          setEmailTo]          = useState("");
  const [emailCc,          setEmailCc]          = useState("");
  const [emailMessage,     setEmailMessage]     = useState("");
  const [emailHistory,     setEmailHistory]     = useState([]);
  const [showEmailHistory, setShowEmailHistory] = useState(false);

  // Product search
  const [products,           setProducts]           = useState([]);
  const [bundles,            setBundles]            = useState([]);
  const [productSearch,      setProductSearch]      = useState("");
  const [showProductDropdown,setShowProductDropdown]= useState(false);
  const [expandedItems,      setExpandedItems]      = useState({});

  // Drag-to-reorder (edit mode)
  const [dragIndex,        setDragIndex]        = useState(null);
  const [dragOverIndex,    setDragOverIndex]    = useState(null);
  const [hoveredGripIndex, setHoveredGripIndex] = useState(null);
  const dragFromHandleRef = useRef(false);

  // Modals
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName,      setTemplateName]      = useState("");
  const [showConfirmModal,  setShowConfirmModal]  = useState(false);
  const [confirmConfig,     setConfirmConfig]     = useState({ title: "", message: "", onConfirm: null });
  const [showSuccessModal,  setShowSuccessModal]  = useState(false);
  const [successMessage,    setSuccessMessage]    = useState("");

  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (actionsRef.current && !actionsRef.current.contains(e.target)) setShowActionsMenu(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setGlobalUnsavedChanges(editMode);
    return () => setGlobalUnsavedChanges(false);
  }, [editMode, setGlobalUnsavedChanges]);

  useEffect(() => {
    const fn = (e) => { if (editMode) { e.preventDefault(); e.returnValue = ""; return ""; } };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [editMode]);

  useEffect(() => {
    if (!editMode) return;
    const fn = () => { window.history.pushState(null, '', window.location.href); globalNavigateWithWarning('/invoicing/estimates', router); };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', fn);
    return () => window.removeEventListener('popstate', fn);
  }, [editMode, globalNavigateWithWarning, router]);

  function navigateWithWarning(url) {
    if (editMode) globalNavigateWithWarning(url, router);
    else router.push(url);
  }

  const toggleItemExpand = (itemId) => setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    loadEstimate();
    loadProducts();
    loadBundles();
  }, [user, router, id]);

  async function loadEstimate() {
    try {
      const res = await fetch(`/api/estimates/${id}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        if (res.status === 404) { setError("Estimate not found"); setLoading(false); return; }
        throw new Error("Failed to load estimate");
      }
      const data = await res.json();
      setEstimate(data);
    } catch (e) {
      setError("Failed to load estimate");
    } finally {
      setLoading(false);
    }
  }

  async function loadProducts() {
    try { const r = await fetch("/api/products", { headers: getAuthHeaders() }); if (r.ok) { const d = await r.json(); setProducts(d.filter(p => p.isActive)); } } catch {}
  }
  async function loadBundles() {
    try { const r = await fetch("/api/bundles", { headers: getAuthHeaders() }); if (r.ok) { const d = await r.json(); setBundles(d.filter(b => b.isActive)); } } catch {}
  }

  async function addProduct(product) {
    setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${id}/items`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ productId: product.id, quantity: 1 }) });
      if (!res.ok) throw new Error("Failed to add item");
      const data = await res.json();
      setEstimate(data.estimate);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); setProductSearch(""); setShowProductDropdown(false); }
  }

  async function addBundle(bundle) {
    setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${id}/bundles`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ bundleId: bundle.id, quantity: 1 }) });
      if (!res.ok) throw new Error("Failed to add bundle");
      const data = await res.json();
      setEstimate(data.estimate);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); setProductSearch(""); setShowProductDropdown(false); }
  }

  async function updateItem(itemId, updates) {
    setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${id}/items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify(updates) });
      if (!res.ok) throw new Error("Failed to update item");
      const data = await res.json();
      setEstimate(data.estimate);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  // Drag-to-reorder: optimistically reorder in UI, then persist to server
  function handleDragStart(e, index) {
    if (!dragFromHandleRef.current) { e.preventDefault(); return; }
    dragFromHandleRef.current = false;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== dragOverIndex) setDragOverIndex(index);
  }

  async function handleDrop(e, dropIndex) {
    e.preventDefault();
    const fromIndex = dragIndex;
    setDragIndex(null);
    setDragOverIndex(null);
    if (fromIndex === null || fromIndex === dropIndex) return;

    // Optimistic update
    const newItems = [...estimate.items];
    const [moved] = newItems.splice(fromIndex, 1);
    newItems.splice(dropIndex, 0, moved);
    setEstimate(prev => ({ ...prev, items: newItems }));
    setExpandedItems({});

    // Persist to server
    setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${id}/items/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ itemIds: newItems.map(i => i.id) }),
      });
      if (!res.ok) throw new Error("Failed to reorder items");
      const data = await res.json();
      setEstimate(data);
    } catch (e) {
      setError(e.message);
      loadEstimate(); // roll back on error
    } finally {
      setSaving(false);
    }
  }

  function handleDragEnd() {
    dragFromHandleRef.current = false;
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function confirmDeleteItem(itemId) { showConfirm("Remove Item", "Are you sure you want to remove this item?", () => deleteItem(itemId)); }

  async function deleteItem(itemId) {
    setShowConfirmModal(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${id}/items/${itemId}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to delete item");
      const data = await res.json();
      setEstimate(data.estimate);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function updateStatus(newStatus) {
    setSaving(true); setShowActionsMenu(false);
    try {
      const res = await fetch(`/api/estimates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ status: newStatus }) });
      if (!res.ok) throw new Error("Failed to update status");
      setEstimate(await res.json());
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  function confirmDeleteEstimate() { setShowActionsMenu(false); showConfirm("Delete Estimate", "Are you sure you want to delete this estimate? This action cannot be undone.", deleteEstimate); }

  async function deleteEstimate() {
    setShowConfirmModal(false); setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to delete estimate");
      router.push("/invoicing/estimates");
    } catch (e) { setError(e.message); setSaving(false); }
  }

  async function loadVersions() {
    try { const r = await fetch(`/api/estimates/${id}/versions`, { headers: getAuthHeaders() }); if (r.ok) setVersions(await r.json()); } catch {}
  }

  function confirmCreateNewVersion() { setShowActionsMenu(false); showConfirm("Create New Version", "Create a new version of this estimate? The current version will be marked as expired.", createNewVersion); }

  async function createNewVersion() {
    setShowConfirmModal(false); setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${id}/new-version`, { method: "POST", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to create new version");
      router.push(`/invoicing/estimates/${(await res.json()).id}`);
    } catch (e) { setError(e.message); setSaving(false); }
  }

  async function cloneEstimate() {
    setShowActionsMenu(false); setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${id}/clone`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({}) });
      if (!res.ok) throw new Error("Failed to clone estimate");
      router.push(`/invoicing/estimates/${(await res.json()).id}`);
    } catch (e) { setError(e.message); setSaving(false); }
  }

  function openTemplateModal() { setShowActionsMenu(false); setTemplateName(""); setShowTemplateModal(true); }

  async function saveAsTemplate() {
    if (!templateName.trim()) return;
    setShowTemplateModal(false); setSaving(true);
    try {
      const res = await fetch(`/api/estimate-templates/from-estimate/${id}`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ name: templateName.trim() }) });
      if (!res.ok) throw new Error("Failed to save as template");
      const t = await res.json();
      setSuccessMessage(`Template "${t.name}" created successfully!`);
      setShowSuccessModal(true);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  function showConfirm(title, message, onConfirm) { setConfirmConfig({ title, message, onConfirm }); setShowConfirmModal(true); }

  async function generatePDF() {
    setGeneratingPDF(true); setError("");
    try {
      const res = await fetch(`/api/estimates/${id}/generate-pdf`, { method: "POST", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to generate PDF");
      const data = await res.json();
      setEstimate(data.estimate);
      if (data.pdfUrl) window.open(data.pdfUrl, '_blank');
    } catch (e) { setError(e.message); }
    finally { setGeneratingPDF(false); }
  }

  async function downloadPDF() {
    try {
      const res = await fetch(`/api/estimates/${id}/pdf`, { headers: getAuthHeaders() });
      if (!res.ok) { await generatePDF(); return; }
      const data = await res.json();
      if (data.pdfUrl) window.open(data.pdfUrl, '_blank');
    } catch (e) { setError(e.message); }
  }

  async function sendEstimate() {
    if (!emailTo) { setError("Recipient email is required"); return; }
    setSendingEmail(true); setError("");
    try {
      const res = await fetch(`/api/estimates/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ toEmail: emailTo, ccEmails: emailCc ? emailCc.split(',').map(e => e.trim()).filter(e => e) : [], customMessage: emailMessage, attachProductPDFs: true, regeneratePDF: !estimate?.pdfS3Key }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to send estimate"); }
      const data = await res.json();
      setEstimate(data.estimate);
      setShowSendModal(false); setEmailTo(""); setEmailCc(""); setEmailMessage("");
      setSuccessMessage("Estimate sent successfully!"); setShowSuccessModal(true);
    } catch (e) { setError(e.message); }
    finally { setSendingEmail(false); }
  }

  async function loadEmailHistory() {
    try { const r = await fetch(`/api/estimates/${id}/email-history`, { headers: getAuthHeaders() }); if (r.ok) setEmailHistory(await r.json()); } catch {}
  }

  const fmt     = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const fmtDT   = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

  const isExpired = estimate?.expiryDate && new Date(estimate.expiryDate) < new Date();

  const filteredProducts = products.filter(p => !productSearch || p.name?.toLowerCase().includes(productSearch.toLowerCase()) || p.sku?.toLowerCase().includes(productSearch.toLowerCase()));
  const filteredBundles  = bundles.filter(b => !productSearch || b.name?.toLowerCase().includes(productSearch.toLowerCase()));

  const inp = { padding: "8px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "rgba(255,255,255,0.9)", fontSize: "14px" };

  if (authLoading || !user) return null;

  if (loading) return (
    <><InvoicingNav /><div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}><div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>Loading estimate...</div></div></>
  );

  if (!estimate) return (
    <><InvoicingNav />
    <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
      <div style={{ textAlign: "center", padding: "60px 0" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>{error || "Estimate not found"}</p>
        <Link href="/invoicing/estimates" style={{ padding: "10px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", textDecoration: "none" }}>Back to Estimates</Link>
      </div>
    </div></>
  );

  const statusColor = STATUS_COLORS[estimate.status] || STATUS_COLORS.DRAFT;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <button type="button" onClick={() => navigateWithWarning("/invoicing/estimates")} style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, display: "block", marginBottom: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            ← Back to Estimates
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: "#dc2626", margin: 0 }}>{estimate.estimateNumber}</h1>
              {estimate.version > 1 && <span style={{ padding: "4px 8px", background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 6, color: "#a855f7", fontSize: 12, fontWeight: 500 }}>v{estimate.version}</span>}
              <span style={{ padding: "4px 12px", background: statusColor.bg, border: `1px solid ${statusColor.border}`, borderRadius: 6, color: statusColor.text, fontSize: 12, fontWeight: 500 }}>{estimate.status}</span>
              {isExpired && estimate.status !== 'ACCEPTED' && estimate.status !== 'DECLINED' && (
                <span style={{ padding: "4px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#ef4444", fontSize: 12 }}>Expired</span>
              )}
              {saving && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Saving…</span>}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => { setEmailTo(estimate?.customer?.email || ""); setShowSendModal(true); }} disabled={saving} style={{ padding: "8px 16px", background: "linear-gradient(135deg,#22c55e,#16a34a)", border: "none", borderRadius: 8, color: "white", cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 500 }}>Send to Customer</button>
              <button onClick={generatePDF} disabled={generatingPDF} style={{ padding: "8px 16px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 8, color: "#3b82f6", cursor: generatingPDF ? "not-allowed" : "pointer", fontSize: 14 }}>{generatingPDF ? "Generating..." : (estimate?.pdfS3Key ? "View PDF" : "Generate PDF")}</button>
              <div style={{ position: "relative" }} ref={actionsRef}>
                <button onClick={() => setShowActionsMenu(!showActionsMenu)} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>Actions <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg></button>
                {showActionsMenu && (
                  <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, minWidth: 180, zIndex: 100, overflow: "hidden" }}>
                    {estimate.status === 'DRAFT' && <button onClick={() => updateStatus('SENT')} style={{ width: "100%", padding: "10px 14px", background: "transparent", border: "none", color: "#3b82f6", textAlign: "left", cursor: "pointer", fontSize: 14 }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Mark as Sent</button>}
                    {estimate.status !== 'ACCEPTED' && estimate.status !== 'CONVERTED' && <button onClick={() => updateStatus('ACCEPTED')} style={{ width: "100%", padding: "10px 14px", background: "transparent", border: "none", color: "#22c55e", textAlign: "left", cursor: "pointer", fontSize: 14 }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Mark Accepted</button>}
                    {estimate.status !== 'DECLINED' && estimate.status !== 'CONVERTED' && <button onClick={() => updateStatus('DECLINED')} style={{ width: "100%", padding: "10px 14px", background: "transparent", border: "none", color: "#ef4444", textAlign: "left", cursor: "pointer", fontSize: 14 }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Mark Declined</button>}
                    <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "4px 0" }} />
                    <button onClick={confirmCreateNewVersion} style={{ width: "100%", padding: "10px 14px", background: "transparent", border: "none", color: "#a855f7", textAlign: "left", cursor: "pointer", fontSize: 14 }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>New Version</button>
                    <button onClick={cloneEstimate} style={{ width: "100%", padding: "10px 14px", background: "transparent", border: "none", color: "rgba(255,255,255,0.9)", textAlign: "left", cursor: "pointer", fontSize: 14 }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Clone Estimate</button>
                    <button onClick={openTemplateModal} style={{ width: "100%", padding: "10px 14px", background: "transparent", border: "none", color: "rgba(255,255,255,0.9)", textAlign: "left", cursor: "pointer", fontSize: 14 }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Save as Template</button>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "4px 0" }} />
                    <button onClick={confirmDeleteEstimate} style={{ width: "100%", padding: "10px 14px", background: "transparent", border: "none", color: "#ef4444", textAlign: "left", cursor: "pointer", fontSize: 14 }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Delete Estimate</button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 4 }}>Created by {estimate.createdBy?.name} on {fmtDate(estimate.createdAt)}</p>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", marginBottom: 20, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {error}
            <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
        )}

        {/* Info Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 8 }}>Customer</div>
            {estimate.customer ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{estimate.customer.firstName} {estimate.customer.lastName}</div>
                {(estimate.customer.company || estimate.customer.companyName) && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{estimate.customer.company || estimate.customer.companyName}</div>}
                {estimate.customer.email && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{estimate.customer.email}</div>}
              </>
            ) : <div style={{ color: "rgba(255,255,255,0.4)" }}>No customer assigned</div>}
          </div>

          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 8 }}>Dates</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Created</span><span style={{ fontSize: 13, color: "rgba(255,255,255,0.9)" }}>{fmtDate(estimate.estimateDate)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Expires</span><span style={{ fontSize: 13, color: isExpired ? "#ef4444" : "rgba(255,255,255,0.9)" }}>{fmtDate(estimate.expiryDate)}</span></div>
              {estimate.sentAt && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Sent</span><span style={{ fontSize: 13, color: "#3b82f6" }}>{fmtDate(estimate.sentAt)}</span></div>}
            </div>
          </div>

          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 8 }}>Tracking</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Views</span><span style={{ fontSize: 13, color: "rgba(255,255,255,0.9)" }}>{estimate.viewCount || 0}</span></div>
              {estimate.viewedAt && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>First View</span><span style={{ fontSize: 13, color: "#a855f7" }}>{fmtDate(estimate.viewedAt)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>PDF</span>
                {estimate.pdfS3Key ? <button onClick={downloadPDF} style={{ padding: "2px 8px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 4, color: "#22c55e", cursor: "pointer", fontSize: 11 }}>Download</button> : <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Not generated</span>}
              </div>
            </div>
          </div>

          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 8 }}>Total</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#dc2626" }}>{fmt(estimate.total)}</div>
            {estimate.discountAmount > 0 && <div style={{ fontSize: 12, color: "#22c55e", marginTop: 4 }}>Includes {fmt(estimate.discountAmount)} discount</div>}
            {estimate.marginPercent != null && <div style={{ fontSize: 12, color: estimate.marginPercent > 30 ? "#22c55e" : estimate.marginPercent > 15 ? "#eab308" : "#ef4444", marginTop: 4 }}>Margin: {estimate.marginPercent?.toFixed(1)}%</div>}
          </div>
        </div>

        {/* Line Items */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.9)", margin: 0 }}>Line Items ({estimate.items?.length || 0})</h2>
            {editMode ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Drag rows to reorder</span>
                <button onClick={() => setEditMode(false)} style={{ padding: "6px 12px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 6, color: "#22c55e", cursor: "pointer", fontSize: 13 }}>Done Editing</button>
              </div>
            ) : estimate.status === 'DRAFT' && (
              <button onClick={() => setEditMode(true)} style={{ padding: "6px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: 13 }}>Edit Items</button>
            )}
          </div>

          {/* Add Product/Bundle search */}
          {editMode && (
            <div style={{ position: "relative", marginBottom: 16 }}>
              <input type="text" placeholder="Search products or bundles to add..." value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }} onFocus={() => setShowProductDropdown(true)} style={{ ...inp, width: "100%" }} />
              {showProductDropdown && (filteredProducts.length > 0 || filteredBundles.length > 0) && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, marginTop: 4, maxHeight: 300, overflow: "auto", zIndex: 100 }}>
                  {filteredBundles.length > 0 && (
                    <>
                      <div style={{ padding: "8px 14px", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Bundles</div>
                      {filteredBundles.map(b => (
                        <div key={`b-${b.id}`} onClick={() => addBundle(b)} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <div><div style={{ fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{b.name}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{b.itemCount || b.items?.length || 0} items</div></div>
                          <div style={{ color: "#dc2626", fontWeight: 600 }}>{fmt(b.price)}</div>
                        </div>
                      ))}
                    </>
                  )}
                  {filteredProducts.length > 0 && (
                    <>
                      <div style={{ padding: "8px 14px", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Products</div>
                      {filteredProducts.map(p => (
                        <div key={`p-${p.id}`} onClick={() => addProduct(p)} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <div><div style={{ fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{p.name}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{p.sku}</div></div>
                          <div style={{ color: "#dc2626", fontWeight: 600 }}>{fmt(p.price)}</div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {estimate.items && estimate.items.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  {editMode && <th style={{ padding: "12px 8px", width: 32 }}></th>}{/* grip */}
                  <th style={{ padding: "12px 8px", width: 30 }}></th>{/* expand */}
                  <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Item</th>
                  <th style={{ padding: "12px 8px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500, width: 100 }}>Qty</th>
                  <th style={{ padding: "12px 8px", textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500, width: 140 }}>Price</th>
                  <th style={{ padding: "12px 8px", textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500, width: 140 }}>Total</th>
                  {editMode && <th style={{ padding: "12px 8px", width: 40 }}></th>}{/* delete */}
                </tr>
              </thead>
              <tbody>
                {estimate.items.map((item, itemIndex) => {
                  const isDragging   = dragIndex === itemIndex;
                  const isDropTarget = dragOverIndex === itemIndex && dragIndex !== itemIndex;
                  const gripHovered  = hoveredGripIndex === itemIndex;
                  return (
                    <>
                      <tr
                        key={item.id}
                        draggable={editMode}
                        onDragStart={editMode ? (e) => handleDragStart(e, itemIndex) : undefined}
                        onDragOver={editMode  ? (e) => handleDragOver(e, itemIndex)  : undefined}
                        onDrop={editMode      ? (e) => handleDrop(e, itemIndex)      : undefined}
                        onDragEnd={editMode   ? handleDragEnd                         : undefined}
                        style={{
                          borderBottom: expandedItems[item.id] ? "none" : "1px solid rgba(255,255,255,0.05)",
                          borderTop: isDropTarget ? "2px solid #dc2626" : "2px solid transparent",
                          opacity: isDragging ? 0.35 : 1,
                          background: isDropTarget ? "rgba(220,38,38,0.04)" : "transparent",
                          transition: "opacity 0.15s, background 0.1s",
                        }}
                      >
                        {/* Drag grip — only shown in edit mode */}
                        {editMode && (
                          <td
                            onMouseDown={() => { dragFromHandleRef.current = true; }}
                            onMouseUp={()   => { dragFromHandleRef.current = false; }}
                            onMouseEnter={() => setHoveredGripIndex(itemIndex)}
                            onMouseLeave={() => setHoveredGripIndex(null)}
                            style={{
                              padding: "8px 4px",
                              verticalAlign: "middle",
                              cursor: "grab",
                              userSelect: "none",
                              textAlign: "center",
                              width: 32,
                              background: gripHovered ? "rgba(255,255,255,0.06)" : "transparent",
                              borderRadius: 4,
                              transition: "background 0.1s",
                            }}
                          >
                            <GripIcon color={gripHovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)"} />
                          </td>
                        )}

                        {/* Expand toggle */}
                        <td style={{ padding: "14px 8px", verticalAlign: "top" }}>
                          <button type="button" onClick={() => toggleItemExpand(item.id)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12, padding: 4, transform: expandedItems[item.id] ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▶</button>
                        </td>

                        {/* Name */}
                        <td style={{ padding: "14px 8px" }}>
                          {editMode ? (
                            <input type="text" value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} style={{ ...inp, width: "100%", padding: "6px 10px" }} />
                          ) : (
                            <div style={{ fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{item.name}</div>
                          )}
                          {item.sku && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{item.sku}</div>}
                          {item.fromBundleName && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>From: {item.fromBundleName}</div>}
                          {item.description && !expandedItems[item.id] && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2, fontStyle: "italic" }}>{item.description.length > 80 ? item.description.substring(0, 80) + "..." : item.description}</div>}
                        </td>

                        {/* Qty */}
                        <td style={{ padding: "14px 8px", textAlign: "center", verticalAlign: "top" }}>
                          {editMode ? <input type="number" value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: parseFloat(e.target.value) || 1 })} style={{ ...inp, width: 70, textAlign: "center", padding: "6px 8px" }} min="1" /> : <span style={{ color: "rgba(255,255,255,0.7)" }}>{item.quantity}</span>}
                        </td>

                        {/* Price */}
                        <td style={{ padding: "14px 8px", textAlign: "right", verticalAlign: "top" }}>
                          {editMode ? <input type="number" value={item.unitPrice} onChange={(e) => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })} style={{ ...inp, width: 100, textAlign: "right", padding: "6px 8px" }} step="0.01" /> : <span style={{ color: "rgba(255,255,255,0.7)" }}>{fmt(item.unitPrice)}</span>}
                        </td>

                        {/* Total */}
                        <td style={{ padding: "14px 8px", textAlign: "right", fontWeight: 600, color: "rgba(255,255,255,0.9)", verticalAlign: "top" }}>{fmt(item.amount || item.quantity * item.unitPrice)}</td>

                        {/* Delete */}
                        {editMode && (
                          <td style={{ padding: "14px 8px", textAlign: "center", verticalAlign: "top" }}>
                            <button onClick={() => confirmDeleteItem(item.id)} disabled={saving} title="Remove" style={{ background: "transparent", border: "none", color: "#ef4444", cursor: saving ? "not-allowed" : "pointer", fontSize: 18, padding: 4 }}>×</button>
                          </td>
                        )}
                      </tr>

                      {/* Expanded detail row */}
                      {expandedItems[item.id] && (
                        <tr key={`${item.id}-details`} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          {editMode && <td></td>}
                          <td></td>
                          <td colSpan={editMode ? 5 : 4} style={{ padding: "0 8px 16px 8px" }}>
                            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 16, marginTop: 4 }}>
                              {editMode ? (
                                <>
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                                    <div>
                                      <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Short Name</label>
                                      <input type="text" value={item.sku || ""} onChange={(e) => updateItem(item.id, { sku: e.target.value })} style={{ ...inp, width: "100%", padding: "6px 10px", fontSize: 13 }} placeholder="e.g. SL50AAS-VFD" />
                                    </div>
                                    <div>
                                      <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Unit Cost</label>
                                      <input type="number" value={item.unitCost || ""} onChange={(e) => updateItem(item.id, { unitCost: parseFloat(e.target.value) || null })} style={{ ...inp, width: "100%", padding: "6px 10px", fontSize: 13 }} step="0.01" placeholder="$0.00" />
                                    </div>
                                    <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
                                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>
                                        <input type="checkbox" checked={item.taxable !== false} onChange={(e) => updateItem(item.id, { taxable: e.target.checked })} style={{ cursor: "pointer" }} />
                                        Taxable
                                      </label>
                                      {item.unitCost && item.unitPrice > 0 && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Margin: {((1 - item.unitCost / item.unitPrice) * 100).toFixed(1)}%</span>}
                                    </div>
                                  </div>
                                  <div>
                                    <label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Description</label>
                                    <textarea value={item.description || ""} onChange={(e) => updateItem(item.id, { description: e.target.value })} style={{ ...inp, width: "100%", padding: "8px 10px", fontSize: 13, minHeight: 80, resize: "vertical", boxSizing: "border-box" }} placeholder="Enter item description..." />
                                  </div>
                                </>
                              ) : (
                                <>
                                  {item.description ? <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, whiteSpace: "pre-wrap", marginBottom: 12 }}>{item.description}</div> : <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontStyle: "italic", marginBottom: 12 }}>No description</div>}
                                  <div style={{ display: "flex", gap: 32, fontSize: 12 }}>
                                    {item.sku && <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Short Name: </span><span style={{ color: "rgba(255,255,255,0.7)" }}>{item.sku}</span></div>}
                                    {item.unitCost && <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Cost: </span><span style={{ color: "rgba(255,255,255,0.7)" }}>{fmt(item.unitCost)}</span></div>}
                                    {item.unitCost && item.unitPrice > 0 && <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Margin: </span><span style={{ color: ((1 - item.unitCost / item.unitPrice) * 100) > 30 ? "#22c55e" : ((1 - item.unitCost / item.unitPrice) * 100) > 15 ? "#eab308" : "#ef4444" }}>{((1 - item.unitCost / item.unitPrice) * 100).toFixed(1)}%</span></div>}
                                    <div><span style={{ color: "rgba(255,255,255,0.4)" }}>Taxable: </span><span style={{ color: "rgba(255,255,255,0.7)" }}>{item.taxable !== false ? "Yes" : "No"}</span></div>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)" }}>
                  <td colSpan={editMode ? 4 : 3}></td>
                  <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Subtotal</td>
                  <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 14, color: "rgba(255,255,255,0.9)" }}>{fmt(estimate.subtotal)}</td>
                  {editMode && <td></td>}
                </tr>
                {estimate.discountAmount > 0 && (
                  <tr>
                    <td colSpan={editMode ? 4 : 3}></td>
                    <td style={{ padding: "8px", textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Discount</td>
                    <td style={{ padding: "8px", textAlign: "right", fontSize: 14, color: "#22c55e" }}>-{fmt(estimate.discountAmount)}</td>
                    {editMode && <td></td>}
                  </tr>
                )}
                {estimate.taxAmount > 0 && (
                  <tr>
                    <td colSpan={editMode ? 4 : 3}></td>
                    <td style={{ padding: "8px", textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Tax ({estimate.taxRate}%)</td>
                    <td style={{ padding: "8px", textAlign: "right", fontSize: 14, color: "rgba(255,255,255,0.9)" }}>{fmt(estimate.taxAmount)}</td>
                    {editMode && <td></td>}
                  </tr>
                )}
                {estimate.shippingAmount > 0 && (
                  <tr>
                    <td colSpan={editMode ? 4 : 3}></td>
                    <td style={{ padding: "8px", textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Shipping</td>
                    <td style={{ padding: "8px", textAlign: "right", fontSize: 14, color: "rgba(255,255,255,0.9)" }}>{fmt(estimate.shippingAmount)}</td>
                    {editMode && <td></td>}
                  </tr>
                )}
                <tr>
                  <td colSpan={editMode ? 4 : 3}></td>
                  <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>Total</td>
                  <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 20, fontWeight: 700, color: "#dc2626" }}>{fmt(estimate.total)}</td>
                  {editMode && <td></td>}
                </tr>
              </tfoot>
            </table>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.4)" }}>No items in this estimate</div>
          )}
        </div>

        {/* Notes & History */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
          {(estimate.notes || estimate.internalNotes || estimate.termsConditions) && (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.9)", margin: 0, marginBottom: 16 }}>Notes</h2>
              {estimate.notes && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Customer Notes:</div><div style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>{estimate.notes}</div></div>}
              {estimate.internalNotes && <div style={{ marginBottom: 16, padding: 12, background: "rgba(234,179,8,0.1)", borderRadius: 6 }}><div style={{ fontSize: 12, color: "#eab308", marginBottom: 4 }}>Internal Notes:</div><div style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>{estimate.internalNotes}</div></div>}
              {estimate.termsConditions && <div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Terms & Conditions:</div><div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, whiteSpace: "pre-wrap" }}>{estimate.termsConditions}</div></div>}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {estimate.invoices && estimate.invoices.length > 0 && (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", margin: 0, marginBottom: 12, textTransform: "uppercase" }}>Related Invoices</h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {estimate.invoices.map(inv => (
                    <Link key={inv.id} href={`/invoicing/invoices/${inv.id}`} style={{ display: "block", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, textDecoration: "none" }}>
                      <div style={{ color: "#dc2626", fontFamily: "monospace" }}>{inv.invoiceNumber}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{inv.status}</div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showEmailHistory ? 12 : 0 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", margin: 0, textTransform: "uppercase" }}>Email History</h3>
                <button onClick={() => { setShowEmailHistory(!showEmailHistory); if (!showEmailHistory) loadEmailHistory(); }} style={{ padding: "4px 8px", background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12 }}>{showEmailHistory ? "Hide" : "Show"}</button>
              </div>
              {showEmailHistory && (
                <div style={{ display: "grid", gap: 8 }}>
                  {emailHistory.length === 0 ? <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>No emails sent yet</div>
                  : emailHistory.map(em => (
                    <div key={em.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 13 }}>{em.toEmail}</div>
                        {em.openedAt && <span style={{ padding: "2px 6px", background: "rgba(34,197,94,0.1)", borderRadius: 4, fontSize: 10, color: "#22c55e" }}>Opened</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Sent {fmtDT(em.sentAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showVersions ? 12 : 0 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", margin: 0, textTransform: "uppercase" }}>Versions</h3>
                <button onClick={() => { setShowVersions(!showVersions); if (!showVersions) loadVersions(); }} style={{ padding: "4px 8px", background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12 }}>{showVersions ? "Hide" : "Show"}</button>
              </div>
              {showVersions && (
                <div style={{ display: "grid", gap: 8 }}>
                  {versions.length === 0 ? <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>No other versions</div>
                  : versions.map(v => (
                    <Link key={v.id} href={`/invoicing/estimates/${v.id}`} style={{ display: "block", padding: "10px 12px", background: v.id === id ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.03)", border: v.id === id ? "1px solid rgba(220,38,38,0.3)" : "1px solid rgba(255,255,255,0.05)", borderRadius: 6, textDecoration: "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ color: "#dc2626", fontFamily: "monospace", fontSize: 13 }}>{v.estimateNumber}</div>
                        <span style={{ padding: "2px 6px", background: STATUS_COLORS[v.status]?.bg || "rgba(156,163,175,0.1)", borderRadius: 4, fontSize: 10, color: STATUS_COLORS[v.status]?.text || "#9ca3af" }}>{v.status}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{fmtDate(v.estimateDate)}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Send Email Modal */}
      {showSendModal && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Send Estimate</h2>
            <div className="modal-form-group"><label>To *</label><input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="customer@example.com" /></div>
            <div className="modal-form-group"><label>CC (comma-separated)</label><input type="text" value={emailCc} onChange={e => setEmailCc(e.target.value)} placeholder="copy@example.com" /></div>
            <div className="modal-form-group"><label>Message (optional)</label><textarea value={emailMessage} onChange={e => setEmailMessage(e.target.value)} placeholder="Add a personal message..." rows={4} /></div>
            {error && <div className="modal-error">{error}</div>}
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => { setShowSendModal(false); setError(""); }}>Cancel</button>
              <button className="modal-btn primary" onClick={sendEstimate} disabled={sendingEmail || !emailTo}>{sendingEmail ? "Sending..." : "Send Estimate"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {showTemplateModal && (
        <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Save as Template</h2>
            <div className="modal-form-group"><label>Template Name *</label><input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Enter a name for this template" autoFocus /></div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowTemplateModal(false)}>Cancel</button>
              <button className="modal-btn primary" onClick={saveAsTemplate} disabled={!templateName.trim()}>Save Template</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{confirmConfig.title}</h2>
            <p className="modal-confirm-text">{confirmConfig.message}</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button className="modal-btn danger" onClick={confirmConfig.onConfirm}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="modal-overlay" onClick={() => setShowSuccessModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Success</h2>
            <div className="modal-success">{successMessage}</div>
            <div className="modal-actions"><button className="modal-btn primary" onClick={() => setShowSuccessModal(false)}>OK</button></div>
          </div>
        </div>
      )}
    </>
  );
}
