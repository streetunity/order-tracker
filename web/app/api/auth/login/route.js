export async function POST(request) {
  try {
    const body = await request.json();
    
    // Forward to backend API
    const res = await fetch('http://localhost:4000/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return Response.json(
        { error: data.error || 'Login failed' },
        { status: res.status }
      );
    }

    return Response.json(data);
  } catch (error) {
    console.error('Login proxy error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}