import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/portal/:token/invoices - List customer's invoices (public)
export async function GET(request, { params }) {
  const { token } = await params;

  try {
    const res = await fetch(`${API_BASE_URL}/portal/${token}/invoices`, {
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Portal invoices error:', error);
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 });
  }
}
