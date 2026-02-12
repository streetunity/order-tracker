import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const groupBy = searchParams.get('groupBy');

  let apiUrl = `${API_BASE_URL}/invoicing-reports/sales-summary`;
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (groupBy) params.append('groupBy', groupBy);
  if (params.toString()) apiUrl += `?${params.toString()}`;

  try {
    const res = await fetch(apiUrl, { headers, cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Sales summary report error:', error);
    return NextResponse.json({ error: 'Failed to fetch sales summary report' }, { status: 500 });
  }
}
