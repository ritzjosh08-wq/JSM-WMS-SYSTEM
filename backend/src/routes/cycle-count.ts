import express from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const router = express.Router();
const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────────
const newId = () => crypto.randomUUID();

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
      `UPDATE DailyCycleSession SET status = 'OVERDUE'
       WHERE status IN ('PENDING','IN_PROGRESS') AND scheduledDate < ?`,
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
router.get('/warehouses', async (_req, res) => {
  try {
    const whs = await prisma.warehouse.findMany({
      where: { isActive: true, NOT: { code: 'WH-DEFAULT' } },
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

    await markOverdue();

    const monday    = getMondayOfWeek();
    const mondayStr = dateStr(monday);

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM WeeklyCycleTask WHERE warehouseId = ? AND weekStart = ? LIMIT 1`,
      warehouseId, mondayStr
    );
    if (!rows.length) return res.json({ plan: null, sessions: [] });

    const plan     = rows[0];
    const sessions = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM DailyCycleSession WHERE taskId = ? ORDER BY dayNumber`,
      plan.id
    );
    return res.json({ plan, sessions: await parseSessions(sessions) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /plan/current?warehouseId=X — wipe ALL active plans for a warehouse
// Clears current week AND any leftover plans from previous weeks for the same warehouse
router.delete('/plan/current', async (req, res) => {
  try {
    const warehouseId = String(req.query.warehouseId || '');
    if (!warehouseId) return res.status(400).json({ error: 'warehouseId required' });

    // Get ALL active (non-completed) tasks for this warehouse, not just current week
    const tasks = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, weekStart FROM WeeklyCycleTask WHERE warehouseId = ? AND status = 'ACTIVE'`,
      warehouseId
    );

    for (const task of tasks) {
      await prisma.$executeRawUnsafe(`DELETE FROM DailyCycleSession WHERE taskId = ?`, task.id);
    }
    await prisma.$executeRawUnsafe(
      `DELETE FROM WeeklyCycleTask WHERE warehouseId = ? AND status = 'ACTIVE'`,
      warehouseId
    );

    res.json({ success: true, deletedTasks: tasks.length, weeks: tasks.map(t => t.weekStart) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /plan/generate — create this week's plan ────────────────────────────
router.post('/plan/generate', async (req, res) => {
  try {
    const { warehouseId } = req.body;
    if (!warehouseId) return res.status(400).json({ error: 'warehouseId required' });

    const monday    = getMondayOfWeek();
    const mondayStr = dateStr(monday);
    const today     = dateStr(new Date());

    // Check existing plan
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM WeeklyCycleTask WHERE warehouseId = ? AND weekStart = ? LIMIT 1`,
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
      `INSERT INTO WeeklyCycleTask (id, warehouseId, weekStart, totalBins, binsPerDay, status, createdAt)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', datetime('now'))`,
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
        `INSERT INTO DailyCycleSession (id, taskId, dayNumber, scheduledDate, binIds, checkedBins, status)
         VALUES (?, ?, ?, ?, ?, '[]', ?)`,
        newId(), taskId, day, dayStr, binJson, status
      );
    }

    const plan     = (await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM WeeklyCycleTask WHERE id = ?`, taskId))[0];
    const sessions = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM DailyCycleSession WHERE taskId = ? ORDER BY dayNumber`, taskId
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
      `SELECT s.*, t.weekStart, t.warehouseId, t.totalBins, t.binsPerDay
       FROM DailyCycleSession s JOIN WeeklyCycleTask t ON s.taskId = t.id WHERE s.id = ?`,
      req.params.id
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
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
      `SELECT s.*, t.weekStart, t.warehouseId, t.totalBins, t.binsPerDay,
              w.code as warehouseCode, w.name as warehouseName
       FROM DailyCycleSession s
       JOIN WeeklyCycleTask t ON s.taskId = t.id
       JOIN Warehouse w ON t.warehouseId = w.id
       WHERE s.id = ?`,
      req.params.id
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });

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
router.put('/session/:id/check-bin', async (req, res) => {
  try {
    const { binId, status, remarks, checkedBy } = req.body;
    // status: 'OK' | 'DISCREPANCY' | 'UNCHECKED'

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM DailyCycleSession WHERE id = ?`, req.params.id
    );
    if (!rows.length) return res.status(404).json({ error: 'Session not found' });
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
      `UPDATE DailyCycleSession SET checkedBins = ?, status = ? WHERE id = ?`,
      JSON.stringify(checked), newStatus, req.params.id
    );

    res.json({ success: true, checkedCount: done, totalBins });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /session/:id/complete ────────────────────────────────────────────────
router.post('/session/:id/complete', async (req, res) => {
  try {
    const { completedBy } = req.body;

    // Mark this session completed
    await prisma.$executeRawUnsafe(
      `UPDATE DailyCycleSession SET status = 'COMPLETED', completedAt = datetime('now'), completedBy = ? WHERE id = ?`,
      completedBy || 'admin', req.params.id
    );

    // Check if ALL sessions in the parent task are now completed
    const sessionRow = await prisma.$queryRawUnsafe<any[]>(
      `SELECT taskId FROM DailyCycleSession WHERE id = ?`, req.params.id
    );
    if (sessionRow.length) {
      const { taskId } = sessionRow[0];
      const [total, done] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as c FROM DailyCycleSession WHERE taskId = ?`, taskId),
        prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as c FROM DailyCycleSession WHERE taskId = ? AND status = 'COMPLETED'`, taskId),
      ]);
      const totalCount = Number(total[0]?.c ?? 0);
      const doneCount  = Number(done[0]?.c ?? 0);

      // All 6 sessions done → mark the weekly task as COMPLETED
      if (totalCount > 0 && doneCount >= totalCount) {
        await prisma.$executeRawUnsafe(
          `UPDATE WeeklyCycleTask SET status = 'COMPLETED', completedAt = datetime('now') WHERE id = ?`,
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
    const { from, to, warehouseCode } = req.query;

    // Build WHERE clause — filter by weekStart date range and/or warehouse
    let where = `WHERE t.status = 'COMPLETED'`;
    const params: any[] = [];
    if (from) { where += ` AND t.weekStart >= ?`; params.push(String(from)); }
    if (to)   { where += ` AND t.weekStart <= ?`; params.push(String(to)); }
    if (warehouseCode) {
      const wh = await prisma.warehouse.findFirst({ where: { code: String(warehouseCode).toUpperCase() } });
      if (wh) { where += ` AND t.warehouseId = ?`; params.push(wh.id); }
    }

    const tasks = await prisma.$queryRawUnsafe<any[]>(
      `SELECT t.id, t.warehouseId, t.weekStart, t.totalBins, t.binsPerDay, t.status, t.completedAt, t.createdAt,
              w.code as warehouseCode, w.name as warehouseName
       FROM WeeklyCycleTask t
       JOIN Warehouse w ON t.warehouseId = w.id
       ${where}
       ORDER BY t.completedAt DESC`,
      ...params
    );

    // For each task, compute summary stats from all its sessions
    const records = await Promise.all(tasks.map(async (task) => {
      const sessions = await prisma.$queryRawUnsafe<any[]>(
        `SELECT scheduledDate, status, checkedBins, binIds FROM DailyCycleSession WHERE taskId = ? ORDER BY dayNumber`,
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
router.get('/pending', async (_req, res) => {
  try {
    await markOverdue();
    const today = dateStr(new Date());
    const rows  = await prisma.$queryRawUnsafe<any[]>(
      `SELECT s.*, t.weekStart, t.warehouseId FROM DailyCycleSession s
       JOIN WeeklyCycleTask t ON s.taskId = t.id
       WHERE s.status IN ('PENDING','OVERDUE','IN_PROGRESS') AND s.scheduledDate <= ?
       ORDER BY s.scheduledDate ASC`,
      today
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

    // Join all sessions with their parent task + warehouse
    const wcFilter = warehouseCode ? String(warehouseCode).toUpperCase() : null;
    const sessionParams: any[] = wcFilter ? [wcFilter] : [];
    const sessions = await prisma.$queryRawUnsafe<any[]>(
      `SELECT s.id as sessionId, s.scheduledDate, s.completedAt, s.completedBy,
              s.binIds, s.checkedBins,
              t.weekStart, t.warehouseId,
              w.code as warehouseCode, w.name as warehouseName
       FROM DailyCycleSession s
       JOIN WeeklyCycleTask t ON s.taskId = t.id
       JOIN Warehouse w ON t.warehouseId = w.id
       ${wcFilter ? 'WHERE w.code = ?' : ''}
       ORDER BY s.scheduledDate DESC`,
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
router.get('/stats', async (_req, res) => {
  try {
    await markOverdue();
    const today = dateStr(new Date());
    const rows  = await prisma.$queryRawUnsafe<[{count: any}]>(
      `SELECT COUNT(*) as count FROM DailyCycleSession
       WHERE status IN ('PENDING','OVERDUE','IN_PROGRESS') AND scheduledDate <= ?`,
      today
    );
    res.json({ pendingCount: Number(rows[0]?.count ?? 0) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
