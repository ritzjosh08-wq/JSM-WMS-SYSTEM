# JSM Customer Portal

A read-only, customer-facing web app that shows each customer their own
warehouse data **live from the JSM Logistics WMS backend**. Customers sign in
with their WMS `CUSTOMER` account and see only the warehouse(s) they are
permitted to view.

Built with React + Vite + TypeScript. Runs on **port 5174** so it sits
alongside the WMS frontend (5173) and backend (5001).

## What a customer sees

- **Dashboard** — pallet totals (RM / FG), today's inward & outward counts,
  discrepancies, stock by location, and recent inward entries.
- **Inventory** — every live stock batch: material, batch, qty, boxes,
  warehouse, bin/floor location, receipt date, status (with search).
- **Inward** — incoming shipments with truck/transporter/invoice and
  expandable line items.
- **Outward** — dispatches with destination and expandable line items.
- **Materials** — the material catalog (code, description, type, unit).

Everything is read-only — the portal never writes to the WMS.

## How the two connect

```
Customer Portal (5174)  ──HTTP──►  WMS backend (5001)  ──►  SQLite (dev.db)
        ▲                               ▲
        │                               │
   CUSTOMER login                 same data the WMS staff use
```

The portal calls the existing backend endpoints: `/auth/login`,
`/auth/permissions`, `/auth/workers`, `/dashboard`, `/inventory`, `/inward`,
`/outward`, `/materials`. The API base URL is configurable in `.env`
(`VITE_API_BASE`, default `http://localhost:5001/api`).

### Customer → warehouse scoping

A WMS customer is tied to a *location label* (e.g. "Chennai PPD"), while the
data endpoints filter by *warehouse code* (e.g. "CM35"). On login the portal
reads `/auth/permissions` (the customer's allowed locations) and
`/auth/workers` (which maps each location to its warehouse code) and shows
only those warehouses. Admins who log in see everything.

## How to run (both pieces)

1. **Start the WMS backend first** — in the WMS repo
   (`JSM-LOGISTICS-FINAL-SOFTWARE-main`), double-click **`start-app.bat`** (or
   run `npm run dev` from the repo root). This serves the API on port 5001.

2. **Start the customer portal** — in this folder, double-click
   **`start-customer-app.bat`**. The first run installs dependencies, then it
   opens `http://localhost:5174`.

## Logging in

Use a WMS **customer** account, e.g.:

| Username       | Password     | Sees        |
| -------------- | ------------ | ----------- |
| `chennaicust`  | `chennai123` | Chennai PPD |
| `salemmabcust` | `salem123`   | Salem MAB   |

Admins create more customer accounts in the WMS under **Settings → New User**
and assign which warehouses each customer may see.

## Installable app (PWA)

The portal is a Progressive Web App: it's mobile-responsive and can be
**installed like a native app** (home-screen icon, full-screen, works offline
for the shell). Login is still required, so only customer (and admin) accounts
can view it.

**Install on desktop** — open `http://localhost:5174` in Chrome or Edge and
click the install icon in the address bar (or the "Install app" button on the
login screen / "⬇ Install" in the header).

**Install on a phone** — the phone must reach the app over **HTTPS** (browsers
only allow PWA install + service workers on `https://` or `localhost`, never on
a plain `http://192.168.x.x` LAN address). Two easy ways:

1. **Quick test over a tunnel** — run a tunnel to the dev server, e.g.
   `npx localtunnel --port 5174` (or ngrok), open the `https://…` URL it gives
   on your phone, then use the browser menu → **Add to Home screen**. Make sure
   the WMS backend is reachable too (tunnel port 5001 and set `VITE_API_BASE` to
   that URL).
2. **Proper deployment** — `npm run build` produces a static `dist/` you can
   host on any HTTPS host (Netlify, Vercel, your own server), with
   `VITE_API_BASE` pointing at your hosted WMS backend.

The app icons live in `public/` (`pwa-192.png`, `pwa-512.png`,
`pwa-maskable-512.png`), the install config is `public/manifest.webmanifest`,
and offline/caching is handled by `public/sw.js`.

## Note on data

The portal shows whatever is in the WMS. A fresh database has the warehouse
layout (warehouses, racks/bins, floor locations) but no stock yet — so the
inventory/inward/outward tables stay empty until staff record entries in the
WMS. They then appear here on reload.

---

The previous demo (`index.html`) and the standalone `wms-api` bridge are kept
under `_archived-old-version/` and are no longer used — the portal talks to the
WMS backend directly, so no separate bridge server is needed.
