"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

export default function CommissionReportsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedSalesRep, setSelectedSalesRep] = useState("all");
  const [salesReps, setSalesReps] = useState([]);
  
  // Report Data
  const [ytdSummary, setYtdSummary] = useState({
    totalCalculated: 0,
    totalPaid: 0,
    totalPending: 0,
    totalProjected: 0,
  });
  const [monthlyData, setMonthlyData] = useState([]);
  const [salesRepData, setSalesRepData] = useState([]);
  const [stageBreakdown, setStageBreakdown] = useState([]);

  useEffect(() => {
    if (!user) {
      router.push("/login");
    } else if (user.role !== "SUPER_ADMIN" && user.role !== "ACCOUNTANT" && user.role !== "ADMIN") {
      router.push("/my-commissions");
    } else {
      fetchReportData();
    }
  }, [user, router, selectedYear, selectedSalesRep]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${user.token}` };

      // Fetch YTD summary
      const ytdRes = await fetch(
        `/api/commissions/reports/ytd?year=${selectedYear}${
          selectedSalesRep !== "all" ? `&salesRep=${selectedSalesRep}` : ""
        }`,
        { headers }
      );
      if (ytdRes.ok) {
        const data = await ytdRes.json();
        setYtdSummary(data);
      }

      // Fetch monthly breakdown
      const monthlyRes = await fetch(
        `/api/commissions/reports/monthly?year=${selectedYear}${
          selectedSalesRep !== "all" ? `&salesRep=${selectedSalesRep}` : ""
        }`,
        { headers }
      );
      if (monthlyRes.ok) {
        const data = await ytdRes.json();
        setMonthlyData(data);
      }

      // Fetch by sales rep (only if viewing all reps)
      if (selectedSalesRep === "all") {
        const repRes = await fetch(`/api/commissions/reports/by-rep?year=${selectedYear}`, { headers });
        if (repRes.ok) {
          const data = await repRes.json();
          setSalesRepData(data);
        }
      }

      // Fetch sales reps list
      if (salesReps.length === 0) {
        const usersRes = await fetch("/api/users", { headers });
        if (usersRes.ok) {
          const data = await usersRes.json();
          setSalesReps(data.filter(u => u.showInSalesRepDropdown && u.isActive));
        }
      }

      // Mock stage breakdown data (would come from API)
      setStageBreakdown([
        { stage: "SHIPPING", amount: 45000 },
        { stage: "DELIVERED", amount: 38000 },
        { stage: "MANUFACTURING", amount: 12000 },
      ]);
    } catch (error) {
      console.error("Error fetching report data:", error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async () => {
    try {
      const headers = { Authorization: `Bearer ${user.token}` };
      const res = await fetch(
        `/api/commissions/reports/export-csv?year=${selectedYear}${
          selectedSalesRep !== "all" ? `&salesRep=${selectedSalesRep}` : ""
        }`,
        { headers }
      );
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `commission-report-${selectedYear}${
          selectedSalesRep !== "all" ? `-${selectedSalesRep}` : ""
        }.csv`;
        a.click();
      }
    } catch (error) {
      console.error("Error exporting CSV:", error);
      alert("Failed to export CSV");
    }
  };

  const exportToPDF = async () => {
    try {
      const headers = { Authorization: `Bearer ${user.token}` };
      const res = await fetch(
        `/api/commissions/reports/export-pdf?year=${selectedYear}${
          selectedSalesRep !== "all" ? `&salesRep=${selectedSalesRep}` : ""
        }`,
        { headers }
      );
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `commission-report-${selectedYear}${
          selectedSalesRep !== "all" ? `-${selectedSalesRep}` : ""
        }.pdf`;
        a.click();
      }
    } catch (error) {
      console.error("Error exporting PDF:", error);
      alert("Failed to export PDF");
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

  // Chart configurations
  const monthlyChartData = {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    datasets: [
      {
        label: "Paid",
        data: monthlyData.map((d) => d?.paid || 0),
        backgroundColor: "rgba(34, 197, 94, 0.8)",
        borderColor: "rgba(34, 197, 94, 1)",
        borderWidth: 1,
      },
      {
        label: "Pending",
        data: monthlyData.map((d) => d?.pending || 0),
        backgroundColor: "rgba(250, 204, 21, 0.8)",
        borderColor: "rgba(250, 204, 21, 1)",
        borderWidth: 1,
      },
    ],
  };

  const monthlyChartOptions = {
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
      x: { 
        ticks: { color: "rgba(255, 255, 255, 0.7)" },
        grid: { color: "rgba(255, 255, 255, 0.1)" },
      },
      y: {
        ticks: {
          color: "rgba(255, 255, 255, 0.7)",
          callback: (value) => formatCurrency(value),
        },
        grid: { color: "rgba(255, 255, 255, 0.1)" },
      },
    },
  };

  const stageChartData = {
    labels: stageBreakdown.map(s => s.stage),
    datasets: [{
      data: stageBreakdown.map(s => s.amount),
      backgroundColor: [
        "rgba(239, 68, 68, 0.8)",
        "rgba(34, 197, 94, 0.8)",
        "rgba(96, 165, 250, 0.8)",
        "rgba(250, 204, 21, 0.8)",
      ],
      borderColor: [
        "rgba(239, 68, 68, 1)",
        "rgba(34, 197, 94, 1)",
        "rgba(96, 165, 250, 1)",
        "rgba(250, 204, 21, 1)",
      ],
      borderWidth: 1,
    }],
  };

  const stageChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right",
        labels: { color: "rgba(255, 255, 255, 0.7)" },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((context.parsed / total) * 100).toFixed(1);
            return `${context.label}: ${formatCurrency(context.parsed)} (${percentage}%)`;
          },
        },
      },
    },
  };

  const topPerformersData = {
    labels: salesRepData.slice(0, 5).map(s => s.salesPersonName),
    datasets: [{
      label: "Total Earnings",
      data: salesRepData.slice(0, 5).map(s => s.total),
      backgroundColor: "rgba(239, 68, 68, 0.8)",
      borderColor: "rgba(239, 68, 68, 1)",
      borderWidth: 1,
    }],
  };

  const topPerformersOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y",
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => formatCurrency(context.parsed.x),
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "rgba(255, 255, 255, 0.7)",
          callback: (value) => formatCurrency(value),
        },
        grid: { color: "rgba(255, 255, 255, 0.1)" },
      },
      y: {
        ticks: { color: "rgba(255, 255, 255, 0.7)" },
        grid: { display: false },
      },
    },
  };

  if (!user) return null;
  if (user.role === "AGENT" || user.role === "MANUFACTURER") return null;

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "100px 24px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <h1 style={{ fontSize: "32px", fontWeight: "700", color: "#ef4444" }}>
            Commission Reports
          </h1>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{
                padding: "10px",
                background: "#1a1a1a",
                color: "white",
                border: "1px solid #333",
                borderRadius: "4px",
              }}
            >
              {[2023, 2024, 2025, 2026].map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <select
              value={selectedSalesRep}
              onChange={(e) => setSelectedSalesRep(e.target.value)}
              style={{
                padding: "10px",
                background: "#1a1a1a",
                color: "white",
                border: "1px solid #333",
                borderRadius: "4px",
              }}
            >
              <option value="all">All Sales Reps</option>
              {salesReps.map((rep) => (
                <option key={rep.id} value={rep.name}>
                  {rep.name}
                </option>
              ))}
            </select>
            <button
              onClick={exportToCSV}
              style={{
                padding: "10px 20px",
                background: "#666",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Export CSV
            </button>
            <button
              onClick={exportToPDF}
              style={{
                padding: "10px 20px",
                background: "#dc2626",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Export PDF
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Loading...</div>
        ) : (
          <>
            {/* YTD Overview Cards */}
            <div style={{ marginBottom: "32px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "16px", color: "#999" }}>
                YTD Overview ({selectedYear})
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px" }}>
                <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "8px", border: "1px solid #333" }}>
                  <div style={{ color: "#999", fontSize: "14px", marginBottom: "8px" }}>Calculated</div>
                  <div style={{ fontSize: "28px", fontWeight: "bold" }}>
                    {formatCurrency(ytdSummary.totalCalculated)}
                  </div>
                </div>
                <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "8px", border: "1px solid #333" }}>
                  <div style={{ color: "#999", fontSize: "14px", marginBottom: "8px" }}>Paid</div>
                  <div style={{ fontSize: "28px", fontWeight: "bold", color: "#10b981" }}>
                    {formatCurrency(ytdSummary.totalPaid)}
                  </div>
                </div>
                <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "8px", border: "1px solid #333" }}>
                  <div style={{ color: "#999", fontSize: "14px", marginBottom: "8px" }}>Pending</div>
                  <div style={{ fontSize: "28px", fontWeight: "bold", color: "#f59e0b" }}>
                    {formatCurrency(ytdSummary.totalPending)}
                  </div>
                </div>
                <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "8px", border: "1px solid #333" }}>
                  <div style={{ color: "#999", fontSize: "14px", marginBottom: "8px" }}>Projected</div>
                  <div style={{ fontSize: "28px", fontWeight: "bold", color: "#60a5fa" }}>
                    {formatCurrency(ytdSummary.totalProjected)}
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly Breakdown Chart */}
            <div style={{ marginBottom: "32px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "16px", color: "#999" }}>
                Monthly Breakdown
              </h2>
              <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "8px", border: "1px solid #333", height: "400px" }}>
                <Bar data={monthlyChartData} options={monthlyChartOptions} />
              </div>
            </div>

            {/* Two Column Layout for Charts */}
            <div style={{ display: "grid", gridTemplateColumns: selectedSalesRep === "all" ? "1fr 1fr" : "1fr", gap: "20px", marginBottom: "32px" }}>
              {/* Stage Breakdown (Pie Chart) */}
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "16px", color: "#999" }}>
                  Commission by Stage
                </h2>
                <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "8px", border: "1px solid #333", height: "300px" }}>
                  <Doughnut data={stageChartData} options={stageChartOptions} />
                </div>
              </div>

              {/* Top Performers (only show if viewing all reps) */}
              {selectedSalesRep === "all" && salesRepData.length > 0 && (
                <div>
                  <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "16px", color: "#999" }}>
                    Top Performers
                  </h2>
                  <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "8px", border: "1px solid #333", height: "300px" }}>
                    <Bar data={topPerformersData} options={topPerformersOptions} />
                  </div>
                </div>
              )}
            </div>

            {/* Sales Rep Table (only show if viewing all reps) */}
            {selectedSalesRep === "all" && salesRepData.length > 0 && (
              <div style={{ marginBottom: "32px" }}>
                <h2 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "16px", color: "#999" }}>
                  By Sales Representative
                </h2>
                <div style={{ background: "#1a1a1a", borderRadius: "8px", border: "1px solid #333", overflow: "hidden" }}>
                  <table style={{ width: "100%" }}>
                    <thead>
                      <tr style={{ background: "#252525", borderBottom: "1px solid #333" }}>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999" }}>Sales Person</th>
                        <th style={{ padding: "12px", textAlign: "right", color: "#999" }}>Total</th>
                        <th style={{ padding: "12px", textAlign: "right", color: "#999" }}>Paid</th>
                        <th style={{ padding: "12px", textAlign: "right", color: "#999" }}>Pending</th>
                        <th style={{ padding: "12px", textAlign: "right", color: "#999" }}>Projected</th>
                        <th style={{ padding: "12px", textAlign: "right", color: "#999" }}>Performance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesRepData.map((rep, index) => {
                        const maxTotal = Math.max(...salesRepData.map(r => r.total));
                        const performancePercentage = (rep.total / maxTotal) * 100;
                        
                        return (
                          <tr key={index} style={{ borderBottom: "1px solid #333" }}>
                            <td style={{ padding: "12px" }}>
                              <button
                                onClick={() => setSelectedSalesRep(rep.salesPersonName)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#ef4444",
                                  cursor: "pointer",
                                  textDecoration: "underline",
                                }}
                              >
                                {rep.salesPersonName}
                              </button>
                            </td>
                            <td style={{ padding: "12px", textAlign: "right", fontWeight: "bold" }}>
                              {formatCurrency(rep.total)}
                            </td>
                            <td style={{ padding: "12px", textAlign: "right", color: "#10b981" }}>
                              {formatCurrency(rep.paid)}
                            </td>
                            <td style={{ padding: "12px", textAlign: "right", color: "#f59e0b" }}>
                              {formatCurrency(rep.pending)}
                            </td>
                            <td style={{ padding: "12px", textAlign: "right", color: "#60a5fa" }}>
                              {formatCurrency(rep.projected || 0)}
                            </td>
                            <td style={{ padding: "12px", textAlign: "right" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                                <div style={{
                                  width: "100px",
                                  height: "8px",
                                  background: "#333",
                                  borderRadius: "4px",
                                  overflow: "hidden",
                                }}>
                                  <div style={{
                                    width: `${performancePercentage}%`,
                                    height: "100%",
                                    background: performancePercentage > 75 ? "#10b981" :
                                               performancePercentage > 50 ? "#f59e0b" :
                                               performancePercentage > 25 ? "#60a5fa" : "#ef4444",
                                  }} />
                                </div>
                                <span style={{ fontSize: "12px", color: "#999" }}>
                                  {performancePercentage.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: "#252525", fontWeight: "bold" }}>
                        <td style={{ padding: "12px" }}>TOTAL</td>
                        <td style={{ padding: "12px", textAlign: "right" }}>
                          {formatCurrency(salesRepData.reduce((sum, r) => sum + r.total, 0))}
                        </td>
                        <td style={{ padding: "12px", textAlign: "right", color: "#10b981" }}>
                          {formatCurrency(salesRepData.reduce((sum, r) => sum + r.paid, 0))}
                        </td>
                        <td style={{ padding: "12px", textAlign: "right", color: "#f59e0b" }}>
                          {formatCurrency(salesRepData.reduce((sum, r) => sum + r.pending, 0))}
                        </td>
                        <td style={{ padding: "12px", textAlign: "right", color: "#60a5fa" }}>
                          {formatCurrency(salesRepData.reduce((sum, r) => sum + (r.projected || 0), 0))}
                        </td>
                        <td style={{ padding: "12px" }}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
