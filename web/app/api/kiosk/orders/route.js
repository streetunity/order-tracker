export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request) {
  try {
    // Kiosk display board - uses the dedicated public, read-only endpoint.
    // (The old x-admin-key backdoor was removed from the backend for security;
    // /public/kiosk-board returns only non-sensitive board data and needs no auth.)
    const res = await fetch(`${API_BASE_URL}/public/kiosk-board`, {
      headers: {
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    if (!res.ok) {
      console.error('Kiosk API error:', res.status);
      const errorText = await res.text();
      console.error('Error response:', errorText);
      return NextResponse.json([], { status: 200 }); // Return empty array instead of error
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Kiosk route error:', error);
    return NextResponse.json([], { status: 200 }); // Return empty array on error
  }
}
