import { prisma } from "@/lib/prisma";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const warehouses = await prisma.warehouse.findMany({
    orderBy: { code: "asc" },
  });

  return <SettingsClient initialWarehouses={warehouses} />;
}
