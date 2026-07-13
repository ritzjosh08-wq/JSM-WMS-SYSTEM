import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET: string = process.env.JWT_SECRET || 'insecure-dev-secret-change-me';

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
