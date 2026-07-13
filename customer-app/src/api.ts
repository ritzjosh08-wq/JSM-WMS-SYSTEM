// ─────────────────────────────────────────────────────────────────────────────
//  API client — talks to the JSM Logistics WMS backend.
//  All customer data is read live from the same backend the WMS staff use.
// ─────────────────────────────────────────────────────────────────────────────

export const API_BASE: string =
  (import.meta as any).env?.VITE_API_BASE || 'http://localhost:5001/api';

const TOKEN_KEY = 'jsm_customer_token';

export function getToken(): string | null {
  // Stored JSON.stringify'd (like every other key in authStore.ts's sessionStorage
  // persistence), so it must be JSON.parse'd back out here, not read as a raw string.
  try { const raw = sessionStorage.getItem(TOKEN_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

async function getJSON<T>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (res.status === 401) {
    // Session expired/invalid — clear it and let the app fall back to the Login screen.
    // Dynamic import avoids a circular import at module-init time (authStore imports
    // types from this file).
    const { useAuthStore } = await import('./store/authStore');
    useAuthStore.getState().logout();
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface TeamWorker {
  username: string;
  name: string;
  location: string;
  warehouseCode: string | null;
  task?: string | null;
}
export interface AuthUser {
  username: string;
  name: string;
  role: string;
  location?: string;
  warehouseCode?: string | null;
  // Customer aggregation context (populated by the backend at login):
  allowedLocations?: string[];
  warehouseCodes?: string[];
  team?: TeamWorker[];
}

export interface TeamWorkerStats extends TeamWorker {
  stats: {
    todaysInward: number;
    todaysOutward: number;
    inventoryRMPallets: number;
    inventoryFGPallets: number;
    totalPallets: number;
    discrepancyCount: number;
  } | null;
}

export interface Warehouse { code: string; name: string; }

export interface InventoryRow {
  id: string;
  batchNumber: string;
  quantity: number;
  receiptDate: string;
  manufacturingDate?: string | null;
  stockStatus: string;
  customFields?: string | null;
  material?: { code: string; description: string; materialType?: string; huUnit?: string } | null;
  warehouse?: { code: string; name: string } | null;
  rack?: { code: string } | null;
  bin?: { code: string } | null;
  floorLocation?: { code: string; zone?: string } | null;
}

export interface InwardLine {
  materialCode: string;
  description?: string | null;
  quantity: number;
  batchNumber: string;
  lineItemStatus?: string | null;
}
export interface InwardEntry {
  id: string;
  inwardNumber: string;
  truckNumber: string;
  transporter?: string | null;
  lrNumber?: string | null;
  invoiceNumber?: string | null;
  status: string;
  inwardDate?: string | null;
  createdAt: string;
  lineItems: InwardLine[];
}

export interface OutwardLine {
  materialCode: string;
  description?: string | null;
  batchNumber: string;
  requiredQty: number;
  pickedQty: number;
}
export interface OutwardEntry {
  id: string;
  outwardNumber: string;
  dispatchDate: string;
  truckNumber: string;
  transporter?: string | null;
  destination?: string | null;
  status: string;
  createdAt: string;
  lineItems: OutwardLine[];
}

export interface MaterialRow {
  id: string;
  code: string;
  description: string;
  materialType: string;
  huUnit: string;
  category?: string | null;
}

export interface CycleSessionSummary {
  date: string;
  status: string;
  total: number;
  ok: number;
  disc: number;
  unchecked: number;
}
export interface CycleCountRecord {
  id: string;
  weekStart: string;
  weekEnd: string;
  warehouseCode: string;
  warehouseName: string;
  totalBins: number;
  okCount: number;
  discrepancyCount: number;
  uncheckedCount: number;
  completedAt?: string | null;
  status: string;
  sessionSummaries: CycleSessionSummary[];
}

export interface DashboardStats {
  todaysInward: number;
  todaysOutward: number;
  inventoryRM: number;
  inventoryFG: number;
  totalPallets: number;
  totalQty?: number;
  discrepancyCount: number;
  discrepancyByCategory?: { category: string; count: number }[];
  stockLocations: { name: string; pallets: number }[];
  warehouseBreakdown?: { code: string; name: string; pallets: number; qty: number }[];
  rmByType: { type: string; pallets: number }[];
  recentInwards: InwardEntry[];
}

// ── Auth ────────────────────────────────────────────────────────────────────
export async function login(username: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return { user: data.user as AuthUser, token: data.token as string };
}

// ── Resolve which warehouse codes a customer is allowed to see ────────────────
//
// In the WMS, a customer is tied to a *location label* (e.g. "Chennai PPD"),
// and admins can grant extra locations via customer-permissions.json. The data
// endpoints, however, filter by *warehouseCode* (e.g. "CM35"). We bridge the two
// by mapping each allowed location label to the warehouseCode of the worker who
// manages that location.
export async function resolveAllowedWarehouseCodes(user: AuthUser): Promise<string[]> {
  // Admins / staff: no restriction.
  if (user.role !== 'CUSTOMER') return [];

  // Preferred: the backend already computed the customer's warehouse codes
  // (every area of every worker at their site) and returned them at login.
  if (user.warehouseCodes && user.warehouseCodes.length) {
    return [...new Set(user.warehouseCodes.map(c => c.toUpperCase()))];
  }

  // Fallback: derive from /auth/permissions + /auth/workers (older backends).
  // A location can have SEVERAL workers (each its own warehouse), so we collect
  // every matching code — not just one per location.
  let allowedLocations: string[] = user.location ? [user.location] : [];
  const locationCodes = new Map<string, string[]>();
  const addCode = (loc: string, code: string) => {
    const key = loc.toLowerCase();
    const arr = locationCodes.get(key) || [];
    if (!arr.includes(code)) arr.push(code);
    locationCodes.set(key, arr);
  };

  try {
    const perms = await getJSON<{ users: any[] }>(`/auth/permissions`);
    const me = perms.users?.find(u => u.username === user.username);
    if (me?.allowedLocations?.length) allowedLocations = me.allowedLocations;
    for (const u of perms.users || []) {
      if (u.warehouseCode && u.location) addCode(u.location, String(u.warehouseCode).toUpperCase());
    }
  } catch { /* fall through to workers endpoint */ }

  try {
    const wk = await getJSON<{ workers: any[] }>(`/auth/workers`);
    for (const w of wk.workers || []) {
      if (w.warehouseCode && w.location) addCode(w.location, String(w.warehouseCode).toUpperCase());
    }
  } catch { /* ignore */ }

  const codes = new Set<string>();
  for (const loc of allowedLocations) {
    const key = loc.toLowerCase();
    if (locationCodes.has(key)) locationCodes.get(key)!.forEach(c => codes.add(c));
    // A location that is already a warehouse code (e.g. "CM35") maps to itself.
    else if (/^[a-z0-9-]{2,10}$/i.test(loc)) codes.add(loc.toUpperCase());
  }

  // Safety: a CUSTOMER must never fall through to the unfiltered "all
  // warehouses" path. If no code resolved (e.g. their location has no worker /
  // warehouse configured yet), fall back to the raw location labels — the
  // backend simply finds no matching warehouse and returns nothing, which is
  // the correct, restrictive behaviour.
  if (codes.size === 0 && allowedLocations.length) {
    for (const loc of allowedLocations) codes.add(loc.toUpperCase());
  }
  return [...codes];
}

// ── Data fetchers (scoped to one warehouse code, or all if undefined) ─────────
const wcParam = (code?: string) =>
  code ? `?warehouseCode=${encodeURIComponent(code)}` : '';

export async function fetchDashboard(code?: string): Promise<DashboardStats> {
  return getJSON<DashboardStats>(`/dashboard${wcParam(code)}`);
}
export async function fetchInventory(code?: string): Promise<{ inventory: InventoryRow[]; warehouses: Warehouse[] }> {
  return getJSON(`/inventory${wcParam(code)}`);
}
// Combined dashboard across several warehouse codes (uses the multi-code filter).
export async function fetchDashboardForCodes(codes: string[]): Promise<DashboardStats> {
  if (!codes.length) return fetchDashboard();
  if (codes.length === 1) return fetchDashboard(codes[0]);
  return getJSON<DashboardStats>(`/dashboard?warehouseCodes=${codes.map(encodeURIComponent).join(',')}`);
}
export async function fetchInward(code?: string): Promise<InwardEntry[]> {
  return getJSON<InwardEntry[]>(`/inward${wcParam(code)}`);
}
export async function fetchOutward(code?: string): Promise<OutwardEntry[]> {
  return getJSON<OutwardEntry[]>(`/outward${wcParam(code)}`);
}
export async function fetchMaterials(): Promise<MaterialRow[]> {
  return getJSON<MaterialRow[]>(`/materials`);
}
export async function fetchCycleCount(code?: string): Promise<CycleCountRecord[]> {
  return getJSON<CycleCountRecord[]>(`/cycle-count/records${wcParam(code)}`);
}

// The customer's team: every worker at their site(s) with task + activity stats.
export async function fetchTeam(locations: string[]): Promise<TeamWorkerStats[]> {
  if (!locations.length) {
    const all = await getJSON<{ workers: TeamWorkerStats[] }>(`/dashboard/all-workers`);
    return all.workers || [];
  }
  const lists = await Promise.all(
    locations.map(loc =>
      getJSON<{ workers: TeamWorkerStats[] }>(`/dashboard/all-workers?location=${encodeURIComponent(loc)}`)
        .then(r => r.workers || [])
        .catch(() => [])
    )
  );
  const seen = new Map<string, TeamWorkerStats>();
  for (const w of lists.flat()) seen.set(w.username, w);
  return [...seen.values()];
}

// Aggregate across multiple allowed warehouse codes (for customers with several areas).
export async function fetchInventoryForCodes(codes: string[]): Promise<{ inventory: InventoryRow[]; warehouses: Warehouse[] }> {
  if (!codes.length) return fetchInventory();
  const results = await Promise.all(codes.map(c => fetchInventory(c)));
  const inventory = results.flatMap(r => r.inventory);
  const whMap = new Map<string, Warehouse>();
  results.flatMap(r => r.warehouses).forEach(w => whMap.set(w.code, w));
  return { inventory, warehouses: [...whMap.values()] };
}
export async function fetchInwardForCodes(codes: string[]): Promise<InwardEntry[]> {
  if (!codes.length) return fetchInward();
  const all = await Promise.all(codes.map(c => fetchInward(c)));
  return dedupeById(all.flat());
}
export async function fetchOutwardForCodes(codes: string[]): Promise<OutwardEntry[]> {
  if (!codes.length) return fetchOutward();
  const all = await Promise.all(codes.map(c => fetchOutward(c)));
  return dedupeById(all.flat());
}
export async function fetchCycleCountForCodes(codes: string[]): Promise<CycleCountRecord[]> {
  if (!codes.length) return fetchCycleCount();
  const all = await Promise.all(codes.map(c => fetchCycleCount(c)));
  return dedupeById(all.flat());
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Map<string, T>();
  for (const r of rows) seen.set(r.id, r);
  return [...seen.values()];
}

// Parse the JSON-encoded customFields column safely.
export function parseCF(s?: string | null): Record<string, any> {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

// ─── Warehouse Map layout ─────────────────────────────────────────────────
export interface WHInvBatch {
  id: string; binId?: string | null; floorLocationId?: string | null;
  quantity: number; batchNumber?: string | null; customFields?: string | null;
  material?: { code: string; description: string; materialType?: string | null } | null;
}
export interface WHBin { id: string; code: string; isActive?: boolean }
export interface WHRack { id: string; code: string; rows: { id: string; levels: { id: string; bins: WHBin[] }[] }[] }
export interface WHFloor { id: string; code: string; zone: string; isActive?: boolean }
export interface WarehouseLayout {
  warehouseId: string; warehouseCode: string;
  floorLocations: WHFloor[]; racks: WHRack[]; inventory: WHInvBatch[];
}
export async function fetchWarehouseLayout(code: string): Promise<WarehouseLayout> {
  return getJSON<WarehouseLayout>(`/warehouse/layout?warehouse=${encodeURIComponent(code)}`);
}
