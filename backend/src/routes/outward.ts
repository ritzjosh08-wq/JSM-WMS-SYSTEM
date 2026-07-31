import express from 'express';
import { prisma } from '../lib/prisma';
import { resolveScopedCodes, requireRole } from '../middleware/auth';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { from, to, warehouseCode, warehouseCodes } = req.query;
    const where: any = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) { const d = new Date(String(to)); d.setHours(23,59,59,999); where.createdAt.lte = d; }
    }
    let codeList = warehouseCodes
      ? String(warehouseCodes).split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      : (warehouseCode ? [String(warehouseCode).trim().toUpperCase()] : []);
    codeList = resolveScopedCodes(req, codeList);
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
    // Backfill description from customFields for older line items that predate the
    // top-level `description` column being written on dispatch.
    for (const e of entries as any[]) {
      for (const li of e.lineItems) {
        if (!li.description) {
          try {
            const cf = JSON.parse(li.customFields || '{}');
            if (cf.description) li.description = cf.description;
          } catch {}
        }
      }
    }
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

// Dispatch, loaded-status, and delete are all write actions — the customer portal is
// read-only by design, so CUSTOMER accounts are blocked here even though a WORKER at any
// warehouse can currently dispatch/mark-loaded/delete regardless of scope (matches the
// existing pre-change behavior for those two roles; only CUSTOMER write access is new here).
router.post('/dispatch', requireRole('ADMIN', 'WORKER'), async (req, res) => {
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
        description:  line.description || '',
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

    // ── Everything below runs inside ONE transaction, with each picked batch row
    // explicitly locked (`SELECT ... FOR UPDATE`) before it's read or depleted. Why: the
    // previous version did a plain findUnique() then a separate update() with no lock in
    // between — if two dispatches picked from the same batch at nearly the same moment,
    // both could read the same starting quantity before either wrote back, so the second
    // write would silently overwrite the first (lost update), letting the same stock be
    // sold twice ("double allocation") or driving a batch negative. Locking the row for the
    // duration of the transaction serializes concurrent picks against the same batch — the
    // second transaction simply waits for the first to commit, then sees the already-
    // updated quantity. Wrapping the whole dispatch (entry + line items + every pick) in one
    // transaction also means a failure partway through (e.g. genuinely insufficient stock)
    // rolls back the ENTIRE dispatch instead of leaving it half-applied. All the per-batch
    // display-field math below (pallets/netWeight/nos/etc.) is untouched — same formulas,
    // same results, for the normal single-user case.
    const outward = await prisma.$transaction(async (tx) => {
      const created = await tx.outwardEntry.create({
        data: {
          outwardNumber,
          truckNumber:   data.truckNumber,
          transporter:   data.transporter   || null,
          destination:   data.destination   || null,
          sapDocumentNo: data.sapDocumentNo || null,
          remarks:       remarksParts.length ? remarksParts.join(' | ') : null,
          dispatchDate:  data.date ? new Date(data.date) : new Date(),
          status: "DISPATCHED",
          loaded: false,
          lineItems: { create: allLineItems },
        }
      });

      for (const line of lines) {
        for (const pick of (line.picks || [])) {
          // A zero/negative/non-numeric pickQty has no legitimate meaning here — the math
          // below (`quantity - pick.pickQty`) would silently INCREASE stock for a negative
          // value instead of depleting it, which is the opposite of what a dispatch does.
          // Legitimate picks are always a positive amount actually being shipped, so this
          // rejects the request outright rather than let a bad value corrupt inventory.
          const pickQtyNum = Number(pick.pickQty);
          if (!Number.isFinite(pickQtyNum) || pickQtyNum <= 0) {
            throw new Error(`Invalid pick quantity for batch ${pick.batchId}: ${pick.pickQty}`);
          }

          const locked = await tx.$queryRawUnsafe<any[]>(
            `SELECT * FROM "InventoryBatch" WHERE id = $1 FOR UPDATE`, pick.batchId
          );
          const batch = locked[0];
          if (!batch) continue;

          // Hard stop, per warehouse policy: never let a dispatch take more than a batch
          // actually has available, and never allow the result to go negative. Two
          // concurrent dispatches racing for the same last few units now can't both
          // succeed — whichever transaction commits first wins; the second sees the
          // already-reduced quantity (thanks to the row lock above) and is rejected here
          // instead of silently clamping to zero and under/over-fulfilling either order.
          if (Number(batch.quantity) < Number(pick.pickQty)) {
            throw new Error(
              `Insufficient stock for batch ${batch.batchNumber || pick.batchId}: ` +
              `available ${batch.quantity}, requested ${pick.pickQty}. Another dispatch may have just picked from the same batch — refresh and try again.`
            );
          }
          const newQty = Math.max(0, Number(batch.quantity) - pick.pickQty);

          let cf: any = {};
          try { cf = JSON.parse(batch.customFields || '{}'); } catch {}

          // ── Deplete the display fields, not just the raw `quantity` column ──────────
          // The Inventory page reads cf.pallets / cf.netWeight / cf.nos (displayQtyPallet/
          // displayQtyKg/displayQtyNos) — NOT the raw `quantity` column directly. Dispatch
          // was only ever decrementing `quantity`, so a batch's Pallets/Net Wt on the
          // Inventory page stayed exactly the same after shipping goods out; only a page
          // reload with the fallback-less `quantity` field would ever have shown the drop,
          // and even that fallback (displayQtyNos) never fires because cf.nos is always
          // truthy. Compute the fraction of this batch actually being shipped and scale
          // every quantity field down by that same fraction, so Pallets/Net Wt/Nos on
          // Inventory drop in proportion to what's leaving — same pattern applied whether
          // or not this pick also happens to auto-rectify a discrepancy below.
          const num = (v: any): number => parseFloat(String(v ?? '')) || 0;
          const fraction = Number(batch.quantity) > 0 ? Math.min(1, pick.pickQty / Number(batch.quantity)) : 0;
          const depletedCf = {
            nos:                  Math.max(0, num(cf.nos)                  - pick.pickQty),
            pallets:              Math.max(0, num(cf.pallets)              * (1 - fraction)),
            netWeight:            Math.max(0, num(cf.netWeight)            * (1 - fraction)),
            invoiceQtyInNos:      Math.max(0, num(cf.invoiceQtyInNos)      * (1 - fraction)),
            receivedQtyInNos:     Math.max(0, num(cf.receivedQtyInNos)     - pick.pickQty),
            invoiceQtyInPallet:   Math.max(0, num(cf.invoiceQtyInPallet)   * (1 - fraction)),
            receivedQtyInPallets: Math.max(0, num(cf.receivedQtyInPallets) * (1 - fraction)),
            invoiceNetWeight:     Math.max(0, num(cf.invoiceNetWeight)     * (1 - fraction)),
            receivedNetWeight:    Math.max(0, num(cf.receivedNetWeight)    * (1 - fraction)),
            numberOfBoxes:        Math.max(0, num(cf.numberOfBoxes)        * (1 - fraction)),
          };

          // ── Discrepancy status is NEVER auto-cleared by a dispatch ──────────────────
          // Per policy: once an inward batch is approved into inventory with a
          // discrepancy flag (or without one), that stockStatus/discrepancy state only
          // ever changes via an explicit, manual rectification (Inventory page →
          // "Rectify Discrepancy" → PATCH /api/inventory/:id). Dispatch only depletes
          // quantity/display fields below; it must never silently flip stockStatus or
          // clear shortInPallet/shortExcessInKg/shortExcessInQty/discrepancyRemarks/
          // discrepancy/rectificationHistory, even if the remaining qty happens to match
          // the invoice qty.
          const newCf = Object.assign({}, cf, depletedCf);
          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: { quantity: newQty, lastMovementDate: new Date(), customFields: JSON.stringify(newCf) },
          });

          const wh = await tx.warehouse.findUnique({ where: { id: batch.warehouseId } });
          if (wh) {
            await tx.warehouse.update({
              where: { id: wh.id },
              data: { usedCapacity: Math.max(0, wh.usedCapacity - pick.pickQty) },
            });
          }
        }
      }

      await tx.truckMovement.create({
        data: {
          truckNumber:  data.truckNumber,
          movementType: 'OUTBOUND',
          status:       'DISPATCHED',
          transporter:  data.transporter || null,
          source:       data.source      || null,
          destination:  data.destination || null,
        }
      });

      return created;
    });

    res.json({ success: true, outwardNumber, outward });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /:id/loaded — manually mark a dispatched entry as loaded / not loaded onto the truck
router.patch('/:id/loaded', requireRole('ADMIN', 'WORKER'), async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const { loaded, loadedBy } = req.body;
    const updated = await prisma.outwardEntry.update({
      where: { id },
      data: {
        loaded: !!loaded,
        loadedAt: loaded ? new Date() : null,
        loadedBy: loaded ? (loadedBy || null) : null,
      },
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requireRole('ADMIN', 'WORKER'), async (req, res) => {
  try {
    const id: string = String(req.params.id);
    await prisma.outwardLineItem.deleteMany({ where: { outwardEntryId: id } });
    await prisma.outwardEntry.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
