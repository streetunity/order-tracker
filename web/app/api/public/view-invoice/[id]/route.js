export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const res = await fetch(`http://localhost:4000/public/view-invoice/${params.id}`, {
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
