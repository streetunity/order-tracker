import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// Helper to get auth token from either header format
function getAuthHeaders(request) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  // Check for x-auth-token first (used by frontend), then Authorization
  const xAuthToken = request.headers.get('x-auth-token');
  const authHeader = request.headers.get('authorization');
  
  if (xAuthToken) {
    headers['x-auth-token'] = xAuthToken;
  } else if (authHeader) {
    headers['Authorization'] = authHeader;
  }
  
  return headers;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    
    const headers = getAuthHeaders(request);
    
    const apiUrl = `${API_BASE_URL}/commission-settings${queryString ? `?${queryString}` : ''}`;
    console.log('[Commission Settings Route] Fetching from:', apiUrl);
    
    const res = await fetch(apiUrl, { headers });
    const data = await res.json();
    
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/commission-settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const headers = getAuthHeaders(request);
    
    if (!headers['x-auth-token'] && !headers['Authorization']) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    
    const res = await fetch(`${API_BASE_URL}/commission-settings`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('POST /api/commission-settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const headers = getAuthHeaders(request);
    
    if (!headers['x-auth-token'] && !headers['Authorization']) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    
    const res = await fetch(`${API_BASE_URL}/commission-settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('PUT /api/commission-settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const headers = getAuthHeaders(request);
    
    if (!headers['x-auth-token'] && !headers['Authorization']) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    
    const res = await fetch(`${API_BASE_URL}/commission-settings`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('PATCH /api/commission-settings error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
