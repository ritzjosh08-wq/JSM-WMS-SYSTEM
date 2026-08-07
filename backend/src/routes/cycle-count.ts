import express from 'express';
import { prisma } from '../lib/prisma';
import crypto from 'crypto';
import { resolveScopedCodes, requireRole, FORBIDDEN_CODE } from '../middleware/auth';

const router = express.Router();

// ── Helpers ────────────────────────────────────────────────────────────────────
const newId = () => crypto.randomUUID();

// ── assertWarehouseScope — server-side cross-tenant guard ─────────────────────
// Every route below identifies its target by an internal warehouseId (or a
// session/task id that belongs to one), which the CLIENT supplies directly —
// there was previously no check anywhere in this file that req.user is actually
// allowed to see that warehouse. resolveScopedCodes() (already used correctly by
// GET /records below) is the established pattern for this everywhere else in the
// backend (inventory/inward/outward/dashboard/warehouse) — this file was missing
// it on every other route, which meant any authenticated WORKER or CUSTOMER could
// read (or, for /plan endpoints, DELETE) another warehouse's cycle-count plans,
// sessions, and live inventory just by supplying a different warehouseId/session
// id. ADMIN is unrestricted, matching resolveScopedCodes' own ADMIN behavior.
// Sends the 403 itself and returns false so callers can just `if (!ok) return;`.
async function assertWarehouseScope(req: express.Request, res: express.Response, warehouseId: string): Promise<boolean> {
  if (!warehouseId) return true; // let the route's own "warehouseId required" check handle this
  if (req.user?.role === 'ADMIN') return true;
  const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { code: true } });
  if (!wh) return true; // let the route's own "not found" handling take it from here
  const scoped = resolveScopedCodes(req, [wh.code.toUpperCase()]);
  if (!scoped.length || scoped[0] === FORBIDDEN_CODE) {
    res.status(403).json({ error: 'You do not have access to this warehouse' });
    return false;
  }
  return true;
}

// Always use LOCAL date (not UTC) so Mon–Sat boundaries are correct in IST and other offset zones
const dateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function getMondayOfWeek(date = new Date()): Date {
  const d   = new Date(date);
  const day = d.getDay();              // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

async function markOverdue() {
  const today = dateStr(new Date());
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "DailyCycleSession" SET status = 'OVERDUE'
       WHERE status IN ('PENDING','IN_PROGRESS') AND "scheduledDate" < $1`,
      today
    );
  } catch { /* table may not exist yet */ }
}

async function parseSessions(sessions: any[]) {
  return sessions.map(s => ({
    ...s,
    binIds:      JSON.parse(s.binIds      || '[]'),
    checkedBins: JSON.parse(s.checkedBins || '[]'),
  }));
}

// ── GET /warehouses — list warehouses with live location counts ───────────────
// Counts both rack bins AND floor locations (FG05 is floor-only)
router.get('/warehouses', async (req, res) => {
  try {
    // Was returning every active warehouse to every authenticated caller regardless of
    // role — a CUSTOMER account could see (and, via other routes, use the id from) every
    // other customer's warehouse. Non-admins now only see warehouses in their own scope.
    const allowedCodes = req.user?.role === 'ADMIN' ? null : resolveScopedCodes(req, []);
    const whs = await prisma.warehouse.findMany({
      where: {
        isActive: true,
        NOT: { code: 'WH-DEFAULT' },
        ...(allowedCodes ? { code: { in: allowedCodes } } : {}),
      },
      select: { id: true, name: true, code: true },
    });
    const result = await Promise.all(whs.map(async wh => {
      const [rackBins, floorLocs] = await Promise.all([
        prisma.bin.count({ where: { isActive: true, rack: { warehouseId: wh.id } } }),
        prisma.floorLocation.count({ where: { warehouseId: wh.id, isActive: true } }),
      ]);
      return { ...wh, binCount: rackBins + floorLocs, rackBins, floorLocs };
    }));
    res.json({ warehouses: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /plan/current?warehouseId=X ──────────────────────────────────────────
router.get('/plan/current', async (req, res) => {
  try {
    const warehouseId = String(req.query.warehouseId || '');
    if (!warehouseId) return res.status(400).json({ error: 'warehouseId required' });
    if (!(await assertWarehouseScope(req, res, warehouseId))) return;

    await markOverdue();

    const monday    = getMondayOfWeek();
    const mondayStr = dateStr(monday);

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "WeeklyCycleTask" WHERE "warehouseId" = $1 AND "weekStart" = $2 LIMIT 1`,
      warehouseId, mondayStr
    );
    if (!rows.length) return res.json({ plan: null, sessions: [] });

    const plan     = rows[0];
    const sessions = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "DailyCycleSession" WHERE "taskId" = $1 ORDER BY "dayNumber"`,
      plan.id
    );
    return res.json({ plan, sessions: await parseSessions(sessions) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /plan/current?warehouseId=X — wipe ALL active plans for a warehouse
// Clears current week AND any leftover plans from previous weeks for the same warehouse
router.delete('/plan/current', requireRole('ADMIN', 'WORKER'), async (req, res) => {
  try {
    const warehouseId = String(req.query.warehouseId || '');
    if (!warehouseId) return res.status(400).json({ error: 'warehouseId required' });
    if (!(await assertWarehouseScope(req, res, warehouseId))) return;

    // Get ALL active (non-completed) tasks for this warehouse, not just current week
    const tasks = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, "weekStart" FROM "WeeklyCycleTask" WHERE "warehouseId" = $1 AND status = 'ACTIVE'`,
      warehouseId
    );

    for (const task of tasks) {
      await prisma.$executeRawUnsafe(`DELETE FROM "DailyCycleSession" WHERE "taskId" = $1`, task.id);
    }
    await prisma.$executeRawUnsafe(
      `DELETE FROM "WeeklyCycleTask" WHERE "warehouseId" = $1 AND status = 'ACTIVE'`,
      warehouseId
    );

    res.json({ success: true, deletedTasks: tasks.length, weeks: tasks.map(t => t.weekStart) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /plan/generate — create this week's plan ────────────────────────────
router.post('/plan/generate', requireRole('ADMIN', 'WORKER'), async (req, res) => {
  try {
    const { warehouseId } = req.body;
    if (!warehouseId) return res.status(400).json({ error: 'warehouseId required' });
    if (!(await assertWarehouseScope(req, res, warehouseId))) return;

    const monday    = getMondayOfWeek();
    const mondayStr = dateStr(monday);
    const today     = dateStr(new Date());

    // Check existing plan
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "WeeklyCycleTask" WHERE "warehouseId" = $1 AND "weekStart" = $2 LIMIT 1`,
      warehouseId, mondayStr
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Plan already exists for this week', planId: existing[0].id });
    }

    // Get ALL active locations for the warehouse:
    // • Rack bins  (CM35 has these)
    // • Floor locations (FG05 is floor-only — 109 locations, no racks)
    const [rackBins, floorLocs] = await Promise.all([
      prisma.bin.findMany({
        where: { isActive: true, rack: { warehouseId } },
        select: { id: true, code: true, rack: { select: { code: true } } },
        orderBy: { code: 'asc' },
      }),
      prisma.floorLocation.findMany({
        where: { warehouseId, isActive: true },
        select: { id: true, code: true, zone: true },
        orderBy: { code: 'asc' },
      }),
    ]);

    // Unified location list — same shape as binIds JSON stored in sessions
    const allLocations = [
      ...rackBins.map(b  => ({ id: b.id,  code: b.code,  rackCode: b.rack.code,  type: 'BIN'   })),
      ...floorLocs.map(f => ({ id: f.id,  code: f.code,  rackCode: f.zone || '', type: 'FLOOR' })),
    ];

    // Fisher-Yates shuffle — randomises bin assignment across days while guaranteeing all bins are covered
    for (let i = allLocations.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allLocations[i], allLocations[j]] = [allLocations[j], allLocations[i]];
    }

    const totalBins = allLocations.length;
    if (totalBins === 0) return res.status(400).json({ error: 'No active bins or floor locations found in this warehouse' });

    const binsPerDay = Math.ceil(totalBins / 6);
    const taskId     = newId();

    await prisma.$executeRawUnsafe(
      `INSERT INTO "WeeklyCycleTask" (id, "warehouseId", "weekStart", "totalBins", "binsPerDay", status, "createdAt")
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', now()::text)`,
      taskId, warehouseId, mondayStr, totalBins, binsPerDay
    );

    // Distribute all locations into 6 daily sessions (Mon–Sat)
    for (let day = 1; day <= 6; day++) {
      const start   = (day - 1) * binsPerDay;
      const slice   = allLocations.slice(start, Math.min(start + binsPerDay, totalBins));
      const dayDate = addDays(monday, day - 1);
      const dayStr  = dateStr(dayDate);
      const status  = dayStr < today ? 'OVERDUE' : 'PENDING';
      const binJson = JSON.stringify(slice);

      await prisma.$executeRawUnsafe(
        `INSERT INTO "DailyCycleSession" (id, "taskId", "dayNumber", "scheduledDate", "binIds", "checkedBins", status)
         VALUES ($1, $2, $3, $4, $5, '[]', $6)`,
        newId(), taskId, day, dayStr, binJson, status
      );
    }

    const plan     = (await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "WeeklyCycleTask" WHERE id = $1`, taskId))[0];
    const sessions = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "DailyCycleSession" WHERE "taskId" = $1 ORDER BY "dayNumber"`, taskId
    );
    res.json({ plan, sessions: await parseSessions(sessions) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /session/:id ──────────────────────────────────────────────────────────
router.get('/session/:id', async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT s.*, t."weekStart", t."warehouseId", t."totalBins", t."binsPerDay"
       FROM "DailyCycleSession" s JOIN "WeeklyCycleTask" t ON s."taskId" = t.id WHERE s.id = $1`,
      req.params.id
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (!(await assertWarehouseScope(req, res, rows[0].warehouseId))) return;
    const [s] = await parseSessions(rows);
    res.json({ session: s });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /session/:id/export-data — bin list + current inventory for Excel ─────
router.get('/session/:id/export-data', async (req, res) => {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT s.*, t."weekStart", t."warehouseId", t."totalBins", t."binsPerDay",
              w.code as "warehouseCode", w.name as "warehouseName"
       FROM "DailyCycleSession" s
       JOIN "WeeklyCycleTask" t ON s."taskId" = t.id
       JOIN "Warehouse" w ON t."warehouseId" = w.id
       WHERE s.id = $1`,
      req.params.id
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    if (!(await assertWarehouseScope(req, res, rows[0].warehouseId))) return;

    const session  = rows[0];
    const binIds: any[] = JSON.parse(session.binIds || '[]');

    // For each location, fetch current inventory batches
    const enriched = await Promise.all(binIds.map(async (loc: any) => {
      let batches: any[] = [];

      if (loc.type === 'BIN') {
        batches = await prisma.inventoryBatch.findMany({
          where: { binId: loc.id, stockStatus: { notIn: ['DISPATCHED', 'REMOVED', 'DAMAGED'] } },
          include: { material: { select: { code: true, description: true, huUnit: true, materialType: true } } },
          orderBy: { receiptDate: 'desc' },
        });
      } else {
        batches = await prisma.inventoryBatch.findMany({
          where: { floorLocationId: loc.id, stockStatus: { notIn: ['DISPATCHED', 'REMOVED', 'DAMAGED'] } },
          include: { material: { select: { code: true, description: true, huUnit: true, materialType: true } } },
          orderBy: { receiptDate: 'desc' },
        });
      }

      return {
        ...loc,
        materials: batches.map(b => {
          let cf: any = {};
          try { cf = JSON.parse((b as any).customFields || '{}'); } catch {}
          return {
            materialCode:  b.material.code,
            description:   b.material.description,
            materialType:  b.material.materialType,
            huUnit:        b.material.huUnit,
            batchNumber:   b.batchNumber,
            quantity:      b.quantity,
            receivedNos:   cf.nos     ?? cf.receivedQtyInNos     ?? null,
            pallets:       cf.pallets ?? cf.receivedQtyInPallets ?? null,
            stockStatus:   b.stockStatus,
            receiptDate:   b.receiptDate,
          };
        }),
      };
    }));

    res.json({
      warehouseCode: session.warehouseCode,
      warehouseName: session.warehouseName,
      weekStart:     session.weekStart,
      dayNumber:     session.dayNumber,
      scheduledDate: session.scheduledDate,
      bins:          enriched,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /session/:id/check-bin — toggle a bin's check status ─────────────────
router.put('/session/:id/check-bin', requireRole('ADMIN', 'WORKER'), async (req, res) => {
  try {
    const { binId, status, remarks, checkedBy } = req.body;
    // status: 'OK' | 'DISCREPANCY' | 'UNCHECKED'

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT s.*, t."warehouseId" FROM "DailyCycleSession" s
       JOIN "WeeklyCycleTask" t ON s."taskId" = t.id WHERE s.id = $1`, req.params.id
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
    if (!(await assertWarehouseScope(req, res, rows[0].warehouseId))) return;
    const session = rows[0];

    let checked: any[] = JSON.parse(session.checkedBins || '[]');

    if (status === 'UNCHECKED') {
      checked = checked.filter((b: any) => b.id !== binId);
    } else {
      const entry = { id: binId, status, remarks: remarks || '', checkedAt: new Date().toISOString(), checkedBy: checkedBy || '' };
      const idx   = checked.findIndex((b: any) => b.id === binId);
      if (idx >= 0) checked[idx] = entry; else checked.push(entry);
    }

    const totalBins = JSON.parse(session.binIds || '[]').length;
    const done      = checked.length;
    let newStatus   = session.status;
    if (done === 0) newStatus = session.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING';
    else if (done < totalBins) newStatus = session.status === 'OVERDUE' ? 'OVERDUE' : 'IN_PROGRESS';

    await prisma.$executeRawUnsafe(
      `UPDATE "DailyCycleSession" SET "checkedBins" = $1, status = $2 WHERE id = $3`,
      JSON.stringify(checked), newStatus, req.params.id
    );

    res.json({ success: true, checkedCount: done, totalBins });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /session/:id/complete ────────────────────────────────────────────────
router.post('/session/:id/complete', requireRole('ADMIN', 'WORKER'), async (req, res) => {
  try {
    const { completedBy } = req.body;

    // Same cross-tenant check as the other session routes — resolve this session's
    // warehouse before allowing the write, not just its role.
    const scopeRow = await prisma.$queryRawUnsafe<any[]>(
      `SELECT t."warehouseId" FROM "DailyCycleSession" s
       JOIN "WeeklyCycleTask" t ON s."taskId" = t.id WHERE s.id = $1`, req.params.id
    );
    if (!scopeRow.length) return res.status(404).json({ error: 'Session not found' });
    if (!(await assertWarehouseScope(req, res, scopeRow[0].warehouseId))) return;

    // Mark this session completed
    await prisma.$executeRawUnsafe(
      `UPDATE "DailyCycleSession" SET status = 'COMPLETED', "completedAt" = now()::text, "completedBy" = $1 WHERE id = $2`,
      completedBy || 'admin', req.params.id
    );

    // Check if ALL sessions in the parent task are now completed
    const sessionRow = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "taskId" FROM "DailyCycleSession" WHERE id = $1`, req.params.id
    );
    if (sessionRow.length) {
      const { taskId } = sessionRow[0];
      const [total, done] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as c FROM "DailyCycleSession" WHERE "taskId" = $1`, taskId),
        prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as c FROM "DailyCycleSession" WHERE "taskId" = $1 AND status = 'COMPLETED'`, taskId),
      ]);
      const totalCount = Number(total[0]?.c ?? 0);
      const doneCount  = Number(done[0]?.c ?? 0);

      // All 6 sessions done → mark the weekly task as COMPLETED
      if (totalCount > 0 && doneCount >= totalCount) {
        await prisma.$executeRawUnsafe(
          `UPDATE "WeeklyCycleTask" SET status = 'COMPLETED', "completedAt" = now()::text WHERE id = $1`,
          taskId
        );
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /records — completed weekly cycle count summaries (for Reports tab) ───
router.get('/records', async (req, res) => {
  try {
    const { from, to, warehouseCode, warehouseCodes } = req.query;

    let where = `WHERE t.status = 'COMPLETED'`;
    const params: any[] = [];
    if (from) { params.push(String(from)); where += ` AND t."weekStart" >= $${params.length}`; }
    if (to)   { params.push(String(to));   where += ` AND t."weekStart" <= $${params.length}`; }
    let codeList = warehouseCodes
      ? String(warehouseCodes).split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      : (warehouseCode ? [String(warehouseCode).trim().toUpperCase()] : []);
    codeList = resolveScopedCodes(req, codeList);
    if (codeList.length) {
      const whs = await prisma.warehouse.findMany({ where: { code: { in: codeList } }, select: { id: true } });
      const ids = whs.map(w => w.id);
      if (ids.length) {
        const placeholders = ids.map((_, i) => `$${params.length + i + 1}`).join(',');
        where += ` AND t."warehouseId" IN (${placeholders})`;
        params.push(...ids);
      } else { where += ` AND 1 = 0`; }
    }

    const tasks = await prisma.$queryRawUnsafe<any[]>(
      `SELECT t.id, t."warehouseId", t."weekStart", t."totalBins", t."binsPerDay", t.status, t."completedAt", t."createdAt",
              w.code as "warehouseCode", w.name as "warehouseName"
       FROM "WeeklyCycleTask" t
       JOIN "Warehouse" w ON t."warehouseId" = w.id
       ${where}
       ORDER BY t."completedAt" DESC`,
      ...params
    );

    // For each task, compute summary stats from all its sessions
    const records = await Promise.all(tasks.map(async (task) => {
      const sessions = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "scheduledDate", status, "checkedBins", "binIds" FROM "DailyCycleSession" WHERE "taskId" = $1 ORDER BY "dayNumber"`,
        task.id
      );

      let totalOK = 0, totalDisc = 0, totalUnchecked = 0, totalBins = 0;
      const sessionSummaries: any[] = [];

      for (const s of sessions) {
        const binIds:      any[] = JSON.parse(s.binIds      || '[]');
        const checkedBins: any[] = JSON.parse(s.checkedBins || '[]');
        const ok   = checkedBins.filter((b: any) => b.status === 'OK').length;
        const disc = checkedBins.filter((b: any) => b.status === 'DISCREPANCY').length;
        const unch = binIds.length - checkedBins.filter((b: any) => b.status !== 'UNCHECKED').length;

        totalOK         += ok;
        totalDisc       += disc;
        totalUnchecked  += Math.max(0, unch);
        totalBins       += binIds.length;

        sessionSummaries.push({
          date:    s.scheduledDate,
          status:  s.status,
          total:   binIds.length,
          ok, disc,
          unchecked: Math.max(0, unch),
        });
      }

      // Week end = weekStart + 5 days (Mon–Sat)
      const wkStart = new Date(task.weekStart + 'T00:00:00');
      const wkEnd   = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 5);
      const wkEndStr = dateStr(wkEnd);

      return {
        id:              task.id,
        weekStart:       task.weekStart,
        weekEnd:         wkEndStr,
        warehouseCode:   task.warehouseCode,
        warehouseName:   task.warehouseName,
        totalBins:       totalBins || task.totalBins,
        okCount:         totalOK,
        discrepancyCount: totalDisc,
        uncheckedCount:  totalUnchecked,
        completedAt:     task.completedAt,
        status:          task.status,
        sessionSummaries,
      };
    }));

    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /pending — all overdue/in-progress sessions (all weeks) ───────────────
router.get('/pending', async (req, res) => {
  try {
    await markOverdue();
    const today = dateStr(new Date());
    // Was returning every warehouse's pending sessions to every authenticated caller —
    // same cross-tenant gap as the routes above. Scope to the caller's own warehouses.
    const allowedCodes = resolveScopedCodes(req, []);
    let warehouseFilter = '';
    const params: any[] = [today];
    if (allowedCodes.length) {
      const whs = await prisma.warehouse.findMany({ where: { code: { in: allowedCodes } }, select: { id: true } });
      if (!whs.length) return res.json({ sessions: [] });
      const ids = whs.map(w => w.id);
      warehouseFilter = ` AND t."warehouseId" IN (${ids.map((_, i) => `$${i + 2}`).join(',')})`;
      params.push(...ids);
    }
    const rows  = await prisma.$queryRawUnsafe<any[]>(
      `SELECT s.*, t."weekStart", t."warehouseId" FROM "DailyCycleSession" s
       JOIN "WeeklyCycleTask" t ON s."taskId" = t.id
       WHERE s.status IN ('PENDING','OVERDUE','IN_PROGRESS') AND s."scheduledDate" <= $1${warehouseFilter}
       ORDER BY s."scheduledDate" ASC`,
      ...params
    );
    res.json({ sessions: await parseSessions(rows) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /discrepancy-report — bins flagged DISCREPANCY during cycle count ─────
// Used by the Reports page "Cycle Count Discrepancy" tab
router.get('/discrepancy-report', async (req, res) => {
  try {
    const { from, to, warehouseCode } = req.query;

    // Join all sessions with their parent task + warehouse. Same cross-tenant gap as the
    // other routes in this file: a supplied warehouseCode was used as-is with no check
    // that the caller is actually allowed to see it, and omitting it entirely returned
    // every warehouse's discrepancies to any authenticated account.
    const requestedCodes = warehouseCode ? [String(warehouseCode).toUpperCase()] : [];
    const scopedCodes = resolveScopedCodes(req, requestedCodes);
    const sessionParams: any[] = scopedCodes;
    const whereClause = scopedCodes.length
      ? `WHERE w.code IN (${scopedCodes.map((_, i) => `$${i + 1}`).join(',')})`
      : '';
    const sessions = await prisma.$queryRawUnsafe<any[]>(
      `SELECT s.id as "sessionId", s."scheduledDate", s."completedAt", s."completedBy",
              s."binIds", s."checkedBins",
              t."weekStart", t."warehouseId",
              w.code as "warehouseCode", w.name as "warehouseName"
       FROM "DailyCycleSession" s
       JOIN "WeeklyCycleTask" t ON s."taskId" = t.id
       JOIN "Warehouse" w ON t."warehouseId" = w.id
       ${whereClause}
       ORDER BY s."scheduledDate" DESC`,
      ...sessionParams
    );

    const result: any[] = [];

    for (const session of sessions) {
      const binIds: any[]      = JSON.parse(session.binIds      || '[]');
      const checkedBins: any[] = JSON.parse(session.checkedBins || '[]');

      // Apply date filter (already in SQL) and find DISCREPANCY entries
      const discrepant = checkedBins.filter((c: any) => c.status === 'DISCREPANCY');
      if (!discrepant.length) continue;

      // Apply date filter
      if (from && session.scheduledDate < String(from)) continue;
      if (to   && session.scheduledDate > String(to))   continue;

      for (const entry of discrepant) {
        const binInfo = binIds.find((b: any) => b.id === entry.id) || {};
        result.push({
          id:            `${session.sessionId}_${entry.id}`,
          sessionId:     session.sessionId,
          weekStart:     session.weekStart,
          scheduledDate: session.scheduledDate,
          completedAt:   session.completedAt,
          completedBy:   session.completedBy || '—',
          warehouseCode: session.warehouseCode,
          warehouseName: session.warehouseName,
          binId:         entry.id,
          binCode:       binInfo.code || entry.id,
          locationType:  binInfo.type  || 'BIN',
          zone:          binInfo.rackCode || '—',
          checkedAt:     entry.checkedAt,
          checkedBy:     entry.checkedBy || '—',
          remarks:       entry.remarks   || '',
        });
      }
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /stats — for dashboard pending count ─────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    await markOverdue();
    const today = dateStr(new Date());
    // Scope the count to the caller's own warehouses, same as /pending above — a
    // WORKER/CUSTOMER shouldn't see other warehouses' operational load, even as a
    // bare number.
    const allowedCodes = resolveScopedCodes(req, []);
    const params: any[] = [today];
    let joinFilter = '';
    if (allowedCodes.length) {
      const whs = await prisma.warehouse.findMany({ where: { code: { in: allowedCodes } }, select: { id: true } });
      if (!whs.length) return res.json({ pendingCount: 0 });
      const ids = whs.map(w => w.id);
      joinFilter = ` JOIN "WeeklyCycleTask" t ON s."taskId" = t.id AND t."warehouseId" IN (${ids.map((_, i) => `$${i + 2}`).join(',')})`;
      params.push(...ids);
    }
    const rows  = await prisma.$queryRawUnsafe<[{count: any}]>(
      `SELECT COUNT(*) as count FROM "DailyCycleSession" s${joinFilter}
       WHERE s.status IN ('PENDING','OVERDUE','IN_PROGRESS') AND s."scheduledDate" <= $1`,
      ...params
    );
    res.json({ pendingCount: Number(rows[0]?.count ?? 0) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
