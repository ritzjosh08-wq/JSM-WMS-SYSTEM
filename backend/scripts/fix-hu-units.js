// One-time backfill / repair script for the Outward Dispatch "HU unit not found" bug.
//
// ROOT CAUSE: multiple Excel inward rows (one per physical pallet) that share the same
// material code + invoice number all aggregate into ONE InventoryBatch record. Each pallet
// can have its own unique HU tag, but the commit code used to overwrite the batch's
// customFields.huUnit with whichever row was processed LAST — silently discarding every
// other pallet's tag. So scanning the tag that happened to survive worked; scanning any of
// the other (still valid, in-stock) tags found nothing. This has been fixed going forward
// in backend/src/routes/inward.ts (now accumulates a `huUnits` array instead of overwriting).
//
// This script repairs EXISTING data already committed before that fix: it rebuilds the full
// `huUnits` list for every InventoryBatch from all of its InwardLineItem rows, and also
// corrects each line item's own huUnit column to prefer the discrepancy-corrected
// actualHuUnit over the original invoice value.
//
// Run with (from the backend/ folder, on the machine where the app normally runs):
//   node scripts/fix-hu-units.js
//
// Safe to re-run — it's idempotent (skips anything already correct).

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function safeParse(s) {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

async function main() {
  const lineItems = await prisma.inwardLineItem.findMany({});
  console.log(`Found ${lineItems.length} inward line items.`);

  // ── Step 1: fix each line item's own huUnit to prefer actualHuUnit ─────────
  let lineItemsFixed = 0;
  for (const li of lineItems) {
    const cf = safeParse(li.customFields);
    const actual = (cf.actualHuUnit || '').toString().trim();
    const current = (li.huUnit || '').toString().trim();
    if (actual && actual !== current) {
      await prisma.inwardLineItem.update({ where: { id: li.id }, data: { huUnit: actual } });
      lineItemsFixed++;
    }
  }
  console.log(`Line items corrected (actualHuUnit applied): ${lineItemsFixed}`);

  // ── Step 2: rebuild huUnits[] per (materialCode, batchNumber) group ────────
  const groups = new Map(); // key "code::batch" -> ordered array of distinct HU tags
  for (const li of lineItems) {
    const cf = safeParse(li.customFields);
    const tag = ((cf.actualHuUnit || li.huUnit || '') + '').trim();
    if (!tag) continue;
    const key = `${li.materialCode}::${li.batchNumber}`;
    if (!groups.has(key)) groups.set(key, []);
    const arr = groups.get(key);
    if (!arr.some(t => t.toLowerCase() === tag.toLowerCase())) arr.push(tag);
  }
  console.log(`Rebuilt HU-tag groups for ${groups.size} material+batch combinations.`);

  let batchesFixed = 0;
  let skippedNoMatch = 0;
  for (const [key, tags] of groups) {
    const [code, batchNumber] = key.split('::');
    const material = await prisma.material.findUnique({ where: { code } });
    if (!material) { skippedNoMatch++; continue; }

    const batch = await prisma.inventoryBatch.findFirst({
      where: { materialId: material.id, batchNumber },
    });
    if (!batch) { skippedNoMatch++; continue; }

    const bcf = safeParse(batch.customFields);
    const existingTags = Array.isArray(bcf.huUnits) ? bcf.huUnits : (bcf.huUnit ? [bcf.huUnit] : []);
    const same = existingTags.length === tags.length &&
      existingTags.every((t, i) => (t || '').toLowerCase() === (tags[i] || '').toLowerCase());
    if (same) continue;

    bcf.huUnits = tags;
    bcf.huUnit = tags[tags.length - 1] || bcf.huUnit || '';
    await prisma.inventoryBatch.update({
      where: { id: batch.id },
      data: { customFields: JSON.stringify(bcf) },
    });
    batchesFixed++;
    console.log(`Fixed ${code} / batch ${batchNumber}: now tracks ${tags.length} HU tag(s) -> [${tags.join(', ')}]`);
  }

  console.log('\n-- Summary --------------------------');
  console.log(`Line items corrected:        ${lineItemsFixed}`);
  console.log(`Inventory batches corrected: ${batchesFixed}`);
  console.log(`Skipped (no matching batch): ${skippedNoMatch}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
