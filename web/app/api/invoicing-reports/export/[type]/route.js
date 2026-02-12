import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request, { params }) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const { type } = await params;
  const { searchParams } = new URL(request.url);

  // Build query params
  const queryParams = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    queryParams.append(key, value);
  }

  let apiUrl = `${API_BASE_URL}/invoicing-reports/export/${type}`;
  if (queryParams.toString()) apiUrl += `?${queryParams.toString()}`;

  try {
    const res = await fetch(apiUrl, { headers, cache: 'no-store' });

    if (!res.ok) {
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    // Return CSV content
    const csv = await res.text();
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${type}-report.csv"`
      }
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export report' }, { status: 500 });
  }
}
