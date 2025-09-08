// GET all users, POST new user
export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return Response.json(
        { error: 'No authorization header' },
        { status: 401 }
      );
    }

    const res = await fetch('http://localhost:4000/users', {
      headers: {
        'Authorization': authHeader,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return Response.json(
        { error: data.error || 'Failed to fetch users' },
        { status: res.status }
      );
    }

    return Response.json(data);
  } catch (error) {
    console.error('Fetch users error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    const body = await request.json();
    
    if (!authHeader) {
      return Response.json(
        { error: 'No authorization header' },
        { status: 401 }
      );
    }

    const res = await fetch('http://localhost:4000/users', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return Response.json(
        { error: data.error || 'Failed to create user' },
        { status: res.status }
      );
    }

    return Response.json(data);
  } catch (error) {
    console.error('Create user error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}