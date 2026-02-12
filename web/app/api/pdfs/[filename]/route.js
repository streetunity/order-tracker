import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request, { params }) {
  try {
    const { filename } = params;
    const authHeader = request.headers.get('authorization');

    const headers = {};
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const res = await fetch(`${API_BASE_URL}/pdfs/${filename}`, { headers });

    if (!res.ok) {
      return NextResponse.json({ error: 'PDF not found' }, { status: res.status });
    }

    const pdfBuffer = await res.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': res.headers.get('content-disposition') || `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('GET /api/pdfs/[filename] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
