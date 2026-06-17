import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting Database Seeding...');

  // 1. Create Default User (Operator)
  const operator = await prisma.user.upsert({
    where: { username: 'operator1' },
    update: {},
    create: {
      username: 'operator1',
      name: 'Warehouse Operator',
      role: 'OPERATOR',
    },
  });
  console.log('Created Operator:', operator.name);

  // 2. Create Warehouses
  const cm35 = await prisma.warehouse.upsert({
    where: { code: 'CM35' },
    update: {},
    create: {
      code: 'CM35',
      name: 'Main Warehouse CM35',
      storageType: 'BOTH',
      totalCapacity: 10000,
    },
  });

  const cm36 = await prisma.warehouse.upsert({
    where: { code: 'CM36' },
    update: {},
    create: {
      code: 'CM36',
      name: 'Floor Storage CM36',
      storageType: 'FLOOR',
      totalCapacity: 5000,
    },
  });

  const fg05 = await prisma.warehouse.upsert({
    where: { code: 'FG05' },
    update: {},
    create: {
      code: 'FG05',
      name: 'Finished Goods FG05',
      storageType: 'FLOOR',
      totalCapacity: 7500,
    },
  });
  console.log('Created Warehouses CM35, CM36, FG05');

  // 3. Create Sample Materials
  const materials = [
    { code: 'MAT-001', description: 'CFC Sheet 5x5', materialType: 'CFC Sheet', huUnit: 'Nos' },
    { code: 'MAT-002', description: 'Poly Reel 10kg', materialType: 'Poly Reel', huUnit: 'Nos' },
    { code: 'MAT-003', description: 'Granules HDPE', materialType: 'Granules', huUnit: 'Kg' },
    { code: 'MAT-004', description: 'Kraft Reel', materialType: 'Kraft Reel', huUnit: 'Nos' },
    { code: 'MAT-005', description: 'Paper Board A4', materialType: 'Paper Board', huUnit: 'Kg' },
  ];

  for (const mat of materials) {
    await prisma.material.upsert({
      where: { code: mat.code },
      update: {},
      create: mat,
    });
  }
  console.log('Created Sample Materials');

  // 4. Create Exact Racks for CM35
  const rmRacks = ['Rack A', 'Rack B', 'Rack H', 'Rack I'];
  const fgRacks = ['Rack N', 'Rack O', 'Rack P', 'Rack Q'];

  for (const rackName of [...rmRacks, ...fgRacks]) {
    const rack = await prisma.rack.create({
      data: {
        warehouseId: cm35.id,
        code: rackName,
        totalCapacity: 1000,
      }
    });

    const row = await prisma.rackRow.create({
      data: { rackId: rack.id, code: `${rackName}-Row1` }
    });

    const level = await prisma.rackLevel.create({
      data: { rowId: row.id, code: 'L1' }
    });

    await prisma.bin.createMany({
      data: [
        { code: `${rackName}-BIN-1`, capacity: 100, rackId: rack.id, levelId: level.id },
        { code: `${rackName}-BIN-2`, capacity: 100, rackId: rack.id, levelId: level.id },
      ]
    });
  }
  console.log('Created Exact Rack Structure (A, B, H, I for RM and N, O, P, Q for FG) for CM35');

  // 5. Create Floor Locations
  await prisma.floorLocation.create({
    data: {
      warehouseId: cm36.id,
      zone: 'Zone A',
      code: 'FL-A1',
      capacity: 500,
    }
  });
  await prisma.floorLocation.create({
    data: {
      warehouseId: fg05.id,
      zone: 'Zone B',
      code: 'FL-B1',
      capacity: 800,
    }
  });
  console.log('Created Floor Locations');

  console.log('Seeding Complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
