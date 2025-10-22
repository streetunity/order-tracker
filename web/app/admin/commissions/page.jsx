"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import TopNav from "@/components/TopNav";

export default function CommissionsPage() {
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
      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 24px" }}>
        <div style={{
          background: "linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "12px",
          padding: "40px",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>💰</div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#ef4444", marginBottom: "12px" }}>
            Commissions
          </h1>
          <p style={{ fontSize: "16px", color: "rgba(255, 255, 255, 0.7)", marginBottom: "8px" }}>
            This feature is coming soon!
          </p>
          <p style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.5)" }}>
            Track and manage sales commissions here.
          </p>
        </div>
      </div>
    </>
  );
}
