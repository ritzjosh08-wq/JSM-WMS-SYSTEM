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
    const codes = ['CM35', ...dynamic.filter(u => u.role === 'WORKER' && u.warehouseCode).map(u => String(u.warehouseCode).toUpperCase())];
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
}
runMigrations().then(ensureWorkerWarehouses);

app.use(cors());
app.use(express.json());

import inwardRouter from './routes/inward';
import dashboardRouter from './routes/dashboard';
import inventoryRouter from './routes/inventory';
import cycleCountRouter from './routes/cycle-count';
import outwardRouter from './routes/outward';
import materialsRouter from './routes/materials';
import authRouter from './routes/auth';
import warehouseRouter from './routes/warehouse';

app.use('/api/inward', inwardRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/cycle-count', cycleCountRouter);
app.use('/api/outward', outwardRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/auth', authRouter);
app.use('/api/warehouse', warehouseRouter);

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'PostgreSQL connected' });
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
