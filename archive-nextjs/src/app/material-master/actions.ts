"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createMaterial(data: {
  code: string;
  description: string;
  materialType: string;
  huUnit: string;
  category?: string;
  defaultStorageType?: string;
  standardPackSize?: number;
  minStockLevel?: number;
  maxStockLevel?: number;
}) {
  await prisma.material.create({
    data,
  });
  revalidatePath('/material-master');
}

export async function updateMaterial(id: string, data: any) {
  await prisma.material.update({
    where: { id },
    data,
  });
  revalidatePath('/material-master');
}

export async function toggleMaterialStatus(id: string, isActive: boolean) {
  await prisma.material.update({
    where: { id },
    data: { isActive },
  });
  revalidatePath('/material-master');
}
