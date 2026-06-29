import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const { from, to, warehouseCode, warehouseCodes } = req.query;
    const where: any = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) { const d = new Date(String(to)); d.setHours(23,59,59,999); where.createdAt.lte = d; }
    }
    const codeList = warehouseCodes
      ? String(warehouseCodes).split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      : (warehouseCode ? [String(warehouseCode).trim().toUpperCase()] : []);
    if (codeList.length) {
      const whs = await prisma.warehouse.findMany({ where: { code: { in: codeList } }, select: { id: true } });
      const ids = whs.map(w => w.id);
      where.lineItems = { some: { warehouseId: { in: ids.length ? ids : ['__none__'] } } };
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
      where: { materialId: material.id, quantity: { gt: 0 }, stockStatus: "GOOD" },
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

router.post('/dispatch', async (req, res) => {
  try {
    const data = req.body;

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
        customFields: JSON.stringify({
          description:   line.description  || '',
          materialType:  line.materialType || '',
          huUnit:        line.huUnit       || '',
          category:      line.category     || '',
          stockLocation: pick.stockLocation || '',
        }),
      }))
    );

    const remarksParts: string[] = [];
    if (data.source)    remarksParts.push('Source: ' + data.source);
    if (data.lrNumber)  remarksParts.push('LR: ' + data.lrNumber);
    if (data.createdBy) remarksParts.push('Created By: ' + data.createdBy);

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

    for (const line of lines) {
      for (const pick of (line.picks || [])) {
        const batch = await prisma.inventoryBatch.findUnique({ where: { id: pick.batchId } });
        if (batch) {
          const newQty = Math.max(0, batch.quantity - pick.pickQty);

          let cf: any = {};
          try { cf = JSON.parse(batch.customFields || '{}'); } catch {}

          const hasDiscrepancy =
            batch.stockStatus === "DISCREPANCY" ||
            Number(cf.shortInPallet   || 0) !== 0 ||
            Number(cf.shortExcessInKg  || 0) !== 0 ||
            Number(cf.shortExcessInQty || 0) !== 0 ||
            !!cf.discrepancyRemarks ||
            !!cf.discrepancy;

          const invoiceQty = Number(cf.invoiceQtyInNos || 0);
          const shouldAutoRectify = hasDiscrepancy && invoiceQty > 0 && newQty === invoiceQty;

          if (shouldAutoRectify) {
            const rectHistory = Array.isArray(cf.rectificationHistory) ? cf.rectificationHistory : [];
            const newCf = Object.assign({}, cf, {
              shortInPallet:      0,
              shortExcessInKg:    0,
              shortExcessInQty:   0,
              discrepancyRemarks: '',
              discrepancy:        false,
              receivedQtyInNos:   newQty,
              rectificationHistory: rectHistory.concat([{
                rectifiedAt:   new Date().toISOString(),
                remarks:       'Auto-rectified via outbound dispatch of ' + pick.pickQty + ' units. Remaining ' + newQty + ' matches invoice qty ' + invoiceQty + '.',
                autoRectified: true,
                dispatchedQty: pick.pickQty,
                remainingQty:  newQty,
                invoiceQty:    invoiceQty,
              }]),
            });
            await prisma.inventoryBatch.update({
              where: { id: batch.id },
              data: {
                quantity:        newQty,
                stockStatus:     'GOOD',
                lastMovementDate: new Date(),
                customFields:    JSON.stringify(newCf),
              },
            });
          } else {
            await prisma.inventoryBatch.update({
              where: { id: batch.id },
              data: { quantity: newQty, lastMovementDate: new Date() },
            });
          }

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

    await prisma.truckMovement.create({
      data: {
        truckNumber:  data.truckNumber,
        movementType: 'OUTBOUND',
        status:       'DISPATCHED',
        transporter:  data.transporter || null,
        source:       data.source      || null,
        destination:  data.destination || null,
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
