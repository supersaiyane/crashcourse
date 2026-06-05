import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Custom metrics — track per-endpoint latency and global error rate
// ---------------------------------------------------------------------------
const eventIngestionDuration = new Trend('event_ingestion_duration', true);
const queryDuration           = new Trend('query_duration', true);
const errorRate               = new Rate('error_rate');

// ---------------------------------------------------------------------------
// Configuration — override BASE_URL via environment variable:
//   k6 run -e BASE_URL=http://api.example.com load-test.js
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export const options = {
  // Ramp up → sustained load → ramp down
  stages: [
    { duration: '2m', target: 50 },   // ramp up to 50 virtual users over 2 min
    { duration: '5m', target: 50 },   // hold steady at 50 VUs for 5 min
    { duration: '1m', target: 0 },    // ramp down to 0 over 1 min
  ],

  thresholds: {
    'http_req_duration{scenario:default}': ['p(95)<500'],  // 95th percentile < 500 ms
    'error_rate':                          ['rate<0.01'],   // global error rate < 1 %
    'event_ingestion_duration':            ['p(95)<500'],   // ingestion p95 < 500 ms
    'query_duration':                      ['p(95)<500'],   // query p95 < 500 ms
  },
};

// ---------------------------------------------------------------------------
// Realistic event payloads — rotated randomly per iteration
// ---------------------------------------------------------------------------
const EVENT_TYPES = ['page_view', 'click', 'purchase', 'signup'];

function randomEvent() {
  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];

  const base = {
    event_type: type,
    timestamp:  new Date().toISOString(),
    session_id: `sess-${__VU}-${__ITER}`,                        // unique per VU + iteration
    user_id:    `user-${Math.floor(Math.random() * 10000)}`,     // synthetic user pool
  };

  // Type-specific fields make payloads realistic for the analytics API
  switch (type) {
    case 'page_view':
      return Object.assign(base, {
        page:        '/products',
        referrer:    'https://google.com',
        duration_ms: Math.floor(Math.random() * 5000),           // time on page
      });
    case 'click':
      return Object.assign(base, {
        element: 'buy-button',
        page:    '/products/42',
      });
    case 'purchase':
      return Object.assign(base, {
        product_id: `prod-${Math.floor(Math.random() * 500)}`,
        amount:     +(Math.random() * 200).toFixed(2),           // 0.00 – 200.00
        currency:   'USD',
      });
    case 'signup':
      return Object.assign(base, {
        method: ['email', 'google', 'github'][Math.floor(Math.random() * 3)],
      });
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// Main test function — each VU cycles through all three endpoint groups
// ---------------------------------------------------------------------------
export default function () {
  // --- 1. Event ingestion (POST /api/events) ---
  group('event_ingestion', () => {
    const payload = JSON.stringify(randomEvent());
    const params  = { headers: { 'Content-Type': 'application/json' } };

    const res = http.post(`${BASE_URL}/api/events`, payload, params);

    eventIngestionDuration.add(res.timings.duration);   // record custom metric

    const success = check(res, {
      'ingestion returns 2xx': (r) => r.status >= 200 && r.status < 300,
    });
    errorRate.add(!success);                            // feed the error rate
  });

  sleep(0.5);  // brief pause between endpoint groups

  // --- 2. Event query (GET /api/events) ---
  group('event_query', () => {
    const res = http.get(`${BASE_URL}/api/events?limit=20`);

    queryDuration.add(res.timings.duration);

    const success = check(res, {
      'query returns 200':   (r) => r.status === 200,
      'query returns array': (r) => {
        try { return Array.isArray(JSON.parse(r.body)); }
        catch (_) { return false; }
      },
    });
    errorRate.add(!success);
  });

  sleep(0.5);

  // --- 3. Analytics summary (GET /api/analytics/summary) ---
  group('analytics_summary', () => {
    const res = http.get(`${BASE_URL}/api/analytics/summary`);

    const success = check(res, {
      'summary returns 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });

  sleep(1);  // think-time between full iterations
}
