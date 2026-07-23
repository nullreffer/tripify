const express = require('express');
const passport = require('passport');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'iamjaydesai@gmail.com').trim().toLowerCase();

// FRONTEND_URL may be comma-separated (CORS list) — use only the first for redirects
const appUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

// Rate limit Google OAuth initiation by IP to prevent abuse
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

router.get('/google', authRateLimit, (req, res, next) => {
  // If the user is coming from an invite link, persist the token through the OAuth flow.
  // Validate it is a non-empty alphanumeric/hyphen string before storing (basic format check).
  const invite = req.query.invite;
  if (invite && /^[a-z0-9-]+$/i.test(invite)) {
    req.session.pendingInvite = invite;
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get(
  '/google/callback',
  authRateLimit,
  (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        const msg = info?.message || 'auth_failed';
        return res.redirect(`${appUrl}/login?error=${encodeURIComponent(msg)}`);
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        // Clear the pending invite token from the session after successful login
        delete req.session.pendingInvite;
        req.session.save(() => res.redirect(appUrl));
      });
    })(req, res, next);
  }
);

router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    const { id, name, email, avatar, isApproved } = req.user;
    const isAdmin = email?.toLowerCase() === ADMIN_EMAIL;
    res.json({ id, name, email, avatar, isApproved: Boolean(isApproved || isAdmin), isAdmin });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.json({ message: 'Logged out successfully' });
  });
});

module.exports = router;
