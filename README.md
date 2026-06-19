# JSM Logistics WMS

Warehouse Management System — React + Vite frontend, Node/Express + Prisma backend.

---

## Prerequisites

- **Node.js 18+** — https://nodejs.org
- **Git**

---

## First-time setup (run once after cloning)

Open a terminal in the project root and run:

```bash
# 1. Install root dev tools
npm install

# 2. Install backend dependencies + generate Prisma client + create local DB
cd backend
npm install
npx prisma generate
npx prisma db push
cd ..

# 3. Install frontend dependencies
cd frontend
npm install
cd ..
```

> **Why `prisma db push`?**
> The database (`dev.db`) is not stored in Git — each developer has their own local copy.
> `db push` creates it from the schema automatically.

---

## Starting the app

From the project root:

```bash
npm run dev
```

This starts both servers concurrently:
| Server   | URL                    |
|----------|------------------------|
| Frontend | http://localhost:5173  |
| Backend  | http://localhost:5001  |

Or use the **`start-app.bat`** file on Windows (double-click).

---

## Default login credentials

| Role     | Username      | Password     | Access              |
|----------|---------------|--------------|---------------------|
| Admin    | `admin`       | `admin123`   | Full access         |
| Worker   | `chennaippd`  | `chennai123` | Inward / Outbound   |
| Customer | `chennaicust` | `chennai123` | View only           |

New warehouse accounts can be created by the Admin in **Settings → New User**.

---

## Project structure

```
├── frontend/          # React + Vite + TypeScript
│   └── src/
│       ├── pages/     # One file per page (Inward, Outward, Inventory…)
│       ├── components/
│       └── store/     # Zustand auth store
│
├── backend/           # Express + TypeScript + Prisma
│   ├── src/routes/    # API routes (auth, inward, outward, inventory…)
│   └── prisma/
│       ├── schema.prisma
│       └── dev.db     # ← local only, not in Git
│
└── start-app.bat      # Windows one-click start
```

---

## Collaboration workflow (Git)

### Day-to-day

```bash
# Before starting work — always pull latest first
git pull origin main

# Make your changes, then commit and push
git add .
git commit -m "describe what you changed"
git push origin main
```

### If you get a merge conflict

1. `git pull origin main` — Git will flag conflicting files
2. Open the conflicted file and look for `<<<<<<` markers
3. Keep the correct version, delete the markers
4. `git add .` then `git commit`

### What NOT to commit (already gitignored)

- `node_modules/` — run `npm install` instead
- `backend/prisma/dev.db` — run `npx prisma db push` instead
- `backend/dynamic-users.json` — recreated automatically, contains passwords
- `backend/customer-permissions.json` — recreated automatically

### After pulling someone else's changes

If the other person changed the Prisma schema (`backend/prisma/schema.prisma`), run:

```bash
cd backend
npx prisma db push
```

This applies the new schema to your local database.

---

## Adding a new page or feature

1. Pull latest: `git pull origin main`
2. Make your changes
3. Test locally
4. `git add . && git commit -m "..." && git push origin main`
5. Tell the other person to `git pull`
