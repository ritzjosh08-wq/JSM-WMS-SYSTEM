# Getting the WMS onto a worker's laptop (no Netlify)

> **Current setup (as of this deploy):** the backend is live 24/7 on Render at
> `https://jsm-logistics-backend.onrender.com` — it does NOT depend on your laptop being on
> anymore. The worker's app is live at `https://jsm-wms-system.pages.dev`. This means
> **everything below about ngrok, tunnels, `start-app.bat`, and `start-tunnel-ngrok.bat` no
> longer applies** — skip straight to "Deploying to the worker's laptop now" just below.
> The rest of this file is kept only as a reference for the old laptop-hosted-backend setup.

## Deploying to the worker's laptop now (current setup)

There is nothing to install on the worker's laptop. The whole app — backend and frontend —
already runs in the cloud, 24/7, independent of any laptop being on.

1. **Give the worker this link**: `https://jsm-wms-system.pages.dev`
   Any browser, any device (laptop, phone, tablet) — nothing to install.
2. **Give them a login.** Right now the confirmed-working worker account is:
   - Username: `chennaippd`
   - Password: `Chennai@PPD2026`
   If you want a separate account per worker (recommended before wider rollout), log in as
   `chennaippd` (or an admin account) → **Settings → Workers** → create a new account with a
   username/password you choose.
3. **Optional — install it like an app.** On the login screen (or via the browser's address
   bar install icon in Chrome/Edge), the worker can "Install app" so it gets a home-screen
   icon and opens full-screen like a native app, instead of a browser tab. Still requires
   login, still needs internet — it's just a shortcut, not an offline app.

That's it. No Node.js, no batch files, no tunnel, no ngrok. If the app breaks or shows
stale data for the worker, the fix is almost always on your end: either the Render
backend needs redeploying (see `backend/DEPLOYMENT.md`) or the Cloudflare Pages site needs
a fresh build — never anything the worker needs to touch on their own laptop.

**Updating the app for the worker later:** since Cloudflare Pages is connected to GitHub
with auto-deploy, any `git push` to `main` rebuilds and redeploys `jsm-wms-system.pages.dev`
automatically within a minute or two — the worker's link never changes, they just see the
new version next time they load/refresh the page.

---

## (Old reference only — laptop-hosted backend, no longer in use)

## What this actually does

The backend (Node/Express + Prisma + your Supabase database) keeps running exactly
where it runs today — on your laptop, started the same way as always via
`start-app.bat`. Nothing about the backend's code or setup changes.

The worker doesn't run anything backend-related and doesn't need Node.js installed —
**they just get a link** (a normal `https://...` URL) that opens the app in any browser,
on any device. That link is a static copy of the frontend, hosted for free on Cloudflare
Pages. It talks to your backend over the internet through a tunnel, instead of
"localhost", because your laptop and the worker's device are in different locations.

(There's also a Node.js-based local option, in case you'd rather not use a link — see
"Alternative" near the bottom — but the link is simpler for the worker and is the
recommended path.)

Why not the old `start-tunnel.bat` (Cloudflare)? That one uses a free "quick tunnel" that
gets a random `*.trycloudflare.com` URL every time it starts, and it dies/needs restarting
periodically — this repo's `tunnel.log` shows it broke on 22 Jul and was never restarted.
Every time that happens, the worker's app would start showing connection errors until
someone notices and manually fixes the URL. A Netlify-hosted frontend would be even worse
here, since fixing the URL would mean rebuilding and redeploying to Netlify each time.

Instead: **ngrok**, using the free permanent domain every ngrok account gets (it does not
expire, and does not require you to own a domain name). You set it up once; the URL never
changes again.

## One-time setup (do this once, on your own laptop)

1. Sign up free: https://dashboard.ngrok.com/signup
2. Install the ngrok agent for Windows: https://dashboard.ngrok.com/get-started/setup/windows
3. In a terminal, run the command the ngrok dashboard shows you, it looks like:
   ```
   ngrok config add-authtoken <your-token-from-the-dashboard>
   ```
4. In the ngrok dashboard, go to **Universal Gateway → Domains**. You'll see one free
   domain already reserved for your account, like `abc-123-xyz.ngrok-free.dev`. Copy it.
5. Open `start-tunnel-ngrok.bat` in this folder and replace
   `YOUR-NGROK-DOMAIN.ngrok-free.dev` with the domain from step 4.
6. Open `frontend/.env.worker` and replace `YOUR-NGROK-DOMAIN.ngrok-free.dev` with the
   *same* domain (keep the `https://` and `/api` around it).

That's it — steps 5 and 6 only ever need to be done again if you create a brand new ngrok
account.

## Every time you want the worker to be able to use the app

On your laptop, two things need to be running at once:

1. `start-app.bat` — same as always (backend + your own frontend).
2. `start-tunnel-ngrok.bat` — the new tunnel script. Leave its window open.

If either window is closed, the worker's app will show connection errors — that's
expected, it just means your laptop currently isn't reachable. (This is the same for
both the link and the local-app method below — the backend only ever lives on your
laptop, so it has to be on and tunneled either way.)

## Getting the worker their link (one-time, ~5 minutes)

1. Make sure `frontend/.env.worker` has your real ngrok domain in it (step 6 above) —
   the link will bake in whatever's there when you build it.
2. Double-click `build-worker-app.bat`. It installs dependencies on first run, builds a
   static copy of the app into `frontend/dist`, then opens that folder for you.
3. Go to https://dash.cloudflare.com (free account if you don't have one) → **Workers &
   Pages** → **Create** → **Pages** → **Upload assets**.
4. Give it a project name (e.g. `jsm-logistics-worker`) and drag the whole `dist` folder
   (from step 2) into the upload box.
5. Cloudflare gives you a permanent link, like `https://jsm-logistics-worker.pages.dev`.
   That's it — send that link to the worker. It doesn't expire and doesn't need renewing.
   The backend already accepts requests from any `*.pages.dev` link automatically.

**If the app code changes later** (new features, bug fixes) or **you get a new ngrok
domain**, just repeat steps 2–4 — Cloudflare Pages lets you re-upload to the same project
and the link stays exactly the same, nothing changes on the worker's end.

## Alternative: run it locally on the worker's laptop instead of a link

Skip this if you're using the link above. This older method needs Node.js installed on
the worker's machine and a batch file double-click instead of a browser link — only
worth it if, for some reason, you'd rather not put the app on Cloudflare.

### Setting up the worker's laptop (one-time)

The worker's laptop needs **Node.js** installed (https://nodejs.org, LTS version) and a
copy of this repo's `frontend` folder plus `start-worker-app.bat`, sitting next to each
other the same way they are in this repo:

```
(worker's laptop)
├── start-worker-app.bat
└── frontend/
```

Easiest way to get it there: copy the whole project folder over (USB drive, a shared
cloud folder, or `git clone` if you push this repo to GitHub/GitLab). The worker's laptop
does **not** need the `backend` folder, Postgres, or any database access at all.

### Every time the worker wants to use the app

They just double-click `start-worker-app.bat`. First run installs dependencies (needs
internet for that one time); after that it opens `http://localhost:5180` in their browser
automatically. They log in with their existing WORKER account, same as anyone else.

## If something shows an error

- **"Failed to fetch" / blank data everywhere on the worker's device** — your laptop's
  `start-app.bat` and/or `start-tunnel-ngrok.bat` windows aren't running, or got closed.
  Both need to stay open the whole time the worker is using the app (link or local method
  — the backend only ever runs on your laptop either way).
- **The link (`*.pages.dev`) loads but shows a login screen that never lets you in / spins
  forever** — same cause as above (backend/tunnel not running), or your ngrok domain in
  `frontend/.env.worker` doesn't match what's in `start-tunnel-ngrok.bat`, or the link was
  built (`build-worker-app.bat`) before you'd set the real ngrok domain — rebuild and
  re-upload after fixing it.
- **CORS error in the browser console** — for the link method this shouldn't happen (the
  backend already allows any `*.pages.dev` origin). For the local method, the worker app
  must run on port 5180 exactly (that's what `start-worker-app.bat` does, and it's the one
  extra origin already added to `backend/.env`'s `CORS_ORIGIN`) — don't rename/move the
  folders.
- **ngrok shows "ERR_NGROK_..." in its window** — almost always means the authtoken step
  wasn't done, or the domain in `start-tunnel-ngrok.bat` doesn't match your dashboard
  exactly.
