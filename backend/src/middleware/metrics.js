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
    latencies: [], // rolling window of recent request durations (ms)
  },
  outgoing: {},
};

function ensureService(service) {
  if (!state.outgoing[service]) {
    state.outgoing[service] = { success: 0, failure: 0, totalMs: 0, count: 0 };
  }
  return state.outgoing[service];
}

// Express middleware — track every inbound request
function requestMetrics(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    state.requests.total++;
    const code = String(res.statusCode);
    state.requests.byStatus[code] = (state.requests.byStatus[code] || 0) + 1;
    state.requests.latencies.push(durationMs);
    if (state.requests.latencies.length > MAX_LATENCY_SAMPLES) {
      state.requests.latencies.shift();
    }
  });
  next();
}

// Call from route handlers to track outbound API calls
function recordOutgoing(service, success, durationMs) {
  const svc = ensureService(service);
  svc.count++;
  svc.totalMs += durationMs;
  if (success) svc.success++;
  else svc.failure++;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function getSnapshot() {
  const sorted = [...state.requests.latencies].sort((a, b) => a - b);
  const avg = sorted.length
    ? Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length)
    : null;

  const outgoing = {};
  for (const [svc, d] of Object.entries(state.outgoing)) {
    outgoing[svc] = {
      count: d.count,
      success: d.success,
      failure: d.failure,
      avgMs: d.count ? Math.round(d.totalMs / d.count) : null,
    };
  }

  return {
    startedAt: state.startedAt,
    requests: {
      total: state.requests.total,
      byStatus: { ...state.requests.byStatus },
      avgLatencyMs: avg,
      p50LatencyMs: percentile(sorted, 0.5),
      p95LatencyMs: percentile(sorted, 0.95),
    },
    outgoing,
  };
}

module.exports = { requestMetrics, recordOutgoing, getSnapshot };
