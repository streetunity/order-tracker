import { NextResponse } from 'next/server';

// HARDCODED FOR AWS DEPLOYMENT - Change this when moving servers
const API_BASE = 'http://50.19.66.100:4000';

export async function GET(request, { params }) {
  try {
    const { token } = params;
    const apiUrl = `${API_BASE}/public/orders/${token}`;
    
    console.log('[Public Order Route] Fetching from:', apiUrl);
    
    const res = await fetch(apiUrl, {
      headers: {
        'Content-Type': 'application/json',
      },
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