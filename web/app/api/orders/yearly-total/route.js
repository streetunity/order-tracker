export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    const apiUrl = `${API_BASE_URL}/orders/yearly-total`;
    console.log('[Orders Yearly Total Route] Fetching from:', apiUrl);
    
    const res = await fetch(apiUrl, { headers });
    const data = await res.json();
    
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/orders/yearly-total error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
