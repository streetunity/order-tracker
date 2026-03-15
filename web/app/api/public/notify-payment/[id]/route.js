export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    const res = await fetch(`http://localhost:4000/public/notify-payment/${params.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
