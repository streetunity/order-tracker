import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// This route handles PATCH and DELETE for /comments/:id
// Note: entityType here is actually the comment ID for these operations

export async function PATCH(request, { params }) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const { entityType: id } = await params;

  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE_URL}/comments/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Update comment error:', error);
    return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const { entityType: id } = await params;

  try {
    const res = await fetch(`${API_BASE_URL}/comments/${id}`, {
      method: 'DELETE',
      headers
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Delete comment error:', error);
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }
}
