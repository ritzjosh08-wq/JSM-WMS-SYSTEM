"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function fetchFIFORecommendation(materialCode: string, requiredQty: number) {
  const material = await prisma.material.findUnique({ where: { code: materialCode } });
  if (!material) return [];

  const batches = await prisma.inventoryBatch.findMany({
    where: { 
      materialId: material.id,
      quantity: { gt: 0 },
      stockStatus: "GOOD" // only recommend good stock
    },
    include: { warehouse: true, rack: true, floorLocation: true },
    orderBy: { receiptDate: 'asc' }
  });

  let remaining = requiredQty;
  const recommendations = [];

  for (const batch of batches) {
    if (remaining <= 0) break;
    const pickQty = Math.min(batch.quantity, remaining);
    recommendations.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      warehouse: batch.warehouse.name,
      location: batch.rack?.code || batch.floorLocation?.code || "Unassigned",
      available: batch.quantity,
      recommendedPick: pickQty,
      receiptDate: batch.receiptDate,
    });
    remaining -= pickQty;
  }

  return recommendations;
}

export async function createOutwardEntry(data: any) {
  const outward = await prisma.outwardEntry.create({
    data: {
      outwardNumber: `OUT-${Date.now()}`,
      truckNumber: data.truckNumber,
      transporter: data.transporter,
      destination: data.destination,
      sapDocumentNo: data.sapDocumentNo,
      dispatchDate: new Date(),
      status: "DISPATCHED",
      lineItems: {
        create: data.picks.map((pick: any) => ({
          materialCode: data.materialCode,
          batchNumber: pick.batchNumber,
          requiredQty: data.requiredQty,
          pickedQty: pick.pickQty,
          warehouseId: pick.warehouseId,
        }))
      }
    }
  });

  // Reduce inventory
  for (const pick of data.picks) {
    const batch = await prisma.inventoryBatch.findUnique({ where: { id: pick.batchId } });
    if (batch) {
      await prisma.inventoryBatch.update({
        where: { id: batch.id },
        data: { quantity: batch.quantity - pick.pickQty }
      });

      // Update warehouse capacity
      const wh = await prisma.warehouse.findUnique({ where: { id: batch.warehouseId } });
      if (wh) {
        await prisma.warehouse.update({
          where: { id: wh.id },
          data: { usedCapacity: Math.max(0, wh.usedCapacity - pick.pickQty) }
        });
      }
    }
  }

  // Create truck movement
  await prisma.truckMovement.create({
    data: {
      truckNumber: data.truckNumber,
      movementType: "OUTBOUND",
      status: "DISPATCHED",
      transporter: data.transporter,
      destination: data.destination,
    }
  });

  revalidatePath('/outward');
  revalidatePath('/inventory');
  revalidatePath('/dashboard');

  return outward;
}
