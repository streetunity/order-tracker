// web/app/api/track/invoice/[id]/open/route.js
// Email tracking pixel - public endpoint, no auth required
import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// 1x1 transparent GIF
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    // Forward tracking request to backend (fire and forget)
    fetch(`${API_BASE_URL}/public/track/invoice/${id}/open`, {
      cache: 'no-store'
    }).catch(err => console.error('Invoice tracking error:', err));

    // Return tracking pixel immediately
    return new NextResponse(TRACKING_PIXEL, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('GET /api/track/invoice/[id]/open error:', error);
    // Still return tracking pixel on error
    return new NextResponse(TRACKING_PIXEL, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store'
      }
    });
  }
}
