import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/payments/invoice/:invoiceId - List payments for an invoice
export async function GET(request, { params }) {
  const { invoiceId } = await params;
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = await fetch(`${API_BASE_URL}/payments/invoice/${invoiceId}`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    cache: 'no-store'
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
