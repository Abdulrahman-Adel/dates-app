// ─────────────────────────────────────────────────────────────────────────────
//  backup.js — one-click local backup of EVERYTHING in the shared database.
//
//  Run it by double-clicking backup.bat (or:  node backup.js)
//
//  What it does:
//   1. Reads your Supabase URL + key from app/.env
//   2. Downloads every table (saved places, memories, photos index, flights,
//      movies, prefs/key dates, push subscriptions) as JSON
//   3. Downloads every actual photo file
//   4. Saves it all under  backups/backup_YYYY-MM-DD_HH-MM-SS/
//
//  Each run makes a NEW timestamped folder, so old backups are never touched.
//  Requires Node 18+ (you already have it for the app).
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs')
const path = require('path')

const TABLES = [
  'saved_places', 'log_entries', 'log_photos',
  'flights', 'movies', 'app_prefs', 'push_subscriptions',
]
const BUCKET = 'log-photos'

// ── Read app/.env ────────────────────────────────────────────────────────────
function readEnv() {
  const envPath = path.join(__dirname, 'app', '.env')
  if (!fs.existsSync(envPath)) {
    console.error('✗ Could not find app/.env — set up Supabase first (see SETUP.md).')
    process.exit(1)
  }
  const env = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

async function main() {
  const env = readEnv()
  const URL_ = env.VITE_SUPABASE_URL
  const KEY = env.VITE_SUPABASE_ANON_KEY
  if (!URL_ || !KEY) {
    console.error('✗ app/.env is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.')
    process.exit(1)
  }

  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')
  const outDir = path.join(__dirname, 'backups', `backup_${stamp}`)
  fs.mkdirSync(path.join(outDir, 'photos'), { recursive: true })

  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }
  console.log(`\n💾 Backing up to  backups/backup_${stamp}/\n`)

  // ── 1. Tables → JSON ──
  let photoRows = []
  for (const table of TABLES) {
    try {
      const r = await fetch(`${URL_}/rest/v1/${table}?select=*`, { headers })
      if (!r.ok) {
        console.log(`  ⚠ ${table}: skipped (${r.status} — table may not exist yet)`)
        continue
      }
      const rows = await r.json()
      fs.writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2))
      console.log(`  ✓ ${table}: ${rows.length} rows`)
      if (table === 'log_photos') photoRows = rows
    } catch (e) {
      console.log(`  ✗ ${table}: ${e.message}`)
    }
  }

  // ── 2. Photo files ──
  console.log(`\n📷 Downloading ${photoRows.length} photos…`)
  let ok = 0, fail = 0
  for (const p of photoRows) {
    try {
      const r = await fetch(`${URL_}/storage/v1/object/public/${BUCKET}/${p.storage_path}`)
      if (!r.ok) { fail++; continue }
      const buf = Buffer.from(await r.arrayBuffer())
      const safe = p.storage_path.replace(/[\\/]/g, '__')
      fs.writeFileSync(path.join(outDir, 'photos', safe), buf)
      ok++
    } catch { fail++ }
  }
  console.log(`  ✓ ${ok} photos saved${fail ? `  (⚠ ${fail} failed)` : ''}`)

  // ── 3. A tiny README inside the backup ──
  fs.writeFileSync(path.join(outDir, 'README.txt'),
`Date Night backup — ${new Date().toString()}

Each .json file is a full copy of one database table.
The photos/ folder has every photo (filename = its storage path).

To restore: ask Claude (or any developer) to re-insert these JSON rows
into a Supabase project using the same supabase-setup.sql schema.
`)

  console.log('\n✅ Backup complete!\n')
}

main().catch(e => { console.error('✗ Backup failed:', e); process.exit(1) })
