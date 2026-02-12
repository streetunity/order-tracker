import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();

  ['status', 'type', 'limit', 'offset'].forEach(key => {
    const value = searchParams.get(key);
    if (value) params.append(key, value);
  });

  try {
    const url = `${API_BASE_URL}/reminders${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url, { headers, cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('List reminders error:', error);
    return NextResponse.json({ error: 'Failed to list reminders' }, { status: 500 });
  }
}

export async function POST(request) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE_URL}/reminders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Create reminder error:', error);
    return NextResponse.json({ error: 'Failed to create reminder' }, { status: 500 });
  }
}
