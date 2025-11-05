"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

export default function CommissionSettingsPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("global");
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Recalculate confirmation modal state
  const [showRecalculateModal, setShowRecalculateModal] = useState(false);
  const [recalculateReason, setRecalculateReason] = useState("");

  // Clear rates modal state
  const [showClearRatesModal, setShowClearRatesModal] = useState(false);

  // Success notification state
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Recalculate results modal state
  const [showRecalculateResults, setShowRecalculateResults] = useState(false);
  const [recalculateResults, setRecalculateResults] = useState(null);
  
  // Global Settings State
  const [globalSettings, setGlobalSettings] = useState({
    enabled: true,
    defaultRate: 5.0,
    calculationBasis: "ORDER_TOTAL",
    paymentTrigger: "STAGE_REACHED",
    minimumOrderValue: 0,
    tieredEnabled: false,
  });

  // Stage Distribution State
  const [stageDistribution, setStageDistribution] = useState([
    { stage: "SHIPPING", percentage: 50 },
    { stage: "DELIVERED", percentage: 50 },
  ]);

  // Individual Rates State
  const [salesReps, setSalesReps] = useState([]);
  const [individualRates, setIndividualRates] = useState({});

  // Available stages - FIXED: Using actual system stages
  const availableStages = [
    "MANUFACTURING",
    "TESTING",
    "SHIPPING",
    "AT_SEA",
    "SMT",
    "QC",
    "DELIVERED",
    "ONSITE",
    "COMPLETED",
    "FOLLOW_UP",
  ];

  useEffect(() => {
    if (!user) {
      router.push("/login");
    } else if (user.role !== "SUPER_ADMIN") {
      router.push("/admin/commissions");
    } else {
      fetchSettings();
    }
  }, [user, router]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();

      // Fetch global settings
      const settingsRes = await fetch("/api/commission-settings/global", {
        headers,
        cache: "no-store"
      });
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setGlobalSettings(data);
      }

      // Fetch stage settings
      const stagesRes = await fetch("/api/commission-settings/stages", {
        headers,
        cache: "no-store"
      });
      if (stagesRes.ok) {
        const data = await stagesRes.json();
        setStageDistribution(data.map(s => ({ stage: s.stage, percentage: s.percentage })));
      }

      // Fetch individual rates
      const ratesRes = await fetch("/api/commission-settings/rates", {
        headers,
        cache: "no-store"
      });
      if (ratesRes.ok) {
        const data = await ratesRes.json();
        const ratesMap = {};
        data.forEach(rate => {
          ratesMap[rate.salesPersonName] = rate.rate;
        });
        setIndividualRates(ratesMap);
      }

      // Fetch users who can be sales reps
      const usersRes = await fetch("/api/commission-settings/sales-reps", {
        headers,
        cache: "no-store"
      });
      if (usersRes.ok) {
        const data = await usersRes.json();
        console.log('[Commission Settings] Sales reps received:', data);
        console.log('[Commission Settings] Number of sales reps:', data.length);
        setSalesReps(data);
      } else {
        console.error('[Commission Settings] Failed to fetch sales reps:', usersRes.status);
        const errorData = await usersRes.json().catch(() => ({}));
        console.error('[Commission Settings] Error details:', errorData);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveGlobalSettings = async () => {
    try {
      setSaving(true);
      const res = await fetch("/api/commission-settings/global", {
        method: "PUT",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(globalSettings),
      });

      if (res.ok) {
        setHasChanges(false);
        setSuccessMessage("Global settings saved successfully");
        setShowSuccessNotification(true);
        setTimeout(() => setShowSuccessNotification(false), 3000);
      } else {
        const error = await res.json();
        setSuccessMessage(error.error || "Failed to save global settings");
        setShowSuccessNotification(true);
        setTimeout(() => setShowSuccessNotification(false), 3000);
      }
    } catch (error) {
      console.error("Error saving global settings:", error);
      setSuccessMessage("Error saving global settings");
      setShowSuccessNotification(true);
      setTimeout(() => setShowSuccessNotification(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const saveStageDistribution = async () => {
    const total = stageDistribution.reduce((sum, s) => sum + Number(s.percentage), 0);

    if (Math.abs(total - 100) > 0.01) {
      setSuccessMessage(`Stage percentages must total 100%. Current total: ${total}%`);
      setShowSuccessNotification(true);
      setTimeout(() => setShowSuccessNotification(false), 3000);
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/commission-settings/stages", {
        method: "PUT",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(stageDistribution.map((s, index) => ({
          ...s,
          percentage: Number(s.percentage),
          sortOrder: index + 1,
        }))),
      });

      if (res.ok) {
        setHasChanges(false);
        await fetchSettings(); // Refresh to get server state
        setSuccessMessage("Stage distribution saved successfully");
        setShowSuccessNotification(true);
        setTimeout(() => setShowSuccessNotification(false), 3000);
      } else {
        const error = await res.json();
        setSuccessMessage(error.error || "Failed to save stage distribution");
        setShowSuccessNotification(true);
        setTimeout(() => setShowSuccessNotification(false), 3000);
      }
    } catch (error) {
      console.error("Error saving stage distribution:", error);
      setSuccessMessage("Error saving stage distribution");
      setShowSuccessNotification(true);
      setTimeout(() => setShowSuccessNotification(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const saveIndividualRate = async (salesPersonName, rate) => {
    if (rate < 0 || rate > 100) {
      setSuccessMessage("Rate must be between 0 and 100");
      setShowSuccessNotification(true);
      setTimeout(() => setShowSuccessNotification(false), 3000);
      return;
    }

    try {
      const res = await fetch(`/api/commission-settings/rates/${encodeURIComponent(salesPersonName)}`, {
        method: "PUT",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rate: Number(rate) }),
      });

      if (res.ok) {
        setIndividualRates({ ...individualRates, [salesPersonName]: Number(rate) });
        setSuccessMessage(`Rate saved for ${salesPersonName}`);
        setShowSuccessNotification(true);
        setTimeout(() => setShowSuccessNotification(false), 3000);
      } else {
        setSuccessMessage("Failed to save rate");
        setShowSuccessNotification(true);
        setTimeout(() => setShowSuccessNotification(false), 3000);
      }
    } catch (error) {
      console.error("Error saving rate:", error);
      setSuccessMessage("Error saving rate");
      setShowSuccessNotification(true);
      setTimeout(() => setShowSuccessNotification(false), 3000);
    }
  };

  const recalculateAllCommissions = () => {
    setShowRecalculateModal(true);
  };

  const executeRecalculate = async () => {
    if (!recalculateReason || recalculateReason.trim().length < 10) {
      return;
    }

    try {
      setRecalculating(true);
      const res = await fetch("/api/commission-settings/recalculate-all", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: recalculateReason.trim() }),
      });

      if (res.ok) {
        const result = await res.json();
        setShowRecalculateModal(false);
        setRecalculateReason("");
        setRecalculateResults(result.results);
        setShowRecalculateResults(true);
      } else {
        const error = await res.json();
        setSuccessMessage(error.error || "Failed to recalculate commissions");
        setShowSuccessNotification(true);
        setTimeout(() => setShowSuccessNotification(false), 3000);
      }
    } catch (error) {
      console.error("Error recalculating commissions:", error);
      setSuccessMessage("Error recalculating commissions");
      setShowSuccessNotification(true);
      setTimeout(() => setShowSuccessNotification(false), 3000);
    } finally {
      setRecalculating(false);
    }
  };

  const cancelRecalculate = () => {
    setShowRecalculateModal(false);
    setRecalculateReason("");
  };

  const addStage = () => {
    const availableToAdd = availableStages.filter(
      s => !stageDistribution.find(sd => sd.stage === s)
    );
    
    if (availableToAdd.length === 0) {
      alert("All stages have been added");
      return;
    }

    setStageDistribution([
      ...stageDistribution,
      { stage: availableToAdd[0], percentage: 0 },
    ]);
    setHasChanges(true);
  };

  const removeStage = (index) => {
    const newDistribution = stageDistribution.filter((_, i) => i !== index);
    setStageDistribution(newDistribution);
    setHasChanges(true);
  };

  const updateStagePercentage = (index, value) => {
    const newDistribution = [...stageDistribution];
    newDistribution[index].percentage = Number(value);
    setStageDistribution(newDistribution);
    setHasChanges(true);
  };

  const updateStage = (index, newStage) => {
    const newDistribution = [...stageDistribution];
    newDistribution[index].stage = newStage;
    setStageDistribution(newDistribution);
    setHasChanges(true);
  };

  const calculateExampleCommission = (percentage) => {
    const orderValue = 10000;
    const rate = 5;
    return (orderValue * rate * percentage) / 10000;
  };

  const stageTotal = stageDistribution.reduce((sum, s) => sum + Number(s.percentage), 0);
  const isValidTotal = Math.abs(stageTotal - 100) < 0.01;

  const getAvatarGradient = (index) => {
    const gradients = [
      "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
      "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
      "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
      "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    ];
    return gradients[index % gradients.length];
  };

  if (!user) return null;
  if (user.role !== "SUPER_ADMIN") return null;

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "100px 24px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <h1 style={{ fontSize: "32px", fontWeight: "700", color: "#ef4444" }}>
            Commission Settings
          </h1>
          <button
            onClick={recalculateAllCommissions}
            disabled={recalculating}
            style={{
              padding: "12px 24px",
              background: recalculating ? "#666" : "#f59e0b",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: recalculating ? "not-allowed" : "pointer",
              fontWeight: "600",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {recalculating ? "⏳ Recalculating..." : "🔄 Recalculate All Commissions"}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "30px", borderBottom: "2px solid #333" }}>
          {["global", "stages", "rates", "tiered"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "12px 24px",
                background: "none",
                color: activeTab === tab ? "#ef4444" : "#999",
                border: "none",
                borderBottom: activeTab === tab ? "2px solid #ef4444" : "2px solid transparent",
                cursor: "pointer",
                fontSize: "16px",
                marginBottom: "-2px",
                textTransform: "capitalize",
              }}
            >
              {tab === "global" ? "Global Settings" : 
               tab === "stages" ? "Stage Distribution" :
               tab === "rates" ? "Individual Rates" : "Tiered Rates"}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>Loading...</div>
        ) : (
          <>
            {/* Global Settings Tab */}
            {activeTab === "global" && (
              <div style={{ background: "#1a1a1a", padding: "30px", borderRadius: "8px", border: "1px solid #333" }}>
                <div style={{
                  background: "rgba(220, 38, 38, 0.1)",
                  border: "1px solid #dc2626",
                  borderRadius: "6px",
                  padding: "15px",
                  marginBottom: "30px",
                  display: "flex",
                  gap: "15px",
                }}>
                  <div style={{ fontSize: "24px" }}>ℹ️</div>
                  <div>
                    <div style={{ fontWeight: "600", marginBottom: "5px" }}>How Commissions Work</div>
                    <div style={{ color: "#999", fontSize: "14px" }}>
                      Commissions are calculated based on the total order value when an order reaches specified stages.
                      Individual agent rates override the default rate. Stage distribution determines when payouts occur.
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: "24px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={globalSettings.enabled}
                      onChange={(e) => {
                        setGlobalSettings({ ...globalSettings, enabled: e.target.checked });
                        setHasChanges(true);
                      }}
                    />
                    <span style={{ fontSize: "16px" }}>Enable Commission System</span>
                  </label>
                </div>

                <div style={{ marginBottom: "24px" }}>
                  <label style={{ display: "block", marginBottom: "8px", color: "#999", fontSize: "14px" }}>
                    Default Commission Rate
                  </label>
                  <div style={{ display: "flex", alignItems: "center", position: "relative", maxWidth: "200px" }}>
                    <input
                      type="number"
                      value={globalSettings.defaultRate}
                      onChange={(e) => {
                        setGlobalSettings({ ...globalSettings, defaultRate: Number(e.target.value) });
                        setHasChanges(true);
                      }}
                      step="0.1"
                      min="0"
                      max="100"
                      style={{
                        width: "100%",
                        padding: "10px",
                        paddingRight: "30px",
                        background: "#252525",
                        border: "1px solid #333",
                        color: "white",
                        borderRadius: "6px",
                      }}
                    />
                    <span style={{ position: "absolute", right: "12px", color: "#999" }}>%</span>
                  </div>
                </div>

                <div style={{ marginBottom: "24px" }}>
                  <label style={{ display: "block", marginBottom: "8px", color: "#999", fontSize: "14px" }}>
                    Calculation Basis
                  </label>
                  <select
                    value={globalSettings.calculationBasis}
                    onChange={(e) => {
                      setGlobalSettings({ ...globalSettings, calculationBasis: e.target.value });
                      setHasChanges(true);
                    }}
                    style={{
                      width: "300px",
                      padding: "10px",
                      background: "#252525",
                      border: "1px solid #333",
                      color: "white",
                      borderRadius: "6px",
                    }}
                  >
                    <option value="ORDER_TOTAL">Order Total Value</option>
                    <option value="SUBTOTAL">Order Subtotal (before tax)</option>
                    <option value="PROFIT_MARGIN">Profit Margin</option>
                  </select>
                </div>

                <div style={{ marginBottom: "24px" }}>
                  <label style={{ display: "block", marginBottom: "8px", color: "#999", fontSize: "14px" }}>
                    Payment Trigger
                  </label>
                  <select
                    value={globalSettings.paymentTrigger}
                    onChange={(e) => {
                      setGlobalSettings({ ...globalSettings, paymentTrigger: e.target.value });
                      setHasChanges(true);
                    }}
                    style={{
                      width: "300px",
                      padding: "10px",
                      background: "#252525",
                      border: "1px solid #333",
                      color: "white",
                      borderRadius: "6px",
                    }}
                  >
                    <option value="STAGE_REACHED">When Order Reaches Stage</option>
                    <option value="ORDER_PAID">When Order is Paid</option>
                    <option value="MANUAL">Manual Trigger Only</option>
                  </select>
                </div>

                <div style={{ marginBottom: "32px" }}>
                  <label style={{ display: "block", marginBottom: "8px", color: "#999", fontSize: "14px" }}>
                    Minimum Order Value for Commission
                  </label>
                  <div style={{ display: "flex", alignItems: "center", position: "relative", maxWidth: "200px" }}>
                    <span style={{ position: "absolute", left: "12px", color: "#999" }}>$</span>
                    <input
                      type="number"
                      value={globalSettings.minimumOrderValue}
                      onChange={(e) => {
                        setGlobalSettings({ ...globalSettings, minimumOrderValue: Number(e.target.value) });
                        setHasChanges(true);
                      }}
                      step="100"
                      min="0"
                      style={{
                        width: "100%",
                        padding: "10px",
                        paddingLeft: "30px",
                        background: "#252525",
                        border: "1px solid #333",
                        color: "white",
                        borderRadius: "6px",
                      }}
                    />
                  </div>
                </div>

                <div style={{ textAlign: "center" }}>
                  <button
                    onClick={() => {
                      setGlobalSettings({
                        enabled: true,
                        defaultRate: 5.0,
                        calculationBasis: "ORDER_TOTAL",
                        paymentTrigger: "STAGE_REACHED",
                        minimumOrderValue: 0,
                        tieredEnabled: false,
                      });
                      setHasChanges(true);
                    }}
                    style={{
                      padding: "10px 20px",
                      background: "#333",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      marginRight: "10px",
                    }}
                  >
                    Reset to Defaults
                  </button>
                  <button
                    onClick={saveGlobalSettings}
                    disabled={saving || !hasChanges}
                    style={{
                      padding: "10px 20px",
                      background: hasChanges ? "#dc2626" : "#666",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: hasChanges ? "pointer" : "not-allowed",
                      fontWeight: "600",
                    }}
                  >
                    {saving ? "Saving..." : "Save Global Settings"}
                  </button>
                </div>
              </div>
            )}

            {/* Stage Distribution Tab */}
            {activeTab === "stages" && (
              <div style={{ background: "#1a1a1a", padding: "30px", borderRadius: "8px", border: "1px solid #333" }}>
                <div style={{
                  background: "rgba(250, 204, 21, 0.1)",
                  border: "1px solid #facc15",
                  borderRadius: "6px",
                  padding: "15px",
                  marginBottom: "30px",
                  display: "flex",
                  gap: "15px",
                }}>
                  <div style={{ fontSize: "24px" }}>💡</div>
                  <div>
                    <div style={{ fontWeight: "600", marginBottom: "5px" }}>Stage Distribution</div>
                    <div style={{ color: "#999", fontSize: "14px" }}>
                      Set the percentage of total commission paid when an order reaches each stage.
                      The total must equal 100%. Most common: 50% at shipping, 50% at delivery.
                      <br /><br />
                      <strong style={{ color: "#facc15" }}>⚠️ Important:</strong> Changes only apply to NEW orders.
                      Existing commissions will use their original distribution.
                    </div>
                  </div>
                </div>

                <div style={{ background: "#252525", borderRadius: "6px", overflow: "hidden", marginBottom: "20px" }}>
                  <table style={{ width: "100%" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #333" }}>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999", width: "30%" }}>Stage</th>
                        <th style={{ padding: "12px", textAlign: "center", color: "#999", width: "25%" }}>Commission %</th>
                        <th style={{ padding: "12px", textAlign: "left", color: "#999", width: "35%" }}>
                          Example ($10,000 order at 5% rate)
                        </th>
                        <th style={{ padding: "12px", textAlign: "center", color: "#999", width: "10%" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stageDistribution.map((item, index) => (
                        <tr key={index} style={{ borderBottom: "1px solid #333" }}>
                          <td style={{ padding: "12px" }}>
                            <select
                              value={item.stage}
                              onChange={(e) => updateStage(index, e.target.value)}
                              style={{
                                padding: "8px",
                                background: "#1a1a1a",
                                border: "1px solid #333",
                                color: "white",
                                borderRadius: "4px",
                                width: "100%",
                              }}
                            >
                              {availableStages.map((stage) => (
                                <option
                                  key={stage}
                                  value={stage}
                                  disabled={stageDistribution.some((s, i) => s.stage === stage && i !== index)}
                                >
                                  {stage}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                              <input
                                type="number"
                                value={item.percentage}
                                onChange={(e) => updateStagePercentage(index, e.target.value)}
                                step="0.1"
                                min="0"
                                max="100"
                                style={{
                                  width: "100px",
                                  padding: "8px",
                                  paddingRight: "25px",
                                  background: "#1a1a1a",
                                  border: "1px solid #333",
                                  color: "white",
                                  borderRadius: "4px",
                                  textAlign: "center",
                                }}
                              />
                              <span style={{ position: "absolute", right: "35px", color: "#999" }}>%</span>
                            </div>
                          </td>
                          <td style={{ padding: "12px", color: "#999" }}>
                            ${calculateExampleCommission(item.percentage).toFixed(2)}
                          </td>
                          <td style={{ padding: "12px", textAlign: "center" }}>
                            <button
                              onClick={() => removeStage(index)}
                              disabled={stageDistribution.length <= 1}
                              style={{
                                padding: "6px 12px",
                                background: stageDistribution.length > 1 ? "#ef4444" : "#333",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: stageDistribution.length > 1 ? "pointer" : "not-allowed",
                                fontSize: "12px",
                              }}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{
                  textAlign: "center",
                  fontSize: "18px",
                  fontWeight: "bold",
                  marginBottom: "20px",
                  color: isValidTotal ? "#10b981" : stageTotal > 100 ? "#ef4444" : "#f59e0b",
                }}>
                  Total: {stageTotal.toFixed(1)}% {isValidTotal && "✓"}
                </div>

                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <button
                    onClick={addStage}
                    style={{
                      padding: "10px 20px",
                      background: "#333",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      marginRight: "10px",
                    }}
                  >
                    + Add Stage
                  </button>
                </div>

                <div style={{ textAlign: "center" }}>
                  <button
                    onClick={saveStageDistribution}
                    disabled={saving || !isValidTotal || !hasChanges}
                    style={{
                      padding: "10px 20px",
                      background: isValidTotal && hasChanges ? "#dc2626" : "#666",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: isValidTotal && hasChanges ? "pointer" : "not-allowed",
                      fontWeight: "600",
                    }}
                  >
                    {saving ? "Saving..." : "Save Stage Distribution"}
                  </button>
                </div>
              </div>
            )}

            {/* Individual Rates Tab */}
            {activeTab === "rates" && (
              <div style={{ background: "#1a1a1a", padding: "30px", borderRadius: "8px", border: "1px solid #333" }}>
                <div style={{ marginBottom: "30px", color: "#999" }}>
                  Set custom commission rates for each sales agent. Leave blank to use the default rate.
                </div>

                {salesReps.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {salesReps.map((rep, index) => (
                      <div
                        key={rep.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "15px",
                          background: "#252525",
                          borderRadius: "6px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                          <div
                            style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "50%",
                              background: getAvatarGradient(index),
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: "bold",
                              color: "white",
                            }}
                          >
                            {rep.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <div style={{ fontWeight: "600" }}>{rep.name}</div>
                            <div style={{ color: "#666", fontSize: "13px" }}>{rep.email}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                            <input
                              type="number"
                              value={individualRates[rep.name] || ""}
                              onChange={(e) => {
                                setIndividualRates({
                                  ...individualRates,
                                  [rep.name]: e.target.value,
                                });
                              }}
                              placeholder={globalSettings.defaultRate.toString()}
                              step="0.1"
                              min="0"
                              max="100"
                              style={{
                                width: "100px",
                                padding: "8px",
                                paddingRight: "25px",
                                background: "#1a1a1a",
                                border: "1px solid #333",
                                color: "white",
                                borderRadius: "4px",
                                textAlign: "center",
                              }}
                            />
                            <span style={{ position: "absolute", right: "8px", color: "#999" }}>%</span>
                          </div>
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontWeight: "600",
                              background: individualRates[rep.name] ? "#dc2626" : "#666",
                              color: "white",
                            }}
                          >
                            {individualRates[rep.name] ? "Custom" : "Default"}
                          </span>
                          <button
                            onClick={() => saveIndividualRate(rep.name, individualRates[rep.name] || globalSettings.defaultRate)}
                            style={{
                              padding: "6px 12px",
                              background: "#10b981",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "12px",
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
                    No sales representatives found. Make sure users have "Show in Sales Rep Dropdown" enabled.
                  </div>
                )}

                <div style={{ textAlign: "center", marginTop: "30px" }}>
                  <button
                    onClick={() => setShowClearRatesModal(true)}
                    style={{
                      padding: "10px 20px",
                      background: "#333",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Clear All Custom Rates
                  </button>
                </div>
              </div>
            )}

            {/* Tiered Rates Tab */}
            {activeTab === "tiered" && (
              <div style={{ background: "#1a1a1a", padding: "30px", borderRadius: "8px", border: "1px solid #333" }}>
                <div style={{
                  background: "rgba(220, 38, 38, 0.1)",
                  border: "1px solid #dc2626",
                  borderRadius: "6px",
                  padding: "15px",
                  marginBottom: "30px",
                  display: "flex",
                  gap: "15px",
                }}>
                  <div style={{ fontSize: "24px" }}>🎯</div>
                  <div>
                    <div style={{ fontWeight: "600", marginBottom: "5px" }}>Tiered Commission Rates</div>
                    <div style={{ color: "#999", fontSize: "14px" }}>
                      Progressive commission rates based on sales volume. Higher sales = higher commission percentage.
                      This feature is optional and can be enabled separately from individual rates.
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: "24px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={globalSettings.tieredEnabled}
                      onChange={(e) => {
                        setGlobalSettings({ ...globalSettings, tieredEnabled: e.target.checked });
                        setHasChanges(true);
                      }}
                    />
                    <span style={{ fontSize: "16px" }}>Enable Tiered Commission Rates</span>
                  </label>
                </div>

                {globalSettings.tieredEnabled ? (
                  <div style={{ padding: "20px", background: "#252525", borderRadius: "6px" }}>
                    <p style={{ color: "#999", textAlign: "center", fontSize: "14px" }}>
                      Tiered commission configuration coming soon
                    </p>
                  </div>
                ) : (
                  <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
                    Tiered commissions are currently disabled
                  </div>
                )}

                <div style={{ textAlign: "center", marginTop: "30px" }}>
                  <button
                    onClick={saveGlobalSettings}
                    disabled={saving || !hasChanges}
                    style={{
                      padding: "10px 20px",
                      background: hasChanges ? "#dc2626" : "#666",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: hasChanges ? "pointer" : "not-allowed",
                      fontWeight: "600",
                    }}
                  >
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Recalculate Confirmation Modal */}
        {showRecalculateModal && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }} onClick={cancelRecalculate}>
            <div style={{
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "8px",
              padding: "2rem",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
            }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
                🔄 Recalculate All Commissions
              </h3>
              <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
                This will recalculate ALL unpaid commissions based on current rates and stage settings.
              </p>
              <div style={{
                padding: "1rem",
                backgroundColor: "rgba(250, 204, 21, 0.1)",
                border: "1px solid rgba(250, 204, 21, 0.3)",
                borderRadius: "6px",
                marginBottom: "1rem"
              }}>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "14px", color: "#facc15" }}>
                  <strong>Note:</strong>
                </p>
                <ul style={{ margin: 0, paddingLeft: "1.5rem", fontSize: "14px", color: "#d1d5db" }}>
                  <li>Only unpaid commissions will be recalculated</li>
                  <li>Commissions with paid payouts will be skipped</li>
                  <li>This action will be logged in the audit trail</li>
                </ul>
              </div>
              <p style={{ fontSize: "14px", marginBottom: "0.5rem", color: "#d1d5db" }}>
                <strong>Please provide a reason:</strong>
              </p>
              <textarea
                value={recalculateReason}
                onChange={(e) => setRecalculateReason(e.target.value)}
                placeholder="Enter reason for recalculation (minimum 10 characters)"
                style={{
                  width: "100%",
                  minHeight: "100px",
                  padding: "10px",
                  background: "#252525",
                  border: "1px solid #404040",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "14px",
                  marginBottom: "1rem",
                  fontFamily: "inherit"
                }}
              />
              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
                <button
                  onClick={cancelRecalculate}
                  disabled={recalculating}
                  style={{
                    background: "#2d2d2d",
                    color: "#fff",
                    border: "1px solid #404040",
                    padding: "0.5rem 1.5rem",
                    borderRadius: "6px",
                    cursor: recalculating ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    opacity: recalculating ? 0.5 : 1
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={executeRecalculate}
                  disabled={recalculating || recalculateReason.trim().length < 10}
                  style={{
                    backgroundColor: "#f59e0b",
                    color: "white",
                    border: "none",
                    padding: "0.5rem 1.5rem",
                    borderRadius: "6px",
                    cursor: (recalculating || recalculateReason.trim().length < 10) ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    opacity: (recalculating || recalculateReason.trim().length < 10) ? 0.5 : 1
                  }}
                >
                  {recalculating ? "Recalculating..." : "Recalculate Commissions"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear Rates Confirmation Modal */}
        {showClearRatesModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1001
            }}
            onClick={() => setShowClearRatesModal(false)}
          >
            <div
              style={{
                backgroundColor: "#1f1f1f",
                border: "1px solid #404040",
                borderRadius: "8px",
                padding: "2rem",
                maxWidth: "500px",
                width: "90%",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
                🗑️ Clear All Custom Rates
              </h3>
              <p style={{ fontSize: "14px", marginBottom: "1rem", color: "#d1d5db" }}>
                Are you sure you want to remove all custom rates? All sales reps will use the default commission rate.
              </p>
              <div style={{
                padding: "1rem",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "6px",
                marginBottom: "1rem"
              }}>
                <p style={{ margin: "0", fontSize: "14px", color: "#ef4444" }}>
                  <strong>Warning:</strong> This feature is not yet implemented. Your custom rates will remain unchanged.
                </p>
              </div>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
                <button
                  onClick={() => setShowClearRatesModal(false)}
                  style={{
                    background: "#2d2d2d",
                    color: "#fff",
                    border: "1px solid #404040",
                    padding: "0.5rem 1.5rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setIndividualRates({});
                    setSuccessMessage("Feature not yet implemented");
                    setShowSuccessNotification(true);
                    setTimeout(() => setShowSuccessNotification(false), 3000);
                    setShowClearRatesModal(false);
                  }}
                  style={{
                    backgroundColor: "#dc2626",
                    color: "white",
                    border: "none",
                    padding: "0.5rem 1.5rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  Clear All Rates
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Recalculate Results Modal */}
        {showRecalculateResults && recalculateResults && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1001
            }}
            onClick={() => setShowRecalculateResults(false)}
          >
            <div
              style={{
                backgroundColor: "#1f1f1f",
                border: "1px solid #404040",
                borderRadius: "8px",
                padding: "2rem",
                maxWidth: "500px",
                width: "90%",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#fff", marginTop: 0, marginBottom: "1rem" }}>
                ✅ Recalculation Complete
              </h3>
              <div style={{
                padding: "1rem",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "6px",
                marginBottom: "1rem"
              }}>
                <div style={{ marginBottom: "0.5rem", fontSize: "14px", color: "#10b981" }}>
                  <strong>Recalculated:</strong> {recalculateResults.recalculated} commissions
                </div>
                <div style={{ marginBottom: "0.5rem", fontSize: "14px", color: "#f59e0b" }}>
                  <strong>Skipped (with paid payouts):</strong> {recalculateResults.skipped} commissions
                </div>
                <div style={{ fontSize: "14px", color: "#ef4444" }}>
                  <strong>Failed:</strong> {recalculateResults.failed} commissions
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.5rem" }}>
                <button
                  onClick={() => setShowRecalculateResults(false)}
                  style={{
                    backgroundColor: "#10b981",
                    color: "white",
                    border: "none",
                    padding: "0.5rem 1.5rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "14px"
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Notification Toast */}
        {showSuccessNotification && (
          <div
            style={{
              position: "fixed",
              top: "100px",
              right: "24px",
              backgroundColor: "#1f1f1f",
              border: "1px solid #404040",
              borderRadius: "8px",
              padding: "1rem 1.5rem",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
              zIndex: 1002,
              maxWidth: "400px",
              animation: "slideIn 0.3s ease-out"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "20px" }}>ℹ️</span>
              <span style={{ color: "#d1d5db", fontSize: "14px" }}>{successMessage}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
