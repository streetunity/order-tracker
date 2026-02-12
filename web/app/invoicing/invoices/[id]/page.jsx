"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import InvoicingNav from "@/components/InvoicingNav";
import "../../modal.css";

const STATUS_COLORS = {
  DRAFT: { bg: 'rgba(156, 163, 175, 0.1)', border: 'rgba(156, 163, 175, 0.3)', text: '#9ca3af' },
  SENT: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6' },
  VIEWED: { bg: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)', text: '#a855f7' },
  PARTIAL: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b' },
  PAID: { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgba(34, 197, 94, 0.3)', text: '#22c55e' },
  OVERDUE: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444' },
  VOID: { bg: 'rgba(107, 114, 128, 0.1)', border: 'rgba(107, 114, 128, 0.3)', text: '#6b7280' }
};

export default function InvoiceDetailPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // PDF & Email state
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailHistory, setEmailHistory] = useState([]);
  const [showEmailHistory, setShowEmailHistory] = useState(false);

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CHECK");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [selectedScheduleItem, setSelectedScheduleItem] = useState(null);

  // Confirmation/Success modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: "", message: "", onConfirm: null });
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }
    loadInvoice();
  }, [user, router, id]);

  async function loadInvoice() {
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 404) {
          setError("Invoice not found");
          setLoading(false);
          return;
        }
        throw new Error("Failed to load invoice");
      }

      const data = await res.json();
      setInvoice(data);
    } catch (e) {
      console.error("Error loading invoice:", e);
      setError("Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }

  async function generatePDF() {
    setGeneratingPDF(true);
    setError("");
    try {
      const res = await fetch(`/api/invoices/${id}/generate-pdf`, {
        method: "POST",
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        throw new Error("Failed to generate PDF");
      }

      const data = await res.json();
      setInvoice(data.invoice);

      if (data.pdfUrl) {
        window.open(data.pdfUrl, '_blank');
      }
    } catch (e) {
      console.error("Error generating PDF:", e);
      setError(e.message);
    } finally {
      setGeneratingPDF(false);
    }
  }

  async function downloadPDF() {
    try {
      const res = await fetch(`/api/invoices/${id}/pdf`, {
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        await generatePDF();
        return;
      }

      const data = await res.json();
      if (data.pdfUrl) {
        window.open(data.pdfUrl, '_blank');
      }
    } catch (e) {
      console.error("Error downloading PDF:", e);
      setError(e.message);
    }
  }

  async function sendInvoice() {
    if (!emailTo) {
      setError("Recipient email is required");
      return;
    }

    setSendingEmail(true);
    setError("");
    try {
      const res = await fetch(`/api/invoices/${id}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          toEmail: emailTo,
          ccEmails: emailCc ? emailCc.split(',').map(e => e.trim()).filter(e => e) : [],
          customMessage: emailMessage,
          regeneratePDF: !invoice?.pdfS3Key
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send invoice");
      }

      const data = await res.json();
      setInvoice(data.invoice);
      setShowSendModal(false);
      setEmailTo("");
      setEmailCc("");
      setEmailMessage("");
      setSuccessMessage("Invoice sent successfully!");
      setShowSuccessModal(true);
    } catch (e) {
      console.error("Error sending invoice:", e);
      setError(e.message);
    } finally {
      setSendingEmail(false);
    }
  }

  async function loadEmailHistory() {
    try {
      const res = await fetch(`/api/invoices/${id}/email-history`, {
        headers: getAuthHeaders()
      });

      if (res.ok) {
        const data = await res.json();
        setEmailHistory(data);
      }
    } catch (e) {
      console.error("Error loading email history:", e);
    }
  }

  async function recordPayment() {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      setError("Valid payment amount is required");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/invoices/${id}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          amount: parseFloat(paymentAmount),
          paymentMethod,
          checkNumber: paymentMethod === "CHECK" ? paymentReference : null,
          wireReference: paymentMethod === "WIRE" ? paymentReference : null,
          referenceNumber: !["CHECK", "WIRE"].includes(paymentMethod) ? paymentReference : null,
          notes: paymentNotes,
          scheduleItemId: selectedScheduleItem?.id
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to record payment");
      }

      const data = await res.json();
      setInvoice(data.invoice);
      setShowPaymentModal(false);
      setPaymentAmount("");
      setPaymentMethod("CHECK");
      setPaymentReference("");
      setPaymentNotes("");
      setSelectedScheduleItem(null);
      setSuccessMessage("Payment recorded successfully!");
      setShowSuccessModal(true);
    } catch (e) {
      console.error("Error recording payment:", e);
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function showConfirm(title, message, onConfirm) {
    setConfirmConfig({ title, message, onConfirm });
    setShowConfirmModal(true);
  }

  function confirmVoidInvoice() {
    showConfirm("Void Invoice", "Are you sure you want to void this invoice? This cannot be undone.", () => voidInvoice());
  }

  function confirmDeleteInvoice() {
    showConfirm("Delete Invoice", "Are you sure you want to delete this invoice? This action cannot be undone.", () => deleteInvoice());
  }

  async function updateStatus(newStatus) {
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error("Failed to update status");
      }

      const data = await res.json();
      setInvoice(data);
    } catch (e) {
      console.error("Error updating status:", e);
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function voidInvoice() {
    setShowConfirmModal(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${id}/void`, {
        method: "POST",
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to void invoice");
      }

      const data = await res.json();
      setInvoice(data);
    } catch (e) {
      console.error("Error voiding invoice:", e);
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteInvoice() {
    setShowConfirmModal(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        throw new Error("Failed to delete invoice");
      }

      router.push("/invoicing/invoices");
    } catch (e) {
      console.error("Error deleting invoice:", e);
      setError(e.message);
      setSaving(false);
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatDateTime = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const isOverdue = invoice?.dueDate && new Date(invoice.dueDate) < new Date() && !['PAID', 'VOID'].includes(invoice?.status);

  const inputStyle = {
    padding: "10px 14px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "14px",
    width: "100%",
    boxSizing: "border-box"
  };

  const sectionStyle = {
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "12px",
    padding: 24,
    marginBottom: 24
  };

  if (authLoading || !user) return null;

  if (loading) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.5)" }}>
            Loading invoice...
          </div>
        </div>
      </>
    );
  }

  if (!invoice) {
    return (
      <>
        <InvoicingNav />
        <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>📊</div>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: "20px" }}>
              {error || "Invoice not found"}
            </p>
            <Link
              href="/invoicing/invoices"
              style={{
                display: "inline-block",
                padding: "10px 20px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "rgba(255, 255, 255, 0.9)",
                textDecoration: "none"
              }}
            >
              Back to Invoices
            </Link>
          </div>
        </div>
      </>
    );
  }

  const statusColor = STATUS_COLORS[invoice.status] || STATUS_COLORS.DRAFT;

  return (
    <>
      <InvoicingNav />
      <div style={{ width: "80%", maxWidth: "1800px", margin: "0 auto", paddingTop: 80 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/invoicing/invoices"
            style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none", fontSize: "13px", display: "block", marginBottom: 8 }}
          >
            ← Back to Invoices
          </Link>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#dc2626" }}>
                  {invoice.invoiceNumber}
                </h1>
                <span style={{
                  padding: "4px 12px",
                  background: statusColor.bg,
                  border: `1px solid ${statusColor.border}`,
                  borderRadius: "6px",
                  color: statusColor.text,
                  fontSize: "12px",
                  fontWeight: "500"
                }}>
                  {invoice.status}
                </span>
                {isOverdue && invoice.status !== 'OVERDUE' && (
                  <span style={{
                    padding: "4px 12px",
                    background: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "6px",
                    color: "#ef4444",
                    fontSize: "12px"
                  }}>
                    Overdue
                  </span>
                )}
              </div>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}>
                Created by {invoice.createdBy?.name} on {formatDate(invoice.createdAt)}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {invoice.status === 'DRAFT' && (
                <button
                  onClick={() => updateStatus('SENT')}
                  disabled={saving}
                  style={{
                    padding: "8px 16px",
                    background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                    border: "none",
                    borderRadius: "8px",
                    color: "white",
                    cursor: saving ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    fontWeight: "500"
                  }}
                >
                  Mark as Sent
                </button>
              )}
              <button
                onClick={generatingPDF ? null : (invoice?.pdfS3Key ? downloadPDF : generatePDF)}
                disabled={generatingPDF}
                style={{
                  padding: "8px 16px",
                  background: "rgba(59, 130, 246, 0.1)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  borderRadius: "8px",
                  color: "#3b82f6",
                  cursor: generatingPDF ? "not-allowed" : "pointer",
                  fontSize: "14px"
                }}
              >
                {generatingPDF ? "Generating..." : (invoice?.pdfS3Key ? "View PDF" : "Generate PDF")}
              </button>
              <button
                onClick={() => {
                  setEmailTo(invoice?.customer?.email || "");
                  setShowSendModal(true);
                }}
                disabled={saving}
                style={{
                  padding: "8px 16px",
                  background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
                  border: "none",
                  borderRadius: "8px",
                  color: "white",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: "500"
                }}
              >
                Send to Customer
              </button>
              {invoice.balanceDue > 0 && invoice.status !== 'VOID' && (
                <button
                  onClick={() => {
                    setPaymentAmount(invoice.balanceDue.toString());
                    setShowPaymentModal(true);
                  }}
                  style={{
                    padding: "8px 16px",
                    background: "rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    borderRadius: "8px",
                    color: "#f59e0b",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "500"
                  }}
                >
                  Record Payment
                </button>
              )}
              {invoice.status !== 'VOID' && invoice.amountPaid === 0 && (
                <button
                  onClick={confirmVoidInvoice}
                  disabled={saving}
                  style={{
                    padding: "8px 16px",
                    background: "rgba(107, 114, 128, 0.1)",
                    border: "1px solid rgba(107, 114, 128, 0.3)",
                    borderRadius: "8px",
                    color: "#6b7280",
                    cursor: saving ? "not-allowed" : "pointer",
                    fontSize: "14px"
                  }}
                >
                  Void
                </button>
              )}
              <button
                onClick={confirmDeleteInvoice}
                disabled={saving}
                style={{
                  padding: "8px 16px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "8px",
                  color: "#ef4444",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: "14px"
                }}
              >
                Delete
              </button>
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
            <button onClick={() => setError("")} style={{ float: "right", background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>×</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
          <div>
            {/* Customer Info */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 12, textTransform: "uppercase" }}>
                Bill To
              </h2>
              {invoice.customer ? (
                <div>
                  <div style={{ fontSize: "16px", fontWeight: "500", color: "rgba(255,255,255,0.9)", marginBottom: 4 }}>
                    {invoice.customer.firstName} {invoice.customer.lastName}
                  </div>
                  {(invoice.customer.company || invoice.customer.companyName) && (
                    <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
                      {invoice.customer.company || invoice.customer.companyName}
                    </div>
                  )}
                  {invoice.customer.email && (
                    <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
                      {invoice.customer.email}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: "rgba(255,255,255,0.4)" }}>No customer assigned</div>
              )}
            </div>

            {/* Line Items */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase" }}>
                Line Items ({invoice.items?.length || 0})
              </h2>

              {invoice.items && invoice.items.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                      <th style={{ padding: "8px", textAlign: "left", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Item</th>
                      <th style={{ padding: "8px", textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.5)", width: "80px" }}>Qty</th>
                      <th style={{ padding: "8px", textAlign: "right", fontSize: "12px", color: "rgba(255,255,255,0.5)", width: "100px" }}>Price</th>
                      <th style={{ padding: "8px", textAlign: "right", fontSize: "12px", color: "rgba(255,255,255,0.5)", width: "100px" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "12px 8px" }}>
                          <div style={{ fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>{item.name}</div>
                          {item.sku && <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>{item.sku}</div>}
                          {item.description && <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginTop: 4, whiteSpace: "pre-wrap" }}>{item.description}</div>}
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "center", color: "rgba(255,255,255,0.7)" }}>
                          {item.quantity}
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "right", color: "rgba(255,255,255,0.7)" }}>
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>
                          {formatCurrency(item.amount || item.quantity * item.unitPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.4)" }}>
                  No items in this invoice
                </div>
              )}
            </div>

            {/* Payment Schedule */}
            {invoice.paymentSchedule && invoice.paymentSchedule.length > 0 && (
              <div style={sectionStyle}>
                <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase" }}>
                  Payment Schedule
                </h2>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                      <th style={{ padding: "8px", textAlign: "left", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Description</th>
                      <th style={{ padding: "8px", textAlign: "right", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Amount</th>
                      <th style={{ padding: "8px", textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Status</th>
                      <th style={{ padding: "8px", textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.paymentSchedule.map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "12px 8px", color: "rgba(255,255,255,0.9)", whiteSpace: "pre-wrap" }}>
                          {item.description}
                          {item.dueDate && (
                            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
                              Due: {formatDate(item.dueDate)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>
                          {formatCurrency(item.amount)}
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "center" }}>
                          <span style={{
                            padding: "4px 10px",
                            background: item.status === 'PAID' ? "rgba(34, 197, 94, 0.1)" : "rgba(245, 158, 11, 0.1)",
                            border: `1px solid ${item.status === 'PAID' ? "rgba(34, 197, 94, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                            borderRadius: "6px",
                            color: item.status === 'PAID' ? "#22c55e" : "#f59e0b",
                            fontSize: "12px"
                          }}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "center" }}>
                          {item.status !== 'PAID' && (
                            <button
                              onClick={() => {
                                setSelectedScheduleItem(item);
                                setPaymentAmount(item.amount.toString());
                                setShowPaymentModal(true);
                              }}
                              style={{
                                padding: "4px 10px",
                                background: "rgba(245, 158, 11, 0.1)",
                                border: "1px solid rgba(245, 158, 11, 0.3)",
                                borderRadius: "6px",
                                color: "#f59e0b",
                                cursor: "pointer",
                                fontSize: "12px"
                              }}
                            >
                              Pay
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payments History */}
            {invoice.payments && invoice.payments.length > 0 && (
              <div style={sectionStyle}>
                <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 16, textTransform: "uppercase" }}>
                  Payments
                </h2>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                      <th style={{ padding: "8px", textAlign: "left", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Date</th>
                      <th style={{ padding: "8px", textAlign: "left", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Method</th>
                      <th style={{ padding: "8px", textAlign: "left", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Reference</th>
                      <th style={{ padding: "8px", textAlign: "right", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments.map((payment) => (
                      <tr key={payment.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "12px 8px", color: "rgba(255,255,255,0.7)" }}>
                          {formatDate(payment.paymentDate)}
                        </td>
                        <td style={{ padding: "12px 8px", color: "rgba(255,255,255,0.9)" }}>
                          {payment.paymentMethod}
                        </td>
                        <td style={{ padding: "12px 8px", color: "rgba(255,255,255,0.5)" }}>
                          {payment.paymentNumber}
                          {(payment.checkNumber || payment.wireReference || payment.referenceNumber) && (
                            <span style={{ marginLeft: 8 }}>
                              ({payment.checkNumber || payment.wireReference || payment.referenceNumber})
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "12px 8px", textAlign: "right", fontWeight: "600", color: "#22c55e" }}>
                          {formatCurrency(payment.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Notes */}
            {(invoice.notes || invoice.internalNotes || invoice.termsConditions) && (
              <div style={sectionStyle}>
                <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 12, textTransform: "uppercase" }}>
                  Notes
                </h2>
                {invoice.notes && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Customer Notes:</div>
                    <div style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>{invoice.notes}</div>
                  </div>
                )}
                {invoice.internalNotes && (
                  <div style={{ marginBottom: 16, padding: 12, background: "rgba(234, 179, 8, 0.1)", borderRadius: "6px" }}>
                    <div style={{ fontSize: "12px", color: "#eab308", marginBottom: 4 }}>Internal Notes:</div>
                    <div style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "pre-wrap" }}>{invoice.internalNotes}</div>
                  </div>
                )}
                {invoice.termsConditions && (
                  <div>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Terms & Conditions:</div>
                    <div style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", whiteSpace: "pre-wrap" }}>{invoice.termsConditions}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div>
            {/* Dates & Tracking */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 12, textTransform: "uppercase" }}>
                Dates & Tracking
              </h2>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Invoice Date</div>
                  <div style={{ color: "rgba(255,255,255,0.9)" }}>{formatDate(invoice.invoiceDate)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Due Date</div>
                  <div style={{ color: isOverdue ? "#ef4444" : "rgba(255,255,255,0.9)" }}>
                    {formatDate(invoice.dueDate)}
                    {isOverdue && " (Overdue)"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Payment Terms</div>
                  <div style={{ color: "rgba(255,255,255,0.9)" }}>{invoice.paymentTerms}</div>
                </div>
                {invoice.lastSentAt && (
                  <div>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Last Sent</div>
                    <div style={{ color: "#3b82f6" }}>{formatDate(invoice.lastSentAt)}</div>
                  </div>
                )}
                {invoice.lastViewedAt && (
                  <div>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Last Viewed</div>
                    <div style={{ color: "#a855f7" }}>{formatDate(invoice.lastViewedAt)}</div>
                  </div>
                )}
                {invoice.viewCount > 0 && (
                  <div>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Views</div>
                    <div style={{ color: "rgba(255,255,255,0.9)" }}>{invoice.viewCount}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Totals */}
            <div style={sectionStyle}>
              <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 12, textTransform: "uppercase" }}>
                Summary
              </h2>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>Subtotal:</span>
                  <span style={{ color: "rgba(255,255,255,0.9)" }}>{formatCurrency(invoice.subtotal)}</span>
                </div>
                {invoice.discountAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>Discount:</span>
                    <span style={{ color: "#22c55e" }}>-{formatCurrency(invoice.discountAmount)}</span>
                  </div>
                )}
                {invoice.taxAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>Tax ({invoice.taxRate}%):</span>
                    <span style={{ color: "rgba(255,255,255,0.9)" }}>{formatCurrency(invoice.taxAmount)}</span>
                  </div>
                )}
                {invoice.shippingAmount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>Shipping:</span>
                    <span style={{ color: "rgba(255,255,255,0.9)" }}>{formatCurrency(invoice.shippingAmount)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                  <span style={{ fontWeight: "500", color: "rgba(255,255,255,0.9)" }}>Total:</span>
                  <span style={{ fontWeight: "600", color: "rgba(255,255,255,0.9)" }}>{formatCurrency(invoice.total)}</span>
                </div>
                {invoice.amountPaid > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#22c55e" }}>Paid:</span>
                    <span style={{ color: "#22c55e" }}>-{formatCurrency(invoice.amountPaid)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                  <span style={{ fontWeight: "600", color: "rgba(255,255,255,0.9)", fontSize: "16px" }}>Balance Due:</span>
                  <span style={{ fontWeight: "700", color: invoice.balanceDue > 0 ? "#dc2626" : "#22c55e", fontSize: "18px" }}>
                    {formatCurrency(invoice.balanceDue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Related Estimate */}
            {invoice.estimate && (
              <div style={sectionStyle}>
                <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 12, textTransform: "uppercase" }}>
                  Source Estimate
                </h2>
                <Link
                  href={`/invoicing/estimates/${invoice.estimate.id}`}
                  style={{
                    display: "block",
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    borderRadius: "6px",
                    textDecoration: "none"
                  }}
                >
                  <div style={{ color: "#dc2626", fontFamily: "monospace" }}>{invoice.estimate.estimateNumber}</div>
                </Link>
              </div>
            )}

            {/* Email History */}
            <div style={sectionStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ fontSize: "14px", fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", margin: 0 }}>
                  Email History
                </h2>
                {!showEmailHistory && (
                  <button
                    onClick={() => { setShowEmailHistory(true); loadEmailHistory(); }}
                    style={{
                      padding: "4px 8px",
                      background: "transparent",
                      border: "none",
                      color: "#dc2626",
                      cursor: "pointer",
                      fontSize: "12px"
                    }}
                  >
                    Show
                  </button>
                )}
              </div>
              {showEmailHistory && (
                <div style={{ display: "grid", gap: 8 }}>
                  {emailHistory.length === 0 ? (
                    <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
                      No emails sent yet
                    </div>
                  ) : (
                    emailHistory.map(email => (
                      <div
                        key={email.id}
                        style={{
                          padding: "10px 12px",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.05)",
                          borderRadius: "6px"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ color: "rgba(255,255,255,0.9)", fontSize: "13px" }}>
                            {email.toEmail}
                          </div>
                          {email.openedAt && (
                            <span style={{
                              padding: "2px 6px",
                              background: "rgba(34, 197, 94, 0.1)",
                              borderRadius: "4px",
                              fontSize: "10px",
                              color: "#22c55e"
                            }}>
                              Opened
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                          Sent {formatDateTime(email.sentAt)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Send Email Modal */}
      {showSendModal && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Send Invoice</h2>
            <div className="modal-form-group">
              <label>To *</label>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="customer@example.com"
              />
            </div>
            <div className="modal-form-group">
              <label>CC (comma-separated)</label>
              <input
                type="text"
                value={emailCc}
                onChange={(e) => setEmailCc(e.target.value)}
                placeholder="copy@example.com, another@example.com"
              />
            </div>
            <div className="modal-form-group">
              <label>Message (optional)</label>
              <textarea
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder="Add a personal message..."
                rows={4}
              />
            </div>
            {error && <div className="modal-error">{error}</div>}
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => { setShowSendModal(false); setError(""); }}>
                Cancel
              </button>
              <button
                className="modal-btn primary"
                onClick={sendInvoice}
                disabled={sendingEmail || !emailTo}
              >
                {sendingEmail ? "Sending..." : "Send Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => { setShowPaymentModal(false); setSelectedScheduleItem(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Record Payment</h2>
            {selectedScheduleItem && (
              <div style={{
                padding: "12px 16px",
                marginBottom: 16,
                background: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: "8px"
              }}>
                <div style={{ fontSize: "13px", color: "#3b82f6" }}>
                  Recording payment for: <strong>{selectedScheduleItem.description}</strong>
                </div>
              </div>
            )}
            <div className="modal-form-group">
              <label>Amount *</label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0.01"
              />
              <span className="modal-hint">Balance due: {formatCurrency(invoice.balanceDue)}</span>
            </div>
            <div className="modal-form-group">
              <label>Payment Method *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="CHECK">Check</option>
                <option value="WIRE">Wire Transfer</option>
                <option value="CREDIT_CARD">Credit Card</option>
                <option value="ACH">ACH</option>
                <option value="CASH">Cash</option>
              </select>
            </div>
            <div className="modal-form-group">
              <label>{paymentMethod === "CHECK" ? "Check Number" : paymentMethod === "WIRE" ? "Wire Reference" : "Reference Number"}</label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="modal-form-group">
              <label>Notes</label>
              <textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={3}
              />
            </div>
            {error && <div className="modal-error">{error}</div>}
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => { setShowPaymentModal(false); setSelectedScheduleItem(null); setError(""); }}>
                Cancel
              </button>
              <button
                className="modal-btn primary"
                onClick={recordPayment}
                disabled={saving || !paymentAmount}
              >
                {saving ? "Recording..." : "Record Payment"}
              </button>
            </div>
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

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="modal-overlay" onClick={() => setShowSuccessModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Success</h2>
            <div className="modal-success">{successMessage}</div>
            <div className="modal-actions">
              <button className="modal-btn primary" onClick={() => setShowSuccessModal(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
