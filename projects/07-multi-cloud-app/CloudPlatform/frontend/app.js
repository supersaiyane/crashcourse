/* CloudPlatform — Real-Time Analytics Dashboard */

const API_BASE = window.location.origin;
let useMock = false;
let feedEvents = [];

/* ── Mock Data Generator ──────────────────────────────── */
const EVENT_TYPES  = ['payment','auth','deploy','alert','audit','sync'];
const SOURCES      = ['aws-lambda','gcp-functions','azure-func','aws-sqs','gcp-pubsub','azure-servicebus'];
const STATUSES     = ['ok','ok','ok','ok','warn','error']; // weighted toward ok

function mockSummary() {
  return {
    total_events:   Math.floor(80000 + Math.random() * 40000),
    events_per_sec: +(12 + Math.random() * 30).toFixed(1),
    active_sources: Math.floor(4 + Math.random() * 5),
    avg_latency_ms: +(8 + Math.random() * 35).toFixed(1)
  };
}

function mockEvent() {
  var now = new Date();
  return {
    id:        'evt-' + Math.random().toString(36).slice(2, 10),
    type:      EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)],
    source:    SOURCES[Math.floor(Math.random() * SOURCES.length)],
    status:    STATUSES[Math.floor(Math.random() * STATUSES.length)],
    timestamp: now.toISOString()
  };
}

function mockEvents(n) {
  var events = [];
  for (var i = 0; i < n; i++) events.push(mockEvent());
  return events;
}

function mockTimeline() {
  var points = [];
  for (var i = 11; i >= 0; i--) {
    var d = new Date(Date.now() - i * 5000);
    points.push({ time: formatTime(d), count: Math.floor(20 + Math.random() * 60) });
  }
  return points;
}

/* ── Cloud Comparison (static mock — would come from /api/clouds) */
var CLOUD_DATA = {
  aws:   { cost: '$2,340/mo', latency: '12ms', avail: '99.97%', region: 'us-east-1' },
  gcp:   { cost: '$2,180/mo', latency: '14ms', avail: '99.95%', region: 'us-central1' },
  azure: { cost: '$2,510/mo', latency: '16ms', avail: '99.94%', region: 'eastus' }
};

/* ── Helpers ───────────────────────────────────────────── */
function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatTime(d) {
  if (typeof d === 'string') d = new Date(d);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function setVal(id, val) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = val;
  el.classList.add('updating');
  setTimeout(function() { el.classList.remove('updating'); }, 400);
}

/* ── API Fetch with Fallback ──────────────────────────── */
async function fetchJSON(path) {
  if (useMock) return null;
  try {
    var r = await fetch(API_BASE + path, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    useMock = true; // switch to mock on first failure
    return null;
  }
}

/* ── Refresh Summary Stats ────────────────────────────── */
async function refreshSummary() {
  var data = (await fetchJSON('/api/analytics/summary')) || mockSummary();
  setVal('total-events',   formatNum(data.total_events));
  setVal('events-per-sec', data.events_per_sec);
  setVal('active-sources', data.active_sources);
  setVal('avg-latency',    data.avg_latency_ms + 'ms');
}

/* ── Refresh Live Feed ────────────────────────────────── */
async function refreshFeed() {
  var newEvents = (await fetchJSON('/api/events?limit=5')) || mockEvents(3);
  var items = Array.isArray(newEvents) ? newEvents : (newEvents.events || []);

  feedEvents = items.concat(feedEvents).slice(0, 50); // keep latest 50
  renderFeed();
}

function renderFeed() {
  var tbody = document.getElementById('feed-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  feedEvents.forEach(function(ev, i) {
    var tr = document.createElement('tr');
    if (i < 3) tr.className = 'feed-new';
    var badgeClass = ev.status === 'ok' ? 'badge-ok' : ev.status === 'warn' ? 'badge-warn' : 'badge-error';
    tr.innerHTML =
      '<td>' + formatTime(ev.timestamp) + '</td>' +
      '<td>' + ev.type + '</td>' +
      '<td>' + ev.source + '</td>' +
      '<td><span class="badge ' + badgeClass + '">' + ev.status + '</span></td>';
    tbody.appendChild(tr);
  });
  // auto-scroll to top (newest first)
  var scroll = document.getElementById('feed-scroll');
  if (scroll) scroll.scrollTop = 0;
}

/* ── Cloud Comparison Panel ───────────────────────────── */
function renderCloudComparison() {
  ['aws', 'gcp', 'azure'].forEach(function(p) {
    var d = CLOUD_DATA[p];
    setVal(p + '-cost',    d.cost);
    setVal(p + '-latency', d.latency);
    setVal(p + '-avail',   d.avail);
    setVal(p + '-region',  d.region);
  });
}

/* ── Canvas Charts ────────────────────────────────────── */
var COLORS = {
  bar:   ['#FF9900','#4285F4','#0078D4','#22c55e','#eab308','#a855f7'],
  line:  '#4285F4',
  donut: ['#FF9900','#4285F4','#0078D4','#22c55e','#a855f7','#ef4444']
};

function drawBarChart(canvasId) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // data: count per event type
  var counts = {};
  EVENT_TYPES.forEach(function(t) { counts[t] = 0; });
  feedEvents.forEach(function(ev) { if (counts[ev.type] !== undefined) counts[ev.type]++; });
  var labels = Object.keys(counts);
  var values = Object.values(counts);
  var max = Math.max.apply(null, values.concat([1]));

  var barW = (w - 60) / labels.length - 8;
  var baseY = h - 30;

  // axes
  ctx.strokeStyle = '#2a2d3e';
  ctx.beginPath(); ctx.moveTo(40, 10); ctx.lineTo(40, baseY); ctx.lineTo(w - 10, baseY); ctx.stroke();

  labels.forEach(function(label, i) {
    var barH = (values[i] / max) * (baseY - 20);
    var x = 50 + i * (barW + 8);
    ctx.fillStyle = COLORS.bar[i % COLORS.bar.length];
    ctx.fillRect(x, baseY - barH, barW, barH);

    // label
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + barW / 2, baseY + 14);

    // value on top
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText(values[i], x + barW / 2, baseY - barH - 4);
  });
}

var timelineData = [];

function drawLineChart(canvasId) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (timelineData.length < 2) timelineData = mockTimeline();

  var max = Math.max.apply(null, timelineData.map(function(p) { return p.count; }).concat([1]));
  var baseY = h - 30;
  var stepX = (w - 60) / (timelineData.length - 1);

  // grid lines
  ctx.strokeStyle = '#1e2130';
  for (var g = 0; g < 4; g++) {
    var gy = 10 + g * ((baseY - 10) / 3);
    ctx.beginPath(); ctx.moveTo(40, gy); ctx.lineTo(w - 10, gy); ctx.stroke();
  }

  // area fill
  ctx.fillStyle = 'rgba(66, 133, 244, 0.08)';
  ctx.beginPath();
  ctx.moveTo(50, baseY);
  timelineData.forEach(function(p, i) {
    var x = 50 + i * stepX;
    var y = baseY - (p.count / max) * (baseY - 20);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(50 + (timelineData.length - 1) * stepX, baseY);
  ctx.closePath();
  ctx.fill();

  // line
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  timelineData.forEach(function(p, i) {
    var x = 50 + i * stepX;
    var y = baseY - (p.count / max) * (baseY - 20);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // dots
  timelineData.forEach(function(p, i) {
    var x = 50 + i * stepX;
    var y = baseY - (p.count / max) * (baseY - 20);
    ctx.fillStyle = COLORS.line;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  });

  // x labels (every other)
  ctx.fillStyle = '#9ca3af';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  timelineData.forEach(function(p, i) {
    if (i % 2 === 0) {
      var x = 50 + i * stepX;
      ctx.fillText(p.time, x, baseY + 14);
    }
  });
}

function drawDonutChart(canvasId) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // count by source
  var counts = {};
  SOURCES.forEach(function(s) { counts[s] = 0; });
  feedEvents.forEach(function(ev) { if (counts[ev.source] !== undefined) counts[ev.source]++; });
  var labels = Object.keys(counts);
  var values = Object.values(counts);
  var total = values.reduce(function(a, b) { return a + b; }, 0) || 1;

  var cx = w / 2 - 40, cy = h / 2;
  var outerR = Math.min(cx, cy) - 10;
  var innerR = outerR * 0.55;
  var angle = -Math.PI / 2;

  labels.forEach(function(label, i) {
    var slice = (values[i] / total) * Math.PI * 2;
    ctx.fillStyle = COLORS.donut[i % COLORS.donut.length];
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, angle, angle + slice);
    ctx.arc(cx, cy, innerR, angle + slice, angle, true);
    ctx.closePath();
    ctx.fill();
    angle += slice;
  });

  // center text
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total, cx, cy - 6);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px sans-serif';
  ctx.fillText('events', cx, cy + 10);

  // legend
  var lx = w - 120;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  labels.forEach(function(label, i) {
    var ly = 14 + i * 16;
    ctx.fillStyle = COLORS.donut[i % COLORS.donut.length];
    ctx.fillRect(lx, ly, 10, 10);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '9px sans-serif';
    // shorten label for legend
    var short = label.replace('aws-', '').replace('gcp-', '').replace('azure-', '');
    ctx.fillText(short + ' (' + values[i] + ')', lx + 14, ly + 1);
  });
}

/* ── Provider Status Indicators ───────────────────────── */
function updateProviderStatus() {
  // Simulate health — in production this would call /api/clouds/status
  ['aws', 'gcp', 'azure'].forEach(function(p) {
    var el = document.getElementById(p + '-status');
    if (!el) return;
    var dot = el.querySelector('.status-dot');
    if (!dot) return;
    // 90% green, 8% yellow, 2% red
    var r = Math.random();
    dot.className = 'status-dot ' + (r < 0.02 ? 'red' : r < 0.10 ? 'yellow' : 'green');
  });
}

/* ── Timeline Data Update ─────────────────────────────── */
function pushTimelinePoint() {
  var now = new Date();
  timelineData.push({ time: formatTime(now), count: Math.floor(20 + Math.random() * 60) });
  if (timelineData.length > 12) timelineData.shift();
}

/* ── Main Refresh Loop ────────────────────────────────── */
async function refresh() {
  await Promise.all([refreshSummary(), refreshFeed()]);
  pushTimelinePoint();
  drawBarChart('chart-bar');
  drawLineChart('chart-line');
  drawDonutChart('chart-donut');
  updateProviderStatus();
}

/* ── Init ──────────────────────────────────────────────── */
(function init() {
  renderCloudComparison();

  // seed feed with mock events so charts have data on first paint
  feedEvents = mockEvents(15);
  timelineData = mockTimeline();

  refresh();
  setInterval(refresh, 5000);
})();
