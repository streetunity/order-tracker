"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

export default function CommissionSettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("global");
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  
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

  // Available stages
  const availableStages = [
    "QUOTE",
    "MANUFACTURING",
    "TESTING",
    "SHIPPING",
    "SMT",
    "QC",
    "DELIVERED",
    "ONSITE",
    "COMPLETED",
    "FOLLOWUP",
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
      const headers = { Authorization: `Bearer ${user.token}` };

      // Fetch global settings
      const settingsRes = await fetch("/api/commission-settings", { headers });
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setGlobalSettings(data);
        if (data.stageDistribution) {
          setStageDistribution(JSON.parse(data.stageDistribution));
        }
      }

      // Fetch individual rates
      const ratesRes = await fetch("/api/commission-settings/rates", { headers });
      if (ratesRes.ok) {
        const data = await ratesRes.json();
        const ratesMap = {};
        data.forEach(rate => {
          ratesMap[rate.salesPersonName] = rate.rate;
        });
        setIndividualRates(ratesMap);
      }

      // Fetch users who can be sales reps
      const usersRes = await fetch("/api/users", { headers });
      if (usersRes.ok) {
        const data = await usersRes.json();
        setSalesReps(data.filter(u => u.showInSalesRepDropdown && u.isActive));
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
      const res = await fetch("/api/commission-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          ...globalSettings,
          stageDistribution: JSON.stringify(stageDistribution),
        }),
      });

      if (res.ok) {
        alert("Global settings saved successfully");
        setHasChanges(false);
      } else {
        alert("Failed to save global settings");
      }
    } catch (error) {
      console.error("Error saving global settings:", error);
      alert("Error saving global settings");
    } finally {
      setSaving(false);
    }
  };

  const saveStageDistribution = async () => {
    const total = stageDistribution.reduce((sum, s) => sum + Number(s.percentage), 0);
    
    if (Math.abs(total - 100) > 0.01) {
      alert(`Stage percentages must total 100%. Current total: ${total}%`);
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/commission-settings/stages", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(stageDistribution.map((s, index) => ({
          ...s,
          percentage: Number(s.percentage),
          sortOrder: index + 1,
        }))),
      });

      if (res.ok) {
        alert("Stage distribution saved successfully");
        setHasChanges(false);
        await fetchSettings(); // Refresh to get server state
      } else {
        const error = await res.json();
        alert(error.message || "Failed to save stage distribution");
      }
    } catch (error) {
      console.error("Error saving stage distribution:", error);
      alert("Error saving stage distribution");
    } finally {
      setSaving(false);
    }
  };

  const saveIndividualRate = async (salesPersonName, rate) => {
    if (rate < 0 || rate > 100) {
      alert("Rate must be between 0 and 100");
      return;
    }

    try {
      const res = await fetch(`/api/commission-settings/rates/${encodeURIComponent(salesPersonName)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ rate: Number(rate) }),
      });

      if (res.ok) {
        alert(`Rate saved for ${salesPersonName}`);
        setIndividualRates({ ...individualRates, [salesPersonName]: Number(rate) });
      } else {
        alert("Failed to save rate");
      }
    } catch (error) {
      console.error("Error saving rate:", error);
      alert("Error saving rate");
    }
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
        <h1 style={{ fontSize: "32px", fontWeight: "700", marginBottom: "32px", color: "#ef4444" }}>
          Commission Settings
        </h1>

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
                    onClick={() => {
                      if (confirm("This will remove all custom rates and use the default rate for everyone. Continue?")) {
                        setIndividualRates({});
                        // You would need to implement a backend endpoint to clear all rates
                        alert("Feature not yet implemented");
                      }
                    }}
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
                  background: "rgba(96, 165, 250, 0.1)",
                  border: "1px solid #60a5fa",
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
      </div>
    </>
  );
}
