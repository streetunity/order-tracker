import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  try {
    const res = await fetch(`${API_BASE_URL}/email-templates/stages/config`, { headers, cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Get stage configs error:', error);
    return NextResponse.json({ error: 'Failed to get stage configs' }, { status: 500 });
  }
}

export async function PUT(request) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE_URL}/email-templates/stages/config`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Save stage configs error:', error);
    return NextResponse.json({ error: 'Failed to save stage configs' }, { status: 500 });
  }
}
