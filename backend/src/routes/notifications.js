const express = require('express');
const webpush = require('web-push');
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();
const router = express.Router();

// Configure VAPID keys (generate once with: npx web-push generate-vapid-keys)
// Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT in environment variables.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@tripify.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// GET /api/notifications/vapid-public-key — return the public VAPID key to clients
router.get('/vapid-public-key', (_req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

// POST /api/notifications/subscribe — save or update a push subscription for the current user
router.post('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'endpoint and keys (p256dh, auth) are required' });
    }
    await prisma.pushSubscription.upsert({
      where: { userId_endpoint: { userId: req.user.id, endpoint } },
      create: { userId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { p256dh: keys.p256dh, auth: keys.auth },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/notifications/subscribe — remove a push subscription
router.delete('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
    await prisma.pushSubscription.deleteMany({
      where: { userId: req.user.id, endpoint },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * Send a push notification to all members of a trip except the actor.
 * Safe to call without VAPID keys — silently skips if not configured.
 *
 * @param {string} tripId
 * @param {string} actorUserId  The user performing the action (excluded from notifications)
 * @param {string} title
 * @param {string} body
 * @param {object} [data]       Optional extra data forwarded to the service worker
 */
async function sendPushToTripMembers(tripId, actorUserId, title, body, data = {}) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  try {
    // Collect all user IDs with access to the trip (owner + members) except the actor
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { userId: true, members: { select: { userId: true } } },
    });
    if (!trip) return;
    const recipientIds = new Set([trip.userId, ...trip.members.map(m => m.userId)]);
    recipientIds.delete(actorUserId);
    if (recipientIds.size === 0) return;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: [...recipientIds] } },
    });

    const payload = JSON.stringify({ title, body, data });
    await Promise.allSettled(subscriptions.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        // Remove stale/expired subscriptions (410 Gone or 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => {});
        }
      }
    }));
  } catch (err) {
    console.error('Push notification error:', err.message);
  }
}

module.exports = { router, sendPushToTripMembers };
