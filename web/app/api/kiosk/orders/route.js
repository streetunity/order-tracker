import { NextResponse } from 'next/server';

// HARDCODED FOR AWS DEPLOYMENT
const API_BASE = 'http://50.19.66.100:4000';

export async function GET(request) {
  try {
    // Kiosk endpoint - no authentication required for display board
    const res = await fetch(`${API_BASE}/orders`, {
      headers: {
        'Content-Type': 'application/json',
        // Use a simple admin key for the kiosk display
        'x-admin-key': 'dev-admin-key'
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