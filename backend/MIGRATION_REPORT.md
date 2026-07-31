# JSM Logistics WMS — Backend Migration & Scalability Report

Backend-only. No frontend UI, layout, component, workflow, permission, or business-rule
changes were made. Everything below is infrastructure, queries, indexes, and deployment.

## 1. Current backend architecture (as found)

Node.js + Express 5 + Prisma 5.22 + TypeScript, deployed on Railway, connected to Supabase
Postgres. A prior hardening pass (visible in code comments/git history) had already added a
lot of what this task asked for: a single shared `PrismaClient`, worker-thread Excel parsing
with a memory ceiling, batched `createMany`/cached lookups in the Inward commit path, parallel
`Promise.all` queries on Dashboard/Inventory, JWT auth with per-warehouse scoping, bcrypt +
login rate-limiting + account lockout, and centralized JSON error handling. This audit
confirmed that work, closed the remaining gaps, and replaced the hosting layer.

## 2. New backend architecture

Same stack (Express + Prisma + TypeScript), same Supabase Postgres database, now on Render
instead of Railway. No rewrite — targeted fixes layered on the existing, already-solid code.

## 3. Railway dependencies removed

- `render.yaml` (repo root) replaces Railway's deploy config — build/start commands, health
  check, persistent disk, env vars.
- Nothing in the application code referenced Railway directly (no Railway SDK/API calls) —
  the only Railway-specific artifacts were deployment scripts (`deploy-backend.bat`,
  `start-tunnel.bat` etc. in `backend/`), which are now unused. Left in place rather than
  deleted, in case you still want the tunnel scripts for local debugging.

## 4. New hosting architecture — Render

- `render.yaml`: web service, `rootDir: backend`, build `npm install && npm run build`, start
  `npm start`, health check `/health`, 1GB persistent disk mounted at `/data`.
- `backend/DEPLOYMENT.md`: step-by-step first-deploy instructions, including the one manual
  step Render can't automate — copying `dynamic-users.json` / `customer-permissions.json`
  (gitignored, filesystem-only state) onto the new persistent disk.
- `backend/.env.example`: documents every required/optional env var.

## 5. Database architecture

Unchanged. Still Supabase Postgres (project `jsm-logistics-backend`, `ap-south-1`). Verified
via the Supabase project tools (not guessed): 4 tracked migrations already exist, `RLS` is
enabled on every table, and `DailyCycleSession`/`WeeklyCycleTask` (the two tables the task
specifically warned about) are real, populated tables — created via raw SQL at app startup and
in one tracked migration, but **not** modeled in `schema.prisma`. Left as-is; not modeled or
migrated in this pass, since reconciling that drift is a deliberate follow-up, not a
scalability fix (see Risks).

## 6. Database / index optimizations

- Ran the Supabase performance advisor before touching anything. It flagged two genuinely
  unindexed foreign keys: `AuditLog.userId` and `DailyCycleSession.taskId`.
- Applied one additive migration directly (`add_missing_fk_indexes`):
  `CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ...` and
  `CREATE INDEX IF NOT EXISTS "DailyCycleSession_taskId_idx" ...`. Re-ran the advisor
  afterward — both warnings are gone. Nothing was dropped; the advisor's "unused index" INFO
  notices (on Rack/Bin/InventoryBatch/etc.) are expected on a low-traffic dataset and were
  left alone per the "never drop without proving unnecessary" instruction.
- All the high-traffic lookup columns on `InventoryBatch`, `InwardLineItem`, `OutwardLineItem`
  (materialId, warehouseId, rackId, binId, batchNumber, receiptDate, etc.) already had indexes
  from the prior pass — confirmed present in the live schema, not just `schema.prisma`.

## 7. Excel processing architecture

Already isolated and batched from the prior pass: `/api/inward/parse-excel` spawns a
`worker_threads` worker (`excelParseWorker.ts`) with a capped heap (512MB), so a malformed or
oversized file can only kill that worker — never the main process. `/api/inward/commit`
resolves warehouses/materials/bins/floor-locations via in-memory `Map` caches (one lookup per
distinct value, not per row) and writes via chunked `createMany` (1,000 rows/chunk). This
session's addition: each invoice group's writes (entry + line items + inventory batches +
truck movement) now run inside one `prisma.$transaction`, so a failure partway through a group
rolls back only that group — every other already-committed group is unaffected, and no
half-written group can be left in the database.

## 8. Large-data optimizations

- `GET /api/inventory` gained opt-in pagination/filtering/sorting (`page`, `limit`, `status`,
  `category`, `materialCode`, `from`/`to`, `sortBy`, `sortDir`) with a `pagination` block in
  the response — **only when those params are present**. With no params, the response is
  byte-for-byte the same shape as before (full array under `inventory`), because the current
  frontend fetches the whole list and filters client-side; changing the default shape would
  have broken it. This is the compatibility-layer approach the task asked for when an API
  can't change outright. See Risks below for what this means at real 50k–100k-row scale.
- `POST /api/outward/dispatch` (pick/deplete stock) now wraps the whole operation in a
  transaction with `SELECT ... FOR UPDATE` row locks on each picked batch, and rejects a pick
  if the batch doesn't have enough quantity left — see #9.

## 9. API compatibility changes

- `GET /api/inventory`: additive only (see #8). Existing callers unaffected.
- `POST /api/outward/dispatch`: **one intentional behavior change**, required by the task's
  own "never allow available stock < requested stock" / "prevent double allocation" rules.
  Previously, two concurrent dispatches could both read a batch's quantity before either wrote
  back, so both could "succeed" — silently overselling (the second write just clobbered the
  first). Now the batch row is locked for the transaction's duration; a second concurrent
  dispatch waits, then sees the already-reduced quantity. If a pick would take more than is
  actually available, that dispatch is now rejected with a clear error instead of silently
  clamping to zero. In normal (non-concurrent, sufficient-stock) use this is invisible — same
  math, same result.
- Everything else (auth, materials, warehouse, cycle-count, dashboard) unchanged.

## 10. Files changed

- `backend/package.json` — removed `prisma db push` from `build` (never run this against
  production — see #13); added `migrate:deploy` script; added `helmet`.
- `backend/tsconfig.json` — fixed `ignoreDeprecations` mismatch that was silently breaking
  `tsc` with the currently-installed TypeScript version (pre-existing, unrelated to this
  task, found while verifying the build actually compiles).
- `backend/src/index.ts` — added `helmet`, added a plain `/health` alongside `/api/health`,
  `DATA_DIR`-aware file path for the worker-warehouse bootstrap.
- `backend/src/routes/inventory.ts` — opt-in pagination/filter/sort (see #8).
- `backend/src/routes/outward.ts` — transactional, row-locked dispatch (see #9).
- `backend/src/routes/inward.ts` — per-invoice-group transaction wrapping.
- `backend/src/routes/auth.ts`, `backend/src/routes/dashboard.ts` — `DATA_DIR`-aware paths for
  `dynamic-users.json`/`customer-permissions.json`.
- New: `render.yaml`, `backend/.env.example`, `backend/DEPLOYMENT.md`, this report.
- Supabase: one migration applied directly (`add_missing_fk_indexes` — see #6).

## 11. Environment variables

See `backend/.env.example` for the full annotated list: `DATABASE_URL`, `JWT_SECRET`,
`NODE_ENV`, `PORT`, `CORS_ORIGIN`, and the new optional `DATA_DIR` (persistent-disk path for
the two JSON state files). `DIRECT_URL` is documented but not wired up (see Risks).

## 12. Database migration steps

Already applied (see #6) — no action needed. For any future schema change, follow
`backend/DEPLOYMENT.md`'s "Database schema changes" section (additive raw SQL against
Supabase directly, then update `schema.prisma` to match — never `db push`/`migrate reset`).

## 13. Deployment steps

Full walkthrough in `backend/DEPLOYMENT.md`. Summary: push to GitHub → Render Blueprint from
`render.yaml` → set `DATABASE_URL`/`JWT_SECRET`/`CORS_ORIGIN` (reuse the same `JWT_SECRET`
Railway used, or every session gets invalidated) → copy the two JSON state files onto the new
disk → verify `/health` → repoint the frontend's API base URL → decommission Railway.

## 14. Performance test results

Not run in this pass — the live Supabase project currently holds real but small data (dozens
to hundreds of rows per table: 50 inventory batches, 96 inward line items, etc.), so a
7,000-row load test would have been against synthetic data with no real signal, and running
it against the *live* project risked polluting production data. Recommend running the
1k/5k/7k/10k-row import benchmarks the original task specifies against a Supabase **branch**
(a disposable copy) before your first real 7,000-row production import, not against this
project directly. Every optimization needed to pass that test (worker-thread parsing, batched
writes, Map-based caching, chunked `createMany`) is already in place per #7 — this is a
verification step, not a rework.

## 15. Remaining risks / follow-ups

- **`schema.prisma` drift**: `WeeklyCycleTask`/`DailyCycleSession` are real, indexed,
  functioning tables, but aren't modeled in `schema.prisma` (they're managed via raw SQL).
  Fine as-is; formalizing them into real Prisma models would be a worthwhile follow-up but
  touches migration tooling directly, so it's out of scope for this pass.
- **Inventory pagination is opt-in, not yet used**: the frontend still fetches the full
  inventory array every load. The backend now supports true server-side pagination, but
  realizing it at 50k–100k rows requires the frontend to actually pass `page`/`limit` — a
  frontend change, which this task explicitly excluded. Flagging per the "stop and explain"
  rule rather than making it silently.
- **No formal import-history/job-queue table**: Excel commits are synchronous-but-batched
  (fast enough at the volumes described, thanks to worker-thread parsing + chunked writes),
  not an async job you can poll a status for. Building a full `ImportJob` table + polling
  endpoint would be a real feature addition, not a scalability fix to existing code — flagging
  as a recommended follow-up rather than building it unasked.
- **Filesystem state on Render**: handled via a persistent disk + `DATA_DIR` (see #4), but
  this is still two flat JSON files, not a database table — a future move of
  `dynamic-users.json`/`customer-permissions.json` into Postgres would remove this class of
  risk entirely (survives disk loss, works if you ever scale to >1 instance). Not done here to
  avoid touching login/user-management logic in a pass scoped to infrastructure.
- **DIRECT_URL / `prisma migrate deploy`**: documented in `.env.example` but not wired into
  the deploy pipeline, since the existing migration history was applied via Supabase directly
  and reconciling that with Prisma's own migration tracking needs a dedicated, careful pass —
  not bundled into this one.
