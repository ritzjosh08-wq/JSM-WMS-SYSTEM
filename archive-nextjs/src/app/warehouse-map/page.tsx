import { prisma } from "@/lib/prisma";
import WarehouseMapClient from "./WarehouseMapClient";

export default async function WarehouseMapPage() {
  const warehouses = await prisma.warehouse.findMany({ where: { isActive: true } });

  return <WarehouseMapClient warehouses={warehouses} />;
}
