import express from 'express';
import path from 'path';
import { Worker } from 'worker_threads';
import { prisma } from '../lib/prisma';
import { resolveScopedCodes, requireRole } from '../middleware/auth';

// xlsx is required: run `npm install xlsx` in the backend folder
let XLSX: any = null;
try { XLSX = require('xlsx'); } catch { /* xlsx not installed yet */ }

const router = express.Router();

// ── POST /parse-excel — accepts base64-encoded Excel file, returns parsed row data
// Frontend sends: { fileBase64: string, fileName: string }
//
// The actual parsing (see workers/excelParseWorker.ts, which is an exact copy of the
// logic that used to run right here) happens in a separate worker thread with a capped
// memory ceiling, not on the main server thread. Why: `xlsx` parsing is synchronous and
// memory-hungry, and a single very large upload was able to exhaust the whole backend
// process's memory and crash it — taking down the connection for every logged-in user
// at once, not just this upload, and requiring Railway to restart the entire service.
// Capping the worker's own heap means an oversized file fails ONLY this one request
// (a clean error below) while the main server keeps running normally for everyone else.
// Output shape and parsing behavior are byte-for-byte identical to before.
router.post('/parse-excel', express.json({ limit: '100mb' }), (req, res) => {
  if (!XLSX) {
    return res.status(500).json({ error: 'xlsx package not installed on backend. Run: npm install xlsx in the backend folder.' });
  }
  const { fileBase64, fileName } = req.body;
  if (!fileBase64) return res.status(400).json({ error: 'fileBase64 is required' });

  // worker_threads' Worker always loads its entry as a plain file via Node's own module
  // loader — it does NOT go through ts-node's require-hook the way the main process does.
  // In production (`npm run build` -> `tsc`), `../workers/excelParseWorker.js` really exists
  // in `dist/`, so pointing at the compiled .js is correct there. But in dev (`npm run dev`
  // -> nodemon/ts-node running `src/index.ts` directly, no `dist/` at all), that .js file was
  // never created — Node/worker_threads would throw "Cannot find module
  // '...src/workers/excelParseWorker.js'" the instant anyone uploaded an Excel file, even
  // though the backend itself was running fine. `__filename` reflects the ORIGINAL source
  // path in both cases (ts-node doesn't rewrite it), so checking its extension reliably tells
  // us which mode we're in — then point the worker at the matching file, registering
  // ts-node in the new worker thread's own process when running from source.
  const runningFromSource = __filename.endsWith('.ts');
  const workerPath = runningFromSource
    ? path.join(__dirname, '../workers/excelParseWorker.ts')
    : path.join(__dirname, '../workers/excelParseWorker.js');

  const worker = new Worker(workerPath, {
    workerData: { fileBase64, fileName },
    // transpile-only (not plain 'ts-node/register'): a fresh worker-thread process
    // doesn't inherit the main process's already-resolved tsconfig/@types context, and
    // full type-checking there fails with spurious "Cannot find name 'Buffer'/'require'"
    // errors even though the same file type-checks fine as part of the main build.
    // transpile-only skips type-checking and just strips types — the worker only ever
    // needs valid JS out of this file, never a type-checking pass of its own.
    execArgv: runningFromSource ? ['-r', 'ts-node/register/transpile-only'] : [],
    // Leaves comfortable headroom under Railway's ~1GB container limit for the main
    // process (Express, Prisma, other in-flight requests) — a file big enough to need
    // more than this fails with a clear error instead of OOM-killing the whole backend.
    resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 64 },
  });

  let settled = false;
  const finish = (status: number, body: any) => {
    if (settled) return;
    settled = true;
    res.status(status).json(body);
    worker.terminate().catch(() => {});
  };

  worker.on('message', (msg: any) => {
    if (msg.success) {
      finish(200, { headers: msg.headers, rows: msg.rows, blankRowsSkipped: msg.blankRowsSkipped, totalRowsInSheet: msg.totalRowsInSheet, sheetName: msg.sheetName });
    } else {
      finish(500, { error: msg.error });
    }
  });
  worker.on('error', (err: any) => {
    finish(500, { error: err.message?.includes('heap') || err.message?.includes('memory')
      ? 'This file is too large or complex to process. Try splitting it into smaller sheets and uploading each separately.'
      : err.message || 'Failed to parse Excel on backend' });
  });
  worker.on('exit', (code: number) => {
    if (!settled && code !== 0) {
      finish(500, { error: 'This file is too large or complex to process. Try splitting it into smaller sheets and uploading each separately.' });
    }
  });
});

// GET all inward entries (for reports)
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
    const entries = await prisma.inwardEntry.findMany({
      where,
      include: { lineItems: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Splits an array into fixed-size chunks — used below to keep bulk inserts under
// Postgres's parameter-count limit (a single INSERT statement can only bind so many
// values at once; ~1000 rows at a time keeps every batch comfortably under that no
// matter how many columns a row has).
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

router.post('/commit', requireRole('ADMIN', 'WORKER'), async (req, res) => {
  try {
    const entries = req.body.entries;
    const createdBy: string = req.body.createdBy || '';
    if (!entries || !entries.length) return res.status(400).json({ error: "No entries provided" });

    // ── Rack bin capacity check — authoritative, runs before anything is written ────────
    // A real rack bin (e.g. RH1-24 — matches an actual provisioned Bin row) physically holds
    // exactly ONE pallet. Floor locations (e.g. FG05, or any code that doesn't match a real
    // Bin) are unaffected — several pallets legitimately share one floor spot there. Reject
    // the WHOLE request up front (nothing partially committed) if two or more of the rows
    // being submitted target the same rack bin, or if a targeted bin already holds a pallet
    // from an earlier commit.
    //
    // This used to look up the warehouse, then the bin, then count existing occupants — as
    // three separate awaited queries PER ROW. For a large sheet (thousands of rows) that's
    // tens of thousands of sequential round trips just for this check, before anything is even
    // written. Batched below into a handful of `findMany`/`in` queries, with the exact same
    // conflict logic evaluated in memory afterward — same conflicts detected, same message.
    const stockCodesForBinCheck = [...new Set(
      (entries as any[])
        .filter(e => (e.binLocation || '').trim() && (e.stockLocation || '').trim())
        .map(e => (e.stockLocation || '').trim().toUpperCase())
    )];
    const whsForBinCheck = stockCodesForBinCheck.length
      ? await prisma.warehouse.findMany({ where: { code: { in: stockCodesForBinCheck } } })
      : [];
    const whByCodeForBinCheck = new Map(whsForBinCheck.map(w => [w.code, w]));
    const whIdsForBinCheck = whsForBinCheck.map(w => w.id);

    const binCodeCandidates = new Set<string>();
    for (const e of entries as any[]) {
      const binCode = (e.binLocation || '').trim();
      if (binCode) { binCodeCandidates.add(binCode); binCodeCandidates.add(binCode.toUpperCase()); }
    }
    const binsForCheck = (binCodeCandidates.size && whIdsForBinCheck.length)
      ? await prisma.bin.findMany({
          where: { code: { in: [...binCodeCandidates] }, rack: { warehouseId: { in: whIdsForBinCheck } } },
          include: { rack: { select: { warehouseId: true } } },
        })
      : [];
    const binByWhAndCode = new Map<string, typeof binsForCheck[number]>();
    const binById = new Map<string, typeof binsForCheck[number]>();
    for (const b of binsForCheck) {
      binByWhAndCode.set(`${b.rack.warehouseId}::${b.code}`, b);
      binById.set(b.id, b);
    }

    const rackBinConflicts = new Set<string>();
    const binUsageThisRequest = new Map<string, Set<string>>(); // binId -> distinct row keys using it
    for (const e of entries as any[]) {
      const binCode = (e.binLocation || '').trim();
      const stockCode = (e.stockLocation || '').trim().toUpperCase();
      if (!binCode || !stockCode) continue;
      const wh = whByCodeForBinCheck.get(stockCode);
      if (!wh) continue; // brand-new warehouse — no racks provisioned yet, nothing to conflict with
      let bin = binByWhAndCode.get(`${wh.id}::${binCode}`);
      if (!bin && binCode.toUpperCase() !== binCode) {
        bin = binByWhAndCode.get(`${wh.id}::${binCode.toUpperCase()}`);
      }
      if (!bin) continue; // no matching Bin — this is a floor location code, no limit here

      const rowKey = `${e.materialCode || 'unknown'}#${e.gateSerialNo || ''}#${e.huUnit || ''}`;
      const used = binUsageThisRequest.get(bin.id) || new Set<string>();
      used.add(rowKey);
      binUsageThisRequest.set(bin.id, used);
      if (used.size > 1) rackBinConflicts.add(`${bin.code} (${used.size} pallets in this upload)`);
    }
    if (binUsageThisRequest.size) {
      const occupiedRows = await prisma.inventoryBatch.findMany({
        where: { binId: { in: [...binUsageThisRequest.keys()] }, quantity: { gt: 0 } },
        select: { binId: true },
      });
      const occupiedBinIds = new Set(occupiedRows.map(r => r.binId));
      for (const binId of binUsageThisRequest.keys()) {
        if (occupiedBinIds.has(binId)) {
          const binRec = binById.get(binId);
          if (binRec) rackBinConflicts.add(`${binRec.code} (already holds a pallet)`);
        }
      }
    }
    if (rackBinConflicts.size) {
      return res.status(400).json({
        error: `Rack bin capacity exceeded — each rack bin holds exactly 1 pallet. Conflicting bin(s): ${[...rackBinConflicts].join('; ')}. Floor locations are not affected by this limit.`,
      });
    }

    // Group entries by invoiceNumber so they share one InwardEntry header
    const groups = new Map<string, any[]>();
    for (const e of entries) {
      const key = e.invoiceNumber || `MANUAL-${Date.now()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    // Same row order the original per-row loop processed them in (group by group, in the
    // order each invoice number first appeared) — needed so the material "who wins when two
    // rows disagree" logic below produces the exact same result as before.
    const allRowsInGroupOrder: any[] = [...groups.values()].flat();

    // Default warehouse: prefer CM35, then any active warehouse.
    // Never auto-create a placeholder — real warehouses are seeded via /api/warehouse.
    let defaultWarehouse =
      await prisma.warehouse.findFirst({ where: { code: 'CM35' } }) ||
      await prisma.warehouse.findFirst({ where: { isActive: true, NOT: { code: 'WH-DEFAULT' } } });
    if (!defaultWarehouse) throw new Error('No warehouse found. Please ensure CM35 is seeded before committing inward entries.');

    // ── Warehouse cache — get-or-create, memoized so a code repeated across thousands of
    // rows only ever costs one lookup (and, at most, one create) for the whole request. ──
    const allStockCodes = new Set<string>();
    for (const [, rows] of groups) {
      const gCode = (rows[0].stockLocation || '').trim().toUpperCase();
      if (gCode) allStockCodes.add(gCode);
    }
    for (const row of allRowsInGroupOrder) {
      const rCode = (row.stockLocation || '').trim().toUpperCase();
      if (rCode) allStockCodes.add(rCode);
    }
    const existingWarehouses = allStockCodes.size
      ? await prisma.warehouse.findMany({ where: { code: { in: [...allStockCodes] } } })
      : [];
    const warehouseByCode = new Map<string, any>(existingWarehouses.map(w => [w.code, w]));
    async function getOrCreateWarehouse(code: string) {
      let wh = warehouseByCode.get(code);
      if (wh) return wh;
      wh = await prisma.warehouse.create({
        data: { code, name: code, storageType: 'MIXED', totalCapacity: 100000, isActive: true },
      });
      console.log(`Auto-created warehouse: ${code}`);
      warehouseByCode.set(code, wh);
      return wh;
    }

    // ── Material resolution — folded across ALL rows sharing a code BEFORE touching the
    // DB, so each distinct material code costs exactly one create-or-update, not one per
    // row. The fold replicates the original per-row logic exactly: for a code that doesn't
    // exist yet, the values used are "the last non-blank value seen across every row with
    // this code" (falling back to the same defaults the original create used) — identical
    // to what running N sequential creates/updates in order would converge to, since a
    // later row's truthy value always overwrote an earlier one's anyway. ──────────────────
    type MaterialFold = {
      firstRowCategory: string;
      lastDescription?: string; lastMaterialType?: string; lastCategory?: string;
      lastHuUnit?: string; lastBinOrStock?: string;
    };
    const materialFold = new Map<string, MaterialFold>();
    for (const row of allRowsInGroupOrder) {
      if (!row.materialCode) continue;
      let f = materialFold.get(row.materialCode);
      if (!f) { f = { firstRowCategory: row.category || '' }; materialFold.set(row.materialCode, f); }
      if (row.description)  f.lastDescription  = row.description;
      if (row.materialType) f.lastMaterialType = row.materialType;
      if (row.category)     f.lastCategory     = row.category;
      if (row.huUnit)       f.lastHuUnit       = row.huUnit;
      if (row.binLocation || row.stockLocation) f.lastBinOrStock = row.binLocation || row.stockLocation;
    }
    const distinctMaterialCodes = [...materialFold.keys()];
    const existingMaterials = distinctMaterialCodes.length
      ? await prisma.material.findMany({ where: { code: { in: distinctMaterialCodes } } })
      : [];
    const materialByCode = new Map<string, any>(existingMaterials.map(m => [m.code, m]));
    for (const [code, f] of materialFold) {
      const existing = materialByCode.get(code);
      if (!existing) {
        const created = await prisma.material.create({
          data: {
            code,
            description: f.lastDescription || code,
            materialType: f.lastMaterialType || (f.firstRowCategory || "RM"),
            huUnit: f.lastHuUnit || "",
            category: f.lastCategory || "RM",
            defaultStorageType: f.lastBinOrStock || null,
          },
        });
        materialByCode.set(code, created);
      } else if (f.lastDescription || f.lastMaterialType || f.lastCategory || f.lastHuUnit || f.lastBinOrStock) {
        const updated = await prisma.material.update({
          where: { id: existing.id },
          data: {
            ...(f.lastDescription  ? { description: f.lastDescription }   : {}),
            ...(f.lastMaterialType ? { materialType: f.lastMaterialType } : {}),
            ...(f.lastCategory     ? { category: f.lastCategory }         : {}),
            ...(f.lastHuUnit       ? { huUnit: f.lastHuUnit }             : {}),
            ...(f.lastBinOrStock   ? { defaultStorageType: f.lastBinOrStock } : {}),
          },
        });
        materialByCode.set(code, updated);
      }
    }

    // ── Bin / floor-location cache — same get-or-create-once memoization as warehouses
    // above. Keyed by warehouseId+code so the same physical location referenced by many
    // rows (the normal case) only ever costs one lookup. ────────────────────────────────
    const binCache = new Map<string, any>();   // `${warehouseId}::${code}` -> Bin
    const floorCache = new Map<string, any>(); // `${warehouseId}::${code}` -> FloorLocation
    async function findBin(warehouseId: string, binCode: string) {
      const key = `${warehouseId}::${binCode}`;
      if (binCache.has(key)) return binCache.get(key);
      let bin = await prisma.bin.findFirst({ where: { code: binCode, rack: { warehouseId } } });
      if (!bin && binCode.toUpperCase() !== binCode) {
        const upperKey = `${warehouseId}::${binCode.toUpperCase()}`;
        if (binCache.has(upperKey)) { binCache.set(key, binCache.get(upperKey)); return binCache.get(upperKey); }
        bin = await prisma.bin.findFirst({ where: { code: binCode.toUpperCase(), rack: { warehouseId } } });
      }
      binCache.set(key, bin || null);
      return bin || null;
    }
    async function getOrCreateFloorLocation(warehouseId: string, binCode: string, zoneSource: string) {
      const key = `${warehouseId}::${binCode}`;
      if (floorCache.has(key)) return floorCache.get(key);
      let floorLoc = await prisma.floorLocation.findFirst({ where: { code: binCode, warehouseId } });
      if (!floorLoc) {
        const zone = zoneSource.toUpperCase().slice(0, 20);
        floorLoc = await prisma.floorLocation.create({
          data: { warehouseId, zone, code: binCode, capacity: 10000, isActive: true },
        });
        console.log(`Auto-created floor location: ${binCode} in warehouse ${warehouseId}`);
      }
      floorCache.set(key, floorLoc);
      return floorLoc;
    }

    // Parse DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, or ISO date strings robustly using LOCAL time
    // (no UTC shift). The dot-separated form (e.g. "28.01.2025") shows up as plain text in some
    // real warehouse sheets' date columns — added alongside the existing "-"/"/" separators
    // without changing how those are parsed.
    const parseInwardDate = (dateStr: string): Date => {
      if (!dateStr) return new Date();
      const ddmmyyyy = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(dateStr.trim());
      if (ddmmyyyy) {
        // Use local midnight — avoids UTC-to-local day-shift in IST and other positive-offset zones
        return new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]), 0, 0, 0, 0);
      }
      const yyyymmdd = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(dateStr.trim());
      if (yyyymmdd) {
        return new Date(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]) - 1, parseInt(yyyymmdd[3]), 0, 0, 0, 0);
      }
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? new Date() : d;
    };

    const parseTime = (dateStr: string, timeStr: string) => {
      if (!dateStr || !timeStr) return null;
      try {
        const [h, m] = timeStr.split(":").map(Number);
        const d = parseInwardDate(dateStr);
        d.setHours(h || 0, m || 0, 0, 0);
        return d;
      } catch { return null; }
    };

    for (const [invoiceKey, rows] of groups) {
      const first = rows[0];

      // Resolve the group-level warehouse from the first row's stockLocation.
      const groupStockCode = (first.stockLocation || '').trim().toUpperCase();
      const groupWarehouse = groupStockCode ? await getOrCreateWarehouse(groupStockCode) : defaultWarehouse;

      // ── Everything for this one invoice group — the entry header, its line items, every
      // resulting InventoryBatch row, and the truck movement record — commits as a single
      // transaction. Why: without this, a failure partway through a group (e.g. the
      // createMany for inventory batches erroring on chunk 3 of 5) could leave that group's
      // InwardEntry + some-but-not-all line items sitting in the database with no matching
      // inventory — a partially-committed, inconsistent import. Scoping the transaction to
      // ONE group (not the whole multi-thousand-row upload) means a problem in one invoice
      // group rolls back only that group; every other group that already committed
      // successfully is unaffected, and the /commit response below still reports which rows
      // came from which group.
      const { inwardEntry } = await prisma.$transaction(async (tx) => {
      // Entry header only — line items are inserted separately below via createMany so a
      // group with thousands of rows costs one bulk insert instead of one round trip per row.
      const inwardEntry = await tx.inwardEntry.create({
        data: {
          inwardNumber: `INW-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          truckNumber: first.truckNumber || "N/A",
          transporter: first.transporter || null,
          lrNumber: first.lrNumber || null,
          sealNumber: first.sealNumber || null,
          source: first.source || null,
          sapDocumentNo: first.sapDocumentNumber || null,
          gateEntryNo: first.gateSerialNo || null,
          invoiceNumber: first.invoiceNumber || null,
          gateSerialNo: first.gateSerialNo || null,
          category: first.category || null,
          inwardDate: first.date ? parseInwardDate(first.date) : null,
          truckInTime: parseTime(first.date, first.truckInTime),
          unloadStartTime: parseTime(first.date, first.unloadStartTime),
          unloadEndTime: parseTime(first.date, first.unloadEndTime),
          truckOutTime: parseTime(first.date, first.truckOutTime),
          tatStr: first.tat || null,
          status: "COMPLETED",
          customFields: JSON.stringify({
            date: first.date,
            tatRemarks: first.tatRemarks,
            stockLocation: first.stockLocation,
            createdBy,
          }),
        },
      });

      const lineItemsData = rows.map((row: any) => ({
        inwardEntryId: inwardEntry.id,
        materialCode: row.materialCode || "UNKNOWN",
        quantity: row.receivedQtyInNos || row.invoiceQtyInNos || row.receivedNetWeight || 0,
        batchNumber: row.invoiceNumber || `BATCH-${Date.now()}`,
        warehouseId: groupWarehouse.id,
        lineItemStatus: row.status,
        // Prefer the ACTUAL/received HU tag (set when a discrepancy corrected the physical
        // unit's identifier) over the original invoice-expected huUnit — dispatch/outbound
        // scanning looks up by whatever tag is physically on the pallet, not what the
        // invoice originally said.
        huUnit: row.actualHuUnit || row.huUnit || null,   // null/blank if not provided in sheet
        description: row.description || null,
        binLocation: row.binLocation || null,
        remarks: row.remarks || null,
        customFields: JSON.stringify({
          materialType: row.materialType || '',
          actualHuUnit: row.actualHuUnit,
          actualDescription: row.actualDescription,
          invoiceQtyInPallet: row.invoiceQtyInPallet,
          invoiceQtyInNos: row.invoiceQtyInNos,
          invoiceNetWeight: row.invoiceNetWeight,
          receivedQtyInPallets: row.receivedQtyInPallets,
          receivedQtyInNos: row.receivedQtyInNos,
          receivedQtyInKgs: row.receivedQtyInKgs,
          receivedNetWeight: row.receivedNetWeight,
          netWeight: row.netWeight,
          receivedPalletCount: row.receivedPalletCount,
          numberOfBoxes: row.numberOfBoxes,
          boxPerKg: row.boxPerKg,
          shortInPallet: row.shortInPallet,
          shortExcessInKg: row.shortExcessInKg,
          shortExcessInQty: row.shortExcessInQty,
          discrepancyRemarks: row.discrepancyRemarks,
          tatRemarks: row.tatRemarks,
          stockLocation: row.stockLocation,
          category: row.category,
          // Real batch/lot number from the sheet's "Batch No" column — distinct from
          // invoiceNumber, which is the internal grouping key inward uses to identify a
          // shipment. See same note on the InventoryBatch customFields below.
          batchNo: row.batchNo || "",
        }),
      }));
      for (const c of chunk(lineItemsData, 1000)) {
        await tx.inwardLineItem.createMany({ data: c });
      }

      // Build every InventoryBatch row for this group in memory first (using the material/
      // warehouse/bin/floor caches resolved above — no DB round trip unless a given code is
      // genuinely new), then insert them all in one bulk call instead of one create() per row.
      const inventoryBatchesData: any[] = [];
      for (const row of rows) {
        if (!row.materialCode) continue;
        const material = materialByCode.get(row.materialCode);
        if (!material) continue; // shouldn't happen — every materialCode was resolved above

        const batchKey = row.invoiceNumber || row.sapDocumentNumber || "MANUAL";

        // Detect discrepancy first so we can decide whether to skip zero-qty rows
        const hasDiscrepancy = !!(
          row.status === "DISCREPANCY" ||
          row.entryStatus === "DISCREPANCY" ||
          row.discrepancyRemarks ||
          Number(row.shortInPallet    || 0) !== 0 ||
          Number(row.shortExcessInKg  || 0) !== 0 ||
          Number(row.shortExcessInQty || 0) !== 0
        );

        // Use the best available quantity — Nos first, then Pallets, then Net Weight
        const receivedQty =
          row.receivedQtyInNos   || row.invoiceQtyInNos    ||
          row.receivedQtyInPallets || row.invoiceQtyInPallet ||
          row.receivedNetWeight  || row.invoiceNetWeight   || 0;
        // Skip only non-discrepancy items with no quantity; discrepancy items always commit
        if (receivedQty <= 0 && !hasDiscrepancy) continue;
        // The physically-verified HU tag for THIS row (prefer the discrepancy-corrected
        // actualHuUnit over the original invoice huUnit — see comment on the line item above).
        const rowHU = (row.actualHuUnit || row.huUnit || '').toString().trim();
        const invCustomFieldsObj: Record<string, any> = {
          netWeight:           row.receivedNetWeight    || row.invoiceNetWeight    || 0,
          invoiceNetWeight:    row.invoiceNetWeight     || 0,
          receivedNetWeight:   row.receivedNetWeight    || 0,
          pallets:             row.receivedQtyInPallets || row.invoiceQtyInPallet  || 0,
          invoiceQtyInPallet:  row.invoiceQtyInPallet   || 0,
          receivedQtyInPallets:row.receivedQtyInPallets || 0,
          nos:                 row.receivedQtyInNos     || row.invoiceQtyInNos     || 0,
          invoiceQtyInNos:     row.invoiceQtyInNos      || 0,
          receivedQtyInNos:    row.receivedQtyInNos     || 0,
          numberOfBoxes:       row.numberOfBoxes        || 0,
          shortInPallet:       row.shortInPallet        || 0,
          shortExcessInKg:     row.shortExcessInKg      || 0,
          shortExcessInQty:    row.shortExcessInQty     || 0,
          discrepancyRemarks:  row.discrepancyRemarks   || "",
          category:       row.category,
          binLocation:    row.binLocation,
          stockLocation:  row.stockLocation || first.stockLocation || "",
          // `huUnit` = most recently committed tag (kept for backward compatibility with
          // anything reading a single value). `huUnits` = every distinct physical HU tag ever
          // folded into this aggregate batch — see merge logic below, right before save.
          // NOTE: multiple Excel rows (one per physical pallet) with the same material code +
          // invoice number all aggregate into ONE InventoryBatch. Each pallet can have its own
          // unique HU tag. Only ever storing a single `huUnit` here silently discarded every
          // tag except the last row committed — that's why Outward Dispatch's HU search found
          // some HU numbers fine but not others.
          huUnit:         rowHU,
          invoiceNo:      row.invoiceNumber || first.invoiceNumber || "",
          sapDocNo:       row.sapDocumentNumber || first.sapDocumentNumber || "",
          gateSerialNo:   row.gateSerialNo  || first.gateSerialNo  || "",
          source:         row.source        || first.source        || "",
          truckNumber:    row.truckNumber   || first.truckNumber   || "",
          lrNumber:       row.lrNumber      || first.lrNumber      || "",
          transporter:    row.transporter   || first.transporter   || "",
          sealNumber:     row.sealNumber    || first.sealNumber    || "",
          status:         row.status,
          // Same overwrite problem as huUnit above can happen here too: the Excel sheet's
          // "Type of Material" column is sometimes filled in differently row-to-row even for
          // the same material code + invoice (e.g. "Reel" / "CFC" / "Board" all appearing for
          // one material code). `materialTypes` accumulates every distinct value seen; see
          // merge logic below, right before save.
          materialType:   row.materialType || "",
          inwardDate:     row.date || first.date || "",
          tatRemarks:     row.tatRemarks   || first.tatRemarks || "",
          createdBy:      createdBy        || "",
          discrepancy:    hasDiscrepancy,
        };

        // Resolve binLocation → either a real Rack Bin (if the code matches one already
        // provisioned for this warehouse, e.g. "RA1-01") or a FloorLocation (auto-creating
        // if new, e.g. "A2-01"). Any new floor code is auto-recorded so all workers'
        // locations land in the warehouse map.
        let resolvedFloorLocationId: string | null = null;
        let resolvedRackId: string | null = null;
        let resolvedBinId: string | null = null;
        // Start from groupWarehouse (already resolved/auto-created for this invoice group)
        let resolvedWarehouseId: string = groupWarehouse.id;

        // Allow per-row override: if the row has its own stockLocation different from the group's,
        // resolve/auto-create that warehouse too (cached — see getOrCreateWarehouse above).
        const rowStockCode = (row.stockLocation || '').trim().toUpperCase();
        let targetWarehouse = groupWarehouse;
        if (rowStockCode && rowStockCode !== groupStockCode) {
          targetWarehouse = await getOrCreateWarehouse(rowStockCode);
          resolvedWarehouseId = targetWarehouse.id;
        }

        if (row.binLocation && row.binLocation.trim()) {
          const binCode = row.binLocation.trim();

          // First: does this code match an already-provisioned Rack Bin (e.g. "RA1-01",
          // seeded per-warehouse in warehouse.ts)? Rack bin codes are distinct from generic
          // floor-location codes (e.g. "A2-01"). Matching against the real Bin table lets the
          // app track true Rack/Row/Level placement — previously EVERY bin code was forced
          // into a flat FloorLocation string, so Rack allotment from the Excel sheet's BIN
          // column was silently dropped even when it referenced a real rack bin.
          const matchedBin = await findBin(targetWarehouse.id, binCode);

          if (matchedBin) {
            resolvedBinId = matchedBin.id;
            resolvedRackId = matchedBin.rackId;
            resolvedWarehouseId = targetWarehouse.id;
          } else {
            // Not a recognised rack bin — check for an existing floor location. Per the
            // warehouse-map validation added upstream: never silently auto-create a bin that
            // isn't on the physical warehouse map (this used to call getOrCreateFloorLocation
            // and invent a new floor code on the fly, which let typos/unmapped bins slip into
            // Inventory undetected).
            const floorLoc = await prisma.floorLocation.findFirst({
              where: { code: binCode, warehouseId: targetWarehouse.id },
            });

            if (!floorLoc) {
              const err: any = new Error(
                `Bin "${binCode}" does not exist in warehouse "${targetWarehouse.code}". ` +
                `Please check the warehouse map and verify the bin location for material "${row.materialCode}" before committing.`
              );
              err.statusCode = 400;
              throw err;
            }

            resolvedFloorLocationId = floorLoc.id;
            resolvedWarehouseId = floorLoc.warehouseId;
          }
        }

        // No consolidation — every Inward row becomes its own separate InventoryBatch record,
        // full stop. This used to merge rows sharing material+invoice(+type) into one summed
        // batch (and FG05 was a special-cased exception to that). Per explicit request, that
        // merging is now off everywhere: each physical pallet/line item you approve in Inward
        // shows up as its own distinct row in Inventory with its own pallets/kg/nos, instead of
        // being folded into a combined total with other rows of the same material. So there is
        // no "existing batch" to look up or merge into — every row always creates a fresh one.

        // ── Rack bin capacity check ────────────────────────────────────────────
        // Each rack bin holds exactly ONE pallet. Floor locations have no such limit. Since
        // consolidation is off (every row is always a brand-new InventoryBatch, never a merge
        // into an existing one — see note above), there's no "this is the same batch being
        // re-committed" case to exempt: any occupant at all means the slot is taken.
        if (resolvedBinId) {
          const occupant = await prisma.inventoryBatch.findFirst({
            where: { binId: resolvedBinId, quantity: { gt: 0 } },
            include: { material: true },
          });
          if (occupant) {
            const binCode = (row.binLocation || '').trim();
            const occupantCode = occupant.material?.code || 'another pallet';
            const err: any = new Error(
              `Rack bin "${binCode}" is already occupied by material "${occupantCode}". ` +
              `Each rack bin holds exactly one pallet. Choose an empty rack bin.`
            );
            err.statusCode = 400;
            throw err;
          }
        }

        const rowType = (row.materialType || '').toString().trim();

        invCustomFieldsObj.huUnits = rowHU ? [rowHU] : [];
        invCustomFieldsObj.huUnit = rowHU;

        // `batchNo` = the real manufacturer/lot batch number from the sheet's "Batch No" column
        // — kept fully separate from `invoiceNo`/the internal `batchKey` grouping key above,
        // which is what inward has always used to identify a shipment.
        const rowBatchNo = (row.batchNo || '').toString().trim();
        invCustomFieldsObj.batchNos = rowBatchNo ? [rowBatchNo] : [];
        invCustomFieldsObj.batchNo = rowBatchNo;

        invCustomFieldsObj.materialTypes = rowType ? [rowType] : [];
        invCustomFieldsObj.materialType = rowType;

        // Always create a fresh InventoryBatch — no merge/update path, see note above.
        inventoryBatchesData.push({
          materialId: material.id,
          batchNumber: batchKey,
          quantity: receivedQty,
          warehouseId: resolvedWarehouseId,
          rackId: resolvedRackId,
          binId: resolvedBinId,
          floorLocationId: resolvedFloorLocationId,
          receiptDate: parseInwardDate(row.date),
          stockStatus: hasDiscrepancy ? "DISCREPANCY" : "GOOD",
          customFields: JSON.stringify(invCustomFieldsObj),
        });
      }
      for (const c of chunk(inventoryBatchesData, 1000)) {
        await tx.inventoryBatch.createMany({ data: c });
      }

      if (first.truckNumber) {
        await tx.truckMovement.create({
          data: {
            truckNumber: first.truckNumber,
            movementType: "INBOUND",
            status: "UNLOADING_COMPLETED",
            transporter: first.transporter || null,
            source: first.source || null,
            lrNumber: first.lrNumber || null,
            sealNumber: first.sealNumber || null,
            sapDocumentNo: first.sapDocumentNumber || null,
            gateEntryNo: first.gateSerialNo || null,
          },
        });
      }

      return { inwardEntry };
      }, { timeout: 60000, maxWait: 15000 }); // large groups (thousands of rows) need more than Prisma's 5s default transaction timeout
    }

    res.json({ success: true, message: "Inward entries committed successfully" });
  } catch (error: any) {
    console.error(error);
    // 400 for validation errors (e.g. bin not found in warehouse map), 500 for unexpected errors
    const status = error.statusCode === 400 ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});


// GET discrepancy records — inward line items with non-zero short/excess
router.get('/discrepancies', async (req, res) => {
  try {
    const { from, to } = req.query;
    const where: any = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) { const d = new Date(String(to)); d.setHours(23,59,59,999); where.createdAt.lte = d; }
    }
    const entries = await prisma.inwardEntry.findMany({
      where,
      include: { lineItems: true },
      orderBy: { createdAt: 'desc' },
    });

    const rows: any[] = [];
    for (const entry of entries) {
      for (const item of entry.lineItems) {
        let cf: any = {};
        try { cf = JSON.parse(item.customFields || '{}'); } catch {}
        const shortPallet   = Number(cf.shortInPallet    || 0);
        const shortExcess   = Number(cf.shortExcessInKg  || 0);
        const shortQty      = Number(cf.shortExcessInQty || 0);
        const isDiscrepancyStatus = item.lineItemStatus === 'DISCREPANCY';
        if (shortPallet === 0 && shortExcess === 0 && shortQty === 0 && !cf.discrepancyRemarks && !isDiscrepancyStatus) continue;
        rows.push({
          id: item.id,
          entryId: entry.id,
          inwardNumber: entry.inwardNumber,
          date: entry.createdAt,
          truckNumber: entry.truckNumber,
          source: entry.source,
          invoiceNumber: entry.invoiceNumber,
          materialCode: item.materialCode,
          description: item.description,
          huUnit: item.huUnit,
          materialType: cf.materialType || '',
          category: cf.category || entry.category || '',
          invoiceQtyInPallet: cf.invoiceQtyInPallet,
          invoiceQtyInNos: cf.invoiceQtyInNos,
          invoiceNetWeight: cf.invoiceNetWeight,
          receivedQtyInPallets: cf.receivedQtyInPallets,
          receivedQtyInNos: cf.receivedQtyInNos,
          receivedNetWeight: cf.receivedNetWeight,
          shortInPallet: shortPallet,
          shortExcessInKg: shortExcess,
          shortExcessInQty: shortQty,
          discrepancyRemarks: cf.discrepancyRemarks || '',
        });
      }
    }
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// DELETE a single line item (used for discrepancy report row deletion)
router.delete('/line-item/:id', requireRole('ADMIN', 'WORKER'), async (req, res) => {
  try {
    const lineItemId: string = String(req.params.id);
    await prisma.inwardLineItem.delete({ where: { id: lineItemId } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requireRole('ADMIN', 'WORKER'), async (req, res) => {
  try {
    const id: string = String(req.params.id);
    // Delete children first (no cascade on schema)
    await prisma.inwardLineItem.deleteMany({ where: { inwardEntryId: id } });
    await prisma.inwardEntry.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
