export const dynamic = 'force-dynamic';

async function check(url, options) {
  try {
    const res = await fetch(url, { cache: 'no-store', ...options });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      body: text.slice(0, 500),
      error: null
    };
  } catch (e) {
    return { ok: false, status: 0, statusText: '', body: '', error: String(e) };
  }
}

function getApiBase() {
  return process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
}

export default async function Debug() {
  const base = getApiBase();

  const health = await check(`${base}/health`);
  const orders = await check(`${base}/orders`, {
    headers: { 'x-admin-key': process.env.NEXT_ADMIN_KEY ?? '' }
  });

  return (
    <main style={{ fontFamily: 'system-ui', lineHeight: 1.4 }}>
      <h1>Connectivity Debug</h1>

      <section style={{ marginBottom: 16 }}>
        <h2>Resolved Config</h2>
        <pre style={{ background: '#f6f8fa', padding: 12, overflow: 'auto' }}>
{`NEXT_PUBLIC_API_BASE: ${process.env.NEXT_PUBLIC_API_BASE ?? '(not set)'}
NEXT_ADMIN_KEY: ${process.env.NEXT_ADMIN_KEY ? '(set)' : '(not set)'}
Resolved base: ${base}`}
        </pre>
        <p>
          If <code>NEXT_PUBLIC_API_BASE</code> is not set, this page uses{' '}
          <code>{base}</code>.
        </p>
      </section>

      <section style={{ marginBottom: 16 }}>
        <h2>/health</h2>
        <pre style={{ background: '#f6f8fa', padding: 12, overflow: 'auto' }}>
{JSON.stringify(health, null, 2)}
        </pre>
        <p>
          Expected: <code>ok: true</code> and a small JSON body like{' '}
          <code>{'{ "ok": true }'}</code>. If this call fails, the API probably
          isn’t running at <code>{base}</code> or the port differs.
        </p>
      </section>

      <section>
        <h2>/orders</h2>
        <pre style={{ background: '#f6f8fa', padding: 12, overflow: 'auto' }}>
{JSON.stringify(orders, null, 2)}
        </pre>
        <p>
          Expected: <code>ok: true</code>. If you see 401, your{' '}
          <code>NEXT_ADMIN_KEY</code> doesn’t match the API’s{' '}
          <code>ADMIN_KEY</code>. If you see <code>status: 0</code> and an
          error like <code>fetch failed</code>, the server wasn’t reachable.
        </p>
      </section>

      <p style={{ marginTop: 16 }}>
        Tip: The web app does server-side fetches, so CORS settings don’t apply
        here. This is purely connectivity and environment.
      </p>
    </main>
  );
}
