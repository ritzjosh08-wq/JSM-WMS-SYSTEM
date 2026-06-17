import express from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const prisma = new PrismaClient();

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
  username: string;
  password: string;
  name: string;
  role: 'ADMIN' | 'WORKER' | 'CUSTOMER';
  location: string;
  dynamic?: boolean;
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

// ─── Built-in accounts (cannot be deleted via UI) ────────────────────────────
const BASE_USERS: UserRecord[] = [
  { username: 'admin',       password: 'admin123',   name: 'Admin',              role: 'ADMIN',    location: 'All Warehouses' },
  { username: 'chennaippd',  password: 'chennai123', name: 'Chennai Worker PPD', role: 'WORKER',   location: 'Chennai PPD' },
  { username: 'chennaicust', password: 'chennai123', name: 'Chennai PPD',        role: 'CUSTOMER', location: 'Chennai PPD' },
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
  const user = getAllUsers().find(
    u => u.username === username.toLowerCase() && u.password === password
  );
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  res.json({
    success: true,
    user: { username: user.username, name: user.name, role: user.role, location: user.location },
  });
});

router.post('/logout', (_req, res) => {
  res.json({ success: true });
});

// ── GET /auth/permissions ─────────────────────────────────────────────────────
router.get('/permissions', (_req, res) => {
  const savedPerms = loadCustomerPerms();
  const all = getAllUsers();
  const allLocations = [...new Set(
    all.filter(u => u.role !== 'ADMIN').map(u => u.location)
  )];
  const users = all.map(u => ({
    username: u.username,
    name:     u.name,
    role:     u.role,
    location: u.location,
    dynamic:  !!u.dynamic,
    allowedLocations: u.role === 'CUSTOMER'
      ? [u.location, ...(savedPerms[u.username] || []).filter((l: string) => l !== u.location)]
      : [],
  }));
  res.json({ users, allLocations });
});

// ── PUT /auth/permissions ─────────────────────────────────────────────────────
router.put('/permissions', (req, res) => {
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
router.post('/users', (req, res) => {
  const { username, password, name, role, location } = req.body as Partial<UserRecord>;

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

  const newUser: UserRecord = {
    username: username.toLowerCase().trim(),
    password: password.trim(),
    name:     name.trim(),
    role,
    location: location.trim(),
    dynamic:  true,
  };

  const dynamic = loadDynamicUsers();
  dynamic.push(newUser);
  saveDynamicUsers(dynamic);

  res.json({
    success: true,
    user: { username: newUser.username, name: newUser.name, role: newUser.role, location: newUser.location },
  });
});

// ── DELETE /auth/users/:username — delete dynamic account ─────────────────────
router.delete('/users/:username', (req, res) => {
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
