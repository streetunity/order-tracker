import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function DELETE(request, { params }) {
  try {
    const { id, documentId } = params;
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const apiUrl = `${API_BASE_URL}/customs/item/${id}/documents/${documentId}`;
    console.log('[Customs Document Delete Route] Deleting from:', apiUrl);

    const res = await fetch(apiUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('DELETE /api/customs/item/[id]/documents/[documentId] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
