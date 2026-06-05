import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const errorRate             = new Rate('error_rate');
const ingestionDuration     = new Trend('event_ingestion_duration', true);
const queryDuration         = new Trend('query_duration', true);
const spikePhaseRequests    = new Counter('spike_phase_requests');    // requests during spike
const recoveryPhaseRequests = new Counter('recovery_phase_requests'); // requests after spike

// ---------------------------------------------------------------------------
// Configuration
//
// BFSI scenario: salary-day traffic burst.
//   Normal (10 VUs, 2 min) → spike (200 VUs, 1 min) → recovery (10 VUs, 2 min)
//
// The goal is to see whether the system:
//   1. Survives the sudden 20x traffic increase
//   2. Recovers gracefully when traffic drops back
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export const options = {
  stages: [
    { duration: '2m',  target: 10 },    // normal baseline traffic
    { duration: '10s', target: 200 },   // sudden spike — salary-day burst
    { duration: '1m',  target: 200 },   // hold the spike
    { duration: '10s', target: 10 },    // traffic drops back
    { duration: '2m',  target: 10 },    // recovery period — watch latency settle
  ],

  thresholds: {
    'http_req_duration': ['p(99)<2000'],   // 99th percentile stays under 2 s even during spike
    'error_rate':        ['rate<0.05'],     // allow up to 5 % errors during spike
  },
};

// ---------------------------------------------------------------------------
// Event payloads — BFSI-flavoured (salary credit, balance check, transfer)
// ---------------------------------------------------------------------------
const BFSI_EVENTS = [
  { event_type: 'page_view',  page: '/account/salary-credit', referrer: 'https://bank.example.com' },
  { event_type: 'click',      element: 'check-balance-btn',   page: '/account/overview' },
  { event_type: 'purchase',   product_id: 'fund-transfer',    amount: 25000.00, currency: 'INR' },
  { event_type: 'signup',     method: 'aadhaar-ekyc' },
  { event_type: 'page_view',  page: '/account/statement',     referrer: 'https://bank.example.com' },
  { event_type: 'click',      element: 'download-statement',  page: '/account/statement' },
];

function randomBfsiEvent() {
  const template = BFSI_EVENTS[Math.floor(Math.random() * BFSI_EVENTS.length)];
  return Object.assign({}, template, {
    timestamp:  new Date().toISOString(),
    session_id: `spike-${__VU}-${__ITER}`,
    user_id:    `user-${Math.floor(Math.random() * 50000)}`,   // large user pool for spike
  });
}

// ---------------------------------------------------------------------------
// Detect which phase we are in based on VU count
// ---------------------------------------------------------------------------
function isSpikePhase() {
  return __VU > 50;  // during spike stages, VU count is well above 10
}

// ---------------------------------------------------------------------------
// Main test function
// ---------------------------------------------------------------------------
export default function () {
  // Track which phase contributed the request
  if (isSpikePhase()) {
    spikePhaseRequests.add(1);
  } else {
    recoveryPhaseRequests.add(1);
  }

  // --- 1. POST /api/events (salary-day event burst) ---
  group('event_ingestion', () => {
    const payload = JSON.stringify(randomBfsiEvent());
    const params  = { headers: { 'Content-Type': 'application/json' } };

    const res = http.post(`${BASE_URL}/api/events`, payload, params);

    ingestionDuration.add(res.timings.duration);

    const ok = check(res, {
      'ingestion 2xx': (r) => r.status >= 200 && r.status < 300,
    });
    errorRate.add(!ok);
  });

  sleep(0.2);  // minimal pause — spikes are aggressive

  // --- 2. GET /api/events (users refreshing to see salary credit) ---
  group('event_query', () => {
    const res = http.get(`${BASE_URL}/api/events?limit=20`);

    queryDuration.add(res.timings.duration);

    const ok = check(res, {
      'query 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  sleep(0.2);

  // --- 3. GET /api/analytics/summary (ops dashboard during spike) ---
  group('analytics_summary', () => {
    const res = http.get(`${BASE_URL}/api/analytics/summary`);

    const ok = check(res, {
      'summary 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  sleep(0.5);
}
