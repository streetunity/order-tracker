"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

export default function ChangePasswordPage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required");
      return;
    }

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to change password");
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      
      setTimeout(() => {
        setSuccess(false);
      }, 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#ef4444", marginBottom: "24px" }}>
          Change Password
        </h1>

        {success && (
          <div style={{
            padding: "12px 16px",
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            borderRadius: "8px",
            color: "#22c55e",
            marginBottom: "20px"
          }}>
            ✓ Password changed successfully!
          </div>
        )}

        {error && (
          <div style={{
            padding: "12px 16px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            color: "#ef4444",
            marginBottom: "20px"
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "12px",
          padding: "32px"
        }}>
          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              color: "rgba(255, 255, 255, 0.9)",
              marginBottom: "8px"
            }}>
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "rgba(255, 255, 255, 0.9)",
                fontSize: "14px"
              }}
              required
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              color: "rgba(255, 255, 255, 0.9)",
              marginBottom: "8px"
            }}>
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "rgba(255, 255, 255, 0.9)",
                fontSize: "14px"
              }}
              required
              minLength={6}
            />
            <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)", marginTop: "4px" }}>
              At least 6 characters
            </div>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              color: "rgba(255, 255, 255, 0.9)",
              marginBottom: "8px"
            }}>
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
                color: "rgba(255, 255, 255, 0.9)",
                fontSize: "14px"
              }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              background: loading ? "rgba(239, 68, 68, 0.5)" : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              border: "none",
              borderRadius: "8px",
              color: "white",
              fontSize: "16px",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s"
            }}
          >
            {loading ? "Changing Password..." : "Change Password"}
          </button>
        </form>
      </div>
    </>
  );
}
