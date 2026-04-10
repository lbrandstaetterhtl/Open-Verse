const BASE_URL = 'http://localhost:5000';

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = res.headers.get('set-cookie') ?? '';
  return cookie;
}

async function api(
  method: string,
  path: string,
  cookie: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  // Pass both headers. We might need to handle fetch cookies manually in Node
  const headers: any = {
    'Content-Type': 'application/json'
  };
  if (cookie) headers['Cookie'] = cookie;
  
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

interface TestResult { id: string; name: string; passed: boolean; expected: string; actual: string; critical: boolean; }
const results: TestResult[] = [];

function test(id: string, name: string, condition: boolean, expected: string, actual: string, critical = false) {
  results.push({ id, name, passed: Boolean(condition), expected, actual, critical });
  const icon = condition ? '✅' : (critical ? '🔴' : '🟡');
  console.log(`${icon} [${id}] ${name}`);
  if (!condition) console.log(`   Erwartet: ${expected} | Erhalten: ${actual}`);
}

async function testAccessControl() {
  const adminSession = Object.fromEntries(await (await fetch(`${BASE_URL}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email: 'jonas.weber@example.com', password: 'TestUser123!' }), headers: { 'content-type': 'application/json' } })).headers.entries())['set-cookie'] || '';
  const ownerSession = Object.fromEntries(await (await fetch(`${BASE_URL}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email: 'markus.bauer@example.com', password: 'TestUser123!' }), headers: { 'content-type': 'application/json' } })).headers.entries())['set-cookie'] || '';
  const userSession = Object.fromEntries(await (await fetch(`${BASE_URL}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email: 'sarah.mueller@example.com', password: 'TestUser456!' }), headers: { 'content-type': 'application/json' } })).headers.entries())['set-cookie'] || '';

  const userAccess = await api('GET', '/api/tickets', userSession);
  test('T1.1', 'Normaler User: GET /api/tickets -> 403', userAccess.status === 403, '403', String(userAccess.status), true);

  return { adminSession, ownerSession, userSession };
}

(async () => {
    await testAccessControl();
    console.log(results);
})();
