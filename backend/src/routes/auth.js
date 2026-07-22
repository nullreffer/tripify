const express = require('express');
const passport = require('passport');

const router = express.Router();

// FRONTEND_URL may be comma-separated (CORS list) — use only the first for redirects
const appUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

router.get('/google', (req, res, next) => {
  // mobile=true signals the Android app — store flag in session so the callback
  // can redirect to the tripify:// deep-link instead of the web frontend.
  if (req.query.mobile === 'true') {
    req.session.mobileAuth = true;
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${appUrl}/login?error=auth_failed`
  }),
  (req, res) => {
    const isMobile = req.session.mobileAuth;
    delete req.session.mobileAuth;
    req.session.save(() => {
      if (isMobile) {
        // Redirect to the Android deep-link so Chrome Custom Tabs hands control back
        res.redirect('tripify://auth/callback?success=true');
      } else {
        res.redirect(appUrl);
      }
    });
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
