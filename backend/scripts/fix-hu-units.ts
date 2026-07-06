// One-time backfill: corrects InventoryBatch / InwardLineItem records that were committed
// before the huUnit-vs-actualHuUnit fix. When a discrepancy review recorded a different
// *actual* HU tag than the invoice's original huUnit, the batch's stored huUnit (used by
// Outward Dispatch's HU-unit search) was left pointing at the stale invoice value instead
// of the physically-verified tag — so scanning the real tag on the pallet found nothing.
//
// This script finds every InwardLineItem where customFields.actualHuUnit is set and differs
// from the stored huUnit, then updates both the line item and the matching InventoryBatch
// to use the actual/corrected HU tag.
//
// Run with:  npx ts-node scripts/fix-hu-units.ts   (from the backend/ folder)

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function safeParse(s: string | null | undefined): any {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

async function main() {
  const lineItems = await prisma.inwardLineItem.findMany({
    include: { inwardEntry: true },
  });

  let lineItemsFixed = 0;
  let batchesFixed = 0;
  let skippedNoMatch = 0;

  for (const li of lineItems) {
    const cf = safeParse(li.customFields);
    const actual = (cf.actualHuUnit || '').toString().trim();
    const current = (li.huUnit || '').toString().trim();

    if (!actual || actual === current) continue; // nothing to correct

    // ── Fix the line item itself ──────────────────────────────────────────
    await prisma.inwardLineItem.update({
      where: { id: li.id },
      data: { huUnit: actual },
    });
    lineItemsFixed++;

    // ── Fix the matching InventoryBatch (materialCode + batchNumber) ─────
    const material = await prisma.material.findUnique({ where: { code: li.materialCode } });
    if (!material) { skippedNoMatch++; continue; }

    const batch = await prisma.inventoryBatch.findFirst({
      where: { materialId: material.id, batchNumber: li.batchNumber },
    });
    if (!batch) { skippedNoMatch++; continue; }

    const bcf = safeParse(batch.customFields);
    if ((bcf.huUnit || '').toString().trim() === actual) continue; // already correct

    bcf.huUnit = actual;
    await prisma.inventoryBatch.update({
      where: { id: batch.id },
      data: { customFields: JSON.stringify(bcf) },
    });
    batchesFixed++;

    console.log(`Fixed ${li.materialCode} / batch ${li.batchNumber}: huUnit "${current}" -> "${actual}"`);
  }

  console.log('\n── Summary ──────────────────────────');
  console.log(`Line items corrected:   ${lineItemsFixed}`);
  console.log(`Inventory batches corrected: ${batchesFixed}`);
  console.log(`Skipped (no matching batch): ${skippedNoMatch}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
