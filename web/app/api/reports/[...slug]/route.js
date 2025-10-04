import { NextResponse } from 'next/server';

// HARDCODED FOR AWS DEPLOYMENT - Change this when moving servers
const API_BASE = 'http://50.19.66.100:4000';

export async function GET(request, context) {
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
    
    // Next.js 14 requires awaiting params
    const params = await context.params;
    const slug = params.slug ? params.slug.join('/') : '';
    const apiUrl = `${API_BASE}/reports/${slug}${queryString ? `?${queryString}` : ''}`;
    
    console.log('[Reports Route] Fetching from:', apiUrl);
    
    const res = await fetch(apiUrl, {
      headers,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/reports error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, context) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    
    // Authorization is required
    if (!authHeader) {
      console.error('No authorization header provided');
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }
    
    // Next.js 14 requires awaiting params
    const params = await context.params;
    const slug = params.slug ? params.slug.join('/') : '';
    const apiUrl = `${API_BASE}/reports/${slug}`;
    
    console.log('[Reports Route] Posting to:', apiUrl);
    
    const res = await fetch(apiUrl, {
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
    console.error('POST /api/reports error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}