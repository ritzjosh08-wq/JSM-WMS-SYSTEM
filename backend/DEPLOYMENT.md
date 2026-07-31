# Backend Deployment — Render

The database does not move. Supabase Postgres stays exactly as it is; only the Node/Express
API's *hosting* changes — from your laptop (the ngrok-tunneled setup in
`WORKER-LAPTOP-SETUP.md`) to Render, so it's reachable 24/7 without your laptop needing to be
on. Everything below is on Render's **free** plan, per your choice — see the cold-start note
in step 6.

## One-time setup

1. **Push this repo to GitHub** if you haven't already (Render deploys from a git repo) —
   `git status` should show a clean working tree and `origin/main` up to date.
2. In the Render dashboard (https://dashboard.render.com, free account): **New → Blueprint**,
   point it at this repo. Render reads `render.yaml` at the repo root and creates the
   `jsm-logistics-backend` web service on the free plan automatically.
3. Open the new service → **Environment** tab and set the three secrets that `render.yaml`
   deliberately leaves blank (`sync: false`) — copy these straight from your local
   `backend/.env` (same file this whole session has been running against):
   - `DATABASE_URL` — the exact value from `backend/.env`'s `DATABASE_URL` line (the Supabase
     session-pooler connection string).
   - `JWT_SECRET` — the exact value from `backend/.env`'s `JWT_SECRET` line. **Do not generate
     a new one** — every currently logged-in user's session would be invalidated at once
     (forced re-login for everyone) if the secret changes.
   - `CORS_ORIGIN` — copy the current value from `backend/.env`, then add the worker app's
     Cloudflare Pages link (`https://your-project.pages.dev`) — though the backend code
     already accepts any `*.pages.dev` origin automatically, so this is mostly for the exact
     origins (Netlify links, localhost dev ports) already in that list.
4. **Free plan has no persistent disk** (see `render.yaml`'s comment) — skip copying
   `dynamic-users.json`/`customer-permissions.json` over; they'll just start empty on Render
   and reset on redeploys/restarts. This only affects admin-created worker/customer accounts
   beyond the 4 built-in ones and custom permission overrides — all real inventory data is in
   Supabase Postgres and is unaffected. Re-create any such accounts after each reset, or ask to
   move that data into Postgres properly later if this becomes a hassle.
5. Trigger the first deploy. Build runs `npm install && npm run build`
   (`prisma generate && tsc`); start runs `npm start` (`node dist/index.js`).
6. Confirm `https://<your-service>.onrender.com/health` returns `{"status":"ok"}`. First
   request after 15 minutes of no traffic takes 30-60 seconds (free plan spin-down) — this is
   expected, not an error. Optional mitigation: a free uptime monitor (e.g.
   https://uptimerobot.com) pinging that `/health` URL every 10 minutes keeps it from ever
   spinning down, at the cost of using more of the free plan's monthly instance hours.
7. Point your frontend's `VITE_API_BASE` at the new Render URL — this replaces the ngrok
   tunnel URL in `frontend/.env.worker` (and `frontend/.env.production` for the customer app,
   if that's still in use). Rebuild/re-upload the worker app (`build-worker-app.bat` →
   Cloudflare Pages) once this changes.
8. Once confirmed working, you can stop running `start-tunnel-ngrok.bat` — it's no longer
   needed. `start-app.bat` is still useful for your own local dev/testing.

## Ongoing deploys

Render auto-deploys on every push to the connected branch (`autoDeployTrigger: commit` in
`render.yaml`). No manual steps needed for routine code changes.

## Database schema changes

Do **not** run `prisma db push` or `prisma migrate reset` against this database — both can
drop or rewrite tables Prisma doesn't know about (this project has `DailyCycleSession` /
`WeeklyCycleTask`, created via raw SQL, that are NOT modeled in `schema.prisma`). For any
future schema change:

1. Write the change as plain, additive SQL (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
   EXISTS`, `CREATE INDEX IF NOT EXISTS`).
2. Apply it directly against the Supabase project (SQL editor, or the Supabase migration
   tool) — the same way the existing 4 tracked migrations were applied.
3. Only after it's live, update `schema.prisma` to match reality and run `npx prisma generate`
   (regenerates the client's types — does **not** touch the database) so the app's types stay
   in sync.

## Health check & restarts

- `GET /health` and `GET /api/health` both ping the database and return `{"status":"ok"}` (or
  `error`). Render uses `/health` (configured in `render.yaml`) to know when the service is up
  and to auto-restart it if it stops responding.
- Logs are visible in the Render dashboard's **Logs** tab in real time — no extra setup needed.

## One thing this could NOT avoid touching

The frontend/customer-app currently point at wherever the backend is deployed today (an API
base URL, almost certainly read from a Netlify environment variable or a config file — not
hardcoded across every component). Moving hosts means that one URL has to change to the new
Render address. This is a deployment **configuration** value, not a UI/feature/behavior
change — but per the "no frontend changes without flagging it first" rule, it's called out
here explicitly rather than changed silently. Locate that value (check `frontend/.env`,
`customer-app/.env`, or Netlify's site environment variables) and update it once the Render
service is confirmed healthy.
