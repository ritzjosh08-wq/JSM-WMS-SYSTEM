import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      todaysInward,
      todaysOutward,
      pendingCycleCounts,
      recentInwards,
      allBatches,
      cm35Wh,
      fg05Wh,
    ] = await Promise.all([
      prisma.inwardEntry.count({ where: { createdAt: { gte: today } } }),
      prisma.outwardEntry.count({ where: { createdAt: { gte: today } } }),
      prisma.cycleCount.count({ where: { status: 'PENDING' } }),
      prisma.inwardEntry.findMany({ take: 6, orderBy: { createdAt: 'desc' } }),
      prisma.inventoryBatch.findMany({ select: { quantity: true, customFields: true, stockStatus: true } }),
      prisma.warehouse.findFirst({ where: { code: 'CM35' } }),
      prisma.warehouse.findFirst({ where: { code: 'FG05' } }),
    ]);

    const [cm35FloorTotal, cm35FloorOccupied, cm35RackTotal, cm35RackOccupied, fg05FloorTotal, fg05FloorOccupied] =
      await Promise.all([
        cm35Wh ? prisma.floorLocation.count({ where: { warehouseId: cm35Wh.id, isActive: true } }) : Promise.resolve(0),
        cm35Wh ? prisma.floorLocation.count({ where: { warehouseId: cm35Wh.id, isActive: true, inventory: { some: {} } } }) : Promise.resolve(0),
        cm35Wh ? prisma.bin.count({ where: { rack: { warehouseId: cm35Wh.id }, isActive: true } }) : Promise.resolve(0),
        cm35Wh ? prisma.bin.count({ where: { rack: { warehouseId: cm35Wh.id }, isActive: true, inventory: { some: {} } } }) : Promise.resolve(0),
        fg05Wh ? prisma.floorLocation.count({ where: { warehouseId: fg05Wh.id, isActive: true } }) : Promise.resolve(0),
        fg05Wh ? prisma.floorLocation.count({ where: { warehouseId: fg05Wh.id, isActive: true, inventory: { some: {} } } }) : Promise.resolve(0),
      ]);

    let inventoryRMPallets = 0;
    let inventoryFGPallets = 0;
    let discrepancyCount   = 0;

    const locationMap: Record<string, number> = {};
    const rmByType:    Record<string, number> = {};
    const discByCat:   Record<string, number> = {};

    for (const batch of allBatches) {
      if (batch.quantity <= 0) continue;

      let cf: any = {};
      try { cf = JSON.parse(batch.customFields || '{}'); } catch {}

      const cat     = (cf.category || '').toUpperCase();
      const pallets = parseFloat(cf.pallets) || 0;
      const matType = (cf.materialType || 'Other').trim() || 'Other';
      const loc     = (cf.stockLocation || '').trim();

      const isDisc =
        (batch as any).stockStatus === 'DISCREPANCY' ||
        Number(cf.shortInPallet   || 0) !== 0 ||
        Number(cf.shortExcessInKg  || 0) !== 0 ||
        Number(cf.shortExcessInQty || 0) !== 0 ||
        !!cf.discrepancyRemarks ||
        !!cf.discrepancy;

      if (isDisc) {
        discrepancyCount++;
        const catLabel = cat.includes('FG') ? 'FG' : 'RM';
        discByCat[catLabel] = (discByCat[catLabel] || 0) + 1;
      }

      if (cat.includes('FG')) {
        inventoryFGPallets += pallets;
      } else {
        inventoryRMPallets += pallets;
        if (pallets > 0) {
          rmByType[matType] = (rmByType[matType] || 0) + pallets;
        }
      }

      if (loc) {
        locationMap[loc] = (locationMap[loc] || 0) + pallets;
      }
    }

    const stockLocations = Object.entries(locationMap)
      .map(([name, pallets]) => ({ name, pallets: Math.round(pallets) }))
      .filter(l => l.pallets > 0)
      .sort((a, b) => b.pallets - a.pallets);

    const totalPallets = stockLocations.reduce((s, l) => s + l.pallets, 0);

    const rmByTypeSorted = Object.entries(rmByType)
      .map(([type, pallets]) => ({ type, pallets: Math.round(pallets) }))
      .filter(t => t.pallets > 0)
      .sort((a, b) => b.pallets - a.pallets);

    const discrepancyByCategory = Object.entries(discByCat)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const cm35 = {
      floorTotal: cm35FloorTotal,
      floorEmpty: cm35FloorTotal - cm35FloorOccupied,
      rackTotal:  cm35RackTotal,
      rackEmpty:  cm35RackTotal - cm35RackOccupied,
    };
    const fg05 = {
      floorTotal: fg05FloorTotal,
      floorEmpty: fg05FloorTotal - fg05FloorOccupied,
    };

    res.json({
      todaysInward,
      todaysOutward,
      pendingCycleCounts,
      inventoryRM:        Math.round(inventoryRMPallets),
      inventoryFG:        Math.round(inventoryFGPallets),
      inventoryRMPallets: Math.round(inventoryRMPallets),
      inventoryFGPallets: Math.round(inventoryFGPallets),
      discrepancyCount,
      discrepancyByCategory,
      recentInwards,
      stockLocations,
      totalPallets,
      rmByType: rmByTypeSorted,
      binStats: { cm35, fg05 },
    });
  } catch (error: any) {
    console.error('[Dashboard]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
