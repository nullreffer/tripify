const express = require('express');
const passport = require('passport');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Limit OAuth initiation to 10 attempts per 15 minutes per IP
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' }
});

// FRONTEND_URL may be comma-separated (CORS list) — use only the first for redirects
const appUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

router.get('/google', authRateLimit, (req, res, next) => {
  // mobile=true signals the Android app — store flag in session so the callback
  // can redirect to the tripify:// deep-link instead of the web frontend.
  if (req.query.mobile === 'true') {
    req.session.mobileAuth = true;
  }
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
        const isMobile = req.session.mobileAuth;
        delete req.session.mobileAuth;
        // Clear the pending invite token from the session after successful login
        delete req.session.pendingInvite;
        req.session.save(() => {
          if (isMobile) {
            // Redirect to the Android deep-link so Chrome Custom Tabs hands control back
            res.redirect('tripify://auth/callback?success=true');
          } else {
            res.redirect(appUrl);
          }
        });
      });
    })(req, res, next);
  }
);

router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    const { id, name, email, avatar } = req.user;
    res.json({ id, name, email, avatar });
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

