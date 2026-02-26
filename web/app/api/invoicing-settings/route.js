// web/app/api/invoicing-settings/route.js
import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request) {
  try {
    const headers = {};
    const auth = request.headers.get('authorization');
    if (auth) headers['Authorization'] = auth;
    const xAuth = request.headers.get('x-auth-token');
    if (xAuth) headers['x-auth-token'] = xAuth;

    const res = await fetch(`${API_BASE_URL}/invoicing-settings`, {
      headers,
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    const auth = request.headers.get('authorization');
    if (auth) headers['Authorization'] = auth;
    const xAuth = request.headers.get('x-auth-token');
    if (xAuth) headers['x-auth-token'] = xAuth;

    const body = await request.json();

    const res = await fetch(`${API_BASE_URL}/invoicing-settings`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
