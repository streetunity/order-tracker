import { NextResponse } from 'next/server';

// HARDCODED FOR AWS DEPLOYMENT - Change this when moving servers
const API_BASE = 'http://50.19.66.100:4000';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    const authHeader = request.headers.get('authorization');
    
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Add authorization header if present
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    const apiUrl = `${API_BASE}/orders${queryString ? `?${queryString}` : ''}`;
    console.log('[Orders Route] Fetching from:', apiUrl);
    
    const res = await fetch(apiUrl, {
      headers,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/orders error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    
    // Authorization is required for creating orders
    if (!authHeader) {
      console.error('No authorization header provided');
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }
    
    console.log('Creating order with auth header:', authHeader.substring(0, 20) + '...');
    
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    
    if (!res.ok) {
      console.error('Backend error:', data);
    }
    
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('POST /api/orders error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}