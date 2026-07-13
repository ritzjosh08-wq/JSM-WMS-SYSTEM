import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const prisma = new PrismaClient();
const app = express();

// Ensure a Warehouse row exists for every worker's warehouseCode (e.g. SALEM1/2/3)
async function ensureWorkerWarehouses() {
  try {
    const usersFile = path.join(__dirname, '../dynamic-users.json');
    const dynamic: any[] = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile, 'utf-8')) : [];
    // .trim() BEFORE .toUpperCase() is required here: every other place that resolves a
    // warehouse by code (inward.ts's per-row/per-invoice resolver, auth.ts's new-user
    // warehouse creation, warehouse.ts's ensureFG05Seeded/ensureCM35Seeded) normalizes with
    // trim+uppercase before the lookup. This was the ONE spot that only uppercased — a
    // worker record with a stray leading/trailing space in its warehouseCode (e.g. "FG05 ",
    // easy to introduce via manual JSON edits or an un-trimmed form field) would silently
    // fail to match the real "FG05" row and get its OWN new Warehouse row created here
    // instead. That ghost warehouse renders as an indistinguishable duplicate "FG05
    // Warehouse" entry in the Inventory filter dropdown (browsers collapse the stray
    // whitespace visually) — selecting it looks identical to selecting the real FG05, but
    // it has zero linked inventory, so the page shows "0 records" for a warehouse that
    // otherwise clearly has stock (see mergeDuplicateWarehouses() below, which cleans up
    // any duplicates already created by this bug).
    const codes = ['CM35', ...dynamic.filter(u => u.role === 'WORKER' && u.warehouseCode).map(u => String(u.warehouseCode).trim().toUpperCase())];
    for (const code of [...new Set(codes)]) {
      const existing = await prisma.warehouse.findFirst({ where: { code } });
      if (!existing) {
        await prisma.warehouse.create({ data: { code, name: `${code} Warehouse`, storageType: 'MIXED', isActive: true, totalCapacity: 10000, usedCapacity: 0 } });
        console.log(`Created warehouse ${code}`);
      }
    }
  } catch (e) { console.warn('ensureWorkerWarehouses skipped:', e); }
}

// ── Startup migration: add columns/tables that may be missing from older DB ───
async function runMigrations() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "OutwardEntry" ADD COLUMN "lrNumber" TEXT`);
    console.log('Migration: added lrNumber to OutwardEntry');
  } catch {}
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "OutwardLineItem" ADD COLUMN "description" TEXT`);
    console.log('Migration: added description to OutwardLineItem');
  } catch {}

  // ── Cycle Count v2 ─────────────────────────────────────────────────────────
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WeeklyCycleTask" (
        "id"          TEXT PRIMARY KEY,
        "warehouseId" TEXT NOT NULL,
        "weekStart"   TEXT NOT NULL,
        "totalBins"   INTEGER NOT NULL DEFAULT 0,
        "binsPerDay"  INTEGER NOT NULL DEFAULT 0,
        "status"      TEXT NOT NULL DEFAULT 'ACTIVE',
        "createdAt"   TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_wct_wh_week ON "WeeklyCycleTask"("warehouseId","weekStart")`);
  } catch {}
  // Add completedAt to WeeklyCycleTask if missing (one-time migration)
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "WeeklyCycleTask" ADD COLUMN "completedAt" TEXT`);
    console.log('Migration: added completedAt to WeeklyCycleTask');
  } catch {}
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DailyCycleSession" (
        "id"            TEXT PRIMARY KEY,
        "taskId"        TEXT NOT NULL,
        "dayNumber"     INTEGER NOT NULL,
        "scheduledDate" TEXT NOT NULL,
        "binIds"        TEXT NOT NULL DEFAULT '[]',
        "checkedBins"   TEXT NOT NULL DEFAULT '[]',
        "status"        TEXT NOT NULL DEFAULT 'PENDING',
        "completedAt"   TEXT,
        "completedBy"   TEXT,
        FOREIGN KEY ("taskId") REFERENCES "WeeklyCycleTask"("id") ON DELETE CASCADE
      )`);
    console.log('Cycle count v2 tables ready');
  } catch {}

  // ── One-time cleanup: delete the WH-DEFAULT placeholder warehouse ───────────
  try {
    const whDefault = await prisma.warehouse.findFirst({ where: { code: 'WH-DEFAULT' } });
    if (whDefault) {
      await prisma.inventoryBatch.deleteMany({ where: { warehouseId: whDefault.id } });
      await prisma.inwardLineItem.deleteMany({ where: { warehouseId: whDefault.id } });
      await prisma.outwardLineItem.deleteMany({ where: { warehouseId: whDefault.id } });
      await prisma.floorLocation.deleteMany({ where: { warehouseId: whDefault.id } });
      await prisma.warehouse.delete({ where: { id: whDefault.id } });
      console.log('Cleanup: deleted WH-DEFAULT placeholder warehouse and all linked records');
    }
  } catch (e: any) {
    console.warn('Cleanup WH-DEFAULT skipped:', e.message);
  }

  // ── Keep only the active warehouses in use (CM35, FG05); deactivate the rest ──
  try {
    const REMOVE = ['CM36', 'SALEM1', 'SALEM2', 'SALEM3'];
    const r = await prisma.warehouse.updateMany({ where: { code: { in: REMOVE } }, data: { isActive: false } });
    if (r.count > 0) console.log(`Cleanup: deactivated ${r.count} unused warehouse(s): ${REMOVE.join(', ')}`);
  } catch (e: any) {
    console.warn('Cleanup unused warehouses skipped:', e.message);
  }

  // ── One-time cleanup: merge duplicate warehouses that differ only by whitespace/case ──
  // Root cause (fixed in ensureWorkerWarehouses below): a code path that normalized a
  // warehouse code with .toUpperCase() but not .trim() could create a second Warehouse row
  // for what was meant to be the same warehouse (e.g. "FG05" and "FG05 "). Both then show up
  // as visually identical entries in dropdowns (e.g. Inventory's warehouse filter), but only
  // one of them actually has any FloorLocation/InventoryBatch/etc. records attached — picking
  // the empty duplicate looks exactly like picking the real warehouse, except nothing shows.
  // This merges every such duplicate into the ONE row whose code is already in canonical
  // (trimmed + uppercased) form, moving all its child records over before removing it.
  try {
    const all = await prisma.warehouse.findMany();
    const groups = new Map<string, typeof all>();
    for (const w of all) {
      const norm = w.code.trim().toUpperCase();
      if (!groups.has(norm)) groups.set(norm, []);
      groups.get(norm)!.push(w);
    }
    for (const [norm, whs] of groups) {
      if (whs.length <= 1) continue;
      const canonical = whs.find(w => w.code === norm) || whs[0];
      const dupes = whs.filter(w => w.id !== canonical.id);
      for (const dupe of dupes) {
        console.log(`Merging duplicate warehouse "${JSON.stringify(dupe.code)}" (id ${dupe.id}) into "${canonical.code}" (id ${canonical.id})`);
        await prisma.floorLocation.updateMany({ where: { warehouseId: dupe.id }, data: { warehouseId: canonical.id } });
        await prisma.rack.updateMany({ where: { warehouseId: dupe.id }, data: { warehouseId: canonical.id } });
        await prisma.inventoryBatch.updateMany({ where: { warehouseId: dupe.id }, data: { warehouseId: canonical.id } });
        await prisma.inwardLineItem.updateMany({ where: { warehouseId: dupe.id }, data: { warehouseId: canonical.id } });
        await prisma.outwardLineItem.updateMany({ where: { warehouseId: dupe.id }, data: { warehouseId: canonical.id } });
        await prisma.warehouse.delete({ where: { id: dupe.id } });
      }
    }
  } catch (e: any) {
    console.warn('mergeDuplicateWarehouses skipped:', e.message);
  }
}
runMigrations().then(ensureWorkerWarehouses);

// CORS_ORIGIN can be a comma-separated list of allowed origins (e.g. your deployed
// customer-app URL + the staff WMS URL). Falls back to "allow everything" when unset,
// which is fine for local dev but should be set once you know your real deployed
// frontend URL(s) — see the deployment guide.
const corsOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : {}));
// Raise body limit so large inward-commit payloads don't trip Express's default
// 100kb limit (which returns an HTML error page -> "Unexpected token '<'").
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

import inwardRouter from './routes/inward';
import dashboardRouter from './routes/dashboard';
import inventoryRouter from './routes/inventory';
import cycleCountRouter from './routes/cycle-count';
import outwardRouter from './routes/outward';
import materialsRouter from './routes/materials';
import authRouter from './routes/auth';
import warehouseRouter from './routes/warehouse';
import { requireAuth } from './middleware/auth';

// /api/auth is mounted WITHOUT a blanket requireAuth here because it hosts the public
// POST /login (and no-op /logout) that must be reachable without a token yet. The
// admin-only sub-routes inside auth.ts (workers/permissions/users) each declare their
// own requireAuth + requireRole('ADMIN') directly on the route. Every other router below
// carries real data and is fully gated behind requireAuth — any request without a valid
// Bearer token now gets a 401 before it reaches a route handler.
app.use('/api/inward', requireAuth, inwardRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/inventory', requireAuth, inventoryRouter);
app.use('/api/cycle-count', requireAuth, cycleCountRouter);
app.use('/api/outward', requireAuth, outwardRouter);
app.use('/api/materials', requireAuth, materialsRouter);
app.use('/api/auth', authRouter);
app.use('/api/warehouse', requireAuth, warehouseRouter);

// ── JSON parse error handler — returns JSON instead of Express HTML 400/413 pages ──
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request payload too large. Maximum size is 25MB.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'PostgreSQL connected' });
});

// Any unmatched /api route returns JSON (never HTML) so the client's res.json() never chokes.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler - always respond with JSON, never Express's default HTML page.
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(err?.status || err?.statusCode || 500).json({ error: err?.message || 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
