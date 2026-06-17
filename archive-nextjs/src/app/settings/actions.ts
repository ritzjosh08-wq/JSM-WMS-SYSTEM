"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateWarehouse(id: string, data: { name: string; isActive: boolean }) {
  await prisma.warehouse.update({
    where: { id },
    data,
  });
  revalidatePath('/settings');
}

export async function createWarehouse(data: { code: string; name: string; storageType: string; totalCapacity: number }) {
  await prisma.warehouse.create({
    data,
  });
  revalidatePath('/settings');
}
