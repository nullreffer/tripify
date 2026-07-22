const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

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
        const avatar = profile.photos?.[0]?.value;

        const allowedEmails = getAllowedEmails();
        const isWhitelisted = allowedEmails.length === 0 || allowedEmails.includes(email?.toLowerCase());

        if (!isWhitelisted) {
          // Check for a valid pending invite stored in session
          const pendingInviteToken = req.session?.pendingInvite;
          if (pendingInviteToken) {
            const invite = await prisma.invite.findUnique({
              where: { token: pendingInviteToken },
            });
            if (!invite || invite.usedAt) {
              return done(null, false, { message: 'access_denied' });
            }
            // Valid invite — allow this user through
          } else {
            return done(null, false, { message: 'access_denied' });
          }
        }

        const user = await prisma.user.upsert({
          where: { googleId: profile.id },
          update: { name: profile.displayName, avatar },
          create: {
            googleId: profile.id,
            email,
            name: profile.displayName,
            avatar
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

