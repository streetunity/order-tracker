"use client";
import { useEffect, useState } from "react";

export default function KioskPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setLoading(true);
      const res = await fetch("/api/orders", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list = Array.isArray(json)
        ? json
        : Array.isArray(json?.orders)
        ? json.orders
        : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.results)
        ? json.results
        : [];
      setOrders(list);
      setErr("");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="flex items-center p-4 border-b border-red-600">
        <img
          src="https://stealthlaser.com/wp-content/uploads/2022/09/SMT-logo-Final-01-e1674149233144-300x261.png"
          alt="Stealth Machine Tools Logo"
          className="mr-4"
          width="60"
          height="52"
          loading="eager"
          decoding="async"
        />
        <h1 className="text-2xl font-bold text-red-600">Stealth Machine Tools</h1>
      </header>

      {err && (
        <main className="p-6 text-red-400">Failed to load: {err}</main>
      )}

      <main className="p-4">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-red-600 px-2 py-1">Customer</th>
              <th className="border border-red-600 px-2 py-1">PO</th>
              <th className="border border-red-600 px-2 py-1">Item</th>
              <th className="border border-red-600 px-2 py-1">Stage</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="border border-red-600 px-2 py-2 text-gray-300" colSpan={4}>
                  Loading…
                </td>
              </tr>
            )}

            {!loading &&
              orders.flatMap((order) =>
                (order.items || []).map((item) => {
                  const stage = String(item.currentStage || order.currentStage || "");
                  const done = stage === "COMPLETED";
                  return (
                    <tr key={item.id ?? `${order.id}-${item.productCode}`}>
                      <td className="border border-red-600 px-2 py-1">
                        {order.account?.name ?? "—"}
                      </td>
                      <td className="border border-red-600 px-2 py-1">
                        {order.poNumber ?? "—"}
                      </td>
                      <td className="border border-red-600 px-2 py-1">
                        {item.productCode ?? item.name ?? "—"} · qty {item.qty ?? 1}
                      </td>
                      <td
                        className={`border border-red-600 px-2 py-1 text-center ${
                          done ? "bg-red-600" : ""
                        }`}
                        title={stage.replace(/_/g, " ")}
                      >
                        {!done ? stage.replace(/_/g, " ") : ""}
                      </td>
                    </tr>
                  );
                })
              )}

            {!loading && orders.length === 0 && !err && (
              <tr>
                <td className="border border-red-600 px-2 py-2 text-gray-300" colSpan={4}>
                  No orders to display.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </main>
    </div>
  );
}
