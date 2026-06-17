import express from 'express';
import { PrismaClient } from '@prisma/client';

// xlsx is required: run `npm install xlsx` in the backend folder
let XLSX: any = null;
try { XLSX = require('xlsx'); } catch { /* xlsx not installed yet */ }

const router = express.Router();
const prisma = new PrismaClient();

// ── POST /parse-excel — accepts base64-encoded Excel file, returns parsed row data
// Frontend sends: { fileBase64: string, fileName: string }
router.post('/parse-excel', express.json({ limit: '25mb' }), (req, res) => {
  if (!XLSX) {
    return res.status(500).json({ error: 'xlsx package not installed on backend. Run: npm install xlsx in the backend folder.' });
  }
  try {
    const { fileBase64, fileName } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'fileBase64 is required' });

    const buf = Buffer.from(fileBase64, 'base64');
    const wb = XLSX.read(buf, { type: 'buffer', raw: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (!rawData.length) return res.json({ headers: [], rows: [] });

    // Find header row (first row with at least 3 non-empty cells)
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(5, rawData.length); i++) {
      if (rawData[i].filter((c: any) => String(c).trim()).length >= 3) { headerRowIdx = i; break; }
    }
    const headers: string[] = rawData[headerRowIdx].map((h: any) => String(h).trim());
    const dataRows = rawData.slice(headerRowIdx + 1).filter((r: any[]) => r.some((c: any) => String(c).trim()));

    // Helper: convert Excel date serial to DD-MM-YYYY string (no timezone conversion)
    const excelSerialToDate = (serial: number): string => {
      const intSerial = Math.floor(serial);
      // Excel epoch = Dec 30, 1899 (accounts for Lotus 1-2-3 leap-year bug)
      const epoch = new Date(1899, 11, 30, 0, 0, 0, 0); // local midnight
      epoch.setDate(epoch.getDate() + intSerial);
      const d = String(epoch.getDate()).padStart(2, '0');
      const m = String(epoch.getMonth() + 1).padStart(2, '0');
      const y = epoch.getFullYear();
      return `${d}-${m}-${y}`;
    };

    // Helper: convert Excel time serial to HH:MM string
    const excelSerialToTime = (serial: number): string => {
      const frac = serial - Math.floor(serial); // fractional day
      const totalMins = Math.round(frac * 24 * 60);
      const h = Math.floor(totalMins / 60) % 24;
      const m = totalMins % 60;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    };

    // Convert each cell value to a typed result
    const convertCell = (val: any, headerName: string): any => {
      if (val === '' || val === null || val === undefined) return '';
      // Date column
      const isDateCol = /^date$/i.test(headerName.trim());
      const isTimeCol = /time|tat/i.test(headerName.trim());
      if (typeof val === 'number') {
        if (isDateCol && val > 1000) return excelSerialToDate(val);
        if (isTimeCol && val >= 0 && val < 1) return excelSerialToTime(val);
        if (isTimeCol && val > 1) return excelSerialToTime(val); // datetime serial — extract time part
        if (isDateCol) return excelSerialToDate(val);
        return val; // numeric value
      }
      if (typeof val === 'string') {
        // Formula result strings — return as-is
        if (val.startsWith('=')) return val;
        return val.trim();
      }
      return String(val).trim();
    };

    const parsedRows = dataRows.map((row: any[]) => {
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => { obj[h] = convertCell(row[i], h); });
      return obj;
    });

    res.json({ headers, rows: parsedRows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET all inward entries (for reports)
router.get('/', async (req, res) => {
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
    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/commit', async (req, res) => {
  try {
    const entries = req.body.entries;
    const createdBy: string = req.body.createdBy || '';
    if (!entries || !entries.length) return res.status(400).json({ error: "No entries provided" });

    // Group entries by invoiceNumber so they share one InwardEntry header
    const groups = new Map();
    for (const e of entries) {
      const key = e.invoiceNumber || `MANUAL-${Date.now()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }

    // Find or auto-create a default warehouse so commit never fails due to missing warehouse
    let defaultWarehouse = await prisma.warehouse.findFirst();
    if (!defaultWarehouse) {
      defaultWarehouse = await prisma.warehouse.create({
        data: {
          code: 'WH-DEFAULT',
          name: 'JSM Main Warehouse',
          storageType: 'MIXED',
          isActive: true,
          totalCapacity: 999999,
          usedCapacity: 0,
        },
      });
    }

    for (const [invoiceKey, rows] of groups) {
      const first = rows[0];

      // Parse DD-MM-YYYY or YYYY-MM-DD or ISO date strings robustly using LOCAL time (no UTC shift)
      const parseInwardDate = (dateStr: string): Date => {
        if (!dateStr) return new Date();
        const ddmmyyyy = /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/.exec(dateStr.trim());
        if (ddmmyyyy) {
          // Use local midnight — avoids UTC-to-local day-shift in IST and other positive-offset zones
          return new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]), 0, 0, 0, 0);
        }
        const yyyymmdd = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(dateStr.trim());
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

      const inwardEntry = await prisma.inwardEntry.create({
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
          lineItems: {
            create: rows.map((row: any) => ({
              materialCode: row.materialCode || "UNKNOWN",
              quantity: row.receivedQtyInNos || row.invoiceQtyInNos || row.receivedNetWeight || 0,
              batchNumber: row.invoiceNumber || `BATCH-${Date.now()}`,
              warehouseId: defaultWarehouse.id,
              lineItemStatus: row.status,
              huUnit: row.huUnit || null,
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
                discrepancyRemarks: row.discrepancyRemarks,
                tatRemarks: row.tatRemarks,
                stockLocation: row.stockLocation,
                category: row.category,
              }),
            })),
          },
        },
      });

      // Update / create inventory batches
      for (const row of rows) {
        if (!row.materialCode) continue;

        let material = await prisma.material.findUnique({ where: { code: row.materialCode } });
        if (!material) {
          material = await prisma.material.create({
            data: {
              code: row.materialCode,
              description: row.description || row.materialCode,
              materialType: row.materialType || row.category || "RM",
              huUnit: row.huUnit || "Nos",
              category: row.category || "RM",
            },
          });
        }

        // Use the best available quantity — Nos first, then Pallets, then Net Weight
        const receivedQty =
          row.receivedQtyInNos   || row.invoiceQtyInNos    ||
          row.receivedQtyInPallets || row.invoiceQtyInPallet ||
          row.receivedNetWeight  || row.invoiceNetWeight   || 0;
        if (receivedQty <= 0) continue;

        const batchKey = row.invoiceNumber || row.sapDocumentNumber || "MANUAL";

        // Store all relevant quantities + inward date in customFields for the Inventory page
        const invCustomFields = JSON.stringify({
          netWeight:      row.receivedNetWeight    || row.invoiceNetWeight    || 0,
          pallets:        row.receivedQtyInPallets || row.invoiceQtyInPallet  || 0,
          nos:            row.receivedQtyInNos     || row.invoiceQtyInNos     || 0,
          numberOfBoxes:  row.numberOfBoxes        || 0,
          category:       row.category,
          binLocation:    row.binLocation,
          stockLocation:  row.stockLocation,
          huUnit:         row.huUnit,
          invoiceNo:      row.invoiceNumber,
          sapDocNo:       row.sapDocumentNumber,
          source:         row.source,
          status:         row.status,
          materialType:   row.materialType || "",
          inwardDate:     row.date || "",
        });

        // Create new inventory batch (no merging — same material+HU unit is an error above)
        const existing = await prisma.inventoryBatch.findFirst({
          where: { materialId: material.id, batchNumber: batchKey, warehouseId: defaultWarehouse.id },
        });

        if (existing) {
          await prisma.inventoryBatch.update({
            where: { id: existing.id },
            data: { quantity: existing.quantity + receivedQty, lastMovementDate: new Date(), customFields: invCustomFields },
          });
        } else {
          await prisma.inventoryBatch.create({
            data: {
              materialId: material.id,
              batchNumber: batchKey,
              quantity: receivedQty,
              warehouseId: defaultWarehouse.id,
              receiptDate: parseInwardDate(row.date),
              stockStatus: "GOOD",
              customFields: invCustomFields,
            },
          });
        }
      }

      if (first.truckNumber) {
        await prisma.truckMovement.create({
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
    }

    res.json({ success: true, message: "Inward entries committed successfully" });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
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
        const shortPallet = Number(cf.shortInPallet || 0);
        const shortExcess = Number(cf.shortExcessInKg || 0);
        const isDiscrepancyStatus = item.lineItemStatus === 'DISCREPANCY';
        if (shortPallet === 0 && shortExcess === 0 && !cf.discrepancyRemarks && !isDiscrepancyStatus) continue;
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
router.delete('/line-item/:id', async (req, res) => {
  try {
    await prisma.inwardLineItem.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.inwardLineItem.deleteMany({ where: { inwardEntryId: id } });
    await prisma.inwardEntry.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
