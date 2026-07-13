import express from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { requireAuth, requireRole } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET: string = process.env.JWT_SECRET || 'insecure-dev-secret-change-me';
const TOKEN_TTL = '12h';

// ── Persistence files ────────────────────────────────────────────────────────
const PERMS_FILE  = path.join(__dirname, '../../customer-permissions.json');
const USERS_FILE  = path.join(__dirname, '../../dynamic-users.json');

function loadCustomerPerms(): Record<string, string[]> {
  try {
    if (fs.existsSync(PERMS_FILE)) return JSON.parse(fs.readFileSync(PERMS_FILE, 'utf-8'));
  } catch {}
  return {};
}
function saveCustomerPerms(perms: Record<string, string[]>) {
  fs.writeFileSync(PERMS_FILE, JSON.stringify(perms, null, 2));
}

interface UserRecord {
  username:      string;
  password:      string;
  name:          string;
  role:          'ADMIN' | 'WORKER' | 'CUSTOMER';
  location:      string;
  warehouseCode?: string;   // ← PRIMARY warehouse this worker manages (e.g. "CM35")
  // Optional: set when a WORKER is shared across more than one warehouse (e.g. a common
  // floor worker who handles both CM35 and FG05). When present, this worker's session is
  // scoped to ALL of these warehouses (like a CUSTOMER's combined scope) instead of just
  // `warehouseCode` alone — see getWorkerScope() below and authStore.ts's login() on the
  // frontend, which prefers this array over the single warehouseCode when it has >1 entries.
  warehouseCodes?: string[];
  task?:         string;    // ← what work this worker does (e.g. "Inward & Receiving")
  dynamic?:      boolean;
}

// ── Resolve locations + warehouse codes + worker team a CUSTOMER can see ──
function getCustomerScope(username: string) {
  const all         = getAllUsers();
  const savedPerms  = loadCustomerPerms();
  const me          = all.find(u => u.username === username);
  const baseLoc     = me?.location ? [me.location] : [];
  const extra       = (savedPerms[username] || []).filter((l: string) => !baseLoc.includes(l));
  const locations   = [...baseLoc, ...extra];
  const locSet      = new Set(locations.map(l => l.toLowerCase()));
  const team = all
    .filter(u => u.role === 'WORKER' && u.location && locSet.has(u.location.toLowerCase()))
    .map(u => ({
      username:      u.username,
      name:          u.name,
      location:      u.location,
      warehouseCode: u.warehouseCode || null,
      task:          u.task || null,
    }));
  const warehouseCodes = [...new Set(team.map(w => w.warehouseCode).filter(Boolean) as string[])];
  return { locations, warehouseCodes, team };
}

function loadDynamicUsers(): UserRecord[] {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch {}
  return [];
}
function saveDynamicUsers(users: UserRecord[]) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ─── Built-in accounts ────────────────────────────────────────────────────────
// Passwords below are bcrypt hashes, NOT plaintext. Login still works with the same
// plaintext passwords as before (admin123 / chennai123) — only the stored form changed,
// verified via bcrypt.compareSync() in POST /login below.
const HASH_ADMIN123   = '$2a$10$P0iIbwdPGYiV20gd5a4jW.cmBd74WbIhcrmSoEM5LjzG2HnY2rBb.';
const HASH_CHENNAI123 = '$2a$10$I1c/b1FbD0viLFLDKCm87e/0sKf40o3/vpNMt/Yk1GJty1qwc7ZIy';
const BASE_USERS: UserRecord[] = [
  { username: 'admin',       password: HASH_ADMIN123,   name: 'Admin',              role: 'ADMIN',    location: 'All Warehouses' },
  // chennaippd is a common/shared worker who handles both warehouses, not just CM35 —
  // warehouseCodes gives their session combined access to CM35 + FG05 (see UserRecord comment
  // above and authStore.ts's login()). warehouseCode stays 'CM35' as their primary/default site
  // for anything that still expects a single code (e.g. the Worker directory badge).
  { username: 'chennaippd',  password: HASH_CHENNAI123, name: 'Chennai Worker PPD',  role: 'WORKER',   location: 'Chennai PPD',  warehouseCode: 'CM35', warehouseCodes: ['CM35', 'FG05'], task: 'Inward & Receiving' },
  { username: 'chennaifg05', password: HASH_CHENNAI123, name: 'Chennai Worker FG05', role: 'WORKER',   location: 'Chennai PPD',  warehouseCode: 'FG05', task: 'FG Storage & Dispatch' },
  { username: 'chennaicust', password: HASH_CHENNAI123, name: 'Chennai PPD',         role: 'CUSTOMER', location: 'Chennai PPD' },
];

function getAllUsers(): UserRecord[] {
  const dynamic = loadDynamicUsers().map(u => ({ ...u, dynamic: true }));
  const baseFiltered = BASE_USERS.filter(b => !dynamic.some(d => d.username === b.username));
  return [...baseFiltered, ...dynamic];
}

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = getAllUsers().find(u => u.username === username.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const scope = user.role === 'CUSTOMER' ? getCustomerScope(user.username) : null;
  // A WORKER shared across multiple warehouses (see UserRecord.warehouseCodes comment) carries
  // its own explicit list — separate from CUSTOMER's team-derived getCustomerScope() above,
  // since a worker's multi-warehouse access is assigned directly, not inferred from a team.
  const workerWarehouseCodes = user.role === 'WORKER' ? (user.warehouseCodes || []) : [];
  const warehouseCodes = scope?.warehouseCodes || workerWarehouseCodes;

  // Token carries only what's needed to re-derive/enforce scope server-side on every
  // subsequent request — requireAuth/requireRole (src/middleware/auth.ts) read req.user
  // from this payload, and route handlers use it to clamp any client-supplied
  // warehouseCode/warehouseCodes query params to what this account is actually allowed to see.
  const token = jwt.sign(
    {
      username: user.username,
      role: user.role,
      warehouseCode: user.warehouseCode || null,
      warehouseCodes,
    },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );

  res.json({
    success: true,
    token,
    user: {
      username:      user.username,
      name:          user.name,
      role:          user.role,
      location:      user.location,
      warehouseCode: user.warehouseCode || null,
      task:          user.task || null,
      allowedLocations: scope?.locations || [],
      warehouseCodes,
      team:             scope?.team || [],
    },
  });
});

router.post('/logout', (_req, res) => {
  res.json({ success: true });
});

// ── GET /auth/workers — all WORKER users with their warehouse info ─────────────
router.get('/workers', requireAuth, async (_req, res) => {
  const all = getAllUsers();
  const workers = all
    .filter(u => u.role === 'WORKER')
    .map(u => ({
      username:      u.username,
      name:          u.name,
      location:      u.location,
      warehouseCode: u.warehouseCode || null,
      task:          u.task || null,
    }));
  res.json({ workers });
});

// ── GET /auth/permissions ─────────────────────────────────────────────────────
router.get('/permissions', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  const savedPerms  = loadCustomerPerms();
  const all         = getAllUsers();

  // Resolve all unique warehouse codes for dropdown
  const whCodes = [...new Set(all.filter(u => u.role === 'WORKER' && u.warehouseCode).map(u => u.warehouseCode as string))];
  // Also fetch any warehouses in DB
  const dbWarehouses = await prisma.warehouse.findMany({ where: { isActive: true }, select: { code: true, name: true } });
  const allLocations = [...new Set([...dbWarehouses.map(w => w.code), ...whCodes])];

  const users = all.map(u => ({
    username:         u.username,
    name:             u.name,
    role:             u.role,
    location:         u.location,
    warehouseCode:    u.warehouseCode || null,
    task:             u.task || null,
    dynamic:          !!u.dynamic,
    allowedLocations: u.role === 'CUSTOMER'
      ? [u.location, ...(savedPerms[u.username] || []).filter((l: string) => l !== u.location)]
      : [],
  }));

  res.json({ users, allLocations });
});

// ── PUT /auth/permissions ─────────────────────────────────────────────────────
router.put('/permissions', requireAuth, requireRole('ADMIN'), (req, res) => {
  const { permissions } = req.body;
  if (!permissions || typeof permissions !== 'object') {
    return res.status(400).json({ error: 'permissions object required' });
  }
  const all = getAllUsers();
  const customerUsernames = new Set(all.filter(u => u.role === 'CUSTOMER').map(u => u.username));
  const filtered: Record<string, string[]> = {};
  for (const [username, locs] of Object.entries(permissions)) {
    if (customerUsernames.has(username) && Array.isArray(locs)) {
      filtered[username] = locs;
    }
  }
  saveCustomerPerms(filtered);
  res.json({ success: true });
});

// ── POST /auth/users — create new account ─────────────────────────────────────
router.post('/users', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { username, password, name, role, location, warehouseCode, task } = req.body as Partial<UserRecord>;

  if (!username || !password || !name || !role || !location) {
    return res.status(400).json({ error: 'username, password, name, role, and location are all required' });
  }
  if (!['ADMIN', 'WORKER', 'CUSTOMER'].includes(role)) {
    return res.status(400).json({ error: 'role must be ADMIN, WORKER, or CUSTOMER' });
  }

  const all = getAllUsers();
  if (all.some(u => u.username === username.toLowerCase().trim())) {
    return res.status(409).json({ error: `Username "${username}" is already taken` });
  }

  // If worker has a new warehouseCode not yet in DB, auto-create the warehouse
  if (role === 'WORKER' && warehouseCode) {
    const existing = await prisma.warehouse.findFirst({ where: { code: warehouseCode.trim().toUpperCase() } });
    if (!existing) {
      await prisma.warehouse.create({
        data: {
          code:          warehouseCode.trim().toUpperCase(),
          name:          `${name}'s Warehouse`,
          storageType:   'MIXED',
          isActive:      true,
          totalCapacity: 10000,
          usedCapacity:  0,
        },
      });
    }
  }

  const newUser: UserRecord = {
    username:      username.toLowerCase().trim(),
    password:      bcrypt.hashSync(password.trim(), 10),
    name:          name.trim(),
    role,
    location:      location.trim(),
    warehouseCode: role === 'WORKER' && warehouseCode ? warehouseCode.trim().toUpperCase() : undefined,
    task:          role === 'WORKER' && task ? task.trim() : undefined,
    dynamic:       true,
  };

  const dynamic = loadDynamicUsers();
  dynamic.push(newUser);
  saveDynamicUsers(dynamic);

  res.json({
    success: true,
    user: { username: newUser.username, name: newUser.name, role: newUser.role, location: newUser.location, warehouseCode: newUser.warehouseCode, task: newUser.task },
  });
});

// ── DELETE /auth/users/:username — delete dynamic account ─────────────────────
router.delete('/users/:username', requireAuth, requireRole('ADMIN'), (req, res) => {
  const { username } = req.params;
  const dynamic = loadDynamicUsers();
  const idx = dynamic.findIndex(u => u.username === username);
  if (idx === -1) {
    return res.status(404).json({ error: 'User not found or is a built-in account that cannot be deleted' });
  }
  dynamic.splice(idx, 1);
  saveDynamicUsers(dynamic);
  res.json({ success: true });
});

export default router;
