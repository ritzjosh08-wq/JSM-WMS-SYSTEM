"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export interface ManualEntryPayload {
  // Header (shipment-level)
  date: string;
  gateSerialNo: string;
  source: string;
  invoiceNumber: string;
  sapDocumentNumber: string;
  lrNumber: string;
  sealNumber: string;
  truckNumber: string;
  transporter: string;
  category: string;
  stockLocation: string;
  truckInTime: string;
  unloadStartTime: string;
  unloadEndTime: string;
  truckOutTime: string;
  tat: string;
  tatRemarks: string;
  // Line-item level
  materialCode: string;
  description: string;
  huUnit: string;
  actualHuUnit: string;
  actualDescription: string;
  binLocation: string;
  invoiceQtyInPallet: number;
  invoiceQtyInNos: number;
  invoiceNetWeight: number;
  receivedQtyInPallets: number;
  receivedQtyInNos: number;
  receivedQtyInKgs: number;
  receivedNetWeight: number;
  netWeight: number;
  receivedPalletCount: number;
  numberOfBoxes: number;
  boxPerKg: number;
  shortInPallet: number;
  shortExcessInKg: number;
  remarks: string;
  discrepancyRemarks: string;
  status: string; // APPROVED | DISCREPANCY
}

export async function commitInwardEntries(entries: ManualEntryPayload[]) {
  if (!entries.length) throw new Error("No entries provided");

  // Group entries by invoiceNumber so they share one InwardEntry header
  const groups = new Map<string, ManualEntryPayload[]>();
  for (const e of entries) {
    const key = e.invoiceNumber || `MANUAL-${Date.now()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  // Find a default warehouse (fallback)
  const defaultWarehouse = await prisma.warehouse.findFirst();
  if (!defaultWarehouse) throw new Error("No warehouse configured. Please set up at least one warehouse.");

  for (const [invoiceKey, rows] of groups) {
    const first = rows[0];

    // Parse truck times to DateTime if provided
    const parseTime = (dateStr: string, timeStr: string): Date | null => {
      if (!dateStr || !timeStr) return null;
      try {
        const [h, m] = timeStr.split(":").map(Number);
        const d = new Date(dateStr);
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
        }),
        lineItems: {
          create: rows.map((row) => ({
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
      include: { lineItems: true },
    });

    // Update / create inventory batches
    for (const row of rows) {
      if (!row.materialCode) continue;

      // Try to find existing material
      let material = await prisma.material.findUnique({ where: { code: row.materialCode } });
      if (!material) {
        // Auto-create material if not found
        material = await prisma.material.create({
          data: {
            code: row.materialCode,
            description: row.description || row.materialCode,
            materialType: row.category || "RM",
            huUnit: row.huUnit || "Nos",
            category: row.category || "RM",
          },
        });
      }

      const receivedQty = row.receivedQtyInNos || row.invoiceQtyInNos || 0;
      if (receivedQty <= 0) continue;

      const existing = await prisma.inventoryBatch.findFirst({
        where: {
          materialId: material.id,
          batchNumber: row.invoiceNumber || "MANUAL",
          warehouseId: defaultWarehouse.id,
        },
      });

      if (existing) {
        await prisma.inventoryBatch.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + receivedQty },
        });
      } else {
        await prisma.inventoryBatch.create({
          data: {
            materialId: material.id,
            batchNumber: row.invoiceNumber || "MANUAL",
            quantity: receivedQty,
            warehouseId: defaultWarehouse.id,
            receiptDate: new Date(row.date || Date.now()),
            stockStatus: "GOOD",
            customFields: JSON.stringify({
              netWeight: row.receivedNetWeight || row.invoiceNetWeight,
              pallets: row.receivedQtyInPallets || row.invoiceQtyInPallet,
              category: row.category,
              binLocation: row.binLocation,
              huUnit: row.huUnit,
            }),
          },
        });
      }
    }

    // Create truck movement record
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

  revalidatePath("/inward");
  revalidatePath("/inventory");
  revalidatePath("/cycle-count");
  revalidatePath("/");
}
