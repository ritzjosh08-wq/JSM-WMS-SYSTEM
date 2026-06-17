import { prisma } from "@/lib/prisma";
import MaterialClient from "./MaterialClient";

export default async function MaterialMasterPage() {
  const materials = await prisma.material.findMany({
    orderBy: { code: "asc" },
  });

  return <MaterialClient initialMaterials={materials} />;
}
