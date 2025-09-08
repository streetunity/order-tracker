export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return Response.json(
        { error: 'No authorization header' },
        { status: 401 }
      );
    }

    const res = await fetch('http://localhost:4000/auth/me', {
      headers: {
        'Authorization': authHeader,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return Response.json(
        { error: data.error || 'Authentication failed' },
        { status: res.status }
      );
    }

    return Response.json(data);
  } catch (error) {
    console.error('Auth check error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}