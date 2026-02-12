import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request, { params }) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const { id } = await params;
  const { searchParams } = new URL(request.url);

  const queryParams = new URLSearchParams();
  ['limit', 'offset'].forEach(key => {
    const value = searchParams.get(key);
    if (value) queryParams.append(key, value);
  });

  try {
    const url = `${API_BASE_URL}/customers/${id}/activity${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const res = await fetch(url, { headers, cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Get customer activity error:', error);
    return NextResponse.json({ error: 'Failed to get customer activity' }, { status: 500 });
  }
}
