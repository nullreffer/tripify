const express = require('express');
const passport = require('passport');

const router = express.Router();

// FRONTEND_URL may be comma-separated (CORS list) — use only the first for redirects
const appUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

router.get('/google', (req, res, next) => {
  // If the user is coming from an invite link, persist the token through the OAuth flow
  if (req.query.invite) {
    req.session.pendingInvite = req.query.invite;
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get(
  '/google/callback',
  (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        const msg = info?.message || 'auth_failed';
        return res.redirect(`${appUrl}/login?error=${encodeURIComponent(msg)}`);
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        req.session.save(() => res.redirect(appUrl));
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

