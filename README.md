# Azitrip

A trip management app built with Node.js + Express (backend) and React + Vite (frontend), deployed on Railway.

---

## Project structure

```
azitrip/
├── backend/        Express API + Passport Google OAuth + Prisma + PostgreSQL
├── frontend/       React + Vite SPA
└── .github/
    └── workflows/  CI pipeline (GitHub Actions)
```

---

## Local development

### Prerequisites
- Node.js 20+
- A running PostgreSQL database
- Google OAuth credentials (see below)

### 1 — Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add `http://localhost:3001` to **Authorised JavaScript origins**
4. Add `http://localhost:3001/auth/google/callback` to **Authorised redirect URIs**
5. Copy the **Client ID** and **Client secret**

### 2 — Backend setup

```bash
cd backend
cp .env.example .env   # fill in your values
npm install
npx prisma migrate dev --name init
npm run dev
```

Key `.env` values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Random string for signing sessions |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3001/auth/google/callback` |
| `FRONTEND_URL` | `http://localhost:5173` |
| `GEMINI_API_KEY` | Enables AI assistant and spreadsheet import features |
| `GEMINI_MODEL` | Optional Gemini model override (defaults to `gemini-flash-latest`) |

### 3 — Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` and `/auth` to `http://localhost:3001` automatically — no extra config needed.

---

## Railway deployment

Railway auto-deploys when you push to `main`. To set it up:

1. Push this repo to GitHub
2. Go to [Railway](https://railway.app/) → New Project → Deploy from GitHub repo
3. Add a **PostgreSQL** plugin to your project
4. Create **two services** — one pointing to `backend/`, one to `frontend/`
5. Each service reads its `railway.toml` for build/start commands

### Backend environment variables (set in Railway dashboard)

```
DATABASE_URL          → auto-injected by Railway Postgres plugin
SESSION_SECRET        → generate: openssl rand -hex 32
GOOGLE_CLIENT_ID      → from Google Cloud Console
GOOGLE_CLIENT_SECRET  → from Google Cloud Console
GOOGLE_CALLBACK_URL   → https://<your-backend>.up.railway.app/auth/google/callback
FRONTEND_URL          → https://<your-frontend>.up.railway.app
GEMINI_API_KEY        → from Google AI Studio
GEMINI_MODEL          → optional, defaults to gemini-flash-latest
NODE_ENV              → production
```

### Frontend environment variables (set in Railway dashboard)

```
VITE_API_URL → https://<your-backend>.up.railway.app
```

> After setting `GOOGLE_CALLBACK_URL` in Railway, add that URL to your Google OAuth app's **Authorised redirect URIs**.

---

## API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/google` | Start Google OAuth flow |
| `GET` | `/auth/google/callback` | OAuth callback |
| `GET` | `/auth/me` | Get current user |
| `POST` | `/auth/logout` | Sign out |
| `GET` | `/api/trips` | List user's trips |
| `POST` | `/api/trips` | Create a trip |
| `GET` | `/api/trips/:id` | Get a trip |
| `PUT` | `/api/trips/:id` | Update a trip |
| `DELETE` | `/api/trips/:id` | Delete a trip |
