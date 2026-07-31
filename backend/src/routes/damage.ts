import express from 'express';
import { prisma } from '../lib/prisma';
import { resolveScopedCodes, requireRole } from '../middleware/auth';

const router = express.Router();

// ── Damaged Goods ────────────────────────────────────────────────────────────
// New feature: mark part (or all) of an existing inventory batch as damaged. The
// `DamageRecord` Prisma model already existed in the schema but had no route and no UI —
// this wires it up. Marking damage does two things in one transaction:
//   1. Writes a DamageRecord (permanent log — material/batch/warehouse/location, qty
//      damaged vs. good, damage type, remarks) for reporting/audit.
//   2. Reduces the live InventoryBatch's sellable quantity by the damaged amount, using
//      the same row-lock + proportional-display-field-scaling pattern already used by
//      outward dispatch (routes/outward.ts) — so Pallets/Net Wt/Nos on the Inventory page
//      drop in proportion, and two concurrent damage/dispatch calls against the same batch
//      can't race each other into a negative quantity.
// Per the existing "discrepancy is never auto-cleared" policy elsewhere in this codebase,
// marking damage does NOT touch stockStatus/discrepancy fields — a batch can be both
// DISCREPANCY and have some damaged quantity; those are independent facts about it.

router.get('/', async (req, res) => {
  try {
    const { from, to, warehouseCode, warehouseCodes, materialCode, status } = req.query;
    const where: any = {};

    let codeList = warehouseCodes
      ? String(warehouseCodes).split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      : (warehouseCode ? [String(warehouseCode).trim().toUpperCase()] : []);
    codeList = resolveScopedCodes(req, codeList);
    if (codeList.length) where.warehouseCode = { in: codeList };

    if (materialCode) where.materialCode = String(materialCode).trim();
    if (status) where.status = String(status).trim();
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(String(from));
      if (to) { const d = new Date(String(to)); d.setHours(23, 59, 59, 999); where.date.lte = d; }
    }

    const records = await prisma.damageRecord.findMany({ where, orderBy: { date: 'desc' } });
    res.json({ records });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:batchId/mark', requireRole('ADMIN', 'WORKER'), async (req, res) => {
  try {
    const batchId = String(req.params.batchId);
    const damagedQtyNum = Number(req.body.damagedQty);
    const damageType = (req.body.damageType || 'OTHER').toString().trim();
    const remarks = (req.body.remarks || '').toString().trim();

    if (!Number.isFinite(damagedQtyNum) || damagedQtyNum <= 0) {
      return res.status(400).json({ error: 'damagedQty must be a positive number' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Lock the batch row for the duration of this transaction — same reasoning as
      // outward dispatch: without this, a damage-mark and a dispatch racing the same
      // batch could both read the same starting quantity and one write would silently
      // clobber the other.
      const locked = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "InventoryBatch" WHERE id = $1 FOR UPDATE`, batchId
      );
      const batch = locked[0];
      if (!batch) throw Object.assign(new Error('Inventory batch not found'), { status: 404 });

      // Warehouse-scope check (WORKER accounts limited to their own warehouses; ADMIN
      // unrestricted) — mirrors requireBatchWriteAccess in routes/inventory.ts.
      if ((req.user as any)?.role !== 'ADMIN') {
        const wh = await tx.warehouse.findUnique({ where: { id: batch.warehouseId }, select: { code: true } });
        const allowed = resolveScopedCodes(req, [(wh?.code || '').toUpperCase()]);
        if (!wh || !allowed.includes(wh.code.toUpperCase())) {
          throw Object.assign(new Error("You do not have access to this warehouse's inventory"), { status: 403 });
        }
      }

      if (damagedQtyNum > Number(batch.quantity)) {
        throw Object.assign(new Error(
          `Cannot mark ${damagedQtyNum} as damaged — only ${batch.quantity} available in this batch.`
        ), { status: 400 });
      }

      const material = await tx.material.findUnique({ where: { id: batch.materialId }, select: { code: true, description: true } });
      const warehouse = await tx.warehouse.findUnique({ where: { id: batch.warehouseId }, select: { code: true } });
      let locationCode = '';
      if (batch.binId) {
        const bin = await tx.bin.findUnique({ where: { id: batch.binId }, select: { code: true } });
        locationCode = bin?.code || '';
      } else if (batch.floorLocationId) {
        const floor = await tx.floorLocation.findUnique({ where: { id: batch.floorLocationId }, select: { code: true } });
        locationCode = floor?.code || '';
      }

      let cf: any = {};
      try { cf = JSON.parse(batch.customFields || '{}'); } catch {}
      if (!locationCode) locationCode = cf.binLocation || '';

      const totalQtyBefore = Number(batch.quantity);
      const goodQtyAfter = Math.max(0, totalQtyBefore - damagedQtyNum);

      // Scale down the same display fields dispatch depletes, so Pallets/Net Wt/Nos on
      // the Inventory page reflect the damaged-out quantity too.
      const num = (v: any): number => parseFloat(String(v ?? '')) || 0;
      const fraction = totalQtyBefore > 0 ? Math.min(1, damagedQtyNum / totalQtyBefore) : 0;
      const damageLogEntry = {
        markedAt: new Date().toISOString(),
        damagedQty: damagedQtyNum,
        damageType,
        remarks,
      };
      const damageHistory: any[] = Array.isArray(cf.damageHistory) ? cf.damageHistory : [];
      const newCf = {
        ...cf,
        nos:                  Math.max(0, num(cf.nos)                  - damagedQtyNum),
        pallets:              Math.max(0, num(cf.pallets)              * (1 - fraction)),
        netWeight:            Math.max(0, num(cf.netWeight)            * (1 - fraction)),
        receivedQtyInNos:     Math.max(0, num(cf.receivedQtyInNos)     - damagedQtyNum),
        receivedQtyInPallets: Math.max(0, num(cf.receivedQtyInPallets) * (1 - fraction)),
        receivedNetWeight:    Math.max(0, num(cf.receivedNetWeight)    * (1 - fraction)),
        damageHistory: [...damageHistory, damageLogEntry],
      };

      await tx.inventoryBatch.update({
        where: { id: batchId },
        data: { quantity: goodQtyAfter, lastMovementDate: new Date(), customFields: JSON.stringify(newCf) },
      });

      if (warehouse) {
        await tx.warehouse.update({
          where: { id: batch.warehouseId },
          data: { usedCapacity: { decrement: damagedQtyNum } },
        }).catch(() => {}); // best-effort — don't fail the whole damage-mark over capacity bookkeeping
      }

      const damageId = `DMG-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const record = await tx.damageRecord.create({
        data: {
          damageId,
          materialCode: material?.code || 'UNKNOWN',
          batchNumber: batch.batchNumber || '',
          warehouseCode: warehouse?.code || '',
          locationCode,
          totalQty: totalQtyBefore,
          damagedQty: damagedQtyNum,
          goodQty: goodQtyAfter,
          damageType,
          status: 'RECORDED',
          remarks: remarks || null,
        },
      });

      return record;
    });

    res.json({ success: true, record: result });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
