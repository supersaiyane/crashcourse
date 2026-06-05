import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Custom metrics — per-endpoint counters help identify which endpoint breaks first
// ---------------------------------------------------------------------------
const errorRate = new Rate('error_rate');

// Counters track total requests per endpoint
const ingestionRequests = new Counter('ingestion_requests');
const queryRequests     = new Counter('query_requests');
const summaryRequests   = new Counter('summary_requests');

// Counters track failures per endpoint
const ingestionErrors = new Counter('ingestion_errors');
const queryErrors     = new Counter('query_errors');
const summaryErrors   = new Counter('summary_errors');

// Duration trends per endpoint
const ingestionDuration = new Trend('ingestion_duration', true);
const queryDuration     = new Trend('query_duration', true);
const summaryDuration   = new Trend('summary_duration', true);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export const options = {
  // Aggressive ramp to find the breaking point
  stages: [
    { duration: '2m',  target: 50 },    // warm-up to 50 VUs
    { duration: '3m',  target: 100 },   // push to 100 VUs
    { duration: '3m',  target: 150 },   // push to 150 VUs
    { duration: '2m',  target: 200 },   // peak at 200 VUs
    { duration: '5m',  target: 200 },   // hold peak for 5 min — observe errors
    { duration: '2m',  target: 0 },     // ramp down
  ],

  thresholds: {
    // Intentionally lenient — the goal is to find *where* things break,
    // not to enforce a pass/fail gate.
    'http_req_duration': ['p(95)<2000'],   // 95th percentile < 2 s
    'error_rate':        ['rate<0.10'],     // allow up to 10 % errors
  },
};

// ---------------------------------------------------------------------------
// Event payload generator (same shape as load-test.js for consistency)
// ---------------------------------------------------------------------------
const EVENT_TYPES = ['page_view', 'click', 'purchase', 'signup'];

function randomEvent() {
  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  return {
    event_type: type,
    timestamp:  new Date().toISOString(),
    session_id: `stress-${__VU}-${__ITER}`,
    user_id:    `user-${Math.floor(Math.random() * 10000)}`,
    page:       '/products',
    amount:     type === 'purchase' ? +(Math.random() * 500).toFixed(2) : undefined,
    currency:   type === 'purchase' ? 'USD' : undefined,
    method:     type === 'signup' ? 'email' : undefined,
  };
}

// ---------------------------------------------------------------------------
// Main — cycle through all endpoints, recording per-endpoint success/failure
// ---------------------------------------------------------------------------
export default function () {
  // --- 1. POST /api/events ---
  group('event_ingestion', () => {
    const payload = JSON.stringify(randomEvent());
    const params  = { headers: { 'Content-Type': 'application/json' } };

    const res = http.post(`${BASE_URL}/api/events`, payload, params);

    ingestionRequests.add(1);
    ingestionDuration.add(res.timings.duration);

    const ok = check(res, {
      'ingestion 2xx': (r) => r.status >= 200 && r.status < 300,
    });
    if (!ok) ingestionErrors.add(1);   // increment endpoint-specific error counter
    errorRate.add(!ok);
  });

  sleep(0.3);  // shorter pause than load test — we want sustained pressure

  // --- 2. GET /api/events ---
  group('event_query', () => {
    const res = http.get(`${BASE_URL}/api/events?limit=50`);

    queryRequests.add(1);
    queryDuration.add(res.timings.duration);

    const ok = check(res, {
      'query 200': (r) => r.status === 200,
    });
    if (!ok) queryErrors.add(1);
    errorRate.add(!ok);
  });

  sleep(0.3);

  // --- 3. GET /api/analytics/summary ---
  group('analytics_summary', () => {
    const res = http.get(`${BASE_URL}/api/analytics/summary`);

    summaryRequests.add(1);
    summaryDuration.add(res.timings.duration);

    const ok = check(res, {
      'summary 200': (r) => r.status === 200,
    });
    if (!ok) summaryErrors.add(1);
    errorRate.add(!ok);
  });

  sleep(0.5);
}
