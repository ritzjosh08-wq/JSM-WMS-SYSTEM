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

// PATCH /:id — update any combination of fields + optional material code/description
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, stockStatus, warehouseId, customFields, materialCode, materialDescription } = req.body;

    const updateData: any = { lastMovementDate: new Date() };
    if (quantity    !== undefined) updateData.quantity    = parseFloat(quantity);
    if (stockStatus !== undefined) updateData.stockStatus = stockStatus;
    if (warehouseId !== undefined) updateData.warehouseId = warehouseId;
    if (customFields !== undefined) {
      updateData.customFields = typeof customFields === 'string'
        ? customFields
        : JSON.stringify(customFields);
    }

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
