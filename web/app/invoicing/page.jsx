"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import LeadsPage from "./leads/page";
import CustomersPage from "./customers/page";
import EstimatesPage from "./estimates/page";
import InvoicesPage from "./invoices/page";
import { hasInvoicingPermission } from "@/lib/roleUtils";
import "./invoicing.css";

export default function InvoicingDashboard() {
  const [activeTab, setActiveTab] = useState("leads");
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (!token || !storedUser) {
      router.push("/login");
      return;
    }

    try {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);

      // Check if user has any invoicing permissions
      const hasAccess =
        hasInvoicingPermission(parsedUser.role, "VIEW_ALL_LEADS") ||
        hasInvoicingPermission(parsedUser.role, "VIEW_OWN_LEADS") ||
        hasInvoicingPermission(parsedUser.role, "VIEW_ALL_CUSTOMERS") ||
        hasInvoicingPermission(parsedUser.role, "VIEW_OWN_CUSTOMERS");

      if (!hasAccess) {
        router.push("/admin");
        return;
      }
    } catch (e) {
      console.error("Failed to parse user:", e);
      router.push("/login");
    }
  }, [router]);

  if (!user) {
    return null;
  }

  const tabs = [
    { id: "leads", label: "Leads", permission: "VIEW_ALL_LEADS" },
    { id: "customers", label: "Customers", permission: "VIEW_ALL_CUSTOMERS" },
    { id: "estimates", label: "Estimates", permission: "VIEW_ALL_ESTIMATES" },
    { id: "invoices", label: "Invoices", permission: "VIEW_ALL_INVOICES" },
  ];

  // Filter tabs based on permissions
  const visibleTabs = tabs.filter((tab) =>
    hasInvoicingPermission(user.role, tab.permission)
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "leads":
        return <LeadsPage />;
      case "customers":
        return <CustomersPage />;
      case "estimates":
        return <EstimatesPage />;
      case "invoices":
        return <InvoicesPage />;
      default:
        return <LeadsPage />;
    }
  };

  return (
    <div className="invoicing-container">
      <TopNav />

      <div className="invoicing-content">
        <div className="invoicing-header">
          <h1>Invoicing & CRM</h1>
          <p>Manage leads, customers, estimates, and invoices</p>
        </div>

        <div className="invoicing-tabs">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {renderTabContent()}
      </div>
    </div>
  );
}
