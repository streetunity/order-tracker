import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    
    const headers = {};
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }
    headers["Content-Type"] = "application/json";

    const response = await fetch(`${BACKEND_URL}/api/commissions/payouts/${id}/unpay`, {
      method: "POST",
      headers,
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error in unpay proxy:", error);
    return NextResponse.json({ error: "Failed to unpay payout" }, { status: 500 });
  }
}
