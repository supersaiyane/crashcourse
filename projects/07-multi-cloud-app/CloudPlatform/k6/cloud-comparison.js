import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// ---------------------------------------------------------------------------
// Cloud provider configuration
//
// Usage:
//   k6 run -e CLOUD_PROVIDER=aws  cloud-comparison.js
//   k6 run -e CLOUD_PROVIDER=gcp  cloud-comparison.js
//   k6 run -e CLOUD_PROVIDER=azure cloud-comparison.js
//
// Run all three, then compare the CSV output side by side.
// ---------------------------------------------------------------------------
const CLOUD_PROVIDER = (__ENV.CLOUD_PROVIDER || 'aws').toLowerCase();

// Map cloud providers to their API endpoints
const CLOUD_ENDPOINTS = {
  aws:   __ENV.AWS_URL   || 'http://localhost:5000',
  gcp:   __ENV.GCP_URL   || 'http://localhost:5001',
  azure: __ENV.AZURE_URL || 'http://localhost:5002',
};

const BASE_URL = CLOUD_ENDPOINTS[CLOUD_PROVIDER] || CLOUD_ENDPOINTS.aws;

// ---------------------------------------------------------------------------
// Custom metrics — all named with cloud provider for cross-cloud comparison
// ---------------------------------------------------------------------------
const ingestionLatency = new Trend(`ingestion_latency_${CLOUD_PROVIDER}`, true);
const queryLatency     = new Trend(`query_latency_${CLOUD_PROVIDER}`, true);
const summaryLatency   = new Trend(`summary_latency_${CLOUD_PROVIDER}`, true);
const errorRate        = new Rate(`error_rate_${CLOUD_PROVIDER}`);
const totalRequests    = new Counter(`total_requests_${CLOUD_PROVIDER}`);

// ---------------------------------------------------------------------------
// Options — moderate load, enough to get stable percentiles
// ---------------------------------------------------------------------------
export const options = {
  stages: [
    { duration: '1m',  target: 30 },   // ramp up
    { duration: '3m',  target: 30 },   // steady state — collect stable metrics
    { duration: '30s', target: 0 },    // ramp down
  ],

  // Tag every request with the cloud provider for filtering in Grafana / k6 Cloud
  tags: {
    cloud_provider: CLOUD_PROVIDER,
  },

  thresholds: {
    [`ingestion_latency_${CLOUD_PROVIDER}`]: ['p(95)<500'],
    [`query_latency_${CLOUD_PROVIDER}`]:     ['p(95)<500'],
    [`error_rate_${CLOUD_PROVIDER}`]:        ['rate<0.01'],
  },
};

// ---------------------------------------------------------------------------
// Event payload generator
// ---------------------------------------------------------------------------
const EVENT_TYPES = ['page_view', 'click', 'purchase', 'signup'];

function randomEvent() {
  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  return {
    event_type: type,
    timestamp:  new Date().toISOString(),
    session_id: `${CLOUD_PROVIDER}-${__VU}-${__ITER}`,
    user_id:    `user-${Math.floor(Math.random() * 10000)}`,
    page:       '/products',
    amount:     type === 'purchase' ? +(Math.random() * 200).toFixed(2) : undefined,
    currency:   type === 'purchase' ? 'USD' : undefined,
  };
}

// ---------------------------------------------------------------------------
// Main test — identical workload regardless of cloud provider
// ---------------------------------------------------------------------------
export default function () {
  const tags = { cloud_provider: CLOUD_PROVIDER };

  // --- 1. POST /api/events ---
  group('event_ingestion', () => {
    const payload = JSON.stringify(randomEvent());
    const params  = {
      headers: { 'Content-Type': 'application/json' },
      tags:    tags,
    };

    const res = http.post(`${BASE_URL}/api/events`, payload, params);

    ingestionLatency.add(res.timings.duration);
    totalRequests.add(1);

    const ok = check(res, {
      'ingestion 2xx': (r) => r.status >= 200 && r.status < 300,
    });
    errorRate.add(!ok);
  });

  sleep(0.3);

  // --- 2. GET /api/events ---
  group('event_query', () => {
    const res = http.get(`${BASE_URL}/api/events?limit=20`, { tags: tags });

    queryLatency.add(res.timings.duration);
    totalRequests.add(1);

    const ok = check(res, {
      'query 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  sleep(0.3);

  // --- 3. GET /api/analytics/summary ---
  group('analytics_summary', () => {
    const res = http.get(`${BASE_URL}/api/analytics/summary`, { tags: tags });

    summaryLatency.add(res.timings.duration);
    totalRequests.add(1);

    const ok = check(res, {
      'summary 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });

  sleep(0.5);
}

// ---------------------------------------------------------------------------
// Custom summary handler — outputs CSV-friendly results for cross-cloud diffs
//
// Pipe output to a file per provider, then paste into a spreadsheet:
//   k6 run -e CLOUD_PROVIDER=aws  cloud-comparison.js 2>&1 | tee results-aws.txt
//   k6 run -e CLOUD_PROVIDER=gcp  cloud-comparison.js 2>&1 | tee results-gcp.txt
//   k6 run -e CLOUD_PROVIDER=azure cloud-comparison.js 2>&1 | tee results-azure.txt
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  // Build CSV rows from the custom trend metrics
  const csvHeader = 'cloud_provider,metric,p50_ms,p95_ms,p99_ms,avg_ms,min_ms,max_ms,count';
  const rows = [csvHeader];

  // Extract percentiles from custom trends
  const trendNames = [
    `ingestion_latency_${CLOUD_PROVIDER}`,
    `query_latency_${CLOUD_PROVIDER}`,
    `summary_latency_${CLOUD_PROVIDER}`,
  ];

  for (const name of trendNames) {
    const m = data.metrics[name];
    if (m && m.values) {
      const v = m.values;
      rows.push([
        CLOUD_PROVIDER,
        name.replace(`_${CLOUD_PROVIDER}`, ''),   // strip provider suffix for clean column
        (v['p(50)'] || 0).toFixed(2),
        (v['p(95)'] || 0).toFixed(2),
        (v['p(99)'] || 0).toFixed(2),
        (v.avg      || 0).toFixed(2),
        (v.min      || 0).toFixed(2),
        (v.max      || 0).toFixed(2),
        v.count || 0,
      ].join(','));
    }
  }

  // Add error rate as a percentage row
  const errMetric = data.metrics[`error_rate_${CLOUD_PROVIDER}`];
  if (errMetric && errMetric.values) {
    rows.push(`${CLOUD_PROVIDER},error_rate,${(errMetric.values.rate * 100).toFixed(2)}%,,,,,,`);
  }

  // Add total request count
  const reqMetric = data.metrics[`total_requests_${CLOUD_PROVIDER}`];
  if (reqMetric && reqMetric.values) {
    rows.push(`${CLOUD_PROVIDER},total_requests,${reqMetric.values.count},,,,,,`);
  }

  const csvOutput = rows.join('\n') + '\n';

  return {
    // Write CSV to file for easy comparison across providers
    [`results-${CLOUD_PROVIDER}.csv`]: csvOutput,
    // Also print the standard k6 text summary to stdout
    stdout: textSummary(data, { indent: '  ', enableColors: true })
      + '\n\n--- CSV Summary ---\n' + csvOutput,
  };
}
