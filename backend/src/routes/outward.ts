import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET all outward dispatches (for reports)
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    const where: any = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) { const d = new Date(String(to)); d.setHours(23,59,59,999); where.createdAt.lte = d; }
    }
    const entries = await prisma.outwardEntry.findMany({
      where,
      include: { lineItems: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/fifo', async (req, res) => {
  try {
    const { materialCode, requiredQty } = req.query;
    if (!materialCode || !requiredQty) return res.status(400).json({ error: "Missing parameters" });

    const material = await prisma.material.findUnique({ where: { code: String(materialCode) } });
    if (!material) return res.json({ recommendations: [] });

    const batches = await prisma.inventoryBatch.findMany({
      where: {
        materialId: material.id,
        quantity: { gt: 0 },
        stockStatus: "GOOD"
      },
      include: { warehouse: true, rack: true, floorLocation: true },
      orderBy: { receiptDate: 'asc' }
    });

    let remaining = Number(requiredQty);
    const recommendations = [];

    for (const batch of batches) {
      if (remaining <= 0) break;
      const pickQty = Math.min(batch.quantity, remaining);
      let cf: any = {};
      try { cf = JSON.parse(batch.customFields || '{}'); } catch {}
      recommendations.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        warehouse: batch.warehouse.name,
        warehouseId: batch.warehouse.id,
        stockLocation: cf.stockLocation || '',
        location: cf.binLocation || batch.rack?.code || batch.floorLocation?.code || "Unassigned",
        binLocation: cf.binLocation || '',
        available: batch.quantity,
        recommendedPick: pickQty,
        receiptDate: batch.receiptDate,
        materialType: cf.materialType || '',
        invoiceNo: cf.invoiceNo || batch.batchNumber,
      });
      remaining -= pickQty;
    }

    res.json({ recommendations, totalAvailable: batches.reduce((s, b) => s + b.quantity, 0) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /dispatch — supports multi-material dispatch in one call
// New format: { truckNumber, transporter, destination, sapDocumentNo, lrNumber, date,
//              lines: [{ materialCode, materialType, description, requiredQty,
//                        picks: [{ batchId, batchNumber, pickQty, warehouseId }] }] }
// Old single-material format still supported for backwards compat:
//   { materialCode, requiredQty, truckNumber, ..., picks: [...] }
router.post('/dispatch', async (req, res) => {
  try {
    const data = req.body;

    // Normalise to lines array
    const lines: any[] = data.lines || [{
      materialCode: data.materialCode,
      materialType: data.materialType || '',
      description: data.description || '',
      requiredQty: data.requiredQty,
      picks: data.picks || [],
    }];

    const outwardNumber = `OUT-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

    const allLineItems = lines.flatMap((line: any) =>
      (line.picks || []).map((pick: any) => ({
        materialCode: line.materialCode,
        batchNumber:  pick.batchNumber,
        requiredQty:  line.requiredQty,
        pickedQty:    pick.pickQty,
        warehouseId:  pick.warehouseId,
        // pack all extra fields into customFields — no schema change needed
        customFields: JSON.stringify({
          description:  line.description  || '',
          materialType: line.materialType || '',
          huUnit:       line.huUnit       || '',
          category:     line.category     || '',
          stockLocation: pick.stockLocation || '',
        }),
      }))
    );

    // pack lrNumber into remarks alongside source — no schema change needed
    const remarksParts: string[] = [];
    if (data.source)   remarksParts.push(`Source: ${data.source}`);
    if (data.lrNumber) remarksParts.push(`LR: ${data.lrNumber}`);

    const outward = await prisma.outwardEntry.create({
      data: {
        outwardNumber,
        truckNumber:   data.truckNumber,
        transporter:   data.transporter   || null,
        destination:   data.destination   || null,
        sapDocumentNo: data.sapDocumentNo || null,
        remarks:       remarksParts.length ? remarksParts.join(' | ') : null,
        dispatchDate:  data.date ? new Date(data.date) : new Date(),
        status: "DISPATCHED",
        lineItems: { create: allLineItems },
      }
    });

    // Reduce inventory for all picks across all lines
    for (const line of lines) {
      for (const pick of (line.picks || [])) {
        const batch = await prisma.inventoryBatch.findUnique({ where: { id: pick.batchId } });
        if (batch) {
          const newQty = Math.max(0, batch.quantity - pick.pickQty);
          await prisma.inventoryBatch.update({
            where: { id: batch.id },
            data: { quantity: newQty, lastMovementDate: new Date() },
          });

          // Update warehouse used capacity
          const wh = await prisma.warehouse.findUnique({ where: { id: batch.warehouseId } });
          if (wh) {
            await prisma.warehouse.update({
              where: { id: wh.id },
              data: { usedCapacity: Math.max(0, wh.usedCapacity - pick.pickQty) },
            });
          }
        }
      }
    }

    // Truck movement record
    await prisma.truckMovement.create({
      data: {
        truckNumber:   data.truckNumber,
        movementType:  "OUTBOUND",
        status:        "DISPATCHED",
        transporter:   data.transporter  || null,
        source:        data.source       || null,
        destination:   data.destination  || null,
      }
    });

    res.json({ success: true, outwardNumber, outward });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.outwardLineItem.deleteMany({ where: { outwardEntryId: id } });
    await prisma.outwardEntry.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
