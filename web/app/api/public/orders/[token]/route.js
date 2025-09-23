import { NextResponse } from 'next/server';

// Use production IP if available, otherwise use the environment variable
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || 'http://50.19.66.100:4000';

export async function GET(request, { params }) {
  try {
    const { token } = params;
    const apiUrl = `${API_BASE}/public/orders/${token}`;
    
    console.log('[Public Order Route] Fetching from:', apiUrl);
    
    const res = await fetch(apiUrl, {
      // No admin key needed for public endpoints
      headers: {
        'Content-Type': 'application/json',
      },
      // Disable caching
      cache: 'no-store'
    });

    const data = await res.json();
    
    if (!res.ok) {
      console.error('[Public Order Route] Backend error:', data);
      return NextResponse.json(data, { status: res.status });
    }
    
    console.log('[Public Order Route] Successfully fetched order with', data.items?.length || 0, 'items');
    
    return NextResponse.json(data, { 
      status: res.status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('[Public Order Route] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}