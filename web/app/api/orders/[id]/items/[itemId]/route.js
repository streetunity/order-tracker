import { NextResponse } from 'next/server';

// HARDCODED FOR AWS DEPLOYMENT - Change this when moving servers
const API_BASE = 'http://50.19.66.100:4000';

export async function PATCH(request, { params }) {
  try {
    const { id, itemId } = params;
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    
    console.log(`[Items PATCH] Updating item ${itemId} in order ${id}`);
    
    const res = await fetch(`${API_BASE}/orders/${id}/items/${itemId}`, {
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
    console.error('PATCH item error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id, itemId } = params;
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
    }
    
    console.log(`[Items DELETE] Deleting item ${itemId} from order ${id}`);
    
    const res = await fetch(`${API_BASE}/orders/${id}/items/${itemId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': authHeader,
      },
    });

    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('DELETE item error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
