// web/app/api/audit/emails/route.js
// Proxy for the audit "Emails" tab. Forwards query params (tab/page/limit/
// startDate/endDate/search) and the auth header to the backend /audit/emails
// endpoint. Explicit route so it takes precedence over /api/audit/[id] and
// preserves the query string (which [id] drops).
import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const search = request.nextUrl.search || '';
    const res = await fetch(`${API_BASE_URL}/audit/emails${search}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      cache: 'no-store',
    });

    const data = await res.json().catch(() => ({ error: 'Failed to fetch email log' }));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/audit/emails error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
