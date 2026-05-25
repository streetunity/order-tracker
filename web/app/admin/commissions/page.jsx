"use client";
export const dynamic = 'force-dynamic';

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

import {
  RejectPaymentModal, UnflagModal, DeleteOrphanModal,
  RecalculateModal, UnapproveModal, UnpayModal,
  PdfReportModal, NotificationToast,
} from "./CommissionModals";
import BulkActionsBar from "./BulkActionsBar";

import { useCommissionsData } from "./hooks/useCommissionsData";
import FlaggedTab from "./tabs/FlaggedTab";
import PendingTab from "./tabs/PendingTab";
import ApprovedTab from "./tabs/ApprovedTab";
import PaidTab from "./tabs/PaidTab";
import OrphanedTab from "./tabs/OrphanedTab";

export default function CommissionsPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const c = useCommissionsData(user, getAuthHeaders, router);

  if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ACCOUNTANT")) return null;

  const TABS = ["flagged", "pending", "approved", "paid", "orphaned", user.role === "SUPER_ADMIN" ? "settings" : null].filter(Boolean);

  return (
    <>
      <TopNav />
      <style>{`
        .commission-polish-table tbody tr {
          transition: background 0.14s, box-shadow 0.14s;
        }
        .commission-polish-table tbody tr:hover {
          background: linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03));
          box-shadow: inset 3px 0 0 rgba(220,38,38,0.65);
        }
      `}</style>
      <div style={{ minHeight: "calc(100vh - 60px)", background: "radial-gradient(circle at 12% 0%,rgba(220,38,38,0.07),transparent 420px)" }}>
        <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px 24px 40px" }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h1 style={{ fontSize: "24px", fontWeight: "700", margin: 0, color: "#fff", letterSpacing: "-0.3px" }}>Commission Management</h1>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 30, borderBottom: "1px solid rgba(255,255,255,0.12)", background: "linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.08))", borderRadius: 10, padding: "8px 10px 0", boxShadow: "0 12px 28px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {TABS.map(tab => (
                <button key={tab} onClick={() => c.setActiveTab(tab)} style={{
                  padding: "10px 18px",
                  background: c.activeTab === tab ? "linear-gradient(180deg,rgba(220,38,38,0.16),rgba(220,38,38,0.07))" : "transparent",
                  color: c.activeTab === tab ? "#ff4b4b" : "#999",
                  border: c.activeTab === tab ? "1px solid rgba(255,75,75,0.32)" : "1px solid transparent",
                  borderBottom: c.activeTab === tab ? "2px solid #dc2626" : "2px solid transparent",
                  borderRadius: "7px 7px 0 0", cursor: "pointer", fontSize: 14, marginBottom: "-1px", textTransform: "capitalize",
                }}>
                  {tab === "settings" ? "⚙️ Settings" : tab}
                </button>
              ))}
            </div>
            <button onClick={() => c.setShowPdfModal(true)} style={{
              padding: "7px 16px", background: "linear-gradient(180deg,rgba(255,75,75,0.2),rgba(220,38,38,0.09))", color: "#ff5a5a",
              border: "1px solid rgba(255,75,75,0.4)", borderRadius: 7,
              cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 8,
              boxShadow: "0 12px 26px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}>Generate Report</button>
          </div>

          {c.loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Loading...</div>
          ) : (
            <>
              {c.activeTab === "flagged" && (
                <FlaggedTab
                  flaggedCommissions={c.flaggedCommissions}
                  user={user}
                  router={router}
                  onUnflag={c.handleUnflag}
                  onRecalculate={c.handleRecalculate}
                />
              )}
              {c.activeTab === "pending" && (
                <PendingTab
                  payoutGroups={c.payoutGroups}
                  expandedGroups={c.expandedGroups}
                  selectedPayouts={c.selectedPayouts}
                  stageSettings={c.stageSettings}
                  onToggleGroup={c.toggleGroup}
                  onTogglePayoutSelection={c.togglePayoutSelection}
                  onSelectAllInGroup={c.selectAllInGroup}
                  onApprovePayout={c.handleApprovePayout}
                  onRejectPayout={c.handleRejectPayout}
                />
              )}
              {c.activeTab === "approved" && (
                <ApprovedTab
                  approvedPayouts={c.approvedPayouts}
                  selectedPayouts={c.selectedPayouts}
                  setSelectedPayouts={c.setSelectedPayouts}
                  paymentMethod={c.paymentMethod}
                  setPaymentMethod={c.setPaymentMethod}
                  paymentNotes={c.paymentNotes}
                  setPaymentNotes={c.setPaymentNotes}
                  stageSettings={c.stageSettings}
                  onTogglePayoutSelection={c.togglePayoutSelection}
                  onMarkAsPaid={c.handleMarkAsPaid}
                  onUnapprove={c.handleUnapprove}
                />
              )}
              {c.activeTab === "paid" && (
                <PaidTab
                  recentlyPaid={c.recentlyPaid}
                  paidFilterSalesRep={c.paidFilterSalesRep}
                  setPaidFilterSalesRep={c.setPaidFilterSalesRep}
                  selectedPayouts={c.selectedPayouts}
                  setSelectedPayouts={c.setSelectedPayouts}
                  onTogglePayoutSelection={c.togglePayoutSelection}
                  stageSettings={c.stageSettings}
                  onUnpay={c.handleUnpay}
                />
              )}
              {c.activeTab === "orphaned" && (
                <OrphanedTab
                  orphanedCommissions={c.orphanedCommissions}
                  user={user}
                  onDelete={c.handleDeleteOrphanedCommission}
                />
              )}
            </>
          )}

          <BulkActionsBar
            activeTab={c.activeTab}
            selectedCount={c.selectedPayouts.size}
            onBulkApprove={c.handleBulkApprove}
            onBulkPay={c.handleBulkPay}
            onGenerateReport={c.generateReportFromSelected}
            onClearSelection={() => c.setSelectedPayouts(new Set())}
          />
        </div>
      </div>

      <RejectPaymentModal show={c.showRejectModal} onClose={() => c.setShowRejectModal(false)} rejectionReason={c.rejectionReason} setRejectionReason={c.setRejectionReason} onExecute={c.executeReject} />
      <UnflagModal show={c.showUnflagModal} onClose={() => c.setShowUnflagModal(false)} unflagNotes={c.unflagNotes} setUnflagNotes={c.setUnflagNotes} onExecute={c.executeUnflag} />
      <DeleteOrphanModal show={c.showDeleteOrphanModal} onClose={() => c.setShowDeleteOrphanModal(false)} onExecute={c.executeDeleteOrphan} />
      <RecalculateModal show={c.showRecalculateModal} onClose={() => c.setShowRecalculateModal(false)} onExecute={c.executeRecalculate} />
      <UnapproveModal show={c.showUnapproveModal} onClose={() => c.setShowUnapproveModal(false)} onExecute={c.executeUnapprove} />
      <UnpayModal show={c.showUnpayModal} onClose={() => c.setShowUnpayModal(false)} onExecute={c.executeUnpay} />
      <PdfReportModal show={c.showPdfModal} onClose={() => c.setShowPdfModal(false)} pdfAgent={c.pdfAgent} setPdfAgent={c.setPdfAgent} pdfStartDate={c.pdfStartDate} setPdfStartDate={c.setPdfStartDate} pdfEndDate={c.pdfEndDate} setPdfEndDate={c.setPdfEndDate} availableAgents={c.availableAgents} onGenerate={c.generatePdfReport} />
      <NotificationToast show={c.showNotification} message={c.notificationMessage} type={c.notificationType} />
    </>
  );
}
