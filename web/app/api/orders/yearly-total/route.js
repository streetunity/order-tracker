import { NextResponse } from 'next/server';

// HARDCODED FOR AWS DEPLOYMENT - Change this when moving servers
const API_BASE = 'http://50.19.66.100:4000';

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    const apiUrl = `${API_BASE}/orders/yearly-total`;
    console.log('[Orders Yearly Total Route] Fetching from:', apiUrl);
    
    const res = await fetch(apiUrl, { headers });
    const data = await res.json();
    
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/orders/yearly-total error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
