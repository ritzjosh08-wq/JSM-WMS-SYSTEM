import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const materials = await prisma.material.findMany({ where: { isActive: true } });
    res.json(materials);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
