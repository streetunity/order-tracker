// web/app/api/settings/[...path]/route.js
// Proxy all /api/settings/* requests to the backend

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET(request, { params }) {
  const { path } = params;
  const searchParams = request.nextUrl.searchParams;
  const queryString = searchParams.toString();
  const url = `${API_URL}/settings/${path.join('/')}${queryString ? `?${queryString}` : ''}`;
  
  try {
    const headers = {};
    const authHeader = request.headers.get('authorization');
    if (authHeader) headers.authorization = authHeader;
    
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { path } = params;
  const url = `${API_URL}/settings/${path.join('/')}`;
  
  try {
    const headers = { 'Content-Type': 'application/json' };
    const authHeader = request.headers.get('authorization');
    if (authHeader) headers.authorization = authHeader;
    
    const body = await request.json();
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const { path } = params;
  const url = `${API_URL}/settings/${path.join('/')}`;
  
  try {
    const headers = { 'Content-Type': 'application/json' };
    const authHeader = request.headers.get('authorization');
    if (authHeader) headers.authorization = authHeader;
    
    const body = await request.json();
    const response = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
