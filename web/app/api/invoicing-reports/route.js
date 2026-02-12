import { NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';

// GET /api/invoicing-reports - List available reports
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;

  // Return list of available report endpoints
  return NextResponse.json({
    reports: [
      { name: 'pipeline', description: 'Sales pipeline by estimate status' },
      { name: 'win-loss', description: 'Win/loss analysis with reasons' },
      { name: 'time-to-close', description: 'Average time from estimate to invoice' },
      { name: 'ar-aging', description: 'AR aging buckets' },
      { name: 'sales-summary', description: 'Sales by rep and period' },
      { name: 'revenue-projections', description: 'Revenue projections from open estimates' }
    ]
  });
}
