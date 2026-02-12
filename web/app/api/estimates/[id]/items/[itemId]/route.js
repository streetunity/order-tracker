import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function PATCH(request, { params }) {
  try {
    const { id, itemId } = await params;
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const body = await request.json();
    const apiUrl = `${API_BASE_URL}/estimates/${id}/items/${itemId}`;

    const res = await fetch(apiUrl, {
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
    console.error('PATCH /api/estimates/[id]/items/[itemId] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id, itemId } = await params;
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const apiUrl = `${API_BASE_URL}/estimates/${id}/items/${itemId}`;

    const res = await fetch(apiUrl, {
      method: 'DELETE',
      headers: { 'Authorization': authHeader },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('DELETE /api/estimates/[id]/items/[itemId] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
