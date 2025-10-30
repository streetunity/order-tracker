import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function CommissionWidget() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pendingApprovals: { count: 0, amount: 0 },
    unpaidTotal: 0,
    thisMonth: 0,
    flaggedCount: 0,
  });

  useEffect(() => {
    if (user && (user.role === "SUPER_ADMIN" || user.role === "ACCOUNTANT")) {
      fetchCommissionStats();
    }
  }, [user]);

  const fetchCommissionStats = async () => {
    try {
      const headers = { Authorization: `Bearer ${user.token}` };

      // Fetch pending approvals
      const pendingRes = await fetch("/api/commissions/payouts/pending", { headers });
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        const totalCount = data.reduce((sum, group) => sum + group.payouts.length, 0);
        const totalAmount = data.reduce((sum, group) => sum + group.total, 0);
        setStats(prev => ({
          ...prev,
          pendingApprovals: { count: totalCount, amount: totalAmount }
        }));
      }

      // Fetch flagged commissions count
      const flaggedRes = await fetch("/api/commissions/flagged", { headers });
      if (flaggedRes.ok) {
        const data = await flaggedRes.json();
        setStats(prev => ({ ...prev, flaggedCount: data.length }));
      }

      // Fetch this month's commissions
      const monthRes = await fetch("/api/commissions/reports/ytd", { headers });
      if (monthRes.ok) {
        const data = await monthRes.json();
        setStats(prev => ({ 
          ...prev, 
          unpaidTotal: (data.totalPending || 0) + (data.totalProjected || 0),
          thisMonth: data.thisMonth || 0
        }));
      }
    } catch (error) {
      console.error("Error fetching commission stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ACCOUNTANT")) {
    return null;
  }

  return (
    <div style={{ marginBottom: "32px" }}>
      <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "16px", color: "#ef4444" }}>
        💰 Commission Overview
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        {/* Pending Approvals */}
        <div
          onClick={() => router.push("/admin/commissions")}
          style={{
            background: "#1a1a1a",
            padding: "20px",
            borderRadius: "8px",
            border: "1px solid #333",
            cursor: "pointer",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "#ef4444"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "#333"}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div style={{ color: "#999", fontSize: "12px", marginBottom: "4px", fontWeight: "600" }}>
                ⏳ PENDING
              </div>
              <div style={{ color: "#999", fontSize: "12px", marginBottom: "8px" }}>
                Approvals
              </div>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#f59e0b" }}>
                {loading ? "..." : stats.pendingApprovals.count}
              </div>
              <div style={{ fontSize: "14px", color: "#666", marginTop: "4px" }}>
                {loading ? "..." : formatCurrency(stats.pendingApprovals.amount)}
              </div>
            </div>
          </div>
          <div style={{ marginTop: "12px" }}>
            <button
              style={{
                fontSize: "12px",
                color: "#ef4444",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              View All →
            </button>
          </div>
        </div>

        {/* Unpaid Total */}
        <div
          onClick={() => router.push("/admin/commissions")}
          style={{
            background: "#1a1a1a",
            padding: "20px",
            borderRadius: "8px",
            border: "1px solid #333",
            cursor: "pointer",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "#ef4444"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "#333"}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div style={{ color: "#999", fontSize: "12px", marginBottom: "4px", fontWeight: "600" }}>
                💰 UNPAID
              </div>
              <div style={{ color: "#999", fontSize: "12px", marginBottom: "8px" }}>
                Total
              </div>
              <div style={{ fontSize: "24px", fontWeight: "bold" }}>
                {loading ? "..." : formatCurrency(stats.unpaidTotal)}
              </div>
            </div>
          </div>
          <div style={{ marginTop: "12px" }}>
            <button
              style={{
                fontSize: "12px",
                color: "#ef4444",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              View All →
            </button>
          </div>
        </div>

        {/* This Month */}
        <div
          onClick={() => router.push("/admin/commission-reports")}
          style={{
            background: "#1a1a1a",
            padding: "20px",
            borderRadius: "8px",
            border: "1px solid #333",
            cursor: "pointer",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "#ef4444"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "#333"}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div style={{ color: "#999", fontSize: "12px", marginBottom: "4px", fontWeight: "600" }}>
                📊 THIS MONTH
              </div>
              <div style={{ color: "#999", fontSize: "12px", marginBottom: "8px" }}>
                Commissions
              </div>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#10b981" }}>
                {loading ? "..." : formatCurrency(stats.thisMonth)}
              </div>
            </div>
          </div>
          <div style={{ marginTop: "12px" }}>
            <button
              style={{
                fontSize: "12px",
                color: "#ef4444",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              View Report →
            </button>
          </div>
        </div>

        {/* Flagged */}
        <div
          onClick={() => router.push("/admin/commissions?tab=flagged")}
          style={{
            background: "#1a1a1a",
            padding: "20px",
            borderRadius: "8px",
            border: "1px solid #333",
            cursor: "pointer",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "#ef4444"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "#333"}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div style={{ color: "#999", fontSize: "12px", marginBottom: "4px", fontWeight: "600" }}>
                ⚠️ FLAGGED
              </div>
              <div style={{ color: "#999", fontSize: "12px", marginBottom: "8px" }}>
                Commissions
              </div>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#ef4444" }}>
                {loading ? "..." : stats.flaggedCount}
              </div>
            </div>
          </div>
          <div style={{ marginTop: "12px" }}>
            <button
              style={{
                fontSize: "12px",
                color: "#ef4444",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Review →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
