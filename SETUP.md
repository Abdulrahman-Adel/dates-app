# Making the Log & Saved places shared (one-time setup)

Right now everything you save lives only in your own browser. To make the **Saved
places** and **Visit Log** shared between you and Janjon — and to add photos,
Google-Maps links, and "who added what" — the app now talks to a small shared
database called **Supabase**. It's free, you don't run any server, and setup is
about 15 minutes, done once.

Until you finish this, the app still works but shows a small **"⚠ local only"**
badge, meaning saves stay on that one device.

---

## Step 1 — Create a Supabase project

1. Go to **https://supabase.com** and sign up (free).
2. Click **New project**. Give it any name (e.g. `date-night`), pick a region
   close to Dubai, and set a database password (save it somewhere — you won't
   need it for the app, but Supabase wants one).
3. Wait ~2 minutes for it to finish setting up.

## Step 2 — Create the tables and photo storage

1. In your project, open **SQL Editor** (left sidebar) → **New query**.
2. Open the file **`supabase-setup.sql`** (in this project folder), copy
   everything, paste it into the editor, and click **Run**.
3. You should see "Success". That created the database tables, the photo
   storage bucket, the access rules, and turned on live sync — all at once.

## Step 3 — Copy your two keys

1. Go to **Settings → API** (left sidebar).
2. Copy these two values:
   - **Project URL** — looks like `https://abcdxyz.supabase.co`
   - **Project API key → `anon` `public`** — a long string starting with `eyJ...`

## Step 4 — Give the keys to your live site (Vercel)

1. Go to **vercel.com** → your Date Night project → **Settings → Environment
   Variables**.
2. Add these two (for all environments — Production, Preview, Development):

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | the Project URL from Step 3 |
   | `VITE_SUPABASE_ANON_KEY` | the anon public key from Step 3 |

3. Go to the **Deployments** tab → open the latest deployment → **⋯ → Redeploy**.
   (Environment variables only take effect on a fresh deploy.)

That's it. Open the site — the "⚠ local only" badge disappears, and anything you
or Janjon save now shows up for both of you, live.

## Step 5 (optional) — Run it on your own computer too

In the `app` folder, copy `.env.example` to `.env`, paste the same two values,
then `npm install` and `npm run dev`.

---

## How the new features work

- **Who's this?** — The first time the app opens on a device it asks whether you
  are **Boody** or **Janjon**. That choice is remembered on that device and is
  stamped on everything you save. Tap the **👤 name** chip at the top to switch.
- **Log a visit from a Google Maps link** — In the Log tab, hit **+ Log visit**
  and paste a Google Maps link. The app expands it and auto-fills the place name
  (and grabs the location). The date is set automatically to today.
- **Photos by either person** — Every log entry has a **＋📷** button, so even if
  *you* logged the visit, *Janjon* can add her photos to it later. Each photo is
  labelled with who added it; tap a photo to view it full-screen (and delete it).

---

## A note on security (worth 20 seconds)

This setup uses the **public ("anon") key**, which means anyone who has the key
*and* knows your Supabase address could, in theory, read or write your data.
For a private link you only share with Janjon, that's a normal and acceptable
trade-off — it's the same model most small couple/family apps use, and it keeps
things password-free.

If you'd ever want it locked down harder (real logins, so only the two of you
can read/write even if someone finds the URL), that's a straightforward upgrade
later — just ask. You picked the simple name-picker for now, which is the right
call to get this working.
