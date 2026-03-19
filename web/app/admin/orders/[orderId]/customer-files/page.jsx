"use client";
export const dynamic = "force-dynamic";

// This file exists only to redirect the old [orderId] route to the correct [id] route.
// TODO: delete this file and the [orderId] folder once confirmed unused.

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function CustomerFilesRedirect() {
  const { orderId } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (orderId) {
      router.replace(`/admin/orders/${orderId}/customer-files`);
    }
  }, [orderId, router]);

  return (
    <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
      Redirecting...
    </div>
  );
}
