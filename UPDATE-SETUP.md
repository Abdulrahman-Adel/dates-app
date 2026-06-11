# Update #1 — what's new & the 10-minute setup

Everything from `ideas.txt` and `problems.txt` is now in the app. Most of it
works the moment you deploy, but three one-time steps are needed: a small
database update, the push-notification keys, and a redeploy.

---

## What's new

**Fixes**
- **Locations are now shared & global.** Each of you taps **Detect** (Settings →
  Locations) on your own phone once — both locations sync across all devices and
  the midpoint is right everywhere.
- **Memories can be edited.** Every card in the Log now has a ✎ button — fix the
  name, date, hearts, notes, or link without deleting anything.

**New features**
- **"How long do you have?"** — a new quiz question. Suggestions now avoid places
  that close before your night would end.
- **Special occasions** — Settings → Key dates holds your first date (pre-set to
  19 May 2026), her birthday, and any custom yearly dates. The home screen shows
  a countdown banner for anything within 2 weeks (Valentine's, anniversary,
  monthly mini-anniversary, NYE, birthday…).
- **Together-counter** — the Log shows "X months & Y days together · N dates &
  counting".
- **Search & filters** — the Log filters by text, hearts, who logged it, and
  year; Saved filters by text, category, and price.
- **🎬 Movies tab** — a shared watchlist backed by TMDB (the movie database).
  Type a name, pick the right film from live suggestions, and the poster, year,
  genres, runtime, plot, and TMDB rating are saved with it (tap a poster/title
  to read the plot). Hit ✓ Watched afterwards and you each rate it with hearts.
- **Real push notifications** — monthly mini-anniversary on the 19th, a big one
  on the anniversary (plus a 7-day heads-up), occasion days, and a "log her
  flights" nudge on the 1st of each month.
- **backup.bat** — double-click it any time; a full copy of the database
  (all tables + every photo) lands in a timestamped folder under `backups/`.

---

## Step 1 — Update the database (2 min)

Supabase → **SQL Editor** → New query → paste all of **`supabase-update.sql`**
→ **Run**. (Creates the movies + push tables and turns on live sync for the
shared locations/key dates.)

## Step 2 — Add the push keys to Vercel (3 min)

Vercel → your project → **Settings → Environment Variables** → add these three
(all environments):

| Name | Value |
|------|-------|
| `VITE_VAPID_PUBLIC_KEY` | `BA0lEk-rD7I95vmcwhZH3Z0G_7NxQZ8pxMkaLS_aVaMeMvuULYutfC1d74l3uKqqQsIA5r51k1HhreN1qKzMncY` |
| `VAPID_PUBLIC_KEY` | same value as above |
| `VAPID_PRIVATE_KEY` | `5o5RrVZXAWAY4VrhXHh0kM-aeRpKVW2sw6FXkkRkWTI` |

These are freshly generated keys for your app. The private key should live
**only** in Vercel — don't post it anywhere public. (The public one is already
in `app/.env` for local dev.)

## Step 2b — TMDB key for movie info (3 min)

1. Sign up free at **https://www.themoviedb.org** → Settings → **API** →
   request a key (choose "Developer"; any honest answers work) → copy the
   **API Key** (the short v3 one).
2. Vercel → Settings → Environment Variables → add:

   | Name | Value |
   |------|-------|
   | `TMDB_API_KEY` | your key |

Without this, the Movies tab still works — titles just save as plain text with
no poster/plot.

## Step 3 — Redeploy (1 min)

Push the new code (or Deployments → ⋯ → Redeploy with "use existing build
cache" **off**). The `vercel.json` cron makes Vercel call the reminder function
every morning at **9:00 Dubai time** automatically.

## Step 4 — Turn notifications on, on each phone (1 min each)

On iPhone the app **must** be opened from the Home Screen icon (Share → Add to
Home Screen — you've already done this). Then: **Settings → Notifications →
🔔 Enable on this device** → Allow. Do it on both phones.

That's it. To test without waiting for a special day: open
`https://<your-site>/api/send-reminders` in a browser on the 1st/19th, or just
wait — the cron fires daily and stays silent on ordinary days.

---

## Notes

- **Backups**: `backup.bat` needs Node (you already have it). Each run creates
  `backups/backup_<date>/` with one JSON per table + a `photos/` folder. Nothing
  is ever overwritten.
- **First date** defaults to **19 May 2026** — change it in Settings → Key dates
  if I guessed wrong.
- **Old locations**: anything you'd saved per-device still works as a fallback
  until you tap Detect once.
