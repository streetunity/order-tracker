import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// POST /api/public/pay/invoice/:id/nextnp
// Customer-facing NexNP payment — accepts Tokenizer token, never raw card data
export async function POST(request, { params }) {
  const { id } = await params;

  try {
    const body = await request.json();

    const res = await fetch(`${API_BASE_URL}/public/pay/invoice/${id}/nextnp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Public NexNP payment proxy error:', error);
    return NextResponse.json({ error: 'Payment request failed' }, { status: 500 });
  }
}
