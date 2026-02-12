import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function PATCH(request, { params }) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const res = await fetch(`${API_BASE_URL}/bundles/${params.id}/items/${params.itemId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('PATCH /api/bundles/[id]/items/[itemId] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const res = await fetch(`${API_BASE_URL}/bundles/${params.id}/items/${params.itemId}`, {
      method: 'DELETE',
      headers: { 'Authorization': authHeader },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('DELETE /api/bundles/[id]/items/[itemId] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
