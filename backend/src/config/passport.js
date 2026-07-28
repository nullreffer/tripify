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

// ── Shared user upsert logic ─────────────────────────────────────────────────
async function upsertUser({ req, providerId, providerField, email, name, avatar }) {
  const emailLower = email?.toLowerCase();
  const isAdmin = emailLower === ADMIN_EMAIL;
  const allowedEmails = getAllowedEmails();
  const isWhitelisted = allowedEmails.length > 0 && allowedEmails.includes(emailLower);

  let hasValidInvite = false;
  const pendingInviteToken = req?.session?.pendingInvite;
  if (pendingInviteToken) {
    const invite = await prisma.invite.findUnique({ where: { token: pendingInviteToken } });
    hasValidInvite = Boolean(invite && !invite.usedAt);
  }

  const shouldApprove = isAdmin || isWhitelisted || hasValidInvite;

  // Try to find by provider ID first, then by email
  let user = await prisma.user.findUnique({ where: { [providerField]: providerId } });
  if (!user && email) {
    user = await prisma.user.findUnique({ where: { email } });
  }

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name || user.name,
        avatar: avatar || user.avatar,
        email: email || user.email,
        [providerField]: providerId,
        ...(shouldApprove ? { isApproved: true, approvedAt: new Date() } : {}),
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        [providerField]: providerId,
        email,
        name,
        avatar,
        isApproved: shouldApprove,
        approvedAt: shouldApprove ? new Date() : null,
      },
    });
  }
  return user;
}

// ── Google Strategy ──────────────────────────────────────────────────────────
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
        const user = await upsertUser({
          req,
          providerId: profile.id,
          providerField: 'googleId',
          email,
          name: profile.displayName,
          avatar,
        });
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// ── Apple Strategy (Sign in with Apple) ─────────────────────────────────────
// Only registered when the required environment variables are present.
if (
  process.env.APPLE_CLIENT_ID &&
  process.env.APPLE_TEAM_ID &&
  process.env.APPLE_KEY_ID &&
  process.env.APPLE_PRIVATE_KEY
) {
  try {
    const { Strategy: AppleStrategy } = require('passport-apple');
    passport.use(
      new AppleStrategy(
        {
          clientID: process.env.APPLE_CLIENT_ID,
          teamID: process.env.APPLE_TEAM_ID,
          keyID: process.env.APPLE_KEY_ID,
          // APPLE_PRIVATE_KEY may contain literal \n — normalise to real newlines
          privateKeyString: (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
          callbackURL: process.env.APPLE_CALLBACK_URL || `${(process.env.FRONTEND_URL || '').split(',')[0]}/auth/apple/callback`,
          passReqToCallback: true,
          scope: ['name', 'email'],
        },
        async (req, accessToken, refreshToken, idToken, profile, done) => {
          try {
            // Apple only provides name on first sign-in; email comes from idToken
            const sub = idToken?.sub || profile?.id;
            const email = idToken?.email || profile?.email;
            const firstName = profile?.name?.firstName || '';
            const lastName = profile?.name?.lastName || '';
            const name = [firstName, lastName].filter(Boolean).join(' ') || email?.split('@')[0] || 'Apple User';
            const user = await upsertUser({
              req,
              providerId: sub,
              providerField: 'appleId',
              email,
              name,
              avatar: null,
            });
            return done(null, user);
          } catch (err) {
            return done(err, null);
          }
        }
      )
    );
    console.log('Apple Sign In strategy registered.');
  } catch (err) {
    console.warn('Failed to register Apple Sign In strategy:', err.message);
  }
}

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

