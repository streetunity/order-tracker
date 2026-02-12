// web/app/api/estimate-templates/[id]/items/[itemId]/route.js
import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function DELETE(request, { params }) {
  try {
    const { id, itemId } = await params;
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const res = await fetch(`${API_BASE_URL}/estimate-templates/${id}/items/${itemId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('DELETE /api/estimate-templates/[id]/items/[itemId] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
