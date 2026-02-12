import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function POST(request, { params }) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  const { id } = await params;

  try {
    const res = await fetch(`${API_BASE_URL}/reminders/${id}/dismiss`, {
      method: 'POST',
      headers
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Dismiss reminder error:', error);
    return NextResponse.json({ error: 'Failed to dismiss reminder' }, { status: 500 });
  }
}
