import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const { searchParams } = new URL(request.url);
  const days = searchParams.get('days');

  try {
    const url = `${API_BASE_URL}/reminders/upcoming${days ? `?days=${days}` : ''}`;
    const res = await fetch(url, { headers, cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Get upcoming reminders error:', error);
    return NextResponse.json({ error: 'Failed to get upcoming reminders' }, { status: 500 });
  }
}
