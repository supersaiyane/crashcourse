const http = require('http');
const assert = require('assert');

// Import the app but do not start listening
const app = require('./server');

const PORT = 9999;
let server;

async function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: PORT, path, method, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('Running BillFlow tests...\n');
  let passed = 0;

  // Test 1: Health check
  const health = await request('GET', '/health');
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.body.status, 'ok');
  console.log('  PASS: GET /health returns 200 with status ok');
  passed++;

  // Test 2: Create subscription
  const sub = await request('POST', '/api/subscriptions', { customer: 'Acme Corp', plan: 'professional' });
  assert.strictEqual(sub.status, 201);
  assert.strictEqual(sub.body.customer, 'Acme Corp');
  assert.strictEqual(sub.body.plan, 'professional');
  assert.ok(sub.body.id, 'subscription has id');
  console.log('  PASS: POST /api/subscriptions creates subscription');
  passed++;

  // Test 3: List subscriptions
  const subs = await request('GET', '/api/subscriptions');
  assert.strictEqual(subs.status, 200);
  assert.ok(subs.body.total >= 1);
  console.log('  PASS: GET /api/subscriptions returns list');
  passed++;

  // Test 4: Create invoice
  const inv = await request('POST', '/api/invoices', { subscription_id: sub.body.id, amount: 299.99, currency: 'USD' });
  assert.strictEqual(inv.status, 201);
  assert.strictEqual(inv.body.amount, 299.99);
  assert.strictEqual(inv.body.status, 'pending');
  console.log('  PASS: POST /api/invoices creates invoice');
  passed++;

  // Test 5: List invoices
  const invs = await request('GET', '/api/invoices');
  assert.strictEqual(invs.status, 200);
  assert.ok(invs.body.total >= 1);
  console.log('  PASS: GET /api/invoices returns list');
  passed++;

  // Test 6: Payment webhook
  const webhook = await request('POST', '/api/webhooks/payment', { invoice_id: inv.body.id, status: 'paid' });
  assert.strictEqual(webhook.status, 200);
  assert.strictEqual(webhook.body.invoice.status, 'paid');
  console.log('  PASS: POST /api/webhooks/payment updates invoice status');
  passed++;

  // Test 7: Payment webhook for non-existent invoice
  const bad = await request('POST', '/api/webhooks/payment', { invoice_id: 'nonexistent', status: 'paid' });
  assert.strictEqual(bad.status, 404);
  console.log('  PASS: POST /api/webhooks/payment returns 404 for unknown invoice');
  passed++;

  console.log(`\n${passed}/${passed} tests passed`);
}

server = app.listen(PORT, async () => {
  try {
    await runTests();
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('\nFAILED:', err.message);
    server.close();
    process.exit(1);
  }
});
