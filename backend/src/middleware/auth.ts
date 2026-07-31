import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// No insecure fallback here on purpose: a hardcoded default secret means anyone who reads
// this source (it's on GitHub) could forge a valid ADMIN token against any deployment that
// forgot to set JWT_SECRET. Fail loudly at startup instead — that's much safer than silently
// running with a guessable secret. Set JWT_SECRET in backend/.env (or the host's env vars).
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET is missing or too short. Set a random 32+ character secret in backend/.env ' +
    '(e.g. run: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))" ' +
    'and paste the result as JWT_SECRET=... ). Refusing to start with an insecure default.'
  );
}
const JWT_SECRET: string = process.env.JWT_SECRET;

export interface AuthUser {
  username: string;
  role: 'ADMIN' | 'WORKER' | 'CUSTOMER';
  warehouseCode: string | null;
  warehouseCodes: string[];
}

// Augment Express's Request type so `req.user` is recognized everywhere without `as any`.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ── requireAuth — verifies the Bearer token issued by POST /api/auth/login ─────
// Every API route except /api/auth/login (and /api/auth/logout, which is a no-op) is
// mounted behind this in src/index.ts. Missing/invalid/expired tokens are rejected with
// 401 before the request ever reaches a route handler.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    req.user = {
      username: payload.username,
      role: payload.role,
      warehouseCode: payload.warehouseCode || null,
      warehouseCodes: payload.warehouseCodes || [],
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid token, please log in again' });
  }
}

// ── requireRole — use after requireAuth to restrict a route to specific roles ──────
export function requireRole(...roles: Array<AuthUser['role']>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    next();
  };
}

// Sentinel warehouse code that never matches a real warehouse — used to force a
// query to return zero rows when a non-admin account has no valid scope left.
export const FORBIDDEN_CODE = '__forbidden__';

// ── resolveScopedCodes — clamp a client-supplied warehouseCode/warehouseCodes list
// to what req.user is actually allowed to see. This is the server-side enforcement
// that data routes (inventory/inward/outward/dashboard/cycle-count/warehouse) MUST
// call before using any client-supplied code list — without it, any authenticated
// CUSTOMER or WORKER could read another customer's/warehouse's data simply by
// changing the ?warehouseCode= query param, since the JWT alone doesn't stop the
// route handler from trusting whatever the client sends.
//
// - ADMIN: unrestricted — returns the requested list unchanged (empty = "all").
// - WORKER / CUSTOMER: allowed = req.user.warehouseCodes (falls back to the single
//   warehouseCode). If the client requested nothing, default to the account's full
//   own scope (never "all warehouses"). If the client requested specific codes,
//   intersect with what's allowed. If the account has no warehouse scope at all, or
//   the intersection is empty, return [FORBIDDEN_CODE] so the caller's "resolve
//   codes -> warehouse ids -> IN (...)" lookup matches nothing.
export function resolveScopedCodes(req: Request, requestedCodes: string[]): string[] {
  const user = req.user;
  if (!user || user.role === 'ADMIN') return requestedCodes;

  const allowed = (user.warehouseCodes && user.warehouseCodes.length)
    ? [...new Set(user.warehouseCodes.map(c => c.toUpperCase()))]
    : (user.warehouseCode ? [user.warehouseCode.toUpperCase()] : []);

  if (!allowed.length) return [FORBIDDEN_CODE];
  if (!requestedCodes.length) return allowed;

  const intersected = requestedCodes.filter(c => allowed.includes(c));
  return intersected.length ? intersected : [FORBIDDEN_CODE];
}
