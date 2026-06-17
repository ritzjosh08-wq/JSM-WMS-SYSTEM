import { prisma } from "@/lib/prisma";
import InventoryClient from "./InventoryClient";

export default async function InventoryPage() {
  const inventory = await prisma.inventoryBatch.findMany({
    include: {
      material: true,
      warehouse: true,
      rack: true,
      bin: true,
      floorLocation: true,
    },
    orderBy: { receiptDate: 'asc' }
  });

  const warehouses = await prisma.warehouse.findMany({ where: { isActive: true } });

  return <InventoryClient inventory={inventory} warehouses={warehouses} />;
}
