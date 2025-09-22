// web/app/api/orders/[id]/items/[itemId]/measurements/route.js
import { NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || 'http://localhost:4000';

export async function PATCH(request, { params }) {
  try {
    const { id, itemId } = params;
    const body = await request.json();
    const token = request.headers.get('authorization');

    const response = await fetch(
      `${API_BASE}/orders/${id}/items/${itemId}/measurements`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': token })
        },
        body: JSON.stringify(body)
      }
    );

    // Check if response has content before parsing
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }
    
    // If no content but successful, return success
    if (response.ok) {
      return NextResponse.json({ success: true }, { status: 200 });
    }
    
    return NextResponse.json(
      { error: 'Failed to update measurements' },
      { status: response.status }
    );
  } catch (error) {
    console.error('PATCH measurements error:', error);
    return NextResponse.json(
      { error: 'Failed to update measurements' },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const { id, itemId } = params;
    const body = await request.json();
    const token = request.headers.get('authorization');

    const response = await fetch(
      `${API_BASE}/orders/${id}/items/${itemId}/measurements`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': token })
        },
        body: JSON.stringify(body)
      }
    );

    // Check if response has content before parsing
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }
    
    // If no content but successful, return success
    if (response.ok) {
      return NextResponse.json({ success: true }, { status: 200 });
    }
    
    return NextResponse.json(
      { error: 'Failed to update measurements' },
      { status: response.status }
    );
  } catch (error) {
    console.error('PUT measurements error:', error);
    return NextResponse.json(
      { error: 'Failed to update measurements' },
      { status: 500 }
    );
  }
}

export async function GET(request, { params }) {
  try {
    const { id, itemId } = params;
    const token = request.headers.get('authorization');

    const response = await fetch(
      `${API_BASE}/orders/${id}/items/${itemId}/measurement-history`,
      {
        method: 'GET',
        headers: {
          ...(token && { 'Authorization': token })
        }
      }
    );

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }
    
    if (response.ok) {
      return NextResponse.json([], { status: 200 });
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch measurement history' },
      { status: response.status }
    );
  } catch (error) {
    console.error('GET measurement history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch measurement history' },
      { status: 500 }
    );
  }
}