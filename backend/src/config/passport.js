const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'iamjaydesai@gmail.com').trim().toLowerCase();

// Comma-separated list of allowed emails from env, e.g. "a@b.com,c@d.com"
function getAllowedEmails() {
  return (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const emailLower = email?.toLowerCase();
        const avatar = profile.photos?.[0]?.value;
        const isAdmin = emailLower === ADMIN_EMAIL;

        const allowedEmails = getAllowedEmails();
        const isWhitelisted = allowedEmails.length > 0 && allowedEmails.includes(emailLower);

        // Check for a valid pending invite stored in session
        let hasValidInvite = false;
        const pendingInviteToken = req.session?.pendingInvite;
        if (pendingInviteToken) {
          const invite = await prisma.invite.findUnique({
            where: { token: pendingInviteToken },
          });
          hasValidInvite = Boolean(invite && !invite.usedAt);
        }

        const shouldApprove = isAdmin || isWhitelisted || hasValidInvite;

        const user = await prisma.user.upsert({
          where: { googleId: profile.id },
          update: {
            name: profile.displayName,
            avatar,
            email,
            ...(shouldApprove ? { isApproved: true, approvedAt: new Date() } : {}),
          },
          create: {
            googleId: profile.id,
            email,
            name: profile.displayName,
            avatar,
            isApproved: shouldApprove,
            approvedAt: shouldApprove ? new Date() : null,
          }
        });

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});
