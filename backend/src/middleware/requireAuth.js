const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'iamjaydesai@gmail.com').trim().toLowerCase();

const requireAuth = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const email = req.user?.email?.toLowerCase();
  const isAdmin = email === ADMIN_EMAIL;
  if (isAdmin || req.user?.isApproved) {
    return next();
  }
  res.status(403).json({ error: 'approval_pending' });
};

module.exports = requireAuth;
