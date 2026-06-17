import { prisma } from "@/lib/prisma";
import CycleCountClient from "./CycleCountClient";
import { ClipboardList } from "lucide-react";

export const metadata = {
  title: "Cycle Count — JSM Logistics WMS",
  description: "Inventory reconciliation: New Master = (Existing − Inward) − Outward",
};

export default async function CycleCountPage() {
  // ── Fetch inventory snapshot
  const inventory = await prisma.inventoryBatch.findMany({
    include: { material: true, warehouse: true },
    orderBy: { lastMovementDate: "desc" },
  });

  // ── Fetch recent inward entries (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const inwardItems = await prisma.inwardLineItem.findMany({
    where: { inwardEntry: { createdAt: { gte: thirtyDaysAgo } } },
    include: { inwardEntry: true },
  });

  const outwardItems = await prisma.outwardLineItem.findMany({
    where: { outwardEntry: { createdAt: { gte: thirtyDaysAgo } } },
    include: { outwardEntry: true },
  });

  // ── Compute cycle-count rows: group by materialCode
  type CycleRow = {
    materialCode: string;
    description: string;
    category: string;
    existingQty: number;   // from InventoryBatch
    inwardQty: number;     // inward last 30d
    outwardQty: number;    // outward last 30d
    computedQty: number;   // (existing - inward) - outward
    warehouse: string;
    huUnit: string;
  };

  const rowMap = new Map<string, CycleRow>();

  for (const batch of inventory) {
    const code = batch.material.code;
    if (!rowMap.has(code)) {
      rowMap.set(code, {
        materialCode: code,
        description: batch.material.description,
        category: batch.material.category || batch.material.materialType || "—",
        existingQty: 0,
        inwardQty: 0,
        outwardQty: 0,
        computedQty: 0,
        warehouse: batch.warehouse.name,
        huUnit: batch.material.huUnit,
      });
    }
    rowMap.get(code)!.existingQty += batch.quantity;
  }

  for (const item of inwardItems) {
    const code = item.materialCode;
    if (!rowMap.has(code)) {
      rowMap.set(code, {
        materialCode: code, description: code, category: "—",
        existingQty: 0, inwardQty: 0, outwardQty: 0, computedQty: 0,
        warehouse: "—", huUnit: "Nos",
      });
    }
    rowMap.get(code)!.inwardQty += item.quantity;
  }

  for (const item of outwardItems) {
    const code = item.materialCode;
    if (!rowMap.has(code)) {
      rowMap.set(code, {
        materialCode: code, description: code, category: "—",
        existingQty: 0, inwardQty: 0, outwardQty: 0, computedQty: 0,
        warehouse: "—", huUnit: "Nos",
      });
    }
    rowMap.get(code)!.outwardQty += item.pickedQty;
  }

  // Apply formula: computed = (existing - inward) - outward
  const rows: CycleRow[] = Array.from(rowMap.values()).map((r) => ({
    ...r,
    computedQty: r.existingQty - r.inwardQty - r.outwardQty,
  }));

  // ── Summary stats
  const totalMaterials = rows.length;
  const totalInward = inwardItems.reduce((s, i) => s + i.quantity, 0);
  const totalOutward = outwardItems.reduce((s, i) => s + i.pickedQty, 0);
  const totalExisting = rows.reduce((s, r) => s + r.existingQty, 0);
  const totalComputed = rows.reduce((s, r) => s + r.computedQty, 0);

  return (
    <CycleCountClient
      rows={rows}
      stats={{ totalMaterials, totalInward, totalOutward, totalExisting, totalComputed }}
      generatedAt={new Date().toISOString()}
    />
  );
}
