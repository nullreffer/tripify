/**
 * Lightweight in-memory metrics collector.
 * Stats reset on every server restart (no persistence needed for an operational health view).
 */

const MAX_LATENCY_SAMPLES = 500;

const state = {
  startedAt: new Date().toISOString(),
  requests: {
    total: 0,
    byStatus: {},
    byPath: {}, // { 'GET /api/trips': { count, byStatus: {} }, ... }
    latencies: [], // rolling window of recent request durations (ms)
  },
  outgoing: {},
};

// Normalise a URL path so dynamic segments (UUIDs, numeric IDs) don't explode cardinality.
// e.g. /api/trips/abc-123/stops/456 → /api/trips/:id/stops/:id
function normalisePath(path) {
  return path
    // Strip query string
    .replace(/\?.*$/, '')
    // UUID-like segments
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    // cuid / nanoid: 12+ chars; require at least one digit so plain word segments
    // like /notifications or /administrative are not replaced.
    .replace(/\/[A-Za-z0-9_-]{12,}/g, (m) => /\d/.test(m) ? '/:id' : m)
    // Pure numeric segments
    .replace(/\/\d+/g, '/:id');
}

function ensureService(service) {
  if (!state.outgoing[service]) {
    state.outgoing[service] = { success: 0, failure: 0, totalMs: 0, count: 0, latencies: [] };
  }
  return state.outgoing[service];
}

// Express middleware — track every inbound request
function requestMetrics(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const code = String(res.statusCode);
    const key = `${req.method} ${normalisePath(req.path)}`;

    state.requests.total++;
    state.requests.byStatus[code] = (state.requests.byStatus[code] || 0) + 1;
    state.requests.latencies.push(durationMs);
    if (state.requests.latencies.length > MAX_LATENCY_SAMPLES) {
      state.requests.latencies.shift();
    }

    if (!state.requests.byPath[key]) {
      state.requests.byPath[key] = { count: 0, byStatus: {} };
    }
    state.requests.byPath[key].count++;
    state.requests.byPath[key].byStatus[code] =
      (state.requests.byPath[key].byStatus[code] || 0) + 1;
  });
  next();
}

// Call from route handlers to track outbound API calls
function recordOutgoing(service, success, durationMs) {
  const svc = ensureService(service);
  svc.count++;
  svc.totalMs += durationMs;
  svc.latencies.push(durationMs);
  if (svc.latencies.length > MAX_LATENCY_SAMPLES) svc.latencies.shift();
  if (success) svc.success++;
  else svc.failure++;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  // Standard 0-based percentile index (ceil formula avoids clamping edge-cases)
  const idx = Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * p));
  return sorted[idx];
}

function getSnapshot() {
  const sorted = [...state.requests.latencies].sort((a, b) => a - b);
  const avg = sorted.length
    ? Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length)
    : null;

  const outgoing = {};
  for (const [svc, d] of Object.entries(state.outgoing)) {
    const sortedSvc = [...d.latencies].sort((a, b) => a - b);
    outgoing[svc] = {
      count: d.count,
      success: d.success,
      failure: d.failure,
      avgMs: d.count ? Math.round(d.totalMs / d.count) : null,
      p50Ms: percentile(sortedSvc, 0.5),
      p95Ms: percentile(sortedSvc, 0.95),
    };
  }

  // Sort paths by descending request count
  const byPath = Object.fromEntries(
    Object.entries(state.requests.byPath)
      .sort(([, a], [, b]) => b.count - a.count)
  );

  return {
    startedAt: state.startedAt,
    requests: {
      total: state.requests.total,
      byStatus: { ...state.requests.byStatus },
      byPath,
      avgLatencyMs: avg,
      p50LatencyMs: percentile(sorted, 0.5),
      p95LatencyMs: percentile(sorted, 0.95),
    },
    outgoing,
  };
}

module.exports = { requestMetrics, recordOutgoing, getSnapshot };
