import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const app = express();

// ── Startup migration: add columns that may be missing from older DB
async function runMigrations() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "OutwardEntry" ADD COLUMN "lrNumber" TEXT`);
    console.log('Migration: added lrNumber to OutwardEntry');
  } catch {}
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "OutwardLineItem" ADD COLUMN "description" TEXT`);
    console.log('Migration: added description to OutwardLineItem');
  } catch {}
}
runMigrations();

app.use(cors());
app.use(express.json());

import inwardRouter from './routes/inward';
import dashboardRouter from './routes/dashboard';
import inventoryRouter from './routes/inventory';
import cycleCountRouter from './routes/cycle-count';
import outwardRouter from './routes/outward';
import materialsRouter from './routes/materials';
import authRouter from './routes/auth';
import warehouseRouter from './routes/warehouse';

app.use('/api/inward', inwardRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/cycle-count', cycleCountRouter);
app.use('/api/outward', outwardRouter);
app.use('/api/materials', materialsRouter);
app.use('/api/auth', authRouter);
app.use('/api/warehouse', warehouseRouter);

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'PostgreSQL connected' });
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
