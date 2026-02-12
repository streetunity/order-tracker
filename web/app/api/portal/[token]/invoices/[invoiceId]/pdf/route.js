import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/portal/:token/invoices/:invoiceId/pdf - Get invoice PDF URL (public)
export async function GET(request, { params }) {
  const { token, invoiceId } = await params;

  try {
    const res = await fetch(`${API_BASE_URL}/portal/${token}/invoices/${invoiceId}/pdf`, {
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Portal invoice PDF error:', error);
    return NextResponse.json({ error: 'Failed to get PDF' }, { status: 500 });
  }
}
