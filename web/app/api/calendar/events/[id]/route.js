import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// PUT /api/calendar/events/:id
export async function PUT(request, { params }) {
  try {
    const authHeader = request.headers.get('authorization');
    const body = await request.json();
    const headers = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;
    const res = await fetch(`${API_BASE_URL}/calendar/events/${params.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/calendar/events/:id
export async function DELETE(request, { params }) {
  try {
    const authHeader = request.headers.get('authorization');
    const headers = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;
    const res = await fetch(`${API_BASE_URL}/calendar/events/${params.id}`, {
      method: 'DELETE',
      headers,
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
