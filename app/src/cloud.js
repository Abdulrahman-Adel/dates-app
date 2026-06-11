// ─────────────────────────────────────────────────────────────────────────────
//  cloud.js — shared data layer for Saved places + Visit Log + photos
//
//  Two backends behind one interface:
//   • CLOUD  — Supabase (a real shared database + photo storage). Used when the
//              VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY env vars are set.
//              Everything you and Janjon save is shared and synced live.
//   • LOCAL  — falls back to this browser's localStorage + IndexedDB so the app
//              still works before Supabase is connected. NOT shared.
//
//  See SETUP.md in the project root for how to turn on the cloud backend.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'

// The two people who use this app. Change these names here if you ever need to.
export const PEOPLE = ['Boody', 'Janjon']

const BUCKET = 'log-photos'

// ── Supabase client (only created if env vars exist) ─────────────────────────
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase =
  SUPA_URL && SUPA_KEY ? createClient(SUPA_URL, SUPA_KEY) : null

// True when the shared cloud backend is configured.
export const isCloud = !!supabase

// ── Identity: who is using this browser? ─────────────────────────────────────
const ME_KEY = 'dn_me'
export const getMe = () => {
  try {
    const v = localStorage.getItem(ME_KEY)
    return PEOPLE.includes(v) ? v : null
  } catch {
    return null
  }
}
export const setMe = name => {
  try { localStorage.setItem(ME_KEY, name) } catch { /* ignore */ }
}

// ── Small image compressor (JPEG, max 1200px) ────────────────────────────────
function compress(file, maxPx = 1200, quality = 0.78) {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(b => resolve(b || file), 'image/jpeg', quality)
    }
    img.onerror = () => resolve(file)
    img.src = url
  })
}

const uid = () =>
  (crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`)

// ═════════════════════════════════════════════════════════════════════════════
//  LOCAL backend helpers (localStorage + IndexedDB) — used only when !isCloud
// ═════════════════════════════════════════════════════════════════════════════
const LS = {
  saved: 'dn_k',   // array of place objects (each may carry _addedBy)
  log:   'dn_l',   // array of log entries (each carries a photos array)
}
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)) || [] } catch { return [] } }
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* quota */ } }

// Photo blobs (as data URLs) live in IndexedDB so they don't blow the
// localStorage quota. Each is keyed by a generated photo id.
const IDB_NAME = 'dn_photos', IDB_STORE = 'photos'
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = e => reject(e.target.error)
  })
}
async function idbPut(key, val) {
  const db = await openIDB()
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(val, key)
    tx.oncomplete = res; tx.onerror = e => rej(e.target.error)
  })
}
async function idbGet(key) {
  const db = await openIDB()
  return new Promise((res, rej) => {
    const r = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key)
    r.onsuccess = e => res(e.target.result || null)
    r.onerror = e => rej(e.target.error)
  })
}
async function idbDel(key) {
  const db = await openIDB()
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).delete(key)
    tx.oncomplete = res; tx.onerror = e => rej(e.target.error)
  })
}
function fileToDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result)
    fr.onerror = rej
    fr.readAsDataURL(blob)
  })
}
// notify other tabs (cheap cross-tab "realtime" for the local backend)
const ping = () => { try { localStorage.setItem('dn_ping', String(Date.now())) } catch { /* */ } }

// ═════════════════════════════════════════════════════════════════════════════
//  SAVED PLACES
// ═════════════════════════════════════════════════════════════════════════════
export async function fetchSaved() {
  if (!isCloud) return lsGet(LS.saved)
  const { data, error } = await supabase
    .from('saved_places')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) { console.warn('fetchSaved', error); return [] }
  return data.map(r => ({ ...r.place, _addedBy: r.added_by }))
}

export async function addSaved(place) {
  const me = getMe()
  if (!isCloud) {
    const list = lsGet(LS.saved)
    if (list.find(p => p.id === place.id)) return
    lsSet(LS.saved, [{ ...place, _addedBy: me }, ...list]); ping()
    return
  }
  await supabase
    .from('saved_places')
    .upsert({ id: String(place.id), place, added_by: me }, { onConflict: 'id' })
}

export async function removeSaved(id) {
  if (!isCloud) {
    lsSet(LS.saved, lsGet(LS.saved).filter(p => p.id !== id)); ping()
    return
  }
  await supabase.from('saved_places').delete().eq('id', String(id))
}

// ═════════════════════════════════════════════════════════════════════════════
//  VISIT LOG  (+ photos, each with its own uploader)
//  Returned entry shape:
//   { id, placeName, rating, notes, date, googleUrl, lat, lng, addedBy,
//     photos: [ { id, url, addedBy, _path } ] }
// ═════════════════════════════════════════════════════════════════════════════
export async function fetchLog() {
  if (!isCloud) {
    const entries = lsGet(LS.log)
    // hydrate each photo id -> data URL from IndexedDB
    for (const e of entries) {
      const photos = []
      for (const ph of (e.photos || [])) {
        const url = await idbGet(ph.id)
        if (url) photos.push({ ...ph, url })
      }
      e.photos = photos
    }
    return entries
  }
  const { data: entries, error } = await supabase
    .from('log_entries')
    .select('*')
    .order('visit_date', { ascending: false })
  if (error) { console.warn('fetchLog', error); return [] }
  const { data: photos } = await supabase
    .from('log_photos')
    .select('*')
    .order('created_at', { ascending: true })
  const byEntry = {}
  ;(photos || []).forEach(p => {
    ;(byEntry[p.entry_id] ||= []).push({
      id: p.id,
      addedBy: p.added_by,
      _path: p.storage_path,
      url: supabase.storage.from(BUCKET).getPublicUrl(p.storage_path).data.publicUrl,
    })
  })
  return entries.map(e => ({
    id: e.id,
    placeName: e.place_name,
    rating: e.rating,
    notes: e.notes,
    date: e.visit_date,
    loggedAt: e.created_at,
    googleUrl: e.google_url,
    lat: e.lat,
    lng: e.lng,
    addedBy: e.added_by,
    photos: byEntry[e.id] || [],
  }))
}

// data: { placeName, rating, notes, visitDate, googleUrl, lat, lng }
// visitDate is the day they actually went (YYYY-MM-DD); created_at records when
// the entry was logged. Returns the created entry (with id) for photo attaching.
export async function addLog(data) {
  const me = getMe()
  const visitISO = data.visitDate ? new Date(data.visitDate).toISOString() : new Date().toISOString()
  if (!isCloud) {
    const entry = {
      id: uid(),
      placeName: data.placeName,
      rating: data.rating ?? 5,
      notes: data.notes || '',
      date: visitISO,
      loggedAt: new Date().toISOString(),
      googleUrl: data.googleUrl || null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      addedBy: me,
      photos: [],
    }
    lsSet(LS.log, [entry, ...lsGet(LS.log)]); ping()
    return entry
  }
  const { data: row, error } = await supabase
    .from('log_entries')
    .insert({
      place_name: data.placeName,
      rating: data.rating ?? 5,
      notes: data.notes || null,
      visit_date: visitISO,
      google_url: data.googleUrl || null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      added_by: me,
    })
    .select()
    .single()
  if (error) { console.warn('addLog', error); throw error }
  return { id: row.id, placeName: row.place_name, addedBy: row.added_by, photos: [] }
}

// Edit an existing memory (name, rating, notes, visit date, link, coords).
export async function updateLog(id, data) {
  const visitISO = data.visitDate ? new Date(data.visitDate).toISOString() : null
  if (!isCloud) {
    const entries = lsGet(LS.log)
    const i = entries.findIndex(e => e.id === id)
    if (i !== -1) {
      entries[i] = {
        ...entries[i],
        placeName: data.placeName ?? entries[i].placeName,
        rating: data.rating ?? entries[i].rating,
        notes: data.notes ?? entries[i].notes,
        date: visitISO || entries[i].date,
        googleUrl: data.googleUrl !== undefined ? data.googleUrl : entries[i].googleUrl,
        lat: data.lat !== undefined ? data.lat : entries[i].lat,
        lng: data.lng !== undefined ? data.lng : entries[i].lng,
      }
      lsSet(LS.log, entries); ping()
    }
    return
  }
  const patch = {}
  if (data.placeName !== undefined) patch.place_name = data.placeName
  if (data.rating    !== undefined) patch.rating = data.rating
  if (data.notes     !== undefined) patch.notes = data.notes || null
  if (visitISO)                     patch.visit_date = visitISO
  if (data.googleUrl !== undefined) patch.google_url = data.googleUrl || null
  if (data.lat       !== undefined) patch.lat = data.lat
  if (data.lng       !== undefined) patch.lng = data.lng
  const { error } = await supabase.from('log_entries').update(patch).eq('id', id)
  if (error) { console.warn('updateLog', error); throw error }
}

export async function removeLog(id) {
  if (!isCloud) {
    const entries = lsGet(LS.log)
    const target = entries.find(e => e.id === id)
    if (target) for (const ph of (target.photos || [])) await idbDel(ph.id).catch(() => {})
    lsSet(LS.log, entries.filter(e => e.id !== id)); ping()
    return
  }
  // remove photo files from storage first, then the entry (cascade clears rows)
  const { data: photos } = await supabase
    .from('log_photos').select('storage_path').eq('entry_id', id)
  if (photos?.length) {
    await supabase.storage.from(BUCKET).remove(photos.map(p => p.storage_path))
  }
  await supabase.from('log_entries').delete().eq('id', id)
}

export async function addPhoto(entryId, file) {
  const me = getMe()
  const blob = await compress(file)
  if (!isCloud) {
    const photoId = uid()
    const dataUrl = await fileToDataURL(blob)
    await idbPut(photoId, dataUrl)
    const entries = lsGet(LS.log)
    const e = entries.find(x => x.id === entryId)
    if (e) { (e.photos ||= []).push({ id: photoId, addedBy: me }); lsSet(LS.log, entries); ping() }
    return
  }
  const path = `${entryId}/${uid()}.jpg`
  const up = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg', upsert: false,
  })
  if (up.error) { console.warn('upload', up.error); throw up.error }
  await supabase.from('log_photos').insert({
    entry_id: entryId, storage_path: path, added_by: me,
  })
}

export async function removePhoto(photo) {
  if (!isCloud) {
    await idbDel(photo.id).catch(() => {})
    const entries = lsGet(LS.log)
    for (const e of entries) e.photos = (e.photos || []).filter(p => p.id !== photo.id)
    lsSet(LS.log, entries); ping()
    return
  }
  if (photo._path) await supabase.storage.from(BUCKET).remove([photo._path])
  await supabase.from('log_photos').delete().eq('id', photo.id)
}

// ═════════════════════════════════════════════════════════════════════════════
//  REALTIME — call `cb` whenever shared data changes (so both phones stay in sync)
//  Returns an unsubscribe function.
// ═════════════════════════════════════════════════════════════════════════════
export function subscribe(cb) {
  if (!isCloud) {
    const h = e => { if (!e || e.key === 'dn_ping' || e.key === LS.log || e.key === LS.saved) cb() }
    window.addEventListener('storage', h)
    return () => window.removeEventListener('storage', h)
  }
  const ch = supabase
    .channel('dn_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_places' }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'log_entries' }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'log_photos' }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'flights' }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'movies' }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_prefs' }, cb)
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Google Maps link resolver — calls the /api/resolve-place serverless function
//  Returns { name, lat, lng } (any field may be null). Falls back gracefully.
// ═════════════════════════════════════════════════════════════════════════════
export async function resolvePlace(url) {
  try {
    const res = await fetch(`/api/resolve-place?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Geocoding — turn a destination name into coordinates for the map.
//  Uses Open-Meteo's free geocoding API (no key — same service as the weather).
// ═════════════════════════════════════════════════════════════════════════════
// Search for places matching `name`, biggest cities first. Open-Meteo matches
// names literally ("newyork" → a hamlet in Scotland!), so we fetch several
// candidates and rank by population to favour the city people actually mean.
export async function geocodeSearch(name, count = 5) {
  if (!name?.trim()) return []
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name.trim())}&count=${count}&language=en&format=json`
    )
    const d = await r.json()
    return (d?.results || [])
      .map(h => ({
        lat: h.latitude,
        lng: h.longitude,
        name: h.name,
        label: [h.name, h.admin1, h.country].filter(Boolean).join(', '),
        population: h.population || 0,
      }))
      .sort((a, b) => b.population - a.population)
  } catch { return [] }
}

export async function geocode(name) {
  const hits = await geocodeSearch(name, 5)
  if (!hits.length) return null
  return { lat: hits[0].lat, lng: hits[0].lng, label: hits[0].label }
}

// ═════════════════════════════════════════════════════════════════════════════
//  FLIGHTS (Janjon's schedule) — shared + live-synced, with map coordinates
// ═════════════════════════════════════════════════════════════════════════════
const LS_FLIGHTS = 'dn_f'

export async function fetchFlights() {
  if (!isCloud) return lsGet(LS_FLIGHTS)
  const { data, error } = await supabase
    .from('flights')
    .select('*')
    .order('departure_date', { ascending: true })
  if (error) { console.warn('fetchFlights', error); return [] }
  return data.map(r => ({
    id: r.id,
    destination: r.destination,
    flightNum: r.flight_num || '',
    departureDate: r.departure_date,
    returnDate: r.return_date,
    lat: r.lat,
    lng: r.lng,
    addedBy: r.added_by,
  }))
}

// f: { destination, flightNum, departureDate, returnDate }
export async function addFlight(f) {
  const me = getMe()
  // look up coordinates so the destination can be placed on the map
  let lat = f.lat ?? null, lng = f.lng ?? null
  if ((lat == null || lng == null) && f.destination) {
    const g = await geocode(f.destination)
    if (g) { lat = g.lat; lng = g.lng }
  }
  if (!isCloud) {
    const entry = {
      id: uid(), destination: f.destination, flightNum: f.flightNum || '',
      departureDate: f.departureDate, returnDate: f.returnDate, lat, lng, addedBy: me,
    }
    lsSet(LS_FLIGHTS, [entry, ...lsGet(LS_FLIGHTS)]); ping()
    return entry
  }
  const { data, error } = await supabase
    .from('flights')
    .insert({
      destination: f.destination,
      flight_num: f.flightNum || null,
      departure_date: f.departureDate,
      return_date: f.returnDate,
      lat, lng, added_by: me,
    })
    .select()
    .single()
  if (error) { console.warn('addFlight', error); throw error }
  return { id: data.id }
}

// Edit an existing flight. Re-geocodes if the destination changed so the map stays right.
export async function updateFlight(id, f) {
  let lat = f.lat ?? null, lng = f.lng ?? null
  if ((lat == null || lng == null) && f.destination) {
    const g = await geocode(f.destination)
    if (g) { lat = g.lat; lng = g.lng }
  }
  if (!isCloud) {
    const list = lsGet(LS_FLIGHTS)
    const i = list.findIndex(x => x.id === id)
    if (i !== -1) {
      list[i] = {
        ...list[i],
        destination: f.destination,
        flightNum: f.flightNum || '',
        departureDate: f.departureDate,
        returnDate: f.returnDate,
        lat, lng,
      }
      lsSet(LS_FLIGHTS, list); ping()
    }
    return
  }
  await supabase
    .from('flights')
    .update({
      destination: f.destination,
      flight_num: f.flightNum || null,
      departure_date: f.departureDate,
      return_date: f.returnDate,
      lat, lng,
    })
    .eq('id', id)
}

export async function removeFlight(id) {
  if (!isCloud) {
    lsSet(LS_FLIGHTS, lsGet(LS_FLIGHTS).filter(f => f.id !== id)); ping()
    return
  }
  await supabase.from('flights').delete().eq('id', id)
}

// ═════════════════════════════════════════════════════════════════════════════
//  PREFS (shared taste model + swipe history)
//  Loaded once on open and saved on change — not live, to avoid clobbering an
//  in-progress swipe. A single shared row holds the whole prefs object.
// ═════════════════════════════════════════════════════════════════════════════
const LS_PREFS = 'dn_p'
const lsGetRaw = k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }

export async function fetchPrefs() {
  if (!isCloud) return lsGetRaw(LS_PREFS)
  const { data, error } = await supabase
    .from('app_prefs').select('data').eq('id', 'shared').maybeSingle()
  if (error) { console.warn('fetchPrefs', error); return null }
  return data?.data || null
}

export async function savePrefs(prefs) {
  // always keep a local copy too
  try { localStorage.setItem(LS_PREFS, JSON.stringify(prefs)) } catch { /* */ }
  if (!isCloud) { ping(); return }
  await supabase
    .from('app_prefs')
    .upsert({ id: 'shared', data: prefs, updated_at: new Date().toISOString() }, { onConflict: 'id' })
}

// ═════════════════════════════════════════════════════════════════════════════
//  Generic shared rows in app_prefs (one JSON blob per id) — used for the
//  shared locations and the key-dates/occasions config.
// ═════════════════════════════════════════════════════════════════════════════
async function fetchPrefsRow(rowId, lsKey) {
  if (!isCloud) return lsGetRaw(lsKey)
  const { data, error } = await supabase
    .from('app_prefs').select('data').eq('id', rowId).maybeSingle()
  if (error) { console.warn(`fetch ${rowId}`, error); return null }
  return data?.data || null
}

async function savePrefsRow(rowId, lsKey, obj) {
  try { localStorage.setItem(lsKey, JSON.stringify(obj)) } catch { /* */ }
  if (!isCloud) { ping(); return }
  await supabase
    .from('app_prefs')
    .upsert({ id: rowId, data: obj, updated_at: new Date().toISOString() }, { onConflict: 'id' })
}

// ── Locations — shared & global. { Boody: {lat,lng,updatedAt}, Janjon: {...} }
export const fetchLocations = () => fetchPrefsRow('locations', 'dn_loc')
export async function saveLocation(person, lat, lng) {
  const cur = (await fetchLocations()) || {}
  const next = { ...cur, [person]: { lat, lng, updatedAt: new Date().toISOString() } }
  await savePrefsRow('locations', 'dn_loc', next)
  return next
}

// ── Occasions / key dates — shared.
//    { firstDate: 'YYYY-MM-DD', herBirthday: 'YYYY-MM-DD',
//      custom: [{ id, name, date: 'YYYY-MM-DD', yearly: true }] }
export const fetchOccasions = () => fetchPrefsRow('occasions', 'dn_occ')
export const saveOccasions  = occ => savePrefsRow('occasions', 'dn_occ', occ)

// ═════════════════════════════════════════════════════════════════════════════
//  MOVIES — shared watchlist with ratings from each of you
//  Shape: { id, title, notes, addedBy, createdAt, watchedAt, ratings: {Boody: n, Janjon: n} }
// ═════════════════════════════════════════════════════════════════════════════
const LS_MOVIES = 'dn_m'

export async function fetchMovies() {
  if (!isCloud) return lsGet(LS_MOVIES)
  const { data, error } = await supabase
    .from('movies').select('*').order('created_at', { ascending: false })
  if (error) { console.warn('fetchMovies', error); return [] }
  return data.map(r => ({
    id: r.id, title: r.title, notes: r.notes || '', meta: r.meta || null,
    addedBy: r.added_by, createdAt: r.created_at,
    watchedAt: r.watched_at, ratings: r.ratings || {},
  }))
}

// meta (optional, from TMDB): { tmdbId, year, poster, plot, score, genres, runtime }
export async function addMovie(title, meta = null, notes = '') {
  const me = getMe()
  if (!isCloud) {
    const m = { id: uid(), title, notes, meta, addedBy: me, createdAt: new Date().toISOString(), watchedAt: null, ratings: {} }
    lsSet(LS_MOVIES, [m, ...lsGet(LS_MOVIES)]); ping()
    return m
  }
  const { error } = await supabase.from('movies').insert({ title, notes: notes || null, meta, added_by: me })
  if (error) { console.warn('addMovie', error); throw error }
}

// ── TMDB lookup (proxied through /api/movie-search so the key stays secret) ──
export async function searchMovies(q) {
  if (!q?.trim()) return []
  try {
    const r = await fetch(`/api/movie-search?q=${encodeURIComponent(q.trim())}`)
    if (!r.ok) return []
    const d = await r.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

export async function movieDetails(tmdbId) {
  try {
    const r = await fetch(`/api/movie-search?id=${encodeURIComponent(tmdbId)}`)
    if (!r.ok) return null
    const d = await r.json()
    return d && d.id ? d : null
  } catch { return null }
}

// patch: { watchedAt?, myRating?, title?, notes? } — myRating is stamped under getMe()
export async function updateMovie(id, patch) {
  const me = getMe()
  if (!isCloud) {
    const list = lsGet(LS_MOVIES)
    const i = list.findIndex(m => m.id === id)
    if (i !== -1) {
      const m = { ...list[i] }
      if (patch.watchedAt !== undefined) m.watchedAt = patch.watchedAt
      if (patch.title     !== undefined) m.title = patch.title
      if (patch.notes     !== undefined) m.notes = patch.notes
      if (patch.myRating  !== undefined) m.ratings = { ...m.ratings, [me]: patch.myRating }
      list[i] = m; lsSet(LS_MOVIES, list); ping()
    }
    return
  }
  const upd = {}
  if (patch.watchedAt !== undefined) upd.watched_at = patch.watchedAt
  if (patch.title     !== undefined) upd.title = patch.title
  if (patch.notes     !== undefined) upd.notes = patch.notes || null
  if (patch.myRating  !== undefined) {
    // read-modify-write the ratings blob (2-person app: races are harmless)
    const { data } = await supabase.from('movies').select('ratings').eq('id', id).maybeSingle()
    upd.ratings = { ...(data?.ratings || {}), [me]: patch.myRating }
  }
  await supabase.from('movies').update(upd).eq('id', id)
}

export async function removeMovie(id) {
  if (!isCloud) {
    lsSet(LS_MOVIES, lsGet(LS_MOVIES).filter(m => m.id !== id)); ping()
    return
  }
  await supabase.from('movies').delete().eq('id', id)
}

// ═════════════════════════════════════════════════════════════════════════════
//  PUSH NOTIFICATIONS — register this device for real lock-screen notifications
//  Requires: VITE_VAPID_PUBLIC_KEY env var + the push_subscriptions table
//  (see supabase-update.sql) + the /api/send-reminders cron on Vercel.
// ═════════════════════════════════════════════════════════════════════════════
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
export const pushConfigured = !!VAPID_PUBLIC && isCloud

function urlB64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// Returns 'subscribed' | 'denied' | 'unsupported' | 'unconfigured'
export async function enablePush() {
  if (!pushConfigured) return 'unconfigured'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8(VAPID_PUBLIC),
  })
  const json = sub.toJSON()
  await supabase.from('push_subscriptions').upsert(
    { endpoint: json.endpoint, subscription: json, person: getMe() },
    { onConflict: 'endpoint' }
  )
  return 'subscribed'
}

// (sync marker)
export async function getPushStatus() {
  if (!pushConfigured) return 'unconfigured'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'subscribed' : 'off'
  } catch { return 'off' }
}
