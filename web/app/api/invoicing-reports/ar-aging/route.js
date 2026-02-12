import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const { searchParams } = new URL(request.url);
  const asOfDate = searchParams.get('asOfDate');

  let apiUrl = `${API_BASE_URL}/invoicing-reports/ar-aging`;
  if (asOfDate) apiUrl += `?asOfDate=${asOfDate}`;

  try {
    const res = await fetch(apiUrl, { headers, cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('AR aging report error:', error);
    return NextResponse.json({ error: 'Failed to fetch AR aging report' }, { status: 500 });
  }
}
