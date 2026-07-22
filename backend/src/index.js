require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

require('./config/passport');

const authRoutes = require('./routes/auth');
const tripRoutes = require('./routes/trips');
const { tripRouter, inviteRouter } = require('./routes/invites');
const stopRoutes = require('./routes/stops');
const itemRoutes = require('./routes/items');
const referenceRoutes = require('./routes/references');
const aiRoutes = require('./routes/ai');
const dayRoutes = require('./routes/days');
const reservationRoutes = require('./routes/reservations');
const importRoutes = require('./routes/import');
const placesRoutes = require('./routes/places');

const app = express();
app.set('trust proxy', 1);

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(u => u.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

app.use(session({
  store: new pgSession({
    pool: pgPool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/trips', tripRouter);
app.use('/api/trips/:tripId/stops', stopRoutes);
app.use('/api/trips/:tripId/items', itemRoutes);
app.use('/api/trips/:tripId/references', referenceRoutes);
app.use('/api/trips/:tripId/ai', aiRoutes);
app.use('/api/trips/:tripId/days', dayRoutes);
app.use('/api/trips/:tripId/reservations', reservationRoutes);
app.use('/api/trips/:tripId/import', importRoutes);
app.use('/api/import', importRoutes);
app.use('/api/invites', inviteRouter);
app.use('/api/places', placesRoutes);

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
