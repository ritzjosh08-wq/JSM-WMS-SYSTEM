import express from 'express';
import { prisma } from '../lib/prisma';
import { resolveScopedCodes, requireRole } from '../middleware/auth';

const router = express.Router();

// ── requireBatchWriteAccess — authorization gate for routes that mutate a specific
// InventoryBatch by :id ──────────────────────────────────────────────────────────
// The list route (GET /) already clamps results to req.user's warehouse scope, but that
// alone doesn't stop someone from calling POST/PATCH/DELETE directly against a batch ID
// that belongs to a warehouse they aren't scoped to — the ID itself isn't secret, it's
// just an opaque string, so "you'd have to guess it" is not real protection. This runs
// before any handler that accepts a batch :id and takes a mutating action:
//   - CUSTOMER accounts are never allowed to write (the customer portal is read-only by
//     design), regardless of which batch it is.
//   - WORKER accounts may only write to a batch whose warehouse is inside their own scope
//     (resolveScopedCodes — same rule the read routes already enforce).
//   - ADMIN is unrestricted.
async function requireBatchWriteAccess(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (user.role === 'CUSTOMER') {
      return res.status(403).json({ error: 'Customer accounts cannot modify inventory' });
    }
    if (user.role === 'ADMIN') return next();

    const batchId: string = String(req.params.id);
    const batch: any = await prisma.inventoryBatch.findUnique({
      where: { id: batchId },
      select: { warehouse: { select: { code: true } } },
    });
    if (!batch) return res.status(404).json({ error: 'Inventory batch not found' });

    const allowed = resolveScopedCodes(req, [batch.warehouse.code.toUpperCase()]);
    if (!allowed.includes(batch.warehouse.code.toUpperCase())) {
      return res.status(403).json({ error: 'You do not have access to this warehouse\'s inventory' });
    }
    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

router.get('/', async (req, res) => {
  try {
    // ── Filter: ?warehouseCode=CM35 OR ?warehouseCodes=A,B,C ─────────────────
    const warehouseCode = (req.query.warehouseCode as string | undefined)?.trim().toUpperCase();
    const warehouseCodesRaw = req.query.warehouseCodes as string | undefined;
    let codeList = warehouseCodesRaw
      ? warehouseCodesRaw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      : (warehouseCode ? [warehouseCode] : []);
    // Server-side enforcement: a CUSTOMER/WORKER can never see outside their own
    // scope, regardless of what warehouseCode(s) the client asks for.
    codeList = resolveScopedCodes(req, codeList);
    let whereWh: any = undefined;
    if (codeList.length) {
      const whs = await prisma.warehouse.findMany({ where: { code: { in: codeList } }, select: { id: true } });
      const ids = whs.map(w => w.id);
      whereWh = { warehouseId: { in: ids.length ? ids : ['__none__'] } };
    }

    // ── Optional server-side filters/pagination — ALL opt-in via query params ──
    // The existing frontend never sends page/limit today; it fetches the full array under
    // `inventory` and filters/sorts client-side. Changing the default response shape here
    // would break it, so: with no page/limit given, behavior is byte-for-byte identical to
    // before (full array, no `pagination` key). Only when a caller explicitly asks for a
    // page does the query get bounded with skip/take and a `pagination` block gets added
    // alongside — a compatibility layer, not a breaking change. This is what lets the
    // backend avoid returning the entire table by default at real scale (50k-100k+ rows)
    // once/if the frontend is updated to pass these, without touching it today.
    const where: any = { ...(whereWh || {}) };
    const materialCode = (req.query.materialCode as string | undefined)?.trim();
    const stockStatus  = (req.query.status as string | undefined)?.trim();
    const category     = (req.query.category as string | undefined)?.trim();
    if (stockStatus) where.stockStatus = stockStatus;
    if (materialCode) where.material = { code: materialCode };
    if (category) where.material = { ...(where.material || {}), category };
    const { from, to } = req.query as { from?: string; to?: string };
    if (from || to) {
      where.receiptDate = {};
      if (from) where.receiptDate.gte = new Date(String(from));
      if (to) { const d = new Date(String(to)); d.setHours(23, 59, 59, 999); where.receiptDate.lte = d; }
    }

    const pageRaw  = req.query.page  as string | undefined;
    const limitRaw = req.query.limit as string | undefined;
    const paginated = pageRaw !== undefined || limitRaw !== undefined;
    const page  = Math.max(1, parseInt(pageRaw || '1', 10) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(limitRaw || '50', 10) || 50));

    const sortField = (req.query.sortBy as string | undefined) || 'receiptDate';
    const sortDir   = (req.query.sortDir as string | undefined) === 'desc' ? 'desc' : 'asc';
    const allowedSortFields = new Set(['receiptDate', 'quantity', 'stockStatus', 'batchNumber', 'lastMovementDate']);
    const orderBy = { [allowedSortFields.has(sortField) ? sortField : 'receiptDate']: sortDir };

    // The inventory list and the warehouse dropdown don't depend on each other —
    // run them concurrently instead of one-after-another. Over a cross-region
    // connection to the database, each sequential round trip adds its own full
    // network latency, so this alone cuts a real chunk off every page load.
    const [inventory, warehouses, totalCount] = await Promise.all([
      prisma.inventoryBatch.findMany({
        where,
        include: {
          material: true,
          warehouse: true,
          rack: true,
          // Nest level → row so the frontend can show the full Rack / Row / Level / Bin
          // hierarchy (not just the bin code string) for batches stored in a real rack bin.
          bin: { include: { level: { include: { row: true } } } },
          floorLocation: true,
        },
        orderBy,
        ...(paginated ? { skip: (page - 1) * limit, take: limit } : {}),
      }),
      // Only return real warehouses — exclude the legacy WH-DEFAULT placeholder.
      // Non-admin accounts only ever see the warehouses within their own scope
      // (codeList is already clamped above), so the dropdown never leaks other
      // customers'/sites' warehouse names.
      prisma.warehouse.findMany({
        where: {
          isActive: true,
          NOT: { code: 'WH-DEFAULT' },
          ...(codeList.length ? { code: { in: codeList } } : {}),
        },
        orderBy: { code: 'asc' },
      }),
      // Only cost a COUNT query when pagination was actually requested — the unpaginated
      // (current, default) path never needed a total and shouldn't pay for one.
      paginated ? prisma.inventoryBatch.count({ where }) : Promise.resolve(null),
    ]);

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

    res.json({
      inventory: enriched,
      warehouses,
      ...(paginated ? {
        pagination: {
          page, limit,
          total: totalCount ?? 0,
          totalPages: Math.max(1, Math.ceil((totalCount ?? 0) / limit)),
        },
      } : {}),
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/adjust', requireBatchWriteAccess, async (req, res) => {
  try {
    const id: string = String(req.params.id);
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
router.patch('/:id', requireBatchWriteAccess, async (req, res) => {
  try {
    const id: string = String(req.params.id);
    const { quantity, stockStatus, warehouseId, customFields, materialCode, materialDescription, binLocation, stockLocation } = req.body;

    // Read current record to build history
    const current: any = await prisma.inventoryBatch.findUnique({
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
        let targetWarehouseCode: string = stockLocCode;
        if (stockLocCode) {
          const wh = await prisma.warehouse.findFirst({ where: { code: stockLocCode } });
          if (wh) { targetWarehouseId = wh.id; targetWarehouseCode = wh.code; }
        }
        if (!targetWarehouseId && current?.warehouseId) {
          targetWarehouseId = current.warehouseId;
          targetWarehouseCode = current.warehouse?.code || targetWarehouseCode;
        }

        // 1. Check rack bin in target warehouse
        const rackBin = targetWarehouseId
          ? await prisma.bin.findFirst({
              where: { code: binCode, rack: { warehouseId: targetWarehouseId } },
            })
          : null;

        if (rackBin) {
          // ── Rack bin capacity: 1 pallet per slot ──────────────────────────
          const occupant = await prisma.inventoryBatch.findFirst({
            where: { binId: rackBin.id, quantity: { gt: 0 } },
            include: { material: true },
          });
          if (occupant && occupant.id !== id) {
            const occupantCode = occupant.material?.code || 'another pallet';
            return res.status(400).json({
              error: `Rack bin "${binCode}" is already occupied by material "${occupantCode}". ` +
                     `Each rack bin holds exactly one pallet. Choose an empty rack bin.`,
            });
          }

          updateData.binId           = rackBin.id;
          updateData.rackId          = (rackBin as any).rackId;
          updateData.floorLocationId = null;
          if (targetWarehouseId) updateData.warehouseId = targetWarehouseId;
        } else {
          // 2. Check floor location in target warehouse
          const floorLoc = await prisma.floorLocation.findFirst({
            where: { code: binCode, isActive: true, ...(targetWarehouseId ? { warehouseId: targetWarehouseId } : {}) },
            include: { warehouse: { select: { id: true, code: true } } },
          });

          if (floorLoc) {
            updateData.floorLocationId = floorLoc.id;
            updateData.warehouseId     = floorLoc.warehouseId;
            updateData.binId           = null;
          } else {
            // 3. Neither found — reject with a clear error
            return res.status(400).json({
              error: `Bin "${binCode}" does not exist in warehouse "${targetWarehouseCode || '?'}". ` +
                     `Please check the warehouse map before saving.`,
            });
          }
        }
      } else {
        // Blank bin = clear location. Must clear BOTH floorLocationId and binId/rackId —
        // a batch sitting in a real rack bin (binId set, floorLocationId already null) would
        // otherwise keep its old rack placement after this "clear" (only floorLocationId was
        // ever nulled here), while still LOOKING cleared in the customFields.binLocation text
        // set below. That left the batch pointing at a rack bin it no longer visually showed,
        // silently blocking that bin from ever being reassigned (Inward's rack-bin-capacity
        // check treats it as still occupied).
        updateData.floorLocationId = null;
        updateData.binId = null;
        updateData.rackId = null;
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
// ADMIN-only: this wipes essentially every operational table in the database. Previously
// this only required being logged in at all (any WORKER or CUSTOMER account could call it).
router.delete('/reset-all', requireRole('ADMIN'), async (req, res) => {
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

router.delete('/:id', requireBatchWriteAccess, async (req, res) => {
  try {
    const id: string = String(req.params.id);
    await prisma.inventoryBatch.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/relocate', requireBatchWriteAccess, async (req, res) => {
  try {
    const id: string = String(req.params.id);
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
