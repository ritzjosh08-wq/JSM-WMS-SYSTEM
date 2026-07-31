import express from 'express';
import { prisma } from '../lib/prisma';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const materials = await prisma.material.findMany({ where: { isActive: true } });
    res.json(materials);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
