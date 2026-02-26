import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

export async function GET(request, { params }) {
  const { key } = await params;
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  try {
    const res = await fetch(`${API_BASE_URL}/email-templates/${key}`, { headers, cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Get email template error:', error);
    return NextResponse.json({ error: 'Failed to get email template' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { key } = await params;
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  try {
    const body = await request.json();
    const res = await fetch(`${API_BASE_URL}/email-templates/${key}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Update email template error:', error);
    return NextResponse.json({ error: 'Failed to update email template' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { key } = await params;
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  try {
    const res = await fetch(`${API_BASE_URL}/email-templates/${key}`, {
      method: 'DELETE',
      headers
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Reset email template error:', error);
    return NextResponse.json({ error: 'Failed to reset email template' }, { status: 500 });
  }
}
