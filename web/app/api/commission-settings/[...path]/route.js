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

export async function GET(request, { params }) {
  try {
    const path = params.path?.join('/') || '';
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    
    const headers = getAuthHeaders(request);
    
    const apiUrl = `${API_BASE_URL}/commission-settings/${path}${queryString ? `?${queryString}` : ''}`;
    console.log('[Commission Settings Catch-All Route] Fetching from:', apiUrl);
    
    const res = await fetch(apiUrl, { headers });
    const data = await res.json();
    
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/commission-settings/[...path] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const path = params.path?.join('/') || '';
    const body = await request.json();
    
    const headers = getAuthHeaders(request);
    
    if (!headers['x-auth-token'] && !headers['Authorization']) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    
    const res = await fetch(`${API_BASE_URL}/commission-settings/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('POST /api/commission-settings/[...path] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const path = params.path?.join('/') || '';
    const body = await request.json();
    
    const headers = getAuthHeaders(request);
    
    if (!headers['x-auth-token'] && !headers['Authorization']) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    
    const res = await fetch(`${API_BASE_URL}/commission-settings/${path}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('PUT /api/commission-settings/[...path] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const path = params.path?.join('/') || '';
    const body = await request.json();
    
    const headers = getAuthHeaders(request);
    
    if (!headers['x-auth-token'] && !headers['Authorization']) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    
    const res = await fetch(`${API_BASE_URL}/commission-settings/${path}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('PATCH /api/commission-settings/[...path] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const path = params.path?.join('/') || '';
    
    const headers = getAuthHeaders(request);
    
    if (!headers['x-auth-token'] && !headers['Authorization']) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    
    const res = await fetch(`${API_BASE_URL}/commission-settings/${path}`, {
      method: 'DELETE',
      headers,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('DELETE /api/commission-settings/[...path] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
