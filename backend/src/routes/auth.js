const express = require('express');
const passport = require('passport');

const router = express.Router();

// FRONTEND_URL may be comma-separated (CORS list) — use only the first for redirects
const appUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${appUrl}/login?error=auth_failed`
  }),
  (req, res) => {
    res.redirect(appUrl);
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
