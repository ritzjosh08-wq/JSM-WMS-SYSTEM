import { PrismaClient } from '@prisma/client';

// ── Single shared Prisma client for the whole backend process ──────────────
// Every route file used to do its own `const prisma = new PrismaClient()`.
// Each PrismaClient opens its own connection pool (sized by CPU count by
// default), so with 9 separate instances in one process the backend could
// try to open far more connections than Supabase's Session Pooler allows
// (pool_size: 15), causing "FATAL: max clients reached" errors under load.
// Importing this single instance everywhere keeps the whole process to one
// pool, with an explicit ceiling as a second safeguard (see DATABASE_URL's
// connection_limit param). This is purely an internal wiring change — no
// route, endpoint, or business-logic behavior is affected.
export const prisma = new PrismaClient();
