"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

export default function ProfilePage() {
  const { user, getAuthHeaders } = useAuth();
  const router = useRouter();
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [hasChanges, setHasChanges] = useState(false);

  // Check if user is manufacturer
  const isManufacturer = user?.role === "MANUFACTURER";

  useEffect(() => {
    if (!user) {
      router.push("/login");
    } else {
      setName(user.name || "");
      setEmail(user.email || "");
    }
  }, [user, router]);

  useEffect(() => {
    if (user) {
      const nameChanged = name !== (user.name || "");
      const emailChanged = email !== (user.email || "");
      setHasChanges(nameChanged || emailChanged);
    }
  }, [name, email, user]);

  async function handleSave() {
    if (!hasChanges) return;
    
    try {
      setSaving(true);
      setMessage({ type: "", text: "" });
      
      // Prepare update payload
      const updateData = {
        email: email.trim().toLowerCase()
      };
      
      // Only include name if user is not a manufacturer
      if (!isManufacturer) {
        updateData.name = name.trim();
      }
      
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify(updateData)
      });
      
      if (res.ok) {
        const updatedUser = await res.json();
        setMessage({ 
          type: "success", 
          text: "Profile updated successfully! Please refresh the page to see changes in the navigation."
        });
        setHasChanges(false);
        
        // Update the user context
        window.location.reload();
      } else {
        const error = await res.json();
        setMessage({ 
          type: "error", 
          text: error.error || "Failed to update profile"
        });
      }
    } catch (e) {
      setMessage({ 
        type: "error", 
        text: "Failed to update profile. Please try again."
      });
    } finally {
      setSaving(false);
    }
  }

  // Helper function to safely format date
  function formatDate(dateValue, includeTime = false) {
    if (!dateValue) return "N/A";
    
    try {
      const date = new Date(dateValue);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return "N/A";
      }
      
      const options = {
        month: "long",
        day: "numeric",
        year: "numeric"
      };
      
      if (includeTime) {
        options.hour = "numeric";
        options.minute = "2-digit";
      }
      
      return date.toLocaleDateString("en-US", options);
    } catch (e) {
      return "N/A";
    }
  }

  if (!user) return null;

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "40px 24px" }}>
        <div style={{
          marginBottom: "32px"
        }}>
          <h1 style={{ 
            fontSize: "28px", 
            fontWeight: "700", 
            color: "var(--text)",
            marginBottom: "8px" 
          }}>
            My Profile
          </h1>
          <p style={{ 
            fontSize: "14px", 
            color: "var(--text-dim)" 
          }}>
            Update your personal information
          </p>
        </div>

        <div style={{
          backgroundColor: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "24px"
        }}>
          {/* Profile Icon */}
          <div style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "32px"
          }}>
            <div style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              backgroundColor: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
              fontWeight: "600",
              color: "#fff"
            }}>
              {user.name ? (
                user.name.split(" ").length >= 2
                  ? user.name.split(" ")[0][0] + user.name.split(" ")[1][0]
                  : user.name.substring(0, 2)
              ).toUpperCase() : "??"}
            </div>
          </div>

          {/* Role Badge */}
          <div style={{
            textAlign: "center",
            marginBottom: "32px"
          }}>
            <span style={{
              display: "inline-block",
              padding: "6px 12px",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid var(--accent)",
              borderRadius: "6px",
              color: "var(--accent)",
              fontSize: "12px",
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}>
              {user.role}
            </span>
          </div>

          {/* Message */}
          {message.text && (
            <div style={{
              padding: "12px 16px",
              marginBottom: "24px",
              backgroundColor: message.type === "success" 
                ? "rgba(34, 197, 94, 0.1)" 
                : "rgba(239, 68, 68, 0.1)",
              border: `1px solid ${message.type === "success" ? "#22c55e" : "var(--accent)"}`,
              borderRadius: "6px",
              color: message.type === "success" ? "#22c55e" : "var(--accent)",
              fontSize: "14px"
            }}>
              {message.text}
            </div>
          )}

          {/* Name Field - Disabled for Manufacturers */}
          <div style={{ marginBottom: "24px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              color: "var(--text)",
              marginBottom: "8px"
            }}>
              Name {isManufacturer && <span style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: "normal" }}>(Cannot be changed - used for order filtering)</span>}
            </label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => !isManufacturer && setName(e.target.value)}
              placeholder="Enter your name"
              disabled={isManufacturer}
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "14px",
                cursor: isManufacturer ? "not-allowed" : "text",
                opacity: isManufacturer ? 0.6 : 1,
                backgroundColor: isManufacturer ? "var(--bg)" : "var(--input-bg)"
              }}
              title={isManufacturer ? "Name cannot be changed for manufacturers as it is used for order filtering" : ""}
            />
          </div>

          {/* Email Field */}
          <div style={{ marginBottom: "32px" }}>
            <label style={{
              display: "block",
              fontSize: "14px",
              fontWeight: "500",
              color: "var(--text)",
              marginBottom: "8px"
            }}>
              Email
            </label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "14px"
              }}
            />
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            style={{
              width: "100%",
              padding: "12px 24px",
              backgroundColor: hasChanges && !saving ? "var(--accent)" : "var(--border)",
              color: hasChanges && !saving ? "#fff" : "var(--text-dim)",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: hasChanges && !saving ? "pointer" : "not-allowed",
              transition: "all 0.2s"
            }}
          >
            {saving ? "Saving..." : hasChanges ? "Save Changes" : "No Changes"}
          </button>

          {/* Account Info */}
          <div style={{
            marginTop: "32px",
            paddingTop: "24px",
            borderTop: "1px solid var(--border)"
          }}>
            <div style={{
              fontSize: "12px",
              color: "var(--text-dim)",
              marginBottom: "8px"
            }}>
              Account created: {formatDate(user.createdAt)}
            </div>
            {user.lastLogin && (
              <div style={{
                fontSize: "12px",
                color: "var(--text-dim)"
              }}>
                Last login: {formatDate(user.lastLogin, true)}
              </div>
            )}
          </div>
        </div>

        {/* Additional Actions */}
        <div style={{
          marginTop: "24px",
          textAlign: "center"
        }}>
          <a 
            href="/admin/change-password"
            style={{
              color: "var(--accent)",
              fontSize: "14px",
              textDecoration: "none",
              fontWeight: "500"
            }}
          >
            Change Password →
          </a>
        </div>
      </div>
    </>
  );
}
