"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function relocateInventory(batchId: string, newLocation: { warehouseId: string; rackId?: string; binId?: string; floorLocationId?: string }, remarks: string) {
  const batch = await prisma.inventoryBatch.findUnique({ where: { id: batchId }, include: { warehouse: true } });
  if (!batch) throw new Error("Batch not found");

  // Audit log or StockMovement record
  await prisma.stockMovement.create({
    data: {
      materialCode: batch.materialId, // using id here due to relation
      batchNumber: batch.batchNumber,
      fromLocation: batch.warehouse.code,
      toLocation: newLocation.warehouseId, // in real scenario, format the name
      quantity: batch.quantity,
      movementType: "RELOCATION",
      operator: "Operator",
      remarks,
    }
  });

  await prisma.inventoryBatch.update({
    where: { id: batchId },
    data: {
      warehouseId: newLocation.warehouseId,
      rackId: newLocation.rackId || null,
      binId: newLocation.binId || null,
      floorLocationId: newLocation.floorLocationId || null,
      lastMovementDate: new Date(),
    }
  });

  revalidatePath('/inventory');
}
