"use client";
export const dynamic = 'force-dynamic';

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BrokerRoot() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/broker/dashboard");
  }, [router]);

  return null;
}
