import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const inventory = await prisma.inventoryBatch.findMany({
      include: {
        material: true,
        warehouse: true,
        rack: true,
        bin: true,
        floorLocation: true,
      },
    });

    const pendingCounts = await prisma.cycleCount.findMany({
      where: { status: "PENDING" },
    });

    // Map system quantities into the UI format expected by CycleCount
    const rows = inventory.map(item => {
      let cf: any = {};
      try { cf = JSON.parse(item.customFields || '{}'); } catch {}
      return {
        id: item.id,
        materialCode: item.material.code,
        description: item.material.description,
        batchNumber: item.batchNumber,
        category: cf.category || item.material.category || item.material.materialType || "RM",
        huUnit: cf.huUnit || item.material.huUnit || "Nos",
        stockLocation: cf.stockLocation || '',
        binLocation: cf.binLocation || '',
        systemQty: item.quantity,
        location: item.bin?.code || item.floorLocation?.code || item.warehouse.name,
        physicalQty: null, // User fills this in
        variance: null,
        status: "PENDING",
      };
    });

    res.json({
      rows,
      stats: {
        totalItems: rows.length,
        pendingCounts: pendingCounts.length,
        variances: 0,
      }
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/submit', async (req, res) => {
  try {
    const { counts } = req.body;
    // process cycle counts here
    for (const count of counts) {
      await prisma.cycleCount.create({
        data: {
          countId: `CC-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          frequency: "ADHOC",
          materialCode: count.materialCode,
          batchNumber: count.batchNumber,
          warehouseCode: "WH-AUTO",
          locationCode: count.location,
          systemQty: count.systemQty,
          physicalQty: count.physicalQty,
          varianceQty: count.variance,
          status: count.variance === 0 ? "MATCH" : count.variance > 0 ? "OVERAGE" : "SHORTAGE"
        }
      });
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET saved cycle count records (for Reports page)
router.get('/records', async (req, res) => {
  try {
    const { from, to } = req.query;
    const where: any = {};
    if (from || to) {
      where.countDate = {};
      if (from) where.countDate.gte = new Date(String(from));
      if (to) { const d = new Date(String(to)); d.setHours(23,59,59,999); where.countDate.lte = d; }
    }
    const records = await prisma.cycleCount.findMany({
      where,
      orderBy: { countDate: 'desc' },
    });
    // Enrich with materialType from Material master
    const materials = await prisma.material.findMany({ select: { code: true, materialType: true } });
    const typeMap: Record<string, string> = Object.fromEntries(materials.map(m => [m.code, m.materialType]));
    const enriched = records.map(r => ({ ...r, materialType: typeMap[r.materialCode] || '' }));
    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.cycleCount.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
