import express from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const prisma = new PrismaClient();

// ── Load worker users from auth files ────────────────────────────────────────
function getWorkerUsers() {
  const USERS_FILE = path.join(__dirname, '../../dynamic-users.json');
  const BASE: any[] = [
    { username: 'chennaippd', name: 'Chennai Worker PPD', role: 'WORKER', location: 'Chennai PPD', warehouseCode: 'CM35' },
  ];
  let dynamic: any[] = [];
  try { if (fs.existsSync(USERS_FILE)) dynamic = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); } catch {}
  return [...BASE, ...dynamic]
    .filter((u: any) => u.role === 'WORKER')
    .map((u: any) => ({ username: u.username, name: u.name, location: u.location, warehouseCode: (u.warehouseCode || null) as string | null }));
}

// ── Core stats for one warehouse (warehouseId undefined = all) ────────────────
async function getStatsForWarehouse(warehouseId?: string, warehouseCode?: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inventoryWhere: any = warehouseId ? { warehouseId } : {};
  const inwardWhere:  any  = warehouseId ? { lineItems: { some: { warehouseId } } } : {};
  const outwardWhere: any  = warehouseId ? { lineItems: { some: { warehouseId } } } : {};

  const [allBatches, todaysInward, todaysOutward, recentInwards] = await Promise.all([
    prisma.inventoryBatch.findMany({
      where: inventoryWhere,
      select: { quantity: true, customFields: true, stockStatus: true },
    }),
    prisma.inwardEntry.count({ where: { ...inwardWhere, createdAt: { gte: today } } }),
    prisma.outwardEntry.count({ where: { ...outwardWhere, createdAt: { gte: today } } }),
    prisma.inwardEntry.findMany({ where: inwardWhere, take: 6, orderBy: { createdAt: 'desc' } }),
  ]);

  let rmPallets = 0, fgPallets = 0, discCount = 0;
  const locMap: Record<string, number> = {};
  const rmType: Record<string, number> = {};
  const discCat: Record<string, number> = {};

  for (const b of allBatches) {
    if (b.quantity <= 0) continue;
    let cf: any = {};
    try { cf = JSON.parse(b.customFields || '{}'); } catch {}
    const cat     = (cf.category || '').toUpperCase();
    const pallets = parseFloat(cf.pallets) || 0;
    const mtype   = (cf.materialType || 'Other').trim() || 'Other';
    const loc     = (cf.stockLocation || '').trim();
    const isDisc  = (b as any).stockStatus === 'DISCREPANCY'
      || Number(cf.shortInPallet   || 0) !== 0
      || Number(cf.shortExcessInKg  || 0) !== 0
      || Number(cf.shortExcessInQty || 0) !== 0
      || !!cf.discrepancyRemarks || !!cf.discrepancy;
    if (isDisc) {
      discCount++;
      const cl = cat.includes('FG') ? 'FG' : 'RM';
      discCat[cl] = (discCat[cl] || 0) + 1;
    }
    if (cat.includes('FG')) {
      fgPallets += pallets;
    } else {
      rmPallets += pallets;
      if (pallets > 0) rmType[mtype] = (rmType[mtype] || 0) + pallets;
    }
    if (loc) locMap[loc] = (locMap[loc] || 0) + pallets;
  }

  // Bin/floor occupancy for this warehouse
  let binStats: any = null;
  if (warehouseId && warehouseCode) {
    const [floorTotal, floorOccupied, rackTotal, rackOccupied] = await Promise.all([
      prisma.floorLocation.count({ where: { warehouseId, isActive: true } }),
      prisma.floorLocation.count({ where: { warehouseId, isActive: true, inventory: { some: {} } } }),
      prisma.bin.count({ where: { rack: { warehouseId }, isActive: true } }),
      prisma.bin.count({ where: { rack: { warehouseId }, isActive: true, inventory: { some: {} } } }),
    ]);
    binStats = {
      [warehouseCode]: {
        floorTotal, floorEmpty: floorTotal - floorOccupied,
        rackTotal,  rackEmpty:  rackTotal  - rackOccupied,
      },
    };
  }

  const stockLocations = Object.entries(locMap)
    .map(([name, p]) => ({ name, pallets: Math.round(p) }))
    .filter(l => l.pallets > 0)
    .sort((a, b) => b.pallets - a.pallets);

  const rmByType = Object.entries(rmType)
    .map(([type, p]) => ({ type, pallets: Math.round(p) }))
    .filter(t => t.pallets > 0)
    .sort((a, b) => b.pallets - a.pallets);

  const discrepancyByCategory = Object.entries(discCat)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return {
    todaysInward, todaysOutward, recentInwards,
    inventoryRM: Math.round(rmPallets), inventoryFG: Math.round(fgPallets),
    inventoryRMPallets: Math.round(rmPallets), inventoryFGPallets: Math.round(fgPallets),
    totalPallets: stockLocations.reduce((s, l) => s + l.pallets, 0),
    discrepancyCount: discCount, discrepancyByCategory,
    stockLocations, rmByType, binStats,
  };
}

// ── GET / — main dashboard (optional ?warehouseCode=X filter) ─────────────────
router.get('/', async (req, res) => {
  try {
    const wc = (req.query.warehouseCode as string | undefined)?.trim().toUpperCase();
    let warehouseId: string | undefined;
    if (wc) {
      const wh = await prisma.warehouse.findFirst({ where: { code: wc } });
      warehouseId = wh?.id;
    }

    // Pending cycle-count sessions (v2); fall back to legacy model if tables not ready
    let pendingCycleCounts = 0;
    try {
      const _n = new Date();
      const today = `${_n.getFullYear()}-${String(_n.getMonth()+1).padStart(2,'0')}-${String(_n.getDate()).padStart(2,'0')}`;
      const ccRows  = await prisma.$queryRawUnsafe<[{count: any}]>(
        `SELECT COUNT(*) as count FROM DailyCycleSession s
         JOIN WeeklyCycleTask t ON s.taskId = t.id
         WHERE s.status IN ('PENDING','OVERDUE','IN_PROGRESS')
           AND s.scheduledDate <= ?
           AND t.status = 'ACTIVE'`,
        today
      );
      pendingCycleCounts = Number(ccRows[0]?.count ?? 0);
    } catch {
      pendingCycleCounts = await prisma.cycleCount.count({ where: { status: 'PENDING' } }).catch(() => 0);
    }
    const stats = await getStatsForWarehouse(warehouseId, wc);

    // Full binStats when no filter (legacy shape for Dashboard.tsx)
    let binStats = stats.binStats;
    if (!wc) {
      const [cm35Wh, fg05Wh] = await Promise.all([
        prisma.warehouse.findFirst({ where: { code: 'CM35' } }),
        prisma.warehouse.findFirst({ where: { code: 'FG05' } }),
      ]);
      const [cft, cfo, crt, cro, fft, ffo] = await Promise.all([
        cm35Wh ? prisma.floorLocation.count({ where: { warehouseId: cm35Wh.id, isActive: true } }) : Promise.resolve(0),
        cm35Wh ? prisma.floorLocation.count({ where: { warehouseId: cm35Wh.id, isActive: true, inventory: { some: {} } } }) : Promise.resolve(0),
        cm35Wh ? prisma.bin.count({ where: { rack: { warehouseId: cm35Wh.id }, isActive: true } }) : Promise.resolve(0),
        cm35Wh ? prisma.bin.count({ where: { rack: { warehouseId: cm35Wh.id }, isActive: true, inventory: { some: {} } } }) : Promise.resolve(0),
        fg05Wh ? prisma.floorLocation.count({ where: { warehouseId: fg05Wh.id, isActive: true } }) : Promise.resolve(0),
        fg05Wh ? prisma.floorLocation.count({ where: { warehouseId: fg05Wh.id, isActive: true, inventory: { some: {} } } }) : Promise.resolve(0),
      ]);
      binStats = {
        cm35: { floorTotal: cft, floorEmpty: cft - cfo, rackTotal: crt, rackEmpty: crt - cro },
        fg05: { floorTotal: fft, floorEmpty: fft - ffo },
      };
    }

    res.json({ ...stats, pendingCycleCounts, binStats });
  } catch (error: any) {
    console.error('[Dashboard]', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /all-workers — per-worker summary cards for Admin overview ─────────────
router.get('/all-workers', async (_req, res) => {
  try {
    const workers = getWorkerUsers();
    const results = await Promise.all(
      workers.map(async (w) => {
        if (!w.warehouseCode) return { ...w, warehouseId: null, warehouseName: null, stats: null };
        const wh = await prisma.warehouse.findFirst({ where: { code: w.warehouseCode } });
        if (!wh) return { ...w, warehouseId: null, warehouseName: wh, stats: null };
        const stats = await getStatsForWarehouse(wh.id, w.warehouseCode);
        return { ...w, warehouseId: wh.id, warehouseName: wh.name, stats };
      })
    );
    res.json({ workers: results });
  } catch (error: any) {
    console.error('[Dashboard/all-workers]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
