import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// DELETE /api/shipments/[id]/documents/[documentId] - Delete document
export async function DELETE(request, { params }) {
  try {
    const { id, documentId } = await params;
    const authHeader = request.headers.get('authorization');
    
    const headers = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(`${API_BASE_URL}/shipments/${id}/documents/${documentId}`, {
      method: 'DELETE',
      headers
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('DELETE /api/shipments/[id]/documents/[documentId] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
