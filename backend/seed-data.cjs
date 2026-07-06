// Seed a clean, correctly-formatted dataset into the shared WMS database so the
// software and the customer app both show real data for each customer's workers.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MATERIALS = [
  { code: 'HDPE-150',   description: 'HDPE Granules 150 Grade',        materialType: 'HDPE',  huUnit: 'KG',  category: 'RM' },
  { code: 'PP-220',     description: 'Polypropylene Granules 220',     materialType: 'PP',    huUnit: 'KG',  category: 'RM' },
  { code: 'LLDPE-350',  description: 'LLDPE Film Grade 350',           materialType: 'LLDPE', huUnit: 'KG',  category: 'RM' },
  { code: 'ABS-100',    description: 'ABS Engineering Plastic 100',    materialType: 'ABS',   huUnit: 'KG',  category: 'RM' },
  { code: 'PVC-S65',    description: 'PVC Suspension Grade S65',       materialType: 'PVC',   huUnit: 'KG',  category: 'RM' },
  { code: 'FG-BOX-01',  description: 'Finished Moulded Box A1',        materialType: 'FG',    huUnit: 'Nos', category: 'FG' },
  { code: 'FG-CRATE-02',description: 'Finished Crate C2',              materialType: 'FG',    huUnit: 'Nos', category: 'FG' },
];

function cf(o) {
  const base = {
    category: 'RM', materialType: '', huUnit: 'KG', pallets: 0, netWeight: 0, nos: 0,
    invoiceNo: '', sapDocNo: '', gateSerialNo: '', source: '',
    invoiceQtyInPallet: 0, receivedQtyInPallets: 0, invoiceQtyInNos: 0, receivedQtyInNos: 0,
    invoiceNetWeight: 0, receivedNetWeight: 0, numberOfBoxes: 0,
    shortInPallet: 0, shortExcessInKg: 0, shortExcessInQty: 0,
    discrepancyRemarks: '', tatRemarks: '', stockLocation: '', binLocation: '',
    inwardDate: '', createdBy: '', seeded: true,
  };
  return JSON.stringify(Object.assign(base, o));
}

const B = [
  // CM35 — Chennai PPD worker (RM + FG)
  { wh:'CM35', code:'HDPE-150', batch:'B-HDPE-2410', pal:12, kg:6000, nos:120, inv:'INV-CHN-1001', sap:'SAP-7781', gate:'G-3301', bin:'RACK-A-01', cat:'RM', mt:'HDPE' },
  { wh:'CM35', code:'PP-220',   batch:'B-PP-2411',   pal:8,  kg:4000, nos:80,  inv:'INV-CHN-1002', sap:'SAP-7782', gate:'G-3302', bin:'RACK-A-02', cat:'RM', mt:'PP' },
  { wh:'CM35', code:'LLDPE-350',batch:'B-LLD-2412',  pal:5,  kg:2500, nos:50,  inv:'INV-CHN-1003', sap:'SAP-7783', gate:'G-3303', bin:'RACK-A-03', cat:'RM', mt:'LLDPE' },
  { wh:'CM35', code:'ABS-100',  batch:'B-ABS-2413',  pal:6,  kg:3000, nos:60,  inv:'INV-CHN-1004', sap:'SAP-7784', gate:'G-3304', bin:'RACK-B-01', cat:'RM', mt:'ABS' },
  { wh:'CM35', code:'PVC-S65',  batch:'B-PVC-2414',  pal:9,  kg:4500, nos:90,  inv:'INV-CHN-1005', sap:'SAP-7785', gate:'G-3305', bin:'RACK-B-02', cat:'RM', mt:'PVC' },
  { wh:'CM35', code:'FG-BOX-01',batch:'B-FGBOX-01',  pal:4,  kg:800,  nos:400, boxes:400, inv:'INV-CHN-1006', sap:'SAP-7786', gate:'G-3306', bin:'FLOOR-F1', cat:'FG', mt:'FG' },
  { wh:'CM35', code:'FG-CRATE-02',batch:'B-FGCR-02', pal:3,  kg:600,  nos:300, boxes:300, inv:'INV-CHN-1007', sap:'SAP-7787', gate:'G-3307', bin:'FLOOR-F2', cat:'FG', mt:'FG' },
];

async function main() {
  const matId = {};
  for (const m of MATERIALS) {
    const ex = await prisma.material.findFirst({ where: { code: m.code } });
    if (ex) { matId[m.code] = ex.id; await prisma.material.update({ where: { id: ex.id }, data: m }); }
    else { const r = await prisma.material.create({ data: Object.assign({ isActive: true }, m) }); matId[m.code] = r.id; }
  }

  // Remove previously-seeded batches so re-running is idempotent
  const existing = await prisma.inventoryBatch.findMany();
  for (const b of existing) {
    try { if (JSON.parse(b.customFields || '{}').seeded) await prisma.inventoryBatch.delete({ where: { id: b.id } }); } catch {}
  }

  const whId = {};
  for (const code of ['CM35']) {
    const w = await prisma.warehouse.findFirst({ where: { code } });
    if (w) whId[code] = w.id;
  }

  const recv = new Date(Date.now() - 7 * 86400000);
  let n = 0;
  for (const b of B) {
    if (!whId[b.wh] || !matId[b.code]) continue;
    await prisma.inventoryBatch.create({ data: {
      materialId: matId[b.code], batchNumber: b.batch, quantity: b.nos,
      warehouseId: whId[b.wh], receiptDate: recv, stockStatus: 'AVAILABLE', lastMovementDate: new Date(),
      customFields: cf({
        category: b.cat, materialType: b.mt, huUnit: b.cat === 'FG' ? 'Nos' : 'KG',
        pallets: b.pal, netWeight: b.kg, nos: b.nos,
        invoiceNo: b.inv, sapDocNo: b.sap, gateSerialNo: b.gate, source: 'Excel Import 2025',
        invoiceQtyInPallet: b.pal, receivedQtyInPallets: b.pal,
        invoiceQtyInNos: b.nos, receivedQtyInNos: b.nos,
        invoiceNetWeight: b.kg, receivedNetWeight: b.kg, numberOfBoxes: b.boxes || 0,
        stockLocation: b.bin, binLocation: b.bin,
        inwardDate: recv.toLocaleDateString('en-GB'), createdBy: 'Import 2025',
      }),
    }});
    n++;
  }
  console.log('SEED OK — materials:', Object.keys(matId).length, 'batches:', n);
  await prisma.$disconnect();
}
main().catch(e => { console.error('SEED FAILED', e); process.exit(1); });
