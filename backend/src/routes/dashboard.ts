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
      allLineItems,
    ] = await Promise.all([
      prisma.inwardEntry.count({ where: { createdAt: { gte: today } } }),
      prisma.outwardEntry.count({ where: { createdAt: { gte: today } } }),
      prisma.cycleCount.count({ where: { status: 'PENDING' } }),
      prisma.inwardEntry.findMany({ take: 6, orderBy: { createdAt: 'desc' } }),
      prisma.inventoryBatch.findMany({ select: { quantity: true, customFields: true } }),
      prisma.inwardLineItem.findMany({ select: { customFields: true, lineItemStatus: true } }),
    ]);

    // Tally RM / FG pallet counts, stock-location pallets, RM type breakdown
    let inventoryRMPallets = 0;
    let inventoryFGPallets = 0;

    const locationMap: Record<string, number> = {};
    const rmByType: Record<string, number>    = {};

    for (const batch of allBatches) {
      if (batch.quantity <= 0) continue;

      let cf: any = {};
      try { cf = JSON.parse(batch.customFields || '{}'); } catch {}

      const cat     = (cf.category || '').toUpperCase();
      const pallets = parseFloat(cf.pallets) || 0;
      const matType = (cf.materialType || 'Other').trim() || 'Other';
      const loc     = (cf.stockLocation || '').trim();

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

    // Stock location list — pallets only, sorted descending
    const stockLocations = Object.entries(locationMap)
      .map(([name, pallets]) => ({ name, pallets: Math.round(pallets) }))
      .filter(l => l.pallets > 0)
      .sort((a, b) => b.pallets - a.pallets);

    const totalPallets = stockLocations.reduce((s, l) => s + l.pallets, 0);

    // RM type breakdown sorted descending by pallets
    const rmByTypeSorted = Object.entries(rmByType)
      .map(([type, pallets]) => ({ type, pallets: Math.round(pallets) }))
      .filter(t => t.pallets > 0)
      .sort((a, b) => b.pallets - a.pallets);

    // Discrepancy count from line items
    let discrepancyCount = 0;
    for (const item of allLineItems) {
      let cf: any = {};
      try { cf = JSON.parse(item.customFields || '{}'); } catch {}
      const hasShort = Number(cf.shortInPallet || 0) !== 0 || Number(cf.shortExcessInKg || 0) !== 0;
      const hasRemarks = !!cf.discrepancyRemarks;
      const isDiscrepancyStatus = (item as any).lineItemStatus === 'DISCREPANCY';
      if (hasShort || hasRemarks || isDiscrepancyStatus) discrepancyCount++;
    }

    res.json({
      todaysInward,
      todaysOutward,
      pendingCycleCounts,
      inventoryRM:        Math.round(inventoryRMPallets),
      inventoryFG:        Math.round(inventoryFGPallets),
      inventoryRMPallets: Math.round(inventoryRMPallets),
      inventoryFGPallets: Math.round(inventoryFGPallets),
      discrepancyCount,
      recentInwards,
      stockLocations,
      totalPallets,
      rmByType: rmByTypeSorted,
    });
  } catch (error: any) {
    console.error('[Dashboard]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
