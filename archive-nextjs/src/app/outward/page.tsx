import { prisma } from "@/lib/prisma";
import OutwardClient from "./OutwardClient";

export default async function OutwardPage() {
  const materials = await prisma.material.findMany({ where: { isActive: true } });

  return <OutwardClient materials={materials} />;
}
