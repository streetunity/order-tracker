"use client";
export const dynamic = 'force-dynamic';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import InvoicingNav from "@/components/InvoicingNav";
import TopNav from "@/components/TopNav";
import { useAuth } from "@/contexts/AuthContext";
import { useInvoicingSettings } from "./_shared/hooks/useInvoicingSettings";
import CompanyTab from "./tabs/CompanyTab";
import InvoicingTab from "./tabs/InvoicingTab";
import EmailTemplatesTab from "./tabs/EmailTemplatesTab";
import OrderStagesTab from "./tabs/OrderStagesTab";
import CommissionsTab from "./tabs/CommissionsTab";

export default function UnifiedSettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState("company");

  // Detect ?from=admin to show Order Tracker nav instead of Invoicing nav
  const [fromAdmin, setFromAdmin] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setFromAdmin(params.get("from") === "admin");
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    if (!["SUPER_ADMIN","ADMIN","ACCOUNTANT"].includes(user.role)) { router.push("/invoicing"); return; }
  }, [user, authLoading]);

  // Shared form state for Company + Invoicing tabs (both write to /api/invoicing-settings)
  const settings = useInvoicingSettings(getAuthHeaders);

  if (authLoading || !user) return null;

  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const isAdmin      = ["SUPER_ADMIN","ADMIN"].includes(user.role);

  const TABS = [
    { id: "company",       label: "Company",         icon: "\uD83C\uDFE2" },
    { id: "invoicing",     label: "Invoicing",        icon: "\uD83D\uDCC4" },
    ...(isAdmin      ? [{ id: "email",       label: "Email Templates", icon: "\u2709\uFE0F" }] : []),
    ...(isAdmin      ? [{ id: "stages",      label: "Order Stages",    icon: "\u2699\uFE0F" }] : []),
    ...(isSuperAdmin ? [{ id: "commissions", label: "Commissions",     icon: "\uD83D\uDCB0" }] : []),
  ];

  const isInvSettingsTab = activeTab === "company" || activeTab === "invoicing";

  return (
    <>
      {/* Render the correct nav based on where the user came from */}
      {fromAdmin ? <TopNav /> : <InvoicingNav />}

      <div style={{ display: "flex", minHeight: "100vh", background: "#0f0f0f", paddingTop: 60 }}>

        {/* Sidebar */}
        <div style={{ width: 220, flexShrink: 0, background: "#141414", borderRight: "1px solid rgba(255,255,255,0.07)", position: "sticky", top: 60, height: "calc(100vh - 60px)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "20px 16px 10px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>Settings</div>
          </div>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(220,38,38,0.08)" : "transparent", border: "none", borderLeft: active ? "3px solid #dc2626" : "3px solid transparent", color: active ? "#fff" : "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, textAlign: "left", width: "100%", transition: "all 0.12s" }}>
                <span style={{ fontSize: 15 }}>{tab.icon}</span>{tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, padding: "24px 24px 56px", overflowX: "hidden" }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>{TABS.find(t => t.id === activeTab)?.label}</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>System-wide configuration for Stealth Machine Tools</p>
          </div>

          {isInvSettingsTab && settings.loading ? (
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, paddingTop: 40 }}>Loading…</div>
          ) : (
            <>
              {activeTab === "company"     && <CompanyTab     settings={settings} />}
              {activeTab === "invoicing"   && <InvoicingTab   settings={settings} />}
              {activeTab === "email"       && isAdmin      && <EmailTemplatesTab getAuthHeaders={getAuthHeaders} />}
              {activeTab === "stages"      && isAdmin      && <OrderStagesTab    getAuthHeaders={getAuthHeaders} />}
              {activeTab === "commissions" && isSuperAdmin && <CommissionsTab    getAuthHeaders={getAuthHeaders} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}
