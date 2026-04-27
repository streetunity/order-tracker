"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, Fragment } from "react";
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

const STATUS_DOT = {
  DRAFT: '#9ca3af', SENT: '#3b82f6', VIEWED: '#a855f7',
  ACCEPTED: '#22c55e', DECLINED: '#ef4444', EXPIRED: '#eab308', CONVERTED: '#14b8a6',
};

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

  const [generatingPDF,    setGeneratingPDF]    = useState(false);
  const [sendingEmail,     setSendingEmail]     = useState(false);
  const [showSendModal,    setShowSendModal]    = useState(false);
  const [emailTo,          setEmailTo]          = useState("");
  const [emailCc,          setEmailCc]          = useState("");
  const [emailMessage,     setEmailMessage]     = useState("");
  const [emailHistory,     setEmailHistory]     = useState([]);
  const [showEmailHistory, setShowEmailHistory] = useState(false);

  const [products,           setProducts]           = useState([]);
  const [bundles,            setBundles]            = useState([]);
  const [productSearch,      setProductSearch]      = useState("");
  const [showProductDropdown,setShowProductDropdown]= useState(false);
  const [expandedItems,      setExpandedItems]      = useState({});

  const [dragIndex,        setDragIndex]        = useState(null);
  const [dragOverIndex,    setDragOverIndex]    = useState(null);
  const [hoveredGripIndex, setHoveredGripIndex] = useState(null);
  const dragFromHandleRef = useRef(false);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName,      setTemplateName]      = useState("");
  const [showConfirmModal,  setShowConfirmModal]  = useState(false);
  const [confirmConfig,     setConfirmConfig]     = useState({ title: "", message: "", onConfirm: null });
  const [showSuccessModal,  setShowSuccessModal]  = useState(false);
  const [successMessage,    setSuccessMessage]    = useState("");
  const [showActionsMenu,   setShowActionsMenu]   = useState(false);
  const actionsRef = useRef(null);

  // Sidebar state
  const [allEstimates,   setAllEstimates]   = useState([]);
  const [sidebarLoading, setSidebarLoading] = useState(true);
  const [sidebarSearch,  setSidebarSearch]  = useState("");
  const [sidebarStatus,  setSidebarStatus]  = useState("all");
  const [sidebarSortBy,  setSidebarSortBy]  = useState("date");

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

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    loadEstimate();
    loadProducts();
    loadBundles();
    loadAllEstimates();
  }, [user, router, id]);

  function navigateWithWarning(url) {
    if (editMode) globalNavigateWithWarning(url, router);
    else router.push(url);
  }

  const toggleItemExpand = (itemId) => setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));

  async function loadAllEstimates() {
    setSidebarLoading(true);
    try {
      const r = await fetch("/api/estimates", { headers: getAuthHeaders() });
      if (r.ok) {
        const d = await r.json();
        setAllEstimates(Array.isArray(d) ? d : (d.estimates || []));
      }
    } catch {}
    finally { setSidebarLoading(false); }
  }

  async function loadEstimate() {
    try {
      const res = await fetch(`/api/estimates/${id}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        if (res.status === 404) { setError("Estimate not found"); setLoading(false); return; }
        throw new Error("Failed to load estimate");
      }
      setEstimate(await res.json());
    } catch { setError("Failed to load estimate"); }
    finally { setLoading(false); }
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
      setEstimate((await res.json()).estimate);
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
      setEstimate((await res.json()).estimate);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

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
    setDragIndex(null); setDragOverIndex(null);
    if (fromIndex === null || fromIndex === dropIndex) return;
    const newItems = [...estimate.items];
    const [moved] = newItems.splice(fromIndex, 1);
    newItems.splice(dropIndex, 0, moved);
    setEstimate(prev => ({ ...prev, items: newItems }));
    setExpandedItems({});
    setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${id}/items/reorder`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify({ itemIds: newItems.map(i => i.id) }) });
      if (!res.ok) throw new Error("Failed to reorder items");
      setEstimate(await res.json());
    } catch (e) { setError(e.message); loadEstimate(); }
    finally { setSaving(false); }
  }
  function handleDragEnd() { dragFromHandleRef.current = false; setDragIndex(null); setDragOverIndex(null); }

  function confirmDeleteItem(itemId) { showConfirm("Remove Item", "Are you sure you want to remove this item?", () => deleteItem(itemId)); }
  async function deleteItem(itemId) {
    setShowConfirmModal(false); setSaving(true);
    try {
      const res = await fetch(`/api/estimates/${id}/items/${itemId}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to delete item");
      setEstimate((await res.json()).estimate);
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
  const panelStyle = { background: "linear-gradient(180deg,#1d1d1d,#151515 48%,#111)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 16, boxShadow: "0 16px 36px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.07)" };
  const getItemImageUrl = (item) => {
    const attachment = item.attachments?.find?.(a => a.mimeType?.startsWith?.("image/") || a.contentType?.startsWith?.("image/") || a.fileType?.startsWith?.("image/")) || item.product?.attachments?.find?.(a => a.mimeType?.startsWith?.("image/") || a.contentType?.startsWith?.("image/") || a.fileType?.startsWith?.("image/"));
    return item.imageUrl || item.thumbnailUrl || item.product?.imageUrl || item.product?.thumbnailUrl || attachment?.url || attachment?.fileUrl || attachment?.downloadUrl || attachment?.signedUrl || null;
  };

  if (authLoading || !user) return null;

  const filteredSidebarEstimates = allEstimates
    .filter(e => {
      if (sidebarStatus !== "all" && e.status !== sidebarStatus) return false;
      if (sidebarSearch.trim()) {
        const q = sidebarSearch.toLowerCase();
        return (
          e.estimateNumber?.toLowerCase().includes(q) ||
          e.customer?.firstName?.toLowerCase().includes(q) ||
          e.customer?.lastName?.toLowerCase().includes(q) ||
          e.customer?.companyName?.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) =>
      sidebarSortBy === "amount"
        ? (b.total || 0) - (a.total || 0)
        : new Date(b.createdAt) - new Date(a.createdAt)
    );

  const sidebarJSX = (
    <div style={{ width: 300, minWidth: 300, flexShrink: 0, position: "sticky", top: 0, height: "calc(100vh - 64px)", background: "linear-gradient(180deg,#171717,#111)", borderRight: "1px solid rgba(255,255,255,0.1)", boxShadow: "18px 0 44px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflowY: "hidden" }}>
      <style>{`
        .esb-header{padding:18px 14px 12px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;background:radial-gradient(circle at 20% 0%,rgba(220,38,38,0.12),transparent 180px)}
        .esb-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
        .esb-title h2{font-size:18px;font-weight:700;color:#dc2626;margin:0}
        .esb-new-btn{display:flex;align-items:center;justify-content:center;width:30px;height:30px;background:linear-gradient(135deg,#dc2626,#991b1b);border:1px solid rgba(255,255,255,0.14);border-radius:7px;color:#fff;font-size:18px;text-decoration:none;line-height:1;cursor:pointer;box-shadow:0 10px 24px rgba(220,38,38,0.22),inset 0 1px 0 rgba(255,255,255,0.18);transition:filter 0.15s,transform 0.15s}
        .esb-new-btn:hover{filter:brightness(1.08);transform:translateY(-1px)}
        .esb-search{width:100%;padding:9px 12px;background:linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.045));border:1px solid rgba(255,255,255,0.14);border-radius:8px;color:rgba(255,255,255,0.9);font-size:13px;outline:none;box-sizing:border-box;margin-bottom:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.05)}
        .esb-search:focus{border-color:rgba(220,38,38,0.5)}
        .esb-search::placeholder{color:rgba(255,255,255,0.35)}
        .esb-filters{display:flex;gap:6px}
        .esb-filter-sel{flex:1;padding:6px 8px;background:#242424;border:1px solid rgba(255,255,255,0.13);border-radius:7px;color:rgba(255,255,255,0.85);font-size:12px;outline:none;cursor:pointer}
        .esb-filter-sel:focus{border-color:rgba(220,38,38,0.4)}
        .esb-sort-bar{display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0}
        .esb-sort-btn{flex:1;padding:4px 6px;background:transparent;border:1px solid transparent;border-radius:5px;color:rgba(255,255,255,0.4);font-size:11px;cursor:pointer;text-align:center;transition:all 0.12s}
        .esb-sort-btn:hover{color:rgba(255,255,255,0.7)}
        .esb-sort-btn.active{background:rgba(220,38,38,0.1);border-color:rgba(220,38,38,0.25);color:#dc2626}
        .esb-list{flex:1;overflow-y:auto;padding:8px}
        .esb-list::-webkit-scrollbar{width:6px}
        .esb-list::-webkit-scrollbar-track{background:transparent}
        .esb-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:3px}
        .esb-list::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.25)}
        .esb-item{padding:12px 12px;cursor:pointer;border:1px solid rgba(255,255,255,0.08);border-left:3px solid transparent;border-radius:8px;transition:background 0.12s,border-color 0.12s,transform 0.12s,box-shadow 0.12s;text-decoration:none;display:block;margin-bottom:8px;background:linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02));box-shadow:0 10px 24px rgba(0,0,0,0.2)}
        .esb-item:hover{background:linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03));border-color:rgba(255,255,255,0.13);transform:translateY(-1px)}
        .esb-item.active{background:linear-gradient(135deg,rgba(220,38,38,0.18),rgba(38,38,38,0.94));border-color:rgba(220,38,38,0.36);border-left-color:#dc2626;box-shadow:0 18px 34px rgba(220,38,38,0.12),0 10px 30px rgba(0,0,0,0.28)}
        .esb-item-num{font-size:12px;font-weight:600;color:rgba(255,255,255,0.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:monospace}
        .esb-item.active .esb-item-num{color:#fff}
        .esb-item-cust{font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .esb-item-foot{display:flex;align-items:center;justify-content:space-between;margin-top:3px}
        .esb-item-amt{font-size:11px;color:rgba(255,255,255,0.5)}
        .esb-item-status{display:flex;align-items:center;gap:3px;font-size:10px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.3px}
        .esb-count{padding:6px 14px;font-size:11px;color:rgba(255,255,255,0.3);text-align:center;border-top:1px solid rgba(255,255,255,0.05);flex-shrink:0}
      `}</style>

      <div className="esb-header">
        <div className="esb-title">
          <h2>Estimates</h2>
          <Link href="/invoicing/estimates/new" className="esb-new-btn" title="New Estimate">+</Link>
        </div>
        <input type="text" placeholder="Search estimates..." value={sidebarSearch} onChange={e => setSidebarSearch(e.target.value)} className="esb-search" />
        <div className="esb-filters">
          <select value={sidebarStatus} onChange={e => setSidebarStatus(e.target.value)} className="esb-filter-sel">
            <option value="all">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="VIEWED">Viewed</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="DECLINED">Declined</option>
            <option value="EXPIRED">Expired</option>
            <option value="CONVERTED">Converted</option>
          </select>
        </div>
      </div>

      <div className="esb-sort-bar">
        {[["date","Date"],["amount","Amount"]].map(([key,label]) => (
          <button key={key} className={`esb-sort-btn${sidebarSortBy === key ? ' active' : ''}`} onClick={() => setSidebarSortBy(key)}>{label}</button>
        ))}
      </div>

      <div className="esb-list">
        {sidebarLoading ? (
          <div style={{ padding: "20px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading...</div>
        ) : filteredSidebarEstimates.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No estimates</div>
        ) : filteredSidebarEstimates.map(e => {
          const isActive = e.id === id;
          const custName = e.customer?.companyName || [e.customer?.firstName, e.customer?.lastName].filter(Boolean).join(" ") || "No customer";
          const dot = STATUS_DOT[e.status] || "#9ca3af";
          return (
            <Link key={e.id} href={`/invoicing/estimates/${e.id}`} className={`esb-item${isActive ? ' active' : ''}`}>
              <div className="esb-item-num">{e.estimateNumber}</div>
              <div className="esb-item-cust">{custName}</div>
              <div className="esb-item-foot">
                <span className="esb-item-amt">{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(e.total||0)}</span>
                <span className="esb-item-status">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, display: "inline-block", flexShrink: 0 }} />
                  {e.status}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="esb-count">{filteredSidebarEstimates.length} estimate{filteredSidebarEstimates.length !== 1 ? 's' : ''}</div>
    </div>
  );

  if (loading) return (
    <>
      <InvoicingNav />
      <div style={{ display: "flex", minHeight: "calc(100vh - 64px)", background: "#0f0f0f" }}>
        {sidebarJSX}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>Loading estimate…</div>
        </div>
      </div>
    </>
  );

  if (!estimate) return (
    <>
      <InvoicingNav />
      <div style={{ display: "flex", minHeight: "calc(100vh - 64px)", background: "#0f0f0f" }}>
        {sidebarJSX}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>{error || "Estimate not found"}</p>
            <Link href="/invoicing/estimates" style={{ padding: "10px 20px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.9)", textDecoration: "none" }}>Back to Estimates</Link>
          </div>
        </div>
      </div>
    </>
  );

  const statusColor = STATUS_COLORS[estimate.status] || STATUS_COLORS.DRAFT;
  const customerName = estimate.customer?.companyName || estimate.customer?.company || [estimate.customer?.firstName, estimate.customer?.lastName].filter(Boolean).join(" ") || "Customer";

  return (
    <>
      <InvoicingNav />
      <div style={{ display: "flex", minHeight: "calc(100vh - 64px)", background: "radial-gradient(circle at 18% 0%, rgba(220,38,38,0.11), transparent 420px), radial-gradient(circle at 100% 8%, rgba(255,255,255,0.045), transparent 360px), #0f0f0f" }}>
        {sidebarJSX}
        <div style={{ flex: 1, minWidth: 0, padding: "16px 18px 48px", overflowX: "hidden" }}>
          <style>{`
            .estimate-detail-shell button{transition:filter .15s,transform .15s,background .15s,border-color .15s}
            .estimate-detail-shell button:hover:not(:disabled){filter:brightness(1.08)}
            .estimate-hero-card{background:linear-gradient(180deg,#1d1d1d,#151515 48%,#111);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:14px 18px;margin-bottom:10px;box-shadow:0 14px 32px rgba(0,0,0,0.34),inset 0 1px 0 rgba(255,255,255,0.07)}
            .estimate-kpi-icon{width:42px;height:42px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(220,38,38,0.32);background:rgba(220,38,38,0.08);color:#ef4444;font-size:17px;box-shadow:0 0 20px rgba(220,38,38,0.1);flex-shrink:0}
            .estimate-summary-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;margin-bottom:10px;padding:13px 16px !important}
            .estimate-summary-cell{display:grid;grid-template-columns:38px 1fr;gap:10px;align-items:center;padding:0 16px;border-left:1px solid rgba(255,255,255,0.09)}
            .estimate-summary-cell:first-child{border-left:0;padding-left:0}
            .estimate-summary-icon{width:36px;height:36px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(220,38,38,0.26);background:rgba(220,38,38,0.065);color:#ef4444;font-size:13px}
            .estimate-summary-label{font-size:12px;color:rgba(255,255,255,0.52);margin-bottom:3px}
            .estimate-summary-value{font-size:17px;font-weight:700;color:#fff;line-height:1.12}
            .estimate-summary-sub{font-size:11px;color:#ef4444;margin-top:2px}
            .estimate-action-btn{height:38px;padding:0 14px;background:linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.035));border:1px solid rgba(255,255,255,0.14);border-radius:6px;color:rgba(255,255,255,0.9);cursor:pointer;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:8px;box-shadow:0 10px 22px rgba(0,0,0,0.24),inset 0 1px 0 rgba(255,255,255,0.08)}
            .estimate-action-primary{background:linear-gradient(180deg,#dc2626,#991b1b);border-color:rgba(255,255,255,0.18);color:#fff;box-shadow:0 14px 28px rgba(220,38,38,0.24),inset 0 1px 0 rgba(255,255,255,0.18)}
            .estimate-action-menu{position:absolute;right:0;top:calc(100% + 6px);min-width:190px;background:#171717;border:1px solid rgba(255,255,255,0.13);border-radius:8px;overflow:hidden;z-index:100;box-shadow:0 22px 48px rgba(0,0,0,0.5)}
            .estimate-action-menu button{width:100%;padding:10px 13px !important;background:transparent !important;border:0 !important;color:rgba(255,255,255,0.82) !important;font-size:13px !important;text-align:left !important;cursor:pointer}
            .estimate-action-menu button:hover{background:rgba(255,255,255,0.06) !important;color:#fff !important}
            .estimate-icon{min-width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;color:currentColor}
            .estimate-line-panel{padding:0 !important;margin-bottom:14px !important;overflow:hidden}
            .estimate-line-head{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.1)}
            .estimate-tabs{display:flex;align-items:center;gap:18px}
            .estimate-tab{height:32px;display:inline-flex;align-items:center;border-bottom:2px solid transparent;color:rgba(255,255,255,0.62);font-weight:600;font-size:14px}
            .estimate-tab.active{color:#fff;border-bottom-color:#dc2626}
            .estimate-line-tools{display:flex;gap:8px;align-items:center}
            .estimate-line-table-wrap{padding:0 16px}
            .estimate-soft-table thead tr{background:linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.035))}
            .estimate-soft-table tbody tr{background:rgba(255,255,255,0.022)}
            .estimate-soft-table tbody tr:hover{background:rgba(255,255,255,0.045)}
            .estimate-thumb{width:34px;height:34px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.025));display:flex;align-items:center;justify-content:center;overflow:hidden;color:rgba(255,255,255,0.42);font-size:10px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.07)}
            .estimate-category-pill{display:inline-flex;align-items:center;padding:4px 9px;border:1px solid rgba(255,255,255,0.1);border-radius:5px;background:rgba(255,255,255,0.035);color:rgba(255,255,255,0.62);font-size:12px;white-space:nowrap}
            .estimate-thumb img{width:100%;height:100%;object-fit:cover;display:block}
            @media (max-width: 1280px){.estimate-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.estimate-hero-card > div{grid-template-columns:1fr !important}}
          `}</style>
          <div className="estimate-detail-shell">

          <div className="estimate-hero-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                <div className="estimate-kpi-icon">E</div>
                <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 style={{ fontSize: 29, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: 0 }}>{estimate.estimateNumber}</h1>
                {estimate.version > 1 && <span style={{ padding: "4px 8px", background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 6, color: "#a855f7", fontSize: 12, fontWeight: 500 }}>v{estimate.version}</span>}
                <span style={{ padding: "4px 12px", background: statusColor.bg, border: `1px solid ${statusColor.border}`, borderRadius: 6, color: statusColor.text, fontSize: 12, fontWeight: 500 }}>{estimate.status}</span>
                {isExpired && estimate.status !== 'ACCEPTED' && estimate.status !== 'DECLINED' && (
                  <span style={{ padding: "4px 12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, color: "#ef4444", fontSize: 12 }}>Expired</span>
                )}
                {saving && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Saving…</span>}
              </div>
                <div style={{ color: "#fff", fontSize: 15, fontWeight: 650, marginTop: 4 }}>{customerName}</div>
                <div style={{ color: "rgba(255,255,255,0.54)", fontSize: 12, marginTop: 3 }}>Created {fmtDate(estimate.createdAt)} by {estimate.createdBy?.name || "team"}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <div style={{ minWidth: 170, paddingLeft: 22, marginRight: 8, borderLeft: "1px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.52)", marginBottom: 4 }}>Total Amount</div>
                  <div style={{ fontSize: 23, fontWeight: 800, color: "#fff" }}>{fmt(estimate.total)}</div>
                </div>
                <button onClick={() => { setEmailTo(estimate?.customer?.email || ""); setShowSendModal(true); }} disabled={saving} className="estimate-action-btn estimate-action-primary"><span className="estimate-icon">&gt;</span>Send</button>
                <button onClick={generatePDF} disabled={generatingPDF} className="estimate-action-btn"><span className="estimate-icon">[]</span>{generatingPDF ? "Generating" : "PDF"}</button>
                <div style={{ position: "relative" }} ref={actionsRef}>
                  <button onClick={() => setShowActionsMenu(!showActionsMenu)} className="estimate-action-btn"><span className="estimate-icon">...</span>More</button>
                  {showActionsMenu && (
                    <div className="estimate-action-menu">
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
          </div>

          {error && (
            <div style={{ padding: "12px 16px", marginBottom: 20, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#ef4444", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {error}
              <button onClick={() => setError("")} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
          )}

          <div className="estimate-summary-grid" style={panelStyle}>
            <div className="estimate-summary-cell">
              <div className="estimate-summary-icon">Cal</div>
              <div>
                <div className="estimate-summary-label">Expiry Date</div>
                <div className="estimate-summary-value">{fmtDate(estimate.expiryDate)}</div>
                <div className="estimate-summary-sub">{isExpired ? "Expired" : "Active quote window"}</div>
              </div>
            </div>
            <div className="estimate-summary-cell">
              <div className="estimate-summary-icon">$</div>
              <div>
                <div className="estimate-summary-label">Sub Total</div>
                <div className="estimate-summary-value">{fmt(estimate.subtotal)}</div>
              </div>
            </div>
            <div className="estimate-summary-cell">
              <div className="estimate-summary-icon">Tax</div>
              <div>
                <div className="estimate-summary-label">Tax ({estimate.taxRate || 0}%)</div>
                <div className="estimate-summary-value">{fmt(estimate.taxAmount)}</div>
              </div>
            </div>
            <div className="estimate-summary-cell">
              <div className="estimate-summary-icon">%</div>
              <div>
                <div className="estimate-summary-label">Discount</div>
                <div className="estimate-summary-value">{fmt(estimate.discountAmount)}</div>
              </div>
            </div>
            <div className="estimate-summary-cell">
              <div className="estimate-summary-icon">Tot</div>
              <div>
                <div className="estimate-summary-label">Total Amount</div>
                <div className="estimate-summary-value" style={{ color: "#fff" }}>{fmt(estimate.total)}</div>
              </div>
            </div>
          </div>

          <div className="estimate-line-panel" style={{ ...panelStyle, marginBottom: 24 }}>
            <div className="estimate-line-head">
              <div className="estimate-tabs">
                <span className="estimate-tab active">Line Items</span>
                <span className="estimate-tab">Customer</span>
                <span className="estimate-tab">Activity</span>
              </div>
              {editMode ? (
                <div className="estimate-line-tools">
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Drag rows to reorder</span>
                  <button onClick={() => setEditMode(false)} className="estimate-action-btn" style={{ height: 36 }}>Done Editing</button>
                </div>
              ) : estimate.status === 'DRAFT' && (
                <div className="estimate-line-tools">
                  <button onClick={() => setEditMode(true)} className="estimate-action-btn" style={{ height: 36 }}><span className="estimate-icon">+</span>Add Item</button>
                  <button onClick={() => setEditMode(true)} className="estimate-action-btn" style={{ height: 36 }}>Edit Items</button>
                </div>
              )}
            </div>
            {editMode && (
              <div style={{ position: "relative", padding: "12px 18px 0" }}>
                <input type="text" placeholder="Search products or bundles to add..." value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); }} onFocus={() => setShowProductDropdown(true)} style={{ ...inp, width: "100%" }} />
                {showProductDropdown && (filteredProducts.length > 0 || filteredBundles.length > 0) && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, marginTop: 4, maxHeight: 300, overflow: "auto", zIndex: 100 }}>
                    {filteredBundles.length > 0 && (<>
                      <div style={{ padding: "8px 14px", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Bundles</div>
                      {filteredBundles.map(b => (<div key={`b-${b.id}`} onClick={() => addBundle(b)} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><div><div style={{ fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{b.name}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{b.itemCount || b.items?.length || 0} items</div></div><div style={{ color: "#dc2626", fontWeight: 600 }}>{fmt(b.price)}</div></div>))}
                    </>)}
                    {filteredProducts.length > 0 && (<>
                      <div style={{ padding: "8px 14px", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>Products</div>
                      {filteredProducts.map(p => (<div key={`p-${p.id}`} onClick={() => addProduct(p)} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><div><div style={{ fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{p.name}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{p.sku}</div></div><div style={{ color: "#dc2626", fontWeight: 600 }}>{fmt(p.price)}</div></div>))}
                    </>)}
                  </div>
                )}
              </div>
            )}
            {estimate.items && estimate.items.length > 0 ? (
              <div className="estimate-line-table-wrap">
              <table className="estimate-soft-table" style={{ width: "100%", borderCollapse: "collapse", background: "transparent" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    {editMode && <th style={{ padding: "12px 8px", width: 32, background: "transparent" }}></th>}
                    <th style={{ padding: "12px 8px", width: 30, background: "transparent" }}></th>
                    <th style={{ padding: "12px 8px", width: 58, background: "transparent" }}></th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500, background: "transparent" }}>Item / Description</th>
                    <th style={{ padding: "10px 8px", textAlign: "left", fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500, width: 150, background: "transparent" }}>Category</th>
                    <th style={{ padding: "10px 8px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500, width: 100, background: "transparent" }}>Qty</th>
                    <th style={{ padding: "10px 8px", textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500, width: 130, background: "transparent" }}>Price</th>
                    <th style={{ padding: "10px 8px", textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500, width: 130, background: "transparent" }}>Total</th>
                    {editMode && <th style={{ padding: "12px 8px", width: 40, background: "transparent" }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {estimate.items.map((item, itemIndex) => {
                    const isDragging   = dragIndex === itemIndex;
                    const isDropTarget = dragOverIndex === itemIndex && dragIndex !== itemIndex;
                    const gripHovered  = hoveredGripIndex === itemIndex;
                    const itemImageUrl = getItemImageUrl(item);
                    const itemCategory = item.category || item.product?.category || item.productCategory || "Item";
                    return (
                      <Fragment key={item.id}>
                        <tr
                          draggable={editMode}
                          onDragStart={editMode ? (e) => handleDragStart(e, itemIndex) : undefined}
                          onDragOver={editMode  ? (e) => handleDragOver(e, itemIndex)  : undefined}
                          onDrop={editMode      ? (e) => handleDrop(e, itemIndex)      : undefined}
                          onDragEnd={editMode   ? handleDragEnd                        : undefined}
                          style={{ borderBottom: expandedItems[item.id] ? "none" : "1px solid rgba(255,255,255,0.05)", borderTop: isDropTarget ? "2px solid #dc2626" : "2px solid transparent", opacity: isDragging ? 0.35 : 1, background: isDropTarget ? "rgba(220,38,38,0.04)" : "transparent", transition: "opacity 0.15s, background 0.1s" }}>
                          {editMode && (
                            <td onMouseDown={() => { dragFromHandleRef.current = true; }} onMouseUp={() => { dragFromHandleRef.current = false; }} onMouseEnter={() => setHoveredGripIndex(itemIndex)} onMouseLeave={() => setHoveredGripIndex(null)}
                              style={{ padding: "8px 4px", verticalAlign: "middle", cursor: "grab", userSelect: "none", textAlign: "center", width: 32, background: gripHovered ? "rgba(255,255,255,0.06)" : "transparent", borderRadius: 4, transition: "background 0.1s" }}>
                              <GripIcon color={gripHovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)"} />
                            </td>
                          )}
                          <td style={{ padding: "10px 8px", verticalAlign: "middle", background: "transparent" }}>
                            <button type="button" onClick={() => toggleItemExpand(item.id)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12, padding: 4, transform: expandedItems[item.id] ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>&#9654;</button>
                          </td>
                          <td style={{ padding: "10px 8px", verticalAlign: "middle" }}>
                            <div className="estimate-thumb">
                              {itemImageUrl ? <img src={itemImageUrl} alt="" /> : (item.sku || item.name || "?").slice(0, 2).toUpperCase()}
                            </div>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {editMode ? <input type="text" value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} style={{ ...inp, width: "100%", padding: "6px 10px" }} /> : <div style={{ fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>{item.name}</div>}
                            {item.sku && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{item.sku}</div>}
                            {item.fromBundleName && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>From: {item.fromBundleName}</div>}
                            {item.description && !expandedItems[item.id] && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2, fontStyle: "italic" }}>{item.description.length > 80 ? item.description.substring(0, 80) + "..." : item.description}</div>}
                          </td>
                          <td style={{ padding: "10px 8px", verticalAlign: "middle" }}>
                            <span className="estimate-category-pill">{itemCategory}</span>
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}>
                            {editMode ? <input type="number" value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: parseFloat(e.target.value) || 1 })} style={{ ...inp, width: 70, textAlign: "center", padding: "6px 8px" }} min="1" /> : <span style={{ color: "rgba(255,255,255,0.7)" }}>{item.quantity}</span>}
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "right", verticalAlign: "middle" }}>
                            {editMode ? <input type="number" value={item.unitPrice} onChange={(e) => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })} style={{ ...inp, width: 100, textAlign: "right", padding: "6px 8px" }} step="0.01" /> : <span style={{ color: "rgba(255,255,255,0.7)" }}>{fmt(item.unitPrice)}</span>}
                          </td>
                          <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 600, color: "rgba(255,255,255,0.9)", verticalAlign: "middle" }}>{fmt(item.amount || item.quantity * item.unitPrice)}</td>
                          {editMode && <td style={{ padding: "10px 8px", textAlign: "center", verticalAlign: "middle" }}><button onClick={() => confirmDeleteItem(item.id)} disabled={saving} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: saving ? "not-allowed" : "pointer", fontSize: 18, padding: 4 }}>&times;</button></td>}
                        </tr>
                        {expandedItems[item.id] && (
                          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            {editMode && <td></td>}
                            <td></td>
                            <td></td>
                            <td colSpan={editMode ? 6 : 5} style={{ padding: "0 8px 14px 8px" }}>
                              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 16, marginTop: 4 }}>
                                {editMode ? (
                                  <>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                                      <div><label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Short Name</label><input type="text" value={item.sku || ""} onChange={(e) => updateItem(item.id, { sku: e.target.value })} style={{ ...inp, width: "100%", padding: "6px 10px", fontSize: 13 }} /></div>
                                      <div><label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Unit Cost</label><input type="number" value={item.unitCost || ""} onChange={(e) => updateItem(item.id, { unitCost: parseFloat(e.target.value) || null })} style={{ ...inp, width: "100%", padding: "6px 10px", fontSize: 13 }} step="0.01" /></div>
                                      <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}><input type="checkbox" checked={item.taxable !== false} onChange={(e) => updateItem(item.id, { taxable: e.target.checked })} style={{ cursor: "pointer" }} />Taxable</label>
                                        {item.unitCost && item.unitPrice > 0 && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Margin: {((1 - item.unitCost / item.unitPrice) * 100).toFixed(1)}%</span>}
                                      </div>
                                    </div>
                                    <div><label style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Description</label><textarea value={item.description || ""} onChange={(e) => updateItem(item.id, { description: e.target.value })} style={{ ...inp, width: "100%", padding: "8px 10px", fontSize: 13, minHeight: 80, resize: "vertical", boxSizing: "border-box" }} /></div>
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
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)" }}>
                    <td colSpan={editMode ? 6 : 5}></td>
                    <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Subtotal</td>
                    <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 14, color: "rgba(255,255,255,0.9)" }}>{fmt(estimate.subtotal)}</td>
                    {editMode && <td></td>}
                  </tr>
                  {estimate.discountAmount > 0 && <tr><td colSpan={editMode ? 6 : 5}></td><td style={{ padding: "8px", textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Discount</td><td style={{ padding: "8px", textAlign: "right", fontSize: 14, color: "#22c55e" }}>-{fmt(estimate.discountAmount)}</td>{editMode && <td></td>}</tr>}
                  {estimate.taxAmount > 0 && <tr><td colSpan={editMode ? 6 : 5}></td><td style={{ padding: "8px", textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Tax ({estimate.taxRate}%)</td><td style={{ padding: "8px", textAlign: "right", fontSize: 14, color: "rgba(255,255,255,0.9)" }}>{fmt(estimate.taxAmount)}</td>{editMode && <td></td>}</tr>}
                  {estimate.shippingAmount > 0 && <tr><td colSpan={editMode ? 6 : 5}></td><td style={{ padding: "8px", textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Shipping</td><td style={{ padding: "8px", textAlign: "right", fontSize: 14, color: "rgba(255,255,255,0.9)" }}>{fmt(estimate.shippingAmount)}</td>{editMode && <td></td>}</tr>}
                  <tr>
                    <td colSpan={editMode ? 6 : 5}></td>
                    <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>Total</td>
                    <td style={{ padding: "12px 8px", textAlign: "right", fontSize: 20, fontWeight: 700, color: "#dc2626" }}>{fmt(estimate.total)}</td>
                    {editMode && <td></td>}
                  </tr>
                </tfoot>
              </table>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.4)" }}>No items in this estimate</div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
            {(estimate.notes || estimate.internalNotes || estimate.termsConditions) && (
              <div style={panelStyle}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.9)", margin: 0, marginBottom: 16 }}>Notes</h2>
                {estimate.notes && <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Customer Notes:</div><div style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>{estimate.notes}</div></div>}
                {estimate.internalNotes && <div style={{ marginBottom: 16, padding: 12, background: "rgba(234,179,8,0.1)", borderRadius: 6 }}><div style={{ fontSize: 12, color: "#eab308", marginBottom: 4 }}>Internal Notes:</div><div style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>{estimate.internalNotes}</div></div>}
                {estimate.termsConditions && <div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Terms & Conditions:</div><div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, whiteSpace: "pre-wrap" }}>{estimate.termsConditions}</div></div>}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {estimate.invoices && estimate.invoices.length > 0 && (
                <div style={{ ...panelStyle, padding: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", margin: 0, marginBottom: 12, textTransform: "uppercase" }}>Related Invoices</h3>
                  <div style={{ display: "grid", gap: 8 }}>
                    {estimate.invoices.map(inv => (<Link key={inv.id} href={`/invoicing/invoices/${inv.id}`} style={{ display: "block", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6, textDecoration: "none" }}><div style={{ color: "#dc2626", fontFamily: "monospace" }}>{inv.invoiceNumber}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{inv.status}</div></Link>))}
                  </div>
                </div>
              )}
              <div style={{ ...panelStyle, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showEmailHistory ? 12 : 0 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", margin: 0, textTransform: "uppercase" }}>Email History</h3>
                  <button onClick={() => { setShowEmailHistory(!showEmailHistory); if (!showEmailHistory) loadEmailHistory(); }} style={{ padding: "4px 8px", background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12 }}>{showEmailHistory ? "Hide" : "Show"}</button>
                </div>
                {showEmailHistory && <div style={{ display: "grid", gap: 8 }}>{emailHistory.length === 0 ? <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>No emails sent yet</div> : emailHistory.map(em => (<div key={em.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 6 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ color: "rgba(255,255,255,0.9)", fontSize: 13 }}>{em.toEmail}</div>{em.openedAt && <span style={{ padding: "2px 6px", background: "rgba(34,197,94,0.1)", borderRadius: 4, fontSize: 10, color: "#22c55e" }}>Opened</span>}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Sent {fmtDT(em.sentAt)}</div></div>))}</div>}
              </div>
              <div style={{ ...panelStyle, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showVersions ? 12 : 0 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)", margin: 0, textTransform: "uppercase" }}>Versions</h3>
                  <button onClick={() => { setShowVersions(!showVersions); if (!showVersions) loadVersions(); }} style={{ padding: "4px 8px", background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12 }}>{showVersions ? "Hide" : "Show"}</button>
                </div>
                {showVersions && <div style={{ display: "grid", gap: 8 }}>{versions.length === 0 ? <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>No other versions</div> : versions.map(v => (<Link key={v.id} href={`/invoicing/estimates/${v.id}`} style={{ display: "block", padding: "10px 12px", background: v.id === id ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.03)", border: v.id === id ? "1px solid rgba(220,38,38,0.3)" : "1px solid rgba(255,255,255,0.05)", borderRadius: 6, textDecoration: "none" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ color: "#dc2626", fontFamily: "monospace", fontSize: 13 }}>{v.estimateNumber}</div><span style={{ padding: "2px 6px", background: STATUS_COLORS[v.status]?.bg || "rgba(156,163,175,0.1)", borderRadius: 4, fontSize: 10, color: STATUS_COLORS[v.status]?.text || "#9ca3af" }}>{v.status}</span></div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{fmtDate(v.estimateDate)}</div></Link>))}</div>}
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

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
