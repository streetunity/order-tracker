import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function DELETE(request, { params }) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }

    const res = await fetch(`${API_BASE_URL}/bundles/${params.id}/attachments/${params.attachmentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': authHeader },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('DELETE /api/bundles/[id]/attachments/[attachmentId] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
