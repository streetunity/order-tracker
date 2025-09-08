import { NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || 'http://localhost:4000';

export async function GET(request, { params }) {
  try {
    const { token } = params;
    
    const res = await fetch(`${API_BASE}/public/orders/${token}`, {
      // No admin key needed for public endpoints
      headers: {
        'Content-Type': 'application/json',
      },
      // Disable caching
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { 
      status: res.status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}