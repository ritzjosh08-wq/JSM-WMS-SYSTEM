import { prisma } from "@/lib/prisma";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage() {
  const inventory = await prisma.inventoryBatch.findMany({
    include: { material: true, warehouse: true, rack: true, floorLocation: true }
  });
  const inward = await prisma.inwardEntry.findMany({ orderBy: { createdAt: 'desc' } });
  const outward = await prisma.outwardEntry.findMany({ orderBy: { dispatchDate: 'desc' } });

  return <ReportsClient inventory={inventory} inward={inward} outward={outward} />;
}
