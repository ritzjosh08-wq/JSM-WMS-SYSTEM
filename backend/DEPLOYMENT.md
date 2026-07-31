# Backend Deployment — Render (replaces Railway)

The database does not move. Supabase Postgres stays exactly as it is; only the Node/Express
API's *hosting* changes, from Railway to Render.

## One-time setup

1. **Push this repo to GitHub** (Render deploys from a git repo, same as Railway did).
2. In the Render dashboard: **New → Blueprint**, point it at this repo. Render will read
   `render.yaml` at the repo root and create the `jsm-logistics-backend` web service plus its
   1GB persistent disk automatically.
3. Open the new service → **Environment** tab and set the three secrets that `render.yaml`
   deliberately leaves blank (`sync: false`):
   - `DATABASE_URL` — the **same** Supabase session-pooler connection string already used on
     Railway (Supabase → Project Settings → Database → Connection string → "Session pooler").
     Copy the value from Railway's current env vars if you don't have it handy.
   - `JWT_SECRET` — reuse the exact same value currently set on Railway. **Do not generate a
     new one** — every currently logged-in user's token, and anyone with a saved session,
     would be invalidated at once (forced re-login for everyone) if the secret changes.
   - `CORS_ORIGIN` — the deployed frontend origin(s), e.g.
     `https://your-staff-app.netlify.app,https://your-customer-portal.netlify.app`
4. **Copy over the two runtime data files** (these are gitignored — they only exist on disk,
   not in the repo, so they don't come across automatically):
   - `backend/dynamic-users.json`
   - `backend/customer-permissions.json`
   Use Render's **Shell** tab on the new service (or a one-off SSH session) to `cat >` these
   two files into `/data/dynamic-users.json` and `/data/customer-permissions.json` — the
   persistent disk `render.yaml` mounts there. Skipping this step just means any admin-created
   worker/customer accounts beyond the 4 built-in ones start empty on the new host; nothing
   breaks, but those accounts would need to be re-created.
5. Trigger the first deploy. Build runs `npm install && npm run build`
   (`prisma generate && tsc`); start runs `npm start` (`node dist/index.js`).
6. Confirm `https://<your-service>.onrender.com/health` returns `{"status":"ok"}`.
7. Point your frontend's API base URL at the new Render URL (this is the one unavoidable
   frontend-adjacent change — an *environment variable/config value*, not a code change — see
   note at the bottom).
8. Once the new backend is verified working end-to-end, decommission the Railway service.

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
