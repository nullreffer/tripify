const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const { recordClientEvent } = require('../middleware/metrics');

const router = express.Router();

const ALLOWED_ACTIVITIES = new Set([
  'dashboard-load',
  'trip-load',
  'map-render',
  'poi-load',
  'route-calc',
]);

// POST /api/metrics/client — receive frontend performance timings
// Accepts an array of events: [{ activity, durationMs, meta? }, ...]
router.post('/client', requireAuth, (req, res) => {
  const events = Array.isArray(req.body) ? req.body : [req.body];
  for (const ev of events) {
    if (!ev || typeof ev.activity !== 'string' || typeof ev.durationMs !== 'number') continue;
    const activity = ev.activity.slice(0, 64);
    const durationMs = Math.round(ev.durationMs);
    const meta = ev.meta && typeof ev.meta === 'object' ? ev.meta : undefined;
    const label = ALLOWED_ACTIVITIES.has(activity) ? activity : 'other';
    recordClientEvent({ activity: label, durationMs, meta, userId: req.user?.id });
    console.log(`[client-perf] ${label} ${durationMs}ms${meta ? ' ' + JSON.stringify(meta) : ''}`);
  }
  res.status(204).send();
});

module.exports = router;
