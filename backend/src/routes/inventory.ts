import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    // ── Optional worker filter: ?warehouseCode=CM35 ──────────────────────────
    const warehouseCode = (req.query.warehouseCode as string | undefined)?.trim().toUpperCase();
    let warehouseIdFilter: string | undefined;
    if (warehouseCode) {
      const wh = await prisma.warehouse.findFirst({ where: { code: warehouseCode } });
      warehouseIdFilter = wh?.id;
    }

    const inventory = await prisma.inventoryBatch.findMany({
      where: warehouseIdFilter ? { warehouseId: warehouseIdFilter } : undefined,
      include: {
        material: true,
        warehouse: true,
        rack: true,
        bin: true,
        floorLocation: true,
      },
      orderBy: { receiptDate: 'asc' }
    });

    const warehouses = await prisma.warehouse.findMany({ where: { isActive: true } });

    // ── Enrich numberOfBoxes from InwardLineItem for batches that lack it ──
    // (handles records committed before the field was added to invCustomFields)
    const batchNumbers = [...new Set(inventory.map(b => b.batchNumber).filter(Boolean))];
    const matCodes     = [...new Set(inventory.map(b => b.material?.code).filter(Boolean))];

    const inwardLines = batchNumbers.length > 0
      ? await prisma.inwardLineItem.findMany({
          where: { batchNumber: { in: batchNumbers }, materialCode: { in: matCodes } },
          select: { materialCode: true, batchNumber: true, customFields: true },
        })
      : [];

    // "materialCode::batchNumber" → numberOfBoxes
    const boxLookup = new Map<string, number>();
    for (const line of inwardLines) {
      let lcf: any = {};
      try { lcf = JSON.parse(line.customFields || '{}'); } catch {}
      if (lcf.numberOfBoxes) {
        boxLookup.set(`${line.materialCode}::${line.batchNumber}`, Number(lcf.numberOfBoxes));
      }
    }

    // Merge into inventory response (in-memory only, no DB write needed)
    const enriched = inventory.map(batch => {
      let cf: any = {};
      try { cf = JSON.parse(batch.customFields || '{}'); } catch {}
      if (!cf.numberOfBoxes) {
        const boxes = boxLookup.get(`${batch.material?.code}::${batch.batchNumber}`);
        if (boxes) {
          return { ...batch, customFields: JSON.stringify({ ...cf, numberOfBoxes: boxes }) };
        }
      }
      return batch;
    });

    res.json({ inventory: enriched, warehouses });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/adjust', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    if (quantity === undefined || quantity === null) return res.status(400).json({ error: "quantity required" });
    const updated = await prisma.inventoryBatch.update({
      where: { id },
      data: { quantity: parseFloat(quantity), lastMovementDate: new Date() },
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /:id — update fields, resolve binLocation → floorLocationId, track location history
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, stockStatus, warehouseId, customFields, materialCode, materialDescription, binLocation, stockLocation } = req.body;

    // Read current record to build history
    const current = await prisma.inventoryBatch.findUnique({
      where: { id },
      include: { floorLocation: true, bin: true, warehouse: true },
    });

    const updateData: any = { lastMovementDate: new Date() };
    if (quantity    !== undefined) updateData.quantity    = parseFloat(quantity);
    if (stockStatus !== undefined) updateData.stockStatus = stockStatus;
    if (warehouseId !== undefined) updateData.warehouseId = warehouseId;

    // Parse incoming customFields (object or JSON string)
    let newCf: any = {};
    if (customFields !== undefined) {
      newCf = typeof customFields === 'string' ? JSON.parse(customFields || '{}') : customFields;
    } else if (current?.customFields) {
      try { newCf = JSON.parse(current.customFields); } catch {}
    }

    // ── Resolve binLocation → floorLocationId (warehouse-scoped) ─────────
    if (binLocation !== undefined) {
      const binCode = (binLocation || '').trim();
      const stockLocCode = ((stockLocation ?? newCf.stockLocation) || '').trim().toUpperCase();

      const oldBinCode  = current?.floorLocation?.code || current?.bin?.code || newCf.binLocation || '';
      const oldWhCode   = current?.warehouse?.code || '';

      if (binCode) {
        // Find target warehouse
        let targetWarehouseId: string | undefined;
        if (stockLocCode) {
          const wh = await prisma.warehouse.findFirst({ where: { code: stockLocCode } });
          if (wh) targetWarehouseId = wh.id;
        }

        const floorLoc = await prisma.floorLocation.findFirst({
          where: { code: binCode, isActive: true, ...(targetWarehouseId ? { warehouseId: targetWarehouseId } : {}) },
          include: { warehouse: { select: { id: true, code: true } } },
        });

        if (floorLoc) {
          updateData.floorLocationId = floorLoc.id;
          updateData.warehouseId     = floorLoc.warehouseId;
          updateData.binId           = null; // clear rack bin if now on floor
        }
      } else {
        // Blank bin = clear location
        updateData.floorLocationId = null;
      }

      // Track location history
      const history: any[] = Array.isArray(newCf.locationHistory) ? newCf.locationHistory : [];
      const toWhCode = stockLocCode || oldWhCode;
      if (binCode !== oldBinCode) {
        history.push({
          from:       oldBinCode  || '—',
          to:         binCode     || '—',
          fromWh:     oldWhCode   || '—',
          toWh:       toWhCode    || '—',
          movedAt:    new Date().toISOString(),
        });
      }
      newCf.locationHistory = history;
      newCf.binLocation     = binCode;
      if (stockLocation !== undefined) newCf.stockLocation = stockLocation;
    }

    updateData.customFields = JSON.stringify(newCf);

    const updated = await prisma.inventoryBatch.update({
      where: { id },
      data: updateData,
      include: { material: true, warehouse: true },
    });

    // Update material code / description if provided
    if ((materialCode !== undefined || materialDescription !== undefined) && updated.materialId) {
      const matData: any = {};
      if (materialCode        !== undefined) matData.code        = materialCode;
      if (materialDescription !== undefined) matData.description = materialDescription;
      await prisma.material.update({ where: { id: updated.materialId }, data: matData });
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE /reset-all must come BEFORE /:id so Express doesn't treat "reset-all" as an ID
router.delete('/reset-all', async (req, res) => {
  try {
    // Delete in dependency order (children before parents)
    await prisma.inwardLineItem.deleteMany({});
    await prisma.inwardEntry.deleteMany({});
    await prisma.outwardLineItem.deleteMany({});
    await prisma.outwardEntry.deleteMany({});
    await prisma.inventoryBatch.deleteMany({});
    await prisma.material.deleteMany({});
    await prisma.cycleCount.deleteMany({});
    await prisma.damageRecord.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.truckMovement.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.reportExport.deleteMany({});
    await prisma.uploadedDocument.deleteMany({});
    res.json({ success: true, message: 'All data cleared successfully.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.inventoryBatch.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/relocate', async (req, res) => {
  try {
    const { id } = req.params;
    const { warehouseId, rackId, binId, floorLocationId } = req.body;

    const updated = await prisma.inventoryBatch.update({
      where: { id },
      data: {
        warehouseId: warehouseId || undefined,
        rackId: rackId || null,
        binId: binId || null,
        floorLocationId: floorLocationId || null,
      }
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
