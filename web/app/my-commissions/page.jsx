"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function MyCommissionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [commissions, setCommissions] = useState([]);
  const [summary, setSummary] = useState({
    ytdTotal: 0,
    ytdPaid: 0,
    ytdPending: 0,
    thisMonth: 0,
  });
  const [monthlyData, setMonthlyData] = useState([]);
  const [projectedCommissions, setProjectedCommissions] = useState([]);
  const [flaggedCommissions, setFlaggedCommissions] = useState([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (!user) {
      router.push("/login");
    } else {
      fetchCommissionData();
    }
  }, [user, router, selectedYear]);

  const fetchCommissionData = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${user.token}` };

      // Fetch my commissions
      const commissionsRes = await fetch("/api/commissions/my", { headers });
      if (commissionsRes.ok) {
        const data = await commissionsRes.json();
        setCommissions(data);
      }

      // Fetch summary
      const summaryRes = await fetch("/api/commissions/my/summary", { headers });
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
      }

      // Fetch monthly data
      const monthlyRes = await fetch(`/api/commissions/my/monthly?year=${selectedYear}`, { headers });
      if (monthlyRes.ok) {
        const data = await monthlyRes.json();
        setMonthlyData(data);
      }

      // Fetch projected earnings
      const projectedRes = await fetch("/api/commissions/projected", { headers });
      if (projectedRes.ok) {
        const data = await projectedRes.json();
        setProjectedCommissions(data);
      }

      // Fetch flagged commissions (AWAITING_PRICES only for agents)
      const flaggedRes = await fetch("/api/commissions/flagged", { headers });
      if (flaggedRes.ok) {
        const data = await flaggedRes.json();
        setFlaggedCommissions(data.filter(c => c.flagReason === 'AWAITING_PRICES'));
      }
    } catch (error) {
      console.error("Error fetching commission data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-900 text-yellow-300";
      case "APPROVED":
        return "bg-green-900 text-green-300";
      case "PAID":
        return "bg-gray-700 text-gray-300";
      case "REJECTED":
        return "bg-red-900 text-red-300";
      default:
        return "bg-gray-700 text-gray-300";
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);
  };

  const chartData = {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    datasets: [
      {
        label: "Paid",
        data: monthlyData.map((d) => d?.paid || 0),
        backgroundColor: "rgba(34, 197, 94, 0.8)",
      },
      {
        label: "Pending",
        data: monthlyData.map((d) => d?.pending || 0),
        backgroundColor: "rgba(250, 204, 21, 0.8)",
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: { color: "rgba(255, 255, 255, 0.7)" },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
          },
        },
      },
    },
    scales: {
      x: { ticks: { color: "rgba(255, 255, 255, 0.7)" } },
      y: { 
        ticks: { 
          color: "rgba(255, 255, 255, 0.7)",
          callback: (value) => formatCurrency(value),
        },
      },
    },
  };

  if (!user) return null;

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "100px 24px 24px" }}>
        <h1 style={{ fontSize: "32px", fontWeight: "700", marginBottom: "32px", color: "#ef4444" }}>
          My Commissions
        </h1>

        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px", marginBottom: "32px" }}>
          <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "8px", border: "1px solid #333" }}>
            <div style={{ color: "#999", fontSize: "14px", marginBottom: "8px" }}>YTD Earnings</div>
            <div style={{ fontSize: "32px", fontWeight: "bold" }}>{formatCurrency(summary.ytdTotal)}</div>
            <div style={{ color: "#10b981", fontSize: "14px", marginTop: "8px" }}>
              {summary.ytdPaid > 0 ? `${formatCurrency(summary.ytdPaid)} paid` : ""}
            </div>
          </div>
          
          <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "8px", border: "1px solid #333" }}>
            <div style={{ color: "#999", fontSize: "14px", marginBottom: "8px" }}>Pending Approval</div>
            <div style={{ fontSize: "32px", fontWeight: "bold", color: "#f59e0b" }}>
              {formatCurrency(summary.ytdPending)}
            </div>
            <div style={{ color: "#666", fontSize: "14px", marginTop: "8px" }}>
              {commissions.filter(c => c.status === "PENDING").length} orders
            </div>
          </div>

          <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "8px", border: "1px solid #333" }}>
            <div style={{ color: "#999", fontSize: "14px", marginBottom: "8px" }}>This Month</div>
            <div style={{ fontSize: "32px", fontWeight: "bold" }}>{formatCurrency(summary.thisMonth)}</div>
          </div>

          <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "8px", border: "1px solid #333" }}>
            <div style={{ color: "#999", fontSize: "14px", marginBottom: "8px" }}>Projected</div>
            <div style={{ fontSize: "32px", fontWeight: "bold", color: "#60a5fa" }}>
              {formatCurrency(projectedCommissions.reduce((sum, c) => sum + c.totalCommissionAmount, 0))}
            </div>
            <div style={{ color: "#666", fontSize: "14px", marginTop: "8px" }}>
              {projectedCommissions.length} orders
            </div>
          </div>
        </div>

        {/* Flagged Commissions (if any) */}
        {flaggedCommissions.length > 0 && (
          <div style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "16px", color: "#f59e0b" }}>
              ⚠️ Incomplete Commissions ({flaggedCommissions.length})
            </h2>
            <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333", padding: "16px" }}>
              {flaggedCommissions.map((commission) => (
                <div key={commission.id} style={{ padding: "12px", borderBottom: "1px solid #333" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ color: "#ef4444", marginRight: "8px" }}>
                        Order #{commission.order?.poNumber || "N/A"}
                      </span>
                      <span style={{ color: "#999" }}>
                        - {commission.order?.account?.name || "N/A"} - Missing item prices
                      </span>
                    </div>
                    <button
                      onClick={() => router.push(`/admin/orders/${commission.orderId}`)}
                      style={{
                        padding: "6px 12px",
                        background: "#dc2626",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Add Prices
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projected Earnings */}
        {projectedCommissions.length > 0 && (
          <div style={{ marginBottom: "32px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "16px", color: "#60a5fa" }}>
              ⭐ Projected Earnings
            </h2>
            <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333" }}>
              <table style={{ width: "100%" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #333" }}>
                    <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Order #</th>
                    <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Customer</th>
                    <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Order Value</th>
                    <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Commission</th>
                    <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Expected Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {projectedCommissions.map((commission) => (
                    <tr key={commission.id} style={{ borderBottom: "1px solid #333" }}>
                      <td style={{ padding: "12px" }}>
                        <a
                          href={`/admin/orders/${commission.orderId}`}
                          style={{ color: "#ef4444", textDecoration: "none" }}
                        >
                          #{commission.order?.poNumber || "N/A"}
                        </a>
                      </td>
                      <td style={{ padding: "12px", color: "#ccc" }}>
                        {commission.order?.account?.name || "N/A"}
                      </td>
                      <td style={{ padding: "12px", color: "#ccc" }}>
                        {formatCurrency(commission.orderTotalAmount)}
                      </td>
                      <td style={{ padding: "12px", color: "#60a5fa", fontWeight: "bold" }}>
                        {formatCurrency(commission.totalCommissionAmount)}
                      </td>
                      <td style={{ padding: "12px", color: "#999" }}>
                        {commission.payouts?.[0]?.stage || "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Monthly Chart */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: "600" }}>
              📊 Monthly Commissions
            </h2>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{
                padding: "8px",
                background: "#1a1a1a",
                color: "white",
                border: "1px solid #333",
                borderRadius: "4px",
              }}
            >
              {[2024, 2025, 2026].map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "8px", border: "1px solid #333", height: "300px" }}>
            {monthlyData.length > 0 ? (
              <Bar data={chartData} options={chartOptions} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#666" }}>
                No commission data available for {selectedYear}
              </div>
            )}
          </div>
        </div>

        {/* Commission History */}
        <div style={{ marginBottom: "32px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "16px" }}>
            💰 Payment History
          </h2>
          <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333", overflow: "hidden" }}>
            <table style={{ width: "100%" }}>
              <thead>
                <tr style={{ background: "#252525", borderBottom: "1px solid #333" }}>
                  <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Order #</th>
                  <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Customer</th>
                  <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Stage</th>
                  <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Order Value</th>
                  <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Rate</th>
                  <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Commission</th>
                  <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" style={{ padding: "24px", textAlign: "center", color: "#666" }}>
                      Loading...
                    </td>
                  </tr>
                ) : commissions.length > 0 ? (
                  commissions.map((commission) => (
                    commission.payouts?.map((payout) => (
                      <tr key={`${commission.id}-${payout.id}`} style={{ borderBottom: "1px solid #333" }}>
                        <td style={{ padding: "12px" }}>
                          <a
                            href={`/admin/orders/${commission.orderId}`}
                            style={{ color: "#ef4444", textDecoration: "none" }}
                          >
                            #{commission.order?.poNumber || "N/A"}
                          </a>
                        </td>
                        <td style={{ padding: "12px", color: "#ccc" }}>
                          {commission.order?.account?.name || "N/A"}
                        </td>
                        <td style={{ padding: "12px", color: "#ccc" }}>{payout.stage}</td>
                        <td style={{ padding: "12px", color: "#ccc" }}>
                          {formatCurrency(commission.orderTotalAmount)}
                        </td>
                        <td style={{ padding: "12px", color: "#ccc" }}>
                          {commission.commissionRate}%
                        </td>
                        <td style={{ padding: "12px", color: "#ccc", fontWeight: "bold" }}>
                          {formatCurrency(payout.amount)}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span
                            className={getStatusBadgeClass(payout.status)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontWeight: "600",
                            }}
                          >
                            {payout.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" style={{ padding: "24px", textAlign: "center", color: "#666" }}>
                      No commission history available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
