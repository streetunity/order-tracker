import { NextResponse } from 'next/server';

const backendUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

export async function PATCH(request, { params }) {
  try {
    const { orderId, itemId } = params;
    const body = await request.json();
    const token = request.headers.get('authorization');

    const response = await fetch(
      `${backendUrl}/orders/${orderId}/items/${itemId}/measurements`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': token })
        },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update measurements' },
      { status: 500 }
    );
  }
}

export async function GET(request, { params }) {
  try {
    const { orderId, itemId } = params;
    const token = request.headers.get('authorization');

    const response = await fetch(
      `${backendUrl}/orders/${orderId}/items/${itemId}/measurement-history`,
      {
        method: 'GET',
        headers: {
          ...(token && { 'Authorization': token })
        }
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch measurement history' },
      { status: 500 }
    );
  }
}