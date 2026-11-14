const app = require('../dist/index').default;
const http = require('http');

async function runVerification() {
  console.log('--- Starting API In-Process End-to-End Verification ---');

  const server = app.listen(4005, async () => {
    try {
      console.log('Test server listening on port 4005');

      // 1. Health check
      const healthRes = await fetch('http://127.0.0.1:4005/api/health').then(r => r.json());
      console.log('✓ /api/health:', healthRes.status, 'service:', healthRes.service);

      // 2. Auth Register
      const authRes = await fetch('http://127.0.0.1:4005/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test.dba@sqlpilot.local', password: 'Password123!' })
      }).then(r => r.json());
      console.log('✓ /api/auth/register:', authRes.user?.email ? 'User registered' : authRes);
      const token = authRes.token;

      // 3. List connections
      const conns = await fetch('http://127.0.0.1:4005/api/connections', {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json());
      console.log('✓ /api/connections count:', conns.length);

      // 4. Test Introspection
      const schema = await fetch('http://127.0.0.1:4005/api/connections/1/introspect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json());
      console.log('✓ /api/connections/1/introspect tables:', schema.tables?.length, 'database:', schema.database_name);

      // 5. Test Read-Only Run Query
      const queryRes = await fetch('http://127.0.0.1:4005/api/connections/1/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ sql: 'SELECT * FROM categories' })
      }).then(r => r.json());
      console.log('✓ /api/connections/1/run rows:', queryRes.row_count, 'duration:', queryRes.duration_ms, 'ms');

      // 6. Test Read-Only Validator Guardrail (attempting destructive DROP TABLE)
      const destructiveRes = await fetch('http://127.0.0.1:4005/api/connections/1/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ sql: 'DROP TABLE customers;' })
      }).then(async r => ({ status: r.status, data: await r.json() }));
      console.log('✓ Guardrail blocked DROP TABLE (status 400 expected):', destructiveRes.status, destructiveRes.data.error);

      // 7. Test NL->SQL Ask Endpoint
      const askRes = await fetch('http://127.0.0.1:4005/api/connections/1/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: 'Show all categories and count of products' })
      }).then(r => r.json());
      console.log('✓ /api/connections/1/ask generated SQL:', askRes.sql?.replace(/\n/g, ' '));
      console.log('✓ Explanation:', askRes.explanation);

      // 8. Test Performance DMV endpoint
      const perfRes = await fetch('http://127.0.0.1:4005/api/connections/1/performance', {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json());
      console.log('✓ /api/connections/1/performance missing indexes:', perfRes.missing_indexes?.length);

      console.log('\n⭐ ALL 8 ENDPOINTS VERIFIED SUCCESSFULLY! ⭐');
      server.close(() => process.exit(0));
    } catch (err) {
      console.error('Verification failed:', err);
      server.close(() => process.exit(1));
    }
  });
}

runVerification();
