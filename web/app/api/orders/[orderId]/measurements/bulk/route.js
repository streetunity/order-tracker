import { NextResponse } from 'next/server';

const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function PATCH(request, { params }) {
  try {
    const { orderId } = params;
    const body = await request.json();
    const token = request.headers.get('authorization');

    const response = await fetch(
      `${backendUrl}/orders/${orderId}/measurements/bulk`,
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
      { error: 'Failed to bulk update measurements' },
      { status: 500 }
    );
  }
}