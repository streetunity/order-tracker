"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

export default function CommissionSettingsPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  if (!user) return null;

  return (
    <>
      <TopNav />
      <div style={{ 
        maxWidth: "1200px", 
        margin: "0 auto", 
        padding: "100px 24px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh"
      }}>
        <div style={{
          textAlign: "center",
          padding: "40px",
          background: "rgba(255, 255, 255, 0.03)",
          borderRadius: "12px",
          border: "1px solid rgba(255, 255, 255, 0.1)"
        }}>
          <h1 style={{ 
            fontSize: "32px", 
            fontWeight: "700", 
            color: "#ef4444", 
            marginBottom: "16px" 
          }}>
            Commission Settings
          </h1>
          <p style={{ 
            fontSize: "18px", 
            color: "rgba(255, 255, 255, 0.6)",
            marginBottom: "8px"
          }}>
            Coming Soon
          </p>
          <p style={{ 
            fontSize: "14px", 
            color: "rgba(255, 255, 255, 0.4)"
          }}>
            This feature is currently under development
          </p>
        </div>
      </div>
    </>
  );
}
