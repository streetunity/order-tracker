import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request, { params }) {
  try {
    const { id, documentId } = params;
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401 }
      );
    }

    const apiUrl = `${API_BASE_URL}/api/items/${id}/documents/${documentId}/download`;
    console.log('[Items Documents Route] Getting download URL:', apiUrl);

    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': authHeader,
      },
      cache: 'no-store'
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('GET /api/items/[id]/documents/[documentId]/download error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
