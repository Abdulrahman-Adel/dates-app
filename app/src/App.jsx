import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import * as cloud from './cloud'
import { PEOPLE } from './cloud'
import FlightsMap from './FlightsMap'

// ─── Sticker assets ───────────────────────────────────────────────────────────
import leftStickerSrc  from '../Stickers/Left Image.png'
import rightStickerSrc from '../Stickers/Right Image.png'
import sticker1Src     from '../Stickers/Sticker 1.png'
import sticker2Src     from '../Stickers/Sticker 2.png'
import sticker3Src     from '../Stickers/Sticker 3.png'
import peekStickerSrc  from '../Stickers/Peek Sticker.png'

// ─── Storage ──────────────────────────────────────────────────────────────────
const SK = { settings: 'dn_s', log: 'dn_l', prefs: 'dn_p', liked: 'dn_k', flights: 'dn_f' }
const ls = k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
const ss = (k, v) => localStorage.setItem(k, JSON.stringify(v))

// ─── IndexedDB photo store ────────────────────────────────────────────────────
const DB_NAME = 'dn_photos'
const DB_VER  = 1
const STORE   = 'photos'

function openPhotoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE)
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

async function savePhoto(key, blob) {
  const db = await openPhotoDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, key)
    tx.oncomplete = resolve
    tx.onerror    = e => reject(e.target.error)
  })
}

async function getPhoto(key) {
  if (!key) return null
  const db = await openPhotoDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = e => resolve(e.target.result || null)
    req.onerror   = e => reject(e.target.error)
  })
}

async function deletePhoto(key) {
  if (!key) return
  const db = await openPhotoDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = resolve
    tx.onerror    = e => reject(e.target.error)
  })
}

// ─── Image compression via canvas ────────────────────────────────────────────
function compressImage(file, maxPx = 1200, quality = 0.78) {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width  * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality)
    }
    img.src = url
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, r = Math.PI / 180
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

const PRICE_NUM = {
  'Budget (< AED 50pp)': 1,
  'Moderate (AED 50–150pp)': 2,
  'Expensive (AED 150–300pp)': 3,
  'Luxury (AED 300+pp)': 4,
}

// ─── Dress-code inference ─────────────────────────────────────────────────────
function getDressCode(category, priceLevel) {
  const price = PRICE_NUM[priceLevel] || 2
  if (category === 'Sports')   return 'Comfortable'
  if (category === 'Wellness') return 'Comfortable'
  if (category === 'Shopping') return 'Casual'
  if (category === 'Day Trip') return 'Casual'
  if (category === 'Outdoor')  return price >= 3 ? 'Smart Casual' : 'Casual'
  if (price === 4) return category === 'Dining' ? 'Formal' : 'Smart'
  if (price === 3) return 'Smart Casual'
  if (price === 2) return category === 'Dining' ? 'Smart Casual' : 'Casual'
  return 'Casual'
}

const DRESS_CODE_META = {
  'Casual':       { emoji: '👟', color: '#6a8c5a', tips: ['Jeans & sneakers work', 'Relaxed top or tee', 'Trainers or flats'] },
  'Comfortable':  { emoji: '🤸', color: '#5a8a88', tips: ['Breathable fabrics', 'Activewear welcome', 'Comfortable footwear'] },
  'Smart Casual': { emoji: '👗', color: '#c4933f', tips: ['Nice jeans or a dress', 'Blouse or fitted top', 'Heeled sandals or loafers'] },
  'Smart':        { emoji: '✨', color: '#8c5a7a', tips: ['Cocktail dress or tailored trousers', 'Heels or dressy flats', 'Elegant accessories'] },
  'Formal':       { emoji: '💎', color: '#c4604a', tips: ['Evening gown or cocktail dress', 'Heels required', 'Jewellery & a clutch'] },
}

// ─── Date formatting helper ───────────────────────────────────────────────────
const fmtDateShort = d => new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })

const CAT_COLOR = {
  Dining: '#c4604a',
  Outdoor: '#4a8c6a',
  'Arts & Culture': '#7a5c8c',
  Entertainment: '#c4933f',
  Sports: '#3a7a9c',
  Wellness: '#8c6a5a',
  Views: '#c47a3a',
  Experience: '#5a7a8c',
  Shopping: '#8c5a7a',
  'Day Trip': '#6a8c5a',
}

const CAT_EMOJI = {
  Dining: '🍽️', Outdoor: '🌿', 'Arts & Culture': '🎨',
  Entertainment: '🎭', Sports: '⚡', Wellness: '🧘',
  Views: '🌆', Experience: '✨', Shopping: '🛍️', 'Day Trip': '🚗',
}

function largePhoto(url) {
  if (!url) return null
  return url.replace(/=w\d+-h\d+-k-no$/, '=w800-h600-k-no')
             .replace(/=w\d+-h\d+$/, '=w800-h600')
}

function fmtDist(km) {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)} km`
}

// ─── Opening-hours checker ────────────────────────────────────────────────────
function isOpenNow(openingHours) {
  if (!openingHours || Object.keys(openingHours).length === 0) return null
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const now = new Date()
  const todayName = DAYS[now.getDay()]
  const hoursStr =
    openingHours[todayName] ||
    Object.entries(openingHours).find(([k]) => k.startsWith(todayName.slice(0, 3)))?.[1]
  if (!hoursStr) return null
  const s = hoursStr.toLowerCase().trim()
  if (s === 'closed') return false
  if (s.includes('24 hours') || s.includes('open 24')) return true
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–—to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (!m) return null
  const to24 = (h, min, p) => {
    h = parseInt(h); min = parseInt(min || 0)
    if (p.toLowerCase() === 'pm' && h !== 12) h += 12
    if (p.toLowerCase() === 'am' && h === 12) h = 0
    return h * 60 + min
  }
  const open = to24(m[1], m[2], m[3])
  const close = to24(m[4], m[5], m[6])
  const cur = now.getHours() * 60 + now.getMinutes()
  return close < open ? (cur >= open || cur <= close) : (cur >= open && cur <= close)
}

// ─── Opening-hours range for a given date ────────────────────────────────────
// Returns 'closed' | '24h' | { open, close } (minutes since midnight) | null
function hoursRangeFor(openingHours, date) {
  if (!openingHours || Object.keys(openingHours).length === 0) return null
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const dayName = DAYS[date.getDay()]
  const hoursStr =
    openingHours[dayName] ||
    Object.entries(openingHours).find(([k]) => k.startsWith(dayName.slice(0, 3)))?.[1]
  if (!hoursStr) return null
  const s = hoursStr.toLowerCase().trim()
  if (s === 'closed') return 'closed'
  if (s.includes('24 hours') || s.includes('open 24')) return '24h'
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–—to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (!m) return null
  const to24 = (h, min, p) => {
    h = parseInt(h); min = parseInt(min || 0)
    if (p === 'pm' && h !== 12) h += 12
    if (p === 'am' && h === 12) h = 0
    return h * 60 + min
  }
  return { open: to24(m[1], m[2], m[3].toLowerCase()), close: to24(m[4], m[5], m[6].toLowerCase()) }
}

// ─── Duration fit — will the place still be open for the whole visit? ────────
// start: Date of planned arrival · hours: planned length of the evening
function durationFitScore(openingHours, start, hours) {
  const r = hoursRangeFor(openingHours, start)
  if (r == null) return 0            // unknown hours — stay neutral
  if (r === 'closed') return -70
  if (r === '24h') return 12
  const startMin = start.getHours() * 60 + start.getMinutes()
  let { open, close } = r
  if (close <= open) close += 1440   // closes after midnight
  if (open - startMin > 90) return -40        // doesn't open until much later
  const minsLeft = close - startMin
  if (minsLeft <= 0) return -70               // already closed by then
  if (minsLeft < 45) return -50               // closing almost immediately
  if (startMin + hours * 60 <= close) return 14   // open for the whole visit ✓
  const cutShort = startMin + hours * 60 - close
  return -Math.min(40, (cutShort / 15) * 5)   // closes partway through
}

// ─── Relationship stats from the first-date anchor ───────────────────────────
function relationshipStats(firstDate) {
  if (!firstDate) return null
  const start = new Date(firstDate + 'T00:00')
  if (isNaN(start)) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  if (now < start) return null
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  let anchor = new Date(start); anchor.setMonth(start.getMonth() + months)
  if (anchor > now) { months--; anchor = new Date(start); anchor.setMonth(start.getMonth() + months) }
  const days = Math.round((now - anchor) / 86400000)
  const totalDays = Math.round((now - start) / 86400000)
  return { months, days, totalDays }
}

// ─── Upcoming occasions (built-ins + key dates + custom) ─────────────────────
function nextYearly(month, day, today) {
  let d = new Date(today.getFullYear(), month, day)
  if (d < today) d = new Date(today.getFullYear() + 1, month, day)
  return d
}

function buildOccasions(occ) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const out = []
  const push = (key, name, date, emoji, big = false) => {
    const daysAway = Math.round((date - today) / 86400000)
    if (daysAway >= 0 && daysAway <= 370) out.push({ key, name, date, daysAway, emoji, big })
  }

  push('valentines', "Valentine's Day", nextYearly(1, 14, today), '🌹', true)
  push('newyear', "New Year's Eve", nextYearly(11, 31, today), '🎆', true)

  if (occ?.herBirthday) {
    const b = new Date(occ.herBirthday + 'T00:00')
    if (!isNaN(b)) push('birthday', 'Her birthday', nextYearly(b.getMonth(), b.getDate(), today), '🎂', true)
  }

  if (occ?.firstDate) {
    const fd = new Date(occ.firstDate + 'T00:00')
    if (!isNaN(fd)) {
      const ann = nextYearly(fd.getMonth(), fd.getDate(), today)
      const years = ann.getFullYear() - fd.getFullYear()
      if (years >= 1) push('anniversary', `${years} year${years > 1 ? 's' : ''} together`, ann, '💍', true)
      // monthly mini-anniversary on the same day-of-month (unless it IS the anniversary)
      let m = new Date(today.getFullYear(), today.getMonth(), fd.getDate())
      if (m < today) m = new Date(today.getFullYear(), today.getMonth() + 1, fd.getDate())
      if (m > fd && m.toDateString() !== ann.toDateString()) {
        const monthsT = (m.getFullYear() - fd.getFullYear()) * 12 + (m.getMonth() - fd.getMonth())
        push('monthiversary', `${monthsT} month${monthsT > 1 ? 's' : ''} together`, m, '💕', false)
      }
    }
  }

  ;(occ?.custom || []).forEach(c => {
    const d = new Date(c.date + 'T00:00')
    if (isNaN(d)) return
    push(`custom_${c.id}`, c.name, c.yearly !== false ? nextYearly(d.getMonth(), d.getDate(), today) : d, '🎉', true)
  })

  return out.sort((a, b) => a.daysAway - b.daysAway)
}

// ─── Time-of-day → category bonus map ────────────────────────────────────────
function getTimeBonusMap(hour) {
  if (hour >= 6  && hour < 11) return { Dining: 8,  Wellness: 14, Outdoor: 12, 'Arts & Culture': 4 }
  if (hour >= 11 && hour < 15) return { Dining: 18, Shopping: 10, 'Arts & Culture': 8, Experience: 6 }
  if (hour >= 15 && hour < 18) return { Shopping: 12, 'Arts & Culture': 14, Views: 10, Outdoor: 8, Experience: 8 }
  if (hour >= 18 && hour < 21) return { Dining: 20, Views: 16, Entertainment: 14, Experience: 10 }
  return { Entertainment: 20, Dining: 14, Views: 12, Experience: 10 }  // night
}

// ─── Build preference model from swipe & like history ────────────────────────
function buildPreferenceModel(liked, prefs) {
  const model = {
    catAffinity: {}, tagAffinity: {},
    avgPrice: 2,
    catSwipeCounts: {}, totalSwipes: 0,
    dislikedReasons: prefs.dislikedReasons || {},
  }
  model.totalSwipes = (prefs.swipedRight || []).length + (prefs.swipedLeft || []).length
  if (liked.length === 0) return model

  // Category affinity: normalised count of right-swipes per category
  liked.forEach(p => {
    model.catAffinity[p.category]    = (model.catAffinity[p.category]    || 0) + 1
    model.catSwipeCounts[p.category] = (model.catSwipeCounts[p.category] || 0) + 1
  })
  const maxCat = Math.max(...Object.values(model.catAffinity), 1)
  Object.keys(model.catAffinity).forEach(k => { model.catAffinity[k] /= maxCat })

  // Tag affinity: fraction of liked places that have each tag
  const TAGS = ['outdoor_seating','serves_alcohol','live_music','allows_dogs',
                'reservable','serves_vegetarian','good_for_groups']
  TAGS.forEach(tag => {
    model.tagAffinity[tag] = liked.filter(p => p[tag]).length / liked.length
  })

  // Average price tier of liked places
  const prices = liked.map(p => PRICE_NUM[p.price_level]).filter(Boolean)
  if (prices.length) model.avgPrice = prices.reduce((a, b) => a + b) / prices.length

  return model
}

// ─── Advanced unified place scorer ───────────────────────────────────────────
function scorePlaceAdvanced(place, model, context) {
  const { answers, midLat, midLng, now = new Date(), checkOpenNow = false, weather = null } = context
  let score = 0

  // 1. Base quality
  score += (place.rating || 3.5) * 20
  if (place.rating_count > 500)   score += 6
  if (place.rating_count > 2000)  score += 6
  if (place.rating_count > 10000) score += 4

  // 2. Quiz vibe affinity
  const VIBE_CATS = {
    romantic:    ['Dining','Views','Experience','Wellness'],
    adventurous: ['Outdoor','Sports','Experience','Day Trip'],
    chill:       ['Dining','Wellness','Arts & Culture'],
    foodie:      ['Dining'],
    cultural:    ['Arts & Culture','Experience','Day Trip'],
    surprise:    null,
  }
  const vibeCats = VIBE_CATS[answers?.vibe] || null
  if (vibeCats?.includes(place.category)) score += 20

  // 3. Learned category affinity (content-based filtering)
  score += (model.catAffinity[place.category] || 0) * 28

  // 4. Learned tag affinity
  const TAGS = ['outdoor_seating','serves_alcohol','live_music','allows_dogs',
                'serves_vegetarian','good_for_groups']
  TAGS.forEach(tag => {
    const pref = model.tagAffinity[tag] || 0
    if (place[tag] && pref > 0.5) score += (pref - 0.5) * 16
  })

  // 5. Price alignment (penalise deviation from learned preference)
  const placePrice = PRICE_NUM[place.price_level] || 2
  score -= Math.abs(placePrice - model.avgPrice) * 5
  if ((answers?.budget || 0) > 0 && placePrice > answers.budget) score -= 18

  // 6. Distance scoring
  if (midLat != null && midLng != null && place.lat && place.lng) {
    const d = haversine(midLat, midLng, place.lat, place.lng)
    score += d < 2  ? 28 : d < 5  ? 20 : d < 10 ? 12
           : d < 20 ? 4  : d < 40 ? 0  : d < 60  ? -20 : -35
    const tooFar = model.dislikedReasons.tooFar || 0
    if (tooFar) score -= Math.min(tooFar, 5) * (d / 8)
  }

  // 7. Opening-hours bonus (used in spontaneous mode)
  if (checkOpenNow) {
    const open = isOpenNow(place.opening_hours)
    if (open === true)  score += 18
    if (open === false) score -= 50
  }

  // 8. Time-of-day affinity
  score += (getTimeBonusMap(now.getHours())[place.category] || 0)

  // 8.5 Duration fit — only suggest places that will still be open for the
  //     whole time you plan to spend out (uses the quiz's when + duration)
  if (answers?.when && answers?.duration > 0) {
    const start = new Date(answers.when)
    if (!isNaN(start)) score += durationFitScore(place.opening_hours, start, answers.duration)
  }

  // 9. Weather penalty (Dubai heat / humidity)
  if (weather) {
    const { tempC, humidity } = weather
    const isOutdoor = ['Outdoor', 'Sports', 'Day Trip', 'Views'].includes(place.category)
    const hasOutdoorSeating = place.outdoor_seating === true

    if (isOutdoor || hasOutdoorSeating) {
      const hour = now.getHours()
      const isDaytime = hour >= 7 && hour < 20

      // Heat penalty — Dubai summers regularly hit 42–46°C
      if (tempC > 45)      score -= isOutdoor ? 60 : 20
      else if (tempC > 42) score -= isOutdoor ? 50 : 15
      else if (tempC > 38) score -= isOutdoor ? 35 : 10
      else if (tempC > 35) score -= isOutdoor ? 20 : 5
      else if (tempC > 32 && isDaytime) score -= isOutdoor ? 10 : 0

      // Humidity penalty (feels much worse >70% even at night)
      if (humidity > 85)      score -= isOutdoor ? 30 : 10
      else if (humidity > 75) score -= isOutdoor ? 18 : 6
      else if (humidity > 65) score -= isOutdoor ? 8  : 2

      // Nice weather bonus (cool Dubai winter evening)
      if (tempC < 28 && humidity < 55) score += isOutdoor ? 18 : 6
    }

    // Bad weather → boost indoor alternatives
    const isTooHot = tempC > 35 || humidity > 75
    if (isTooHot && ['Dining', 'Entertainment', 'Wellness', 'Arts & Culture', 'Shopping'].includes(place.category)) {
      score += 12
    }
  }

  // 10. UCB-inspired exploration bonus
  //    sqrt(2 * ln(totalSwipes) / swipesInCategory) encourages trying unseen categories
  if (model.totalSwipes >= 10) {
    const n = model.catSwipeCounts[place.category] || 0
    const ucb = n === 0 ? 15 : Math.sqrt(2 * Math.log(model.totalSwipes) / (n + 1)) * 6
    score += Math.min(ucb, 15)
  }

  // 10. Skip-reason penalties (learned feedback)
  const r = model.dislikedReasons
  if (r.tooExpensive) score -= Math.min(r.tooExpensive, 5) * placePrice * 2
  if (r.notMyVibe && !model.catAffinity[place.category])
    score -= Math.min(r.notMyVibe, 5) * 3

  // 11. Small jitter for freshness
  score += Math.random() * 5

  return score
}

// ─── Quiz config ──────────────────────────────────────────────────────────────
const QUIZ_STEPS = [
  {
    id: 'vibe',
    q: "What's the vibe tonight?",
    type: 'cards',
    options: [
      { v: 'romantic', label: 'Romantic', emoji: '🌹', desc: 'Intimate, candlelit, special' },
      { v: 'adventurous', label: 'Adventure', emoji: '🪂', desc: 'Thrilling, active, unique' },
      { v: 'chill', label: 'Chill', emoji: '☕', desc: 'Relaxed, cozy, low-key' },
      { v: 'foodie', label: 'Foodie', emoji: '🍽️', desc: 'Amazing food, new flavors' },
      { v: 'cultural', label: 'Culture', emoji: '🎭', desc: 'Art, history, experiences' },
      { v: 'surprise', label: 'Surprise', emoji: '✨', desc: 'Whatever feels right' },
    ],
  },
  {
    id: 'budget',
    q: "What's your budget per person?",
    type: 'cards',
    options: [
      { v: 1, label: 'Casual', emoji: '💸', desc: '< AED 50' },
      { v: 2, label: 'Moderate', emoji: '💳', desc: 'AED 50–150' },
      { v: 3, label: 'Splurge', emoji: '💎', desc: 'AED 150–300' },
      { v: 4, label: 'Luxury', emoji: '👑', desc: 'AED 300+' },
      { v: 0, label: 'Flexible', emoji: '🤷', desc: 'No limit' },
    ],
  },
  {
    id: 'when',
    q: 'When are you going?',
    type: 'datetime',
  },
  {
    id: 'duration',
    q: 'How long do you have?',
    type: 'cards',
    options: [
      { v: 2, label: 'Quick', emoji: '⏱️', desc: '~2 hours' },
      { v: 4, label: 'Half evening', emoji: '🌆', desc: '3–4 hours' },
      { v: 6, label: 'Full night', emoji: '🌙', desc: '5+ hours' },
      { v: 0, label: 'Flexible', emoji: '🤷', desc: 'No time limit' },
    ],
  },
  {
    id: 'categories',
    q: 'Any type preference?',
    hint: 'Skip to show everything',
    type: 'multiselect',
    options: [
      { v: 'Dining', emoji: '🍽️' },
      { v: 'Outdoor', emoji: '🌿' },
      { v: 'Arts & Culture', emoji: '🎨' },
      { v: 'Entertainment', emoji: '🎭' },
      { v: 'Sports', emoji: '⚡' },
      { v: 'Wellness', emoji: '🧘' },
      { v: 'Experience', emoji: '✨' },
      { v: 'Views', emoji: '🌆' },
    ],
  },
]

// ─── SwipeCard ────────────────────────────────────────────────────────────────
function SwipeCard({ place, onSwipe, isTop, stackPos, userLat, userLng }) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false, sx: 0, sy: 0 })
  const [flyOff, setFlyOff] = useState(null) // 'left' | 'right' | null
  const [showDetail, setShowDetail] = useState(false)
  const [imgErr, setImgErr] = useState(false)
  const cardRef = useRef(null)

  // ── Window-peek sticker ──────────────────────────────────────
  const [showPeek, setShowPeek] = useState(false)
  const peekInTimer  = useRef(null)
  const peekOutTimer = useRef(null)

  const startDrag = useCallback((cx, cy) => {
    setDrag({ x: 0, y: 0, active: true, sx: cx, sy: cy })
  }, [])

  const moveDrag = useCallback((cx, cy) => {
    setDrag(d => d.active ? { ...d, x: cx - d.sx, y: cy - d.sy } : d)
  }, [])

  const endDrag = useCallback(() => {
    setDrag(d => {
      if (d.active && Math.abs(d.x) > 110) {
        setFlyOff(d.x > 0 ? 'right' : 'left')
      }
      return { ...d, active: false }
    })
  }, [])

  // Window-level mouse tracking so drag works even if cursor leaves card
  useEffect(() => {
    if (!isTop) return
    const mm = e => moveDrag(e.clientX, e.clientY)
    const mu = () => endDrag()
    window.addEventListener('mousemove', mm)
    window.addEventListener('mouseup', mu)
    return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu) }
  }, [isTop, moveDrag, endDrag])

  // Touch move — needs passive:false to preventDefault
  useEffect(() => {
    if (!isTop) return
    const el = cardRef.current
    if (!el) return
    const tm = e => { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY) }
    el.addEventListener('touchmove', tm, { passive: false })
    return () => el.removeEventListener('touchmove', tm)
  }, [isTop, moveDrag])

  // Schedule window-peek when this becomes the top card
  useEffect(() => {
    if (!isTop) { setShowPeek(false); return }

    clearTimeout(peekInTimer.current)
    clearTimeout(peekOutTimer.current)
    setShowPeek(false)

    // Peek in after 2.5 s, auto-hide after 3 s
    peekInTimer.current = setTimeout(() => {
      setShowPeek(true)
      peekOutTimer.current = setTimeout(() => setShowPeek(false), 3000)
    }, 2500)

    return () => {
      clearTimeout(peekInTimer.current)
      clearTimeout(peekOutTimer.current)
    }
  }, [isTop, place.id])

  // Hide peek the moment the user starts dragging
  useEffect(() => {
    if (drag.active) {
      clearTimeout(peekInTimer.current)
      clearTimeout(peekOutTimer.current)
      setShowPeek(false)
    }
  }, [drag.active])

  const handleTransitionEnd = () => {
    if (flyOff) onSwipe(flyOff)
  }

  const rot = (drag.x / 400) * 18
  const overlayOpacity = Math.min(Math.abs(drag.x) / 100, 1)

  // Sticker peek — 0→1 as drag reaches ±150px; retract on flyOff
  const leftPeek  = (!flyOff && drag.x < -20) ? Math.min(Math.abs(drag.x) / 150, 1) : 0
  const rightPeek = (!flyOff && drag.x >  20) ? Math.min(drag.x / 150, 1) : 0
  const stickerTrans = (drag.active && !flyOff) ? 'none' : 'transform 0.35s ease'
  const photo = !imgErr && place.photo_url ? largePhoto(place.photo_url) : null
  const catColor = CAT_COLOR[place.category] || '#666'

  let distKm = null
  if (userLat && userLng && place.lat && place.lng) {
    distKm = haversine(userLat, userLng, place.lat, place.lng)
  }

  const tags = [
    place.outdoor_seating && '🌿 Outdoor seating',
    place.serves_alcohol && '🍷 Drinks',
    place.live_music && '🎵 Live music',
    place.allows_dogs && '🐾 Dog-friendly',
    place.reservable && '📅 Reservable',
    place.serves_vegetarian && '🥗 Vegetarian',
    place.good_for_groups && '👥 Groups',
  ].filter(Boolean)

  const cardStyle = isTop ? {
    transform: flyOff === 'right'
      ? 'translate(160%, -20%) rotate(30deg)'
      : flyOff === 'left'
      ? 'translate(-160%, -20%) rotate(-30deg)'
      : `translate(${drag.x}px, ${drag.y * 0.15}px) rotate(${rot}deg)`,
    transition: flyOff
      ? 'transform 0.4s ease-in'
      : drag.active
      ? 'none'
      : 'transform 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    cursor: drag.active ? 'grabbing' : 'grab',
    zIndex: 10,
  } : {
    transform: `scale(${1 - stackPos * 0.045}) translateY(${stackPos * 16}px)`,
    transition: 'transform 0.4s ease',
    zIndex: 10 - stackPos,
    pointerEvents: 'none',
    filter: `brightness(${1 - stackPos * 0.08})`,
  }

  return (
    <>
      <div
        ref={cardRef}
        className="swipe-card"
        style={cardStyle}
        onMouseDown={isTop ? e => { e.preventDefault(); startDrag(e.clientX, e.clientY) } : undefined}
        onTouchStart={isTop ? e => startDrag(e.touches[0].clientX, e.touches[0].clientY) : undefined}
        onTouchEnd={isTop ? endDrag : undefined}
        onTransitionEnd={handleTransitionEnd}
      >
        {/* ── Photo ── */}
        <div className="card-photo" style={{ background: `linear-gradient(145deg, ${catColor}30, ${catColor}18)` }}>
          {photo
            ? <img src={photo} alt={place.name} draggable={false} onError={() => setImgErr(true)} />
            : <div className="photo-fallback" style={{ color: catColor }}>{CAT_EMOJI[place.category] || '📍'}</div>
          }

          {/* Swipe direction overlays */}
          {isTop && drag.x > 20 && (
            <div className="swipe-overlay like-overlay" style={{ opacity: overlayOpacity }}>
              <span className="overlay-icon">❤</span>
              <span className="overlay-label">Love it</span>
            </div>
          )}
          {isTop && drag.x < -20 && (
            <div className="swipe-overlay skip-overlay" style={{ opacity: overlayOpacity }}>
              <span className="overlay-icon">✕</span>
              <span className="overlay-label">Skip</span>
            </div>
          )}

          {/* Badges */}
          <span className="badge cat-badge" style={{ background: catColor }}>
            {CAT_EMOJI[place.category]} {place.category}
          </span>
          {place.rating != null && (
            <span className="badge rating-badge">
              ⭐ {place.rating.toFixed(1)}
              {place.rating_count > 0 && (
                <span className="rating-count">
                  &nbsp;({place.rating_count >= 1000
                    ? `${(place.rating_count / 1000).toFixed(1)}k`
                    : place.rating_count})
                </span>
              )}
            </span>
          )}
        </div>

        {/* ── Content ── */}
        <div className="card-content">
          <div className="card-top">
            <h2 className="card-name">{place.name}</h2>
            <div className="card-sub-row">
              {place.subcategory && <span className="card-sub">{place.subcategory}</span>}
              {distKm != null && <span className="card-dist">📍 {fmtDist(distKm)}</span>}
            </div>
            <div className="card-chips">
              {place.price_level && (
                <span className="chip price-chip">{place.price_level}</span>
              )}
              {place.area && <span className="chip area-chip">{place.area}</span>}
              {(() => {
                const dc = getDressCode(place.category, place.price_level)
                const meta = DRESS_CODE_META[dc]
                return (
                  <span className="chip dress-chip" style={{ background: meta.color + '22', color: meta.color, borderColor: meta.color + '44' }}>
                    {meta.emoji} {dc}
                  </span>
                )
              })()}
            </div>
          </div>

          {place.summary && (
            <p className="card-summary">{place.summary}</p>
          )}

          {tags.length > 0 && (
            <div className="card-tags">
              {tags.slice(0, 4).map(t => <span key={t} className="tag">{t}</span>)}
            </div>
          )}

          {/* Window-peek sticker — lives inside card so overflow:hidden acts as the sill */}
          {isTop && (
            <img
              src={peekStickerSrc}
              alt=""
              draggable={false}
              className="card-window-peek"
              style={{
                transform: `translateX(-50%) translateY(${showPeek && !flyOff ? '38%' : '112%'})`,
                transition: showPeek && !flyOff
                  ? 'transform 0.65s cubic-bezier(0.16, 1, 0.3, 1)'
                  : 'transform 0.28s ease-in',
              }}
            />
          )}

          {/* Action buttons — only on top card */}
          {isTop && (
            <div className="card-actions">
              <button
                className="act-btn act-skip"
                onClick={() => setFlyOff('left')}
                title="Skip"
              >✕</button>
              <button
                className="act-btn act-info"
                onClick={() => setShowDetail(true)}
                title="Details"
              >ℹ</button>
              {place.maps_url && (
                <a
                  className="act-btn act-maps"
                  href={place.maps_url}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in Google Maps"
                  onClick={e => e.stopPropagation()}
                >🗺</a>
              )}
              <button
                className="act-btn act-like"
                onClick={() => setFlyOff('right')}
                title="Love it"
              >❤</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Edge-peek stickers (portal so fixed positioning escapes the transform) ── */}
      {isTop && createPortal(
        <>
          {/* Left sticker slides in from left edge when swiping left */}
          <img
            src={leftStickerSrc}
            alt=""
            draggable={false}
            style={{
              position: 'fixed',
              bottom: '12%',
              left: 0,
              height: 'min(30vh, 260px)',
              width: 'auto',
              transform: `translateX(${-100 + leftPeek * 62}%)`,
              transition: stickerTrans,
              zIndex: 55,
              pointerEvents: 'none',
              filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.18))',
            }}
          />
          {/* Right sticker slides in from right edge when swiping right */}
          <img
            src={rightStickerSrc}
            alt=""
            draggable={false}
            style={{
              position: 'fixed',
              bottom: '12%',
              right: 0,
              height: 'min(30vh, 260px)',
              width: 'auto',
              transform: `translateX(${100 - rightPeek * 62}%)`,
              transition: stickerTrans,
              zIndex: 55,
              pointerEvents: 'none',
              filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.18))',
            }}
          />

        </>,
        document.body
      )}

      {/* ── Detail Sheet ── */}
      {showDetail && (
        <div className="sheet-overlay" onClick={() => setShowDetail(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <button className="sheet-close" onClick={() => setShowDetail(false)}>✕</button>
            <h3 className="sheet-name">{place.name}</h3>
            {place.subcategory && (
              <p className="sheet-sub">{place.category} · {place.subcategory}</p>
            )}
            {place.address && <p className="sheet-addr">📍 {place.address}</p>}

            <div className="sheet-chips">
              {place.price_level && <span className="chip price-chip">{place.price_level}</span>}
              {place.rating != null && <span className="chip">⭐ {place.rating.toFixed(1)}</span>}
            </div>

            {place.opening_hours && Object.keys(place.opening_hours).length > 0 && (
              <div className="sheet-hours">
                <p className="sheet-section-label">Hours</p>
                {Object.entries(place.opening_hours).map(([day, hrs]) => (
                  <div key={day} className="hour-row">
                    <span>{day}</span><span>{hrs}</span>
                  </div>
                ))}
              </div>
            )}

            {tags.length > 0 && (
              <div className="sheet-tags">
                {tags.map(t => <span key={t} className="tag">{t}</span>)}
              </div>
            )}

            {/* ── Dress code ── */}
            {(() => {
              const dc   = getDressCode(place.category, place.price_level)
              const meta = DRESS_CODE_META[dc]
              return (
                <div className="sheet-dresscode">
                  <p className="sheet-section-label">What to wear</p>
                  <div className="dresscode-header" style={{ color: meta.color }}>
                    <span className="dresscode-emoji">{meta.emoji}</span>
                    <span className="dresscode-name">{dc}</span>
                  </div>
                  <ul className="dresscode-tips">
                    {meta.tips.map(tip => <li key={tip}>{tip}</li>)}
                  </ul>
                </div>
              )
            })()}

            <div className="sheet-actions">
              {place.maps_url && (
                <a className="pill-btn primary-pill" href={place.maps_url} target="_blank" rel="noreferrer">
                  Open in Maps
                </a>
              )}
              {place.website && (
                <a
                  className="pill-btn outline-pill"
                  href={place.website.startsWith('http') ? place.website : `https://${place.website}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Website
                </a>
              )}
              {place.phone && (
                <a className="pill-btn outline-pill" href={`tel:${place.phone}`}>{place.phone}</a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Feedback Modal ───────────────────────────────────────────────────────────
function FeedbackModal({ place, onSubmit, onDismiss }) {
  const [selected, setSelected] = useState([])
  const reasons = [
    { v: 'tooExpensive', label: '💰 Too expensive' },
    { v: 'tooFar', label: '📍 Too far away' },
    { v: 'notMyVibe', label: '😐 Not my vibe' },
    { v: 'alreadyBeen', label: '✓ Already been here' },
    { v: 'notOpen', label: '🕐 Not open then' },
    { v: 'noInterest', label: '🚫 Just not interested' },
  ]
  const toggle = v => setSelected(s => s.includes(v) ? s.filter(x => x !== v) : [...s, v])

  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <div className="feedback-modal" onClick={e => e.stopPropagation()}>
        <p className="feedback-eyebrow">Why did you skip?</p>
        <h3 className="feedback-name">{place.name}</h3>
        <div className="feedback-reasons">
          {reasons.map(r => (
            <button
              key={r.v}
              className={`reason-btn ${selected.includes(r.v) ? 'reason-selected' : ''}`}
              onClick={() => toggle(r.v)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="feedback-footer">
          <button className="outline-pill" onClick={onDismiss}>Skip</button>
          <button
            className="pill-btn primary-pill"
            onClick={() => onSubmit(selected)}
            disabled={selected.length === 0}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Quiz View ────────────────────────────────────────────────────────────────
function QuizView({ step, answers, setAnswer, onNext, onBack, loading, onSpontaneous, flights = [] }) {
  const q = QUIZ_STEPS[step]
  const isLast = step === QUIZ_STEPS.length - 1
  const canNext = q.type === 'cards' ? (answers[q.id] !== undefined && answers[q.id] !== '') : true

  const defaultDT = () => {
    const d = new Date()
    d.setMinutes(d.getMinutes() < 30 ? 0 : 30)
    return d.toISOString().slice(0, 16)
  }

  return (
    <div className="quiz-view">
      {/* Progress dots */}
      <div className="quiz-progress">
        {QUIZ_STEPS.map((_, i) => (
          <div key={i} className={`qdot ${i < step ? 'qdot-done' : i === step ? 'qdot-active' : ''}`} />
        ))}
      </div>

      {/* Welcome on step 0 */}
      {step === 0 && (
        <div className="quiz-welcome">
          <img src={sticker3Src} alt="" className="sticker-welcome" />
          <h1 className="welcome-title">Your perfect<br/><em>evening</em> awaits</h1>
          <p className="welcome-sub">Answer a few questions and we'll curate your night</p>
          {onSpontaneous && (
            <button className="pill-btn spontaneous-pill" onClick={onSpontaneous}>
              ✨ Feeling Spontaneous
            </button>
          )}
        </div>
      )}

      <div className="quiz-body">
        <h2 className="quiz-q">{q.q}</h2>
        {q.hint && <p className="quiz-hint">{q.hint}</p>}

        {q.type === 'cards' && (
          <div className={`quiz-options ${q.options.length > 4 ? 'opts-3col' : 'opts-2col'}`}>
            {q.options.map(opt => (
              <button
                key={opt.v}
                className={`quiz-opt ${answers[q.id] === opt.v ? 'opt-selected' : ''}`}
                onClick={() => setAnswer(q.id, opt.v)}
              >
                <span className="opt-emoji">{opt.emoji}</span>
                <span className="opt-label">{opt.label}</span>
                {opt.desc && <span className="opt-desc">{opt.desc}</span>}
              </button>
            ))}
          </div>
        )}

        {q.type === 'datetime' && (
          <div className="quiz-dt">
            <input
              type="datetime-local"
              className="dt-input"
              value={answers.when || defaultDT()}
              onChange={e => setAnswer('when', e.target.value)}
            />

            {/* Flight conflict or free-day confirmation */}
            {answers.when && flights.length > 0 && (() => {
              const conflict = isDateDuringFlight(answers.when, flights)
              if (conflict) return (
                <div className="flight-conflict-warning">
                  ✈️ She's away {fmtDateShort(conflict.departureDate)} – {fmtDateShort(conflict.returnDate)} ({conflict.destination})
                </div>
              )
              return <div className="flight-free-notice">✓ She's in Dubai on this date</div>
            })()}

            {/* Suggested free windows as tap-to-set chips */}
            {flights.length > 0 && (() => {
              const windows = freeWindowsFromFlights(flights, 60)
              if (!windows.length) return null
              return (
                <div className="free-windows-suggestions">
                  <p className="free-windows-label">Tap a free window</p>
                  <div className="free-windows-list">
                    {windows.slice(0, 5).map((w, i) => {
                      const days = Math.round((w.end - w.start) / 86400000) + 1
                      const suggestDT = w.start.toISOString().slice(0, 10) + 'T20:00'
                      return (
                        <button
                          key={i}
                          className="free-window-chip free-window-btn"
                          onClick={() => setAnswer('when', suggestDT)}
                        >
                          {days === 1 ? fmtDateShort(w.start) : `${fmtDateShort(w.start)} – ${fmtDateShort(w.end)}`}
                          <span className="free-window-days">{days}d</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {q.type === 'multiselect' && (
          <div className="quiz-multi">
            {q.options.map(opt => {
              const sel = (answers.categories || []).includes(opt.v)
              return (
                <button
                  key={opt.v}
                  className={`multi-opt ${sel ? 'opt-selected' : ''}`}
                  onClick={() => {
                    const cats = answers.categories || []
                    setAnswer('categories', sel ? cats.filter(c => c !== opt.v) : [...cats, opt.v])
                  }}
                >
                  {opt.emoji} {opt.v}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="quiz-footer">
        {step > 0 && (
          <button className="back-btn" onClick={onBack}>← Back</button>
        )}
        <button
          className="next-btn"
          onClick={onNext}
          disabled={!canNext || loading}
        >
          {loading
            ? <><span className="btn-spinner" /> Finding places…</>
            : isLast ? '✦ Find my night' : 'Next →'}
        </button>
      </div>
    </div>
  )
}

// ─── Liked View ───────────────────────────────────────────────────────────────
function LikedView({ liked, onRemove }) {
  const [query, setQuery]       = useState('')
  const [catFilter, setCatFilter]     = useState(null)
  const [priceFilter, setPriceFilter] = useState(0)   // 0 = all, 1–4 price tiers

  if (liked.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">💔</span>
        <h2>Nothing saved yet</h2>
        <p>Swipe right on places you love</p>
      </div>
    )
  }

  const cats = [...new Set(liked.map(p => p.category).filter(Boolean))].sort()
  const q = query.trim().toLowerCase()
  const filtered = liked.filter(p => {
    if (catFilter && p.category !== catFilter) return false
    if (priceFilter && (PRICE_NUM[p.price_level] || 0) !== priceFilter) return false
    if (q && !`${p.name} ${p.subcategory || ''} ${p.area || ''}`.toLowerCase().includes(q)) return false
    return true
  })

  return (
    <div className="list-view">
      <h2 className="list-title">Saved <span className="list-count">{liked.length}</span></h2>

      {/* ── Search & filters ── */}
      <div className="filter-bar">
        <input
          className="form-input filter-search"
          placeholder="🔍 Search saved places…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <div className="filter-chips">
          <button className={`filter-chip ${!catFilter ? 'chip-on' : ''}`} onClick={() => setCatFilter(null)}>All</button>
          {cats.map(c => (
            <button
              key={c}
              className={`filter-chip ${catFilter === c ? 'chip-on' : ''}`}
              onClick={() => setCatFilter(f => f === c ? null : c)}
            >{CAT_EMOJI[c]} {c}</button>
          ))}
        </div>
        <div className="filter-chips">
          {[0, 1, 2, 3, 4].map(n => (
            <button
              key={n}
              className={`filter-chip ${priceFilter === n ? 'chip-on' : ''}`}
              onClick={() => setPriceFilter(n)}
            >{n === 0 ? 'Any price' : '💰'.repeat(n)}</button>
          ))}
        </div>
        {filtered.length !== liked.length && (
          <p className="filter-count">{filtered.length} of {liked.length} shown</p>
        )}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">🔍</span>
          <h2>No matches</h2>
          <p>Try a different search or filter</p>
        </div>
      )}

      <div className="place-list">
        {filtered.map(place => (
          <div key={place.id} className="place-row">
            <div className="place-thumb" style={{ background: `${CAT_COLOR[place.category] || '#444'}30` }}>
              {place.photo_url
                ? <img src={largePhoto(place.photo_url)} alt="" onError={e => e.target.style.display = 'none'} />
                : <span>{CAT_EMOJI[place.category] || '📍'}</span>
              }
            </div>
            <div className="place-row-info">
              <h3>{place.name}</h3>
              <p>{place.subcategory || place.category}{place.area ? ` · ${place.area}` : ''}</p>
              {place.price_level && <p className="row-price">{place.price_level}</p>}
              {place._addedBy && <p className="row-by">saved by {place._addedBy}</p>}
            </div>
            <div className="place-row-actions">
              {place.maps_url && (
                <a className="row-btn" href={place.maps_url} target="_blank" rel="noreferrer">Maps</a>
              )}
              <button className="row-btn row-btn-remove" onClick={() => onRemove(place.id)}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Log View ─────────────────────────────────────────────────────────────────

// Full-screen photo viewer with swipe / arrows / keyboard between an entry's photos.
function PhotoLightbox({ photos, index, onClose, onDelete }) {
  const [i, setI] = useState(index)
  const startX = useRef(null)

  const prev = () => setI(v => (v - 1 + photos.length) % photos.length)
  const next = () => setI(v => (v + 1) % photos.length)

  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [photos.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // keep index valid as photos get deleted; close when none left
  useEffect(() => {
    if (photos.length === 0) onClose()
    else if (i >= photos.length) setI(photos.length - 1)
  }, [photos.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const cur = photos[i]
  if (!cur) return null

  return (
    <div
      className="photo-lightbox"
      onClick={onClose}
      onTouchStart={e => { startX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (startX.current == null) return
        const dx = e.changedTouches[0].clientX - startX.current
        if (dx > 45) prev()
        else if (dx < -45) next()
        startX.current = null
      }}
    >
      <img src={cur.url} alt="" onClick={e => e.stopPropagation()} />

      {photos.length > 1 && (
        <>
          <button className="lb-nav lb-prev" onClick={e => { e.stopPropagation(); prev() }}>‹</button>
          <button className="lb-nav lb-next" onClick={e => { e.stopPropagation(); next() }}>›</button>
          <div className="lb-counter">{i + 1} / {photos.length}</div>
        </>
      )}

      {cur.addedBy && <div className="lightbox-by">Photo by {cur.addedBy}</div>}
      <button className="lightbox-close" onClick={onClose}>✕</button>
      <button
        className="lightbox-delete"
        onClick={async e => { e.stopPropagation(); await onDelete(cur) }}
      >Delete photo</button>
    </div>
  )
}

// Gentle alternating tilts so the polaroids feel hand-placed.
const POLAROID_TILTS = [-2.6, 2.1, -1.4, 2.8, -2.2, 1.6]

// One memory in the scrapbook.
function LogEntry({ entry, index = 0, onRemove, onEdit, onAddPhoto, onRemovePhoto }) {
  const [lbIndex, setLbIndex]     = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const handleAddPhoto = async e => {
    const files = Array.from(e.target.files || [])
    if (fileRef.current) fileRef.current.value = ''
    if (files.length === 0) return
    setUploading(true)
    try { await onAddPhoto(entry.id, files) } catch { /* ignore */ }
    setUploading(false)
  }

  const photos = entry.photos || []
  const visit  = new Date(entry.date)
  const logged = entry.loggedAt ? new Date(entry.loggedAt) : null
  const fmtFull = d => d.toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })
  const day   = visit.getDate()
  const month = visit.toLocaleDateString('en-AE', { month: 'short' })
  const year  = visit.getFullYear()
  const showLogged = logged && entry.addedBy && fmtFull(logged) !== fmtFull(visit)

  return (
    <div className={`sb-card ${index % 2 === 0 ? 'sb-tilt-l' : 'sb-tilt-r'}`}>
      <span className="sb-tape" aria-hidden="true" />
      <button className="sb-remove" onClick={() => onRemove(entry.id)} title="Remove">✕</button>
      <button className="sb-edit" onClick={() => onEdit(entry)} title="Edit this memory">✎</button>

      <div className="sb-top">
        <span className="sb-stamp">{day} {month} {year}</span>
        <span className="sb-hearts">
          {'❤'.repeat(entry.rating)}
          <span className="sb-hearts-dim">{'❤'.repeat(5 - entry.rating)}</span>
        </span>
      </div>

      <h3 className="sb-name">{entry.placeName}</h3>

      {entry.notes && <p className="sb-notes">“{entry.notes}”</p>}

      <div className="sb-photos">
        {photos.map((ph, idx) => (
          <figure
            className="polaroid"
            key={ph.id}
            style={{ '--tilt': `${POLAROID_TILTS[idx % POLAROID_TILTS.length]}deg` }}
          >
            <img src={ph.url} alt={entry.placeName} onClick={() => setLbIndex(idx)} />
            <figcaption>{ph.addedBy ? `by ${ph.addedBy}` : '♥'}</figcaption>
          </figure>
        ))}

        <label className="polaroid-add" title="Add photos">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleAddPhoto}
            style={{ display: 'none' }}
          />
          <span className="polaroid-add-icon">{uploading ? '…' : '＋'}</span>
          <span className="polaroid-add-label">add photo</span>
        </label>
      </div>

      <div className="sb-foot">
        {entry.googleUrl && (
          <a className="sb-maps" href={entry.googleUrl} target="_blank" rel="noreferrer">📍 Map</a>
        )}
        {entry.addedBy && (
          <span className="sb-meta">
            {showLogged ? `logged ${fmtFull(logged)} by ${entry.addedBy}` : `logged by ${entry.addedBy}`}
          </span>
        )}
      </div>

      {/* portal: .sb-card is transformed (tilt), which would trap a fixed-position overlay */}
      {lbIndex != null && createPortal(
        <PhotoLightbox
          photos={photos}
          index={lbIndex}
          onClose={() => setLbIndex(null)}
          onDelete={onRemovePhoto}
        />,
        document.body
      )}
    </div>
  )
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function LogView({ log, onAddEntry, onUpdateEntry, onRemove, onAddPhoto, onRemovePhoto, occasions }) {
  const [adding, setAdding]       = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm]           = useState({ name: '', rating: 5, notes: '', link: '', visitDate: todayStr() })
  // ── Search & filters ──
  const [query, setQuery]           = useState('')
  const [minHearts, setMinHearts]   = useState(0)
  const [personFilter, setPersonFilter] = useState(null)
  const [yearFilter, setYearFilter] = useState(null)
  const [photoFiles, setPhotoFiles]       = useState([])
  const [photoPreviews, setPhotoPreviews] = useState([])
  const [resolved, setResolved]   = useState(null)   // { lat, lng } from the maps link
  const [resolving, setResolving] = useState(false)
  const [saving, setSaving]       = useState(false)
  const fileInputRef              = useRef(null)

  const handlePhotoChange = e => {
    const files = Array.from(e.target.files || [])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!files.length) return
    setPhotoFiles(prev => [...prev, ...files])
    setPhotoPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
  }

  const removePhotoAt = i => {
    setPhotoPreviews(prev => {
      if (prev[i]) URL.revokeObjectURL(prev[i])
      return prev.filter((_, j) => j !== i)
    })
    setPhotoFiles(prev => prev.filter((_, j) => j !== i))
  }

  const clearPhotos = () => {
    photoPreviews.forEach(u => URL.revokeObjectURL(u))
    setPhotoFiles([])
    setPhotoPreviews([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const resetForm = () => {
    setForm({ name: '', rating: 5, notes: '', link: '', visitDate: todayStr() })
    setResolved(null)
    setEditingId(null)
    clearPhotos()
  }

  // ── Start editing an existing memory: prefill the form ──
  const startEdit = entry => {
    setEditingId(entry.id)
    setForm({
      name: entry.placeName || '',
      rating: entry.rating ?? 5,
      notes: entry.notes || '',
      link: entry.googleUrl || '',
      visitDate: entry.date ? new Date(entry.date).toISOString().slice(0, 10) : todayStr(),
    })
    setResolved(entry.lat != null ? { lat: entry.lat, lng: entry.lng } : null)
    clearPhotos()
    setAdding(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // When a Google Maps link is pasted/entered, expand it server-side and
  // auto-fill the place name + coordinates.
  const handleLink = async link => {
    setForm(f => ({ ...f, link }))
    setResolved(null)
    if (!/^https?:\/\//i.test(link.trim())) return
    setResolving(true)
    const r = await cloud.resolvePlace(link.trim())
    setResolving(false)
    if (r) {
      setResolved({ lat: r.lat, lng: r.lng })
      // only auto-fill the name if the user hasn't typed one
      if (r.name) setForm(f => (f.name.trim() ? f : { ...f, name: r.name }))
    }
  }

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        placeName: form.name.trim(),
        rating: form.rating,
        notes: form.notes,
        visitDate: form.visitDate,
        googleUrl: form.link.trim() || null,
        lat: resolved?.lat ?? null,
        lng: resolved?.lng ?? null,
      }
      if (editingId) {
        await onUpdateEntry(editingId, payload)
        // new photos picked while editing get attached to the same entry
        if (photoFiles.length) await onAddPhoto(editingId, photoFiles)
      } else {
        await onAddEntry({ ...payload, _photoFiles: photoFiles })
      }
      resetForm()
      setAdding(false)
    } catch {
      // keep the form open so nothing is lost
    }
    setSaving(false)
  }

  // ── Apply search & filters ──
  const q = query.trim().toLowerCase()
  const years = [...new Set(log.map(e => new Date(e.date).getFullYear()))].sort((a, b) => b - a)
  const filteredLog = log.filter(e => {
    if (minHearts && (e.rating || 0) < minHearts) return false
    if (personFilter && e.addedBy !== personFilter) return false
    if (yearFilter && new Date(e.date).getFullYear() !== yearFilter) return false
    if (q && !`${e.placeName} ${e.notes || ''}`.toLowerCase().includes(q)) return false
    return true
  })
  const isFiltering = q || minHearts || personFilter || yearFilter

  // ── Relationship counter ──
  const stats = relationshipStats(occasions?.firstDate)

  // Group memories by month for scrapbook chapter dividers (newest first).
  const sorted = [...filteredLog].sort((a, b) => new Date(b.date) - new Date(a.date))
  const groups = []
  sorted.forEach((entry, gi) => {
    const d = new Date(entry.date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push({ entry, gi })
    else groups.push({
      key,
      label: d.toLocaleDateString('en-AE', { month: 'long', year: 'numeric' }),
      items: [{ entry, gi }],
    })
  })

  return (
    <div className="list-view">
      <div className="list-header">
        <div className="sb-headline">
          <span className="sb-eyebrow">Memory Book</span>
          <h2 className="list-title">Our Dates
            {log.length > 0 && (
              <span className="list-count">{log.length} {log.length === 1 ? 'memory' : 'memories'}</span>
            )}
          </h2>
        </div>
        <button className="pill-btn primary-pill pill-sm" onClick={() => { const was = adding; resetForm(); setAdding(!was) }}>
          {adding ? 'Cancel' : '＋ New memory'}
        </button>
      </div>

      {/* ── Together-counter ── */}
      {stats && (
        <div className="together-banner">
          <span className="together-heart">💞</span>
          <div className="together-text">
            <strong>
              {stats.months > 0
                ? `${stats.months} month${stats.months > 1 ? 's' : ''}${stats.days > 0 ? ` & ${stats.days} day${stats.days > 1 ? 's' : ''}` : ''} together`
                : `${stats.totalDays} day${stats.totalDays !== 1 ? 's' : ''} together`}
            </strong>
            <span className="together-sub">
              {log.length} date{log.length !== 1 ? 's' : ''} & counting · since {new Date(occasions.firstDate + 'T00:00').toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>
      )}

      {/* ── Search & filters (only useful once the book grows) ── */}
      {log.length > 0 && (
        <div className="filter-bar">
          <input
            className="form-input filter-search"
            placeholder="🔍 Search memories…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <div className="filter-chips">
            {[0, 5, 4, 3].map(n => (
              <button
                key={n}
                className={`filter-chip ${minHearts === n ? 'chip-on' : ''}`}
                onClick={() => setMinHearts(n)}
              >{n === 0 ? 'Any rating' : `${'❤'.repeat(n)}${n < 5 ? '+' : ''}`}</button>
            ))}
            <button className={`filter-chip ${!personFilter ? 'chip-on' : ''}`} onClick={() => setPersonFilter(null)}>Both</button>
            {PEOPLE.map(p => (
              <button
                key={p}
                className={`filter-chip ${personFilter === p ? 'chip-on' : ''}`}
                onClick={() => setPersonFilter(f => f === p ? null : p)}
              >by {p}</button>
            ))}
            {years.length > 1 && years.map(y => (
              <button
                key={y}
                className={`filter-chip ${yearFilter === y ? 'chip-on' : ''}`}
                onClick={() => setYearFilter(f => f === y ? null : y)}
              >{y}</button>
            ))}
          </div>
          {isFiltering && (
            <p className="filter-count">{filteredLog.length} of {log.length} memories shown</p>
          )}
        </div>
      )}

      {adding && (
        <div className="log-form sb-form">
          <span className="sb-tape" aria-hidden="true" />
          <p className="sb-form-title">{editingId ? 'rewriting this page…' : 'a new page in our story…'}</p>
          {/* ── Paste a Google Maps link → name auto-fills ── */}
          <input
            className="form-input"
            placeholder="📍 Paste Google Maps link (optional)"
            value={form.link}
            onChange={e => handleLink(e.target.value)}
            autoFocus
          />
          {resolving && <p className="resolve-hint">Looking up the place…</p>}
          {resolved && !resolving && (
            <p className="resolve-hint ok">✓ Link added{resolved.lat ? ' · location captured' : ''}</p>
          )}

          <input
            className="form-input"
            placeholder="Place name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />

          <label className="form-label">When did you go?</label>
          <input
            className="form-input dt-input"
            type="date"
            value={form.visitDate}
            max={todayStr()}
            onChange={e => setForm(f => ({ ...f, visitDate: e.target.value }))}
          />

          <div className="star-row">
            <span>How was it?</span>
            <div className="stars-input">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  className={`heart-btn ${form.rating >= n ? 'heart-lit' : ''}`}
                  onClick={() => setForm(f => ({ ...f, rating: n }))}
                >♥</button>
              ))}
            </div>
          </div>
          <textarea
            className="form-input"
            placeholder="Notes (optional)"
            rows={3}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />

          {/* ── Photos (add as many as you like) ── */}
          <div className="photo-picker">
            <div className="sb-photos">
              {photoPreviews.map((url, i) => (
                <figure
                  className="polaroid"
                  key={i}
                  style={{ '--tilt': `${POLAROID_TILTS[i % POLAROID_TILTS.length]}deg` }}
                >
                  <img src={url} alt="preview" />
                  <button className="photo-remove-btn sm" onClick={() => removePhotoAt(i)} title="Remove">✕</button>
                  <figcaption>ready ♥</figcaption>
                </figure>
              ))}
              <label className="polaroid-add" title="Add photos">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoChange}
                  style={{ display: 'none' }}
                />
                <span className="polaroid-add-icon">＋</span>
                <span className="polaroid-add-label">add photos</span>
              </label>
            </div>
          </div>

          <button
            className="pill-btn gold-pill"
            onClick={submit}
            disabled={saving || !form.name.trim()}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {saving ? 'Saving…' : editingId ? 'Save changes ♥' : 'Save this memory ♥'}
          </button>
        </div>
      )}

      {log.length === 0 && !adding && (
        <div className="empty-state sb-empty">
          <figure className="polaroid sb-empty-polaroid">
            <img src={sticker2Src} alt="" />
            <figcaption>the story of us ♥</figcaption>
          </figure>
          <h2>Your story starts here</h2>
          <p>Log your first date together</p>
        </div>
      )}

      {log.length > 0 && filteredLog.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">🔍</span>
          <h2>No memories match</h2>
          <p>Try a different search or filter</p>
        </div>
      )}

      {filteredLog.length > 0 && (
        <div className="scrapbook">
          {groups.map(g => (
            <div className="sb-group" key={g.key}>
              <div className="sb-month"><span>{g.label}</span></div>
              {g.items.map(({ entry, gi }) => (
                <LogEntry
                  key={entry.id}
                  entry={entry}
                  index={gi}
                  onRemove={onRemove}
                  onEdit={startEdit}
                  onAddPhoto={onAddPhoto}
                  onRemovePhoto={onRemovePhoto}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Flight helpers ───────────────────────────────────────────────────────────
function freeWindowsFromFlights(flights, daysAhead = 60) {
  const now = new Date(); now.setHours(0,0,0,0)
  const end = new Date(now); end.setDate(end.getDate() + daysAhead)

  const awayDates = new Set()
  flights.forEach(f => {
    const dep = new Date(f.departureDate); dep.setHours(0,0,0,0)
    const ret = new Date(f.returnDate);    ret.setHours(0,0,0,0)
    const d = new Date(dep)
    while (d <= ret) { awayDates.add(d.toDateString()); d.setDate(d.getDate() + 1) }
  })

  const windows = []; let wStart = null
  const cur = new Date(now)
  while (cur <= end) {
    const free = !awayDates.has(cur.toDateString())
    if (free  && !wStart) wStart = new Date(cur)
    if (!free &&  wStart) { windows.push({ start: wStart, end: new Date(cur.getTime() - 86400000) }); wStart = null }
    cur.setDate(cur.getDate() + 1)
  }
  if (wStart) windows.push({ start: wStart, end: new Date(end) })
  return windows
}

function isDateDuringFlight(dateStr, flights) {
  if (!dateStr || !flights?.length) return null
  const d = new Date(dateStr); d.setHours(0,0,0,0)
  return flights.find(f => {
    const dep = new Date(f.departureDate); dep.setHours(0,0,0,0)
    const ret = new Date(f.returnDate);    ret.setHours(0,0,0,0)
    return d >= dep && d <= ret
  }) || null
}

// ─── Flights View ─────────────────────────────────────────────────────────────
const EMPTY_FLIGHT_FORM = { destination: '', departureDate: '', returnDate: '', flightNum: '' }

// ISO / stored date → value usable by <input type="datetime-local">
const toDtInput = v => {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d)) return ''
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Cute pseudo airport code for the boarding-pass look ("London" → LON)
const destCode = name => (name || '').replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() || '···'

function FlightsView({ flights, onAdd, onUpdate, onRemove }) {
  const [formOpen, setFormOpen]   = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FLIGHT_FORM)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  // Destination geocoding — suggest cities while typing so the map pin is
  // always the place they actually mean (typed text alone can mis-match).
  const [destOpts, setDestOpts] = useState([])   // candidate places
  const [destPin, setDestPin]   = useState(null) // confirmed { lat, lng, label }
  const destTimer = useRef(null)

  const onDestChange = e => {
    const v = e.target.value
    setForm(f => ({ ...f, destination: v }))
    setDestPin(null)
    clearTimeout(destTimer.current)
    if (v.trim().length < 2) { setDestOpts([]); return }
    destTimer.current = setTimeout(async () => {
      const opts = await cloud.geocodeSearch(v, 5)
      setDestOpts(opts)
    }, 350)
  }

  const pickDest = s => {
    setForm(f => ({ ...f, destination: s.name }))
    setDestPin(s)
    setDestOpts([])
  }

  const closeForm = () => {
    setFormOpen(false); setEditingId(null); setForm(EMPTY_FLIGHT_FORM)
    setDestOpts([]); setDestPin(null)
    clearTimeout(destTimer.current)
  }
  const toggleAdd = () => {
    if (formOpen) closeForm()
    else { setEditingId(null); setForm(EMPTY_FLIGHT_FORM); setDestOpts([]); setDestPin(null); setFormOpen(true) }
  }
  const startEdit = f => {
    setEditingId(f.id)
    setForm({
      destination: f.destination,
      flightNum: f.flightNum || '',
      departureDate: toDtInput(f.departureDate),
      returnDate: toDtInput(f.returnDate),
    })
    setDestOpts([])
    setDestPin(f.lat != null && f.lng != null ? { lat: f.lat, lng: f.lng, label: `${f.destination} (saved pin)` } : null)
    setFormOpen(true)
  }

  const canSave = form.destination.trim() && form.departureDate && form.returnDate
  const submit = () => {
    if (!canSave) return
    // best coords we know: explicitly picked > top-ranked suggestion > let the
    // backend geocode as a last resort
    const pin = destPin || destOpts[0] || null
    const payload = { ...form, lat: pin?.lat ?? null, lng: pin?.lng ?? null }
    if (editingId) onUpdate(editingId, payload)
    else onAdd(payload)
    closeForm()
  }

  const now = new Date()
  const upcoming = [...flights].filter(f => new Date(f.returnDate) >= now).sort((a,b) => new Date(a.departureDate) - new Date(b.departureDate))
  const past     = [...flights].filter(f => new Date(f.returnDate) <  now).sort((a,b) => new Date(b.departureDate) - new Date(a.departureDate))
  const windows  = freeWindowsFromFlights(flights, 60)

  const daysUntil    = d => Math.ceil((new Date(d) - now) / 86400000)
  const daysBetween  = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1

  const renderCard = (f, isPast) => {
    const until  = daysUntil(f.departureDate)
    const backIn = daysUntil(f.returnDate)
    const inAir  = !isPast && until <= 0 && backIn >= 0
    return (
      <div key={f.id} className={`bp-card ${isPast ? 'bp-past' : ''} ${editingId === f.id ? 'bp-editing' : ''}`}>
        <div className="bp-main">
          <div className="bp-route">
            <span className="bp-code">DXB</span>
            <span className="bp-path"><span className="bp-path-line" />✈<span className="bp-path-line" /></span>
            <span className="bp-code">{destCode(f.destination)}</span>
          </div>
          <div className="bp-dest">{f.destination}</div>
          <div className="bp-dates">
            {fmtDateShort(f.departureDate)} → {fmtDateShort(f.returnDate)} · {daysBetween(f.departureDate, f.returnDate)}d
            {f.flightNum && <span className="bp-num"> · {f.flightNum}</span>}
          </div>
        </div>
        <div className="bp-stub">
          <span className={`bp-countdown ${inAir ? 'bp-inair' : ''} ${isPast ? 'bp-home' : ''}`}>
            {isPast ? '✓ home' : inAir ? '✈ in the air' : `in ${until}d`}
          </span>
          <div className="bp-actions">
            <button className="icon-btn" onClick={() => startEdit(f)} title="Edit flight">✎</button>
            <button className="icon-btn" onClick={() => onRemove(f.id)} title="Remove">✕</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="list-view">
      <div className="list-header">
        <div className="sb-headline">
          <span className="sb-eyebrow">Up in the Air</span>
          <h2 className="list-title">Her Schedule</h2>
        </div>
        <button className="pill-btn primary-pill pill-sm" onClick={toggleAdd}>
          {formOpen ? 'Cancel' : '＋ Add flight'}
        </button>
      </div>

      {formOpen && (
        <div className="log-form sb-form">
          <span className="sb-tape" aria-hidden="true" />
          <p className="sb-form-title">{editingId ? 'fixing up this trip…' : 'where is she off to?…'}</p>
          <input className="form-input" placeholder="Destination city (e.g. New York)" value={form.destination} onChange={onDestChange} autoFocus />

          {/* live place suggestions → tap to pin the right city on the map */}
          {destOpts.length > 0 && (
            <div className="dest-suggest">
              {destOpts.map((s, i) => (
                <button key={i} className="dest-opt" onClick={() => pickDest(s)}>
                  📍 {s.label}
                </button>
              ))}
            </div>
          )}
          {destPin && <p className="resolve-hint ok">✓ pins to {destPin.label}</p>}

          <input className="form-input" placeholder="Flight number (optional, e.g. EK001)" value={form.flightNum} onChange={set('flightNum')} />
          <label className="form-label">Departure</label>
          <input className="form-input dt-input" type="datetime-local" value={form.departureDate} onChange={set('departureDate')} />
          <label className="form-label">Return to Dubai</label>
          <input className="form-input dt-input" type="datetime-local" value={form.returnDate} onChange={set('returnDate')} />
          <button
            className="pill-btn gold-pill"
            onClick={submit}
            disabled={!canSave}
            style={{ width: '100%', justifyContent: 'center' }}
          >{editingId ? 'Save changes ♥' : 'Add to her schedule ✈'}</button>
        </div>
      )}

      {/* ── Where she'll be this month ── */}
      {flights.length > 0 && <FlightsMap flights={flights} />}

      {/* ── Free windows banner ── */}
      {flights.length > 0 && (
        <div className="free-windows-card">
          <p className="free-windows-label">💕 Free for date nights — next 60 days</p>
          {windows.length === 0
            ? <p className="settings-hint" style={{ marginTop: 6 }}>No free windows found — she's busy! 😅</p>
            : (
              <div className="free-windows-list">
                {windows.slice(0, 6).map((w, i) => {
                  const days = Math.round((w.end - w.start) / 86400000) + 1
                  const isNow = w.start <= now && w.end >= now
                  return (
                    <div key={i} className={`free-window-chip ${isNow ? 'free-window-now' : ''}`}>
                      <span className="free-window-dates">
                        {days === 1 ? fmtDateShort(w.start) : `${fmtDateShort(w.start)} – ${fmtDateShort(w.end)}`}
                      </span>
                      <span className="free-window-days">{days}d{isNow ? ' · now ✓' : ''}</span>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
      )}

      {flights.length === 0 && !formOpen && (
        <div className="empty-state">
          <span className="empty-icon">✈️</span>
          <h2>No flights yet</h2>
          <p>Add her roster to find your free date windows</p>
        </div>
      )}

      <div className="bp-list">
        {upcoming.length > 0 && <p className="section-label bp-section">Upcoming flights</p>}
        {upcoming.map(f => renderCard(f, false))}

        {past.length > 0 && (
          <>
            <p className="section-label bp-section">Past flights</p>
            {past.slice(0, 5).map(f => renderCard(f, true))}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Occasion banner — countdown to the next special day ─────────────────────
function OccasionBanner({ occasions }) {
  const upcoming = buildOccasions(occasions)
  const soon = upcoming.filter(o => o.daysAway <= 14).slice(0, 2)
  if (soon.length === 0) return null
  return (
    <div className="occasion-banners">
      {soon.map(o => (
        <div key={o.key} className={`occasion-banner ${o.daysAway === 0 ? 'occasion-today' : ''} ${o.big ? 'occasion-big' : ''}`}>
          <span className="occasion-emoji">{o.emoji}</span>
          <span className="occasion-text">
            {o.daysAway === 0
              ? <>It's <strong>{o.name}</strong> — today! Make it special 💝</>
              : <><strong>{o.name}</strong> {o.daysAway === 1 ? 'is tomorrow' : `in ${o.daysAway} days`} · {o.date.toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}</>}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Movies View — shared watchlist + ratings + TMDB info ─────────────────────
function MoviesView({ movies, me, onAdd, onUpdate, onRemove }) {
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const partner = PEOPLE.find(p => p !== me)

  // ── Live TMDB suggestions while typing ──
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [expanded, setExpanded] = useState(null)   // movie id with plot open
  const searchTimer = useRef(null)

  const onTitleChange = v => {
    setTitle(v)
    clearTimeout(searchTimer.current)
    if (v.trim().length < 2) { setSuggestions([]); setSearching(false); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      const hits = await cloud.searchMovies(v)
      setSearching(false)
      setSuggestions(hits)
    }, 350)
  }

  // Pick a suggestion → fetch full details (adds runtime) → save with metadata
  const pickSuggestion = async s => {
    setSuggestions([])
    setTitle('')
    setAdding(true)
    const full = (await cloud.movieDetails(s.id)) || s
    const meta = {
      tmdbId: full.id,
      year: full.year || null,
      poster: full.poster || null,
      plot: full.plot || null,
      score: full.score || null,
      genres: full.genres || [],
      runtime: full.runtime || null,
    }
    try { await onAdd(full.title, meta) } catch { /* ignore */ }
    setAdding(false)
  }

  // Plain add (no metadata) — fallback if TMDB finds nothing / isn't set up
  const submit = async () => {
    const t = title.trim()
    if (!t) return
    setSuggestions([])
    setAdding(true)
    try { await onAdd(t, null); setTitle('') } catch { /* keep text */ }
    setAdding(false)
  }

  const watchlist = movies.filter(m => !m.watchedAt)
  const watched   = movies.filter(m => m.watchedAt)
    .sort((a, b) => new Date(b.watchedAt) - new Date(a.watchedAt))

  const Stars = ({ movie, person, editable }) => (
    <div className={`movie-stars ${editable ? '' : 'movie-stars-ro'}`}>
      <span className="movie-stars-who">{person}</span>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          className={`heart-btn sm ${(movie.ratings?.[person] || 0) >= n ? 'heart-lit' : ''}`}
          disabled={!editable}
          onClick={() => editable && onUpdate(movie.id, { myRating: n })}
        >♥</button>
      ))}
    </div>
  )

  const row = (m, isWatched) => {
    const meta = m.meta || {}
    const infoBits = [
      meta.score ? `⭐ ${meta.score}` : null,
      meta.runtime ? `${Math.floor(meta.runtime / 60)}h ${meta.runtime % 60}m` : null,
      (meta.genres || []).join(' · ') || null,
    ].filter(Boolean)
    return (
      <div key={m.id} className={`movie-row ${isWatched ? 'movie-watched' : ''}`}>
        <div
          className="movie-poster"
          onClick={() => meta.plot && setExpanded(e => e === m.id ? null : m.id)}
          style={{ cursor: meta.plot ? 'pointer' : 'default' }}
        >
          {meta.poster
            ? <img src={meta.poster} alt={m.title} loading="lazy" />
            : <span className="movie-poster-fallback">{isWatched ? '🎬' : '🍿'}</span>}
        </div>
        <div className="movie-main">
          <span
            className="movie-title"
            onClick={() => meta.plot && setExpanded(e => e === m.id ? null : m.id)}
            style={{ cursor: meta.plot ? 'pointer' : 'default' }}
          >
            {m.title}{meta.year && <span className="movie-year"> ({meta.year})</span>}
          </span>
          {infoBits.length > 0 && <span className="movie-info">{infoBits.join('  ·  ')}</span>}
          {m.addedBy && <span className="movie-by">added by {m.addedBy}</span>}
          {expanded === m.id && meta.plot && (
            <p className="movie-plot">{meta.plot}</p>
          )}
          {isWatched && (
            <div className="movie-ratings">
              <Stars movie={m} person={me} editable />
              {partner && <Stars movie={m} person={partner} editable={false} />}
            </div>
          )}
        </div>
        <div className="movie-actions">
          {isWatched
            ? <button className="row-btn" onClick={() => onUpdate(m.id, { watchedAt: null })}>↩ Unwatch</button>
            : <button className="row-btn movie-watch-btn" onClick={() => onUpdate(m.id, { watchedAt: new Date().toISOString() })}>✓ Watched</button>}
          <button className="row-btn row-btn-remove" onClick={() => onRemove(m.id)}>✕</button>
        </div>
      </div>
    )
  }

  return (
    <div className="list-view">
      <div className="list-header">
        <div className="sb-headline">
          <span className="sb-eyebrow">Movie Nights</span>
          <h2 className="list-title">Our Watchlist
            {movies.length > 0 && <span className="list-count">{watchlist.length} to watch</span>}
          </h2>
        </div>
      </div>

      <div className="movie-add-wrap">
        <div className="movie-add-row">
          <input
            className="form-input"
            placeholder="🍿 Type a movie name…"
            value={title}
            onChange={e => onTitleChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && suggestions.length === 0) submit() }}
          />
          <button className="pill-btn primary-pill pill-sm" onClick={submit} disabled={adding || !title.trim()}>
            {adding ? '…' : 'Add'}
          </button>
        </div>

        {/* Live results from the movie database — tap the right one */}
        {searching && <p className="resolve-hint">Searching the movie database…</p>}
        {suggestions.length > 0 && (
          <div className="movie-suggest">
            {suggestions.map(s => (
              <button key={s.id} className="movie-suggest-row" onClick={() => pickSuggestion(s)}>
                <span className="movie-suggest-poster">
                  {s.poster ? <img src={s.poster} alt="" loading="lazy" /> : '🎬'}
                </span>
                <span className="movie-suggest-info">
                  <span className="movie-suggest-title">{s.title}{s.year && ` (${s.year})`}</span>
                  <span className="movie-suggest-sub">
                    {[s.score ? `⭐ ${s.score}` : null, (s.genres || []).slice(0, 2).join(', ') || null].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            ))}
            <p className="movie-suggest-hint">not there? hit Add to save it as plain text</p>
          </div>
        )}
      </div>

      {movies.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">🎬</span>
          <h2>No movies yet</h2>
          <p>Next movie night, add everything you talk about watching</p>
        </div>
      )}

      {watchlist.length > 0 && (
        <>
          <p className="section-label">To watch</p>
          {watchlist.map(m => row(m, false))}
        </>
      )}

      {watched.length > 0 && (
        <>
          <p className="section-label">Watched · rate them ♥</p>
          {watched.map(m => row(m, true))}
        </>
      )}
    </div>
  )
}

// ─── Settings View ────────────────────────────────────────────────────────────
function SettingsView({ settings, setSettings, prefs, setPrefs, dataCount, me, locations, onDetectMyLocation, occasions, onSaveOccasions }) {
  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }))
  const [flash, setFlash] = useState(false)
  const partner = PEOPLE.find(p => p !== me)

  const detectLoc = async () => {
    try {
      await onDetectMyLocation()
      setFlash(true); setTimeout(() => setFlash(false), 1500)
    } catch { alert('Could not detect location') }
  }

  // ── Key dates ──
  const occ = occasions || {}
  const setOcc = patch => onSaveOccasions({ ...occ, ...patch })
  const [newOccName, setNewOccName] = useState('')
  const [newOccDate, setNewOccDate] = useState('')
  const addCustom = () => {
    if (!newOccName.trim() || !newOccDate) return
    setOcc({ custom: [...(occ.custom || []), { id: Date.now().toString(36), name: newOccName.trim(), date: newOccDate, yearly: true }] })
    setNewOccName(''); setNewOccDate('')
  }

  // ── Push notifications ──
  const [pushStatus, setPushStatus] = useState('…')
  useEffect(() => { cloud.getPushStatus().then(setPushStatus) }, [])
  const enableNotifications = async () => {
    const r = await cloud.enablePush()
    setPushStatus(r === 'subscribed' ? 'subscribed' : r)
    if (r === 'denied') alert('Notifications are blocked for this app — allow them in your phone settings, then try again.')
    if (r === 'unsupported') alert('This browser can\'t do push. On iPhone: add the app to your Home Screen first (Share → Add to Home Screen), then open it from there.')
  }

  return (
    <div className="settings-view">
      <div className="settings-hero">
        <img src={sticker3Src} alt="" className="sticker-settings" />
      </div>
      <h2 className="list-title">Settings</h2>

      <div className="settings-card">
        <h3>AI Ranking</h3>
        <p className="settings-hint">Add your Anthropic API key for smarter, personalised picks</p>
        <input
          type="password"
          className="form-input"
          placeholder="sk-ant-api03-…"
          value={settings.apiKey || ''}
          onChange={e => set('apiKey', e.target.value)}
        />
      </div>

      <div className="settings-card">
        <h3>Locations</h3>
        <p className="settings-hint">
          Shared between both phones — each of you taps Detect on your own device,
          and both locations sync everywhere. Used for the distance midpoint.
        </p>
        {PEOPLE.map(p => {
          const loc = locations?.[p]
          const isMe = p === me
          return (
            <div className="loc-row" key={p}>
              <span>{p}{isMe ? ' (you)' : ''}</span>
              <div className="loc-right">
                {loc?.lat != null && <span className="loc-coords">{loc.lat.toFixed(3)}, {loc.lng.toFixed(3)}</span>}
                {isMe
                  ? <button className="pill-btn outline-pill pill-sm" onClick={detectLoc}>Detect</button>
                  : !loc && <span className="settings-hint" style={{ margin: 0 }}>ask {p} to tap Detect on their phone</span>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="settings-card">
        <h3>Key dates</h3>
        <p className="settings-hint">Powers the together-counter, occasion reminders, and notifications</p>
        <div className="loc-row">
          <span>First date 💞</span>
          <input
            className="form-input dt-input keydate-input"
            type="date"
            value={occ.firstDate || ''}
            onChange={e => setOcc({ firstDate: e.target.value })}
          />
        </div>
        <div className="loc-row">
          <span>Her birthday 🎂</span>
          <input
            className="form-input dt-input keydate-input"
            type="date"
            value={occ.herBirthday || ''}
            onChange={e => setOcc({ herBirthday: e.target.value })}
          />
        </div>
        {(occ.custom || []).map(c => (
          <div className="loc-row" key={c.id}>
            <span>🎉 {c.name} · {new Date(c.date + 'T00:00').toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })} (yearly)</span>
            <button
              className="row-btn row-btn-remove"
              onClick={() => setOcc({ custom: (occ.custom || []).filter(x => x.id !== c.id) })}
            >✕</button>
          </div>
        ))}
        <div className="keydate-add">
          <input className="form-input" placeholder="Occasion name (e.g. Met for the first time)" value={newOccName} onChange={e => setNewOccName(e.target.value)} />
          <input className="form-input dt-input" type="date" value={newOccDate} onChange={e => setNewOccDate(e.target.value)} />
          <button className="pill-btn outline-pill pill-sm" onClick={addCustom} disabled={!newOccName.trim() || !newOccDate}>Add</button>
        </div>
      </div>

      <div className="settings-card">
        <h3>Notifications</h3>
        <p className="settings-hint">
          Real lock-screen notifications: monthly mini-anniversary, the big anniversary,
          occasions, and a start-of-month nudge to log her flights.
          On iPhone the app must be added to the Home Screen first.
        </p>
        {pushStatus === 'subscribed' ? (
          <p className="settings-hint" style={{ color: '#6a8c5a' }}>✓ Notifications are on for this device</p>
        ) : pushStatus === 'unconfigured' ? (
          <p className="settings-hint">⚠ Push isn't set up on the server yet — see UPDATE-SETUP.md</p>
        ) : (
          <button className="pill-btn primary-pill pill-sm" onClick={enableNotifications}>
            🔔 Enable on this device
          </button>
        )}
      </div>

      <div className="settings-card">
        <h3>Preference learning</h3>
        <div className="pref-row">
          <div>
            <span>Ask why on skip</span>
            <p className="settings-hint" style={{ margin: 0 }}>Improves future suggestions</p>
          </div>
          <button
            className={`toggle-btn ${prefs.trackFeedback ? 'toggle-on' : 'toggle-off'}`}
            onClick={() => setPrefs(p => ({ ...p, trackFeedback: !p.trackFeedback }))}
          >
            {prefs.trackFeedback ? 'On' : 'Off'}
          </button>
        </div>
        <div className="pref-row">
          <span>{prefs.swipedLeft.length + prefs.swipedRight.length} places seen</span>
          <button
            className="pill-btn outline-pill pill-sm"
            onClick={() => { if (window.confirm('Reset swipe history?')) setPrefs(p => ({ ...p, swipedLeft: [], swipedRight: [], dislikedReasons: {} })) }}
          >
            Reset
          </button>
        </div>

        {/* Feedback summary */}
        {Object.keys(prefs.dislikedReasons || {}).length > 0 && (
          <div className="feedback-summary">
            <p className="settings-hint" style={{ marginBottom: 8 }}>Skip reasons learned:</p>
            {Object.entries(prefs.dislikedReasons).map(([k, v]) => (
              <div key={k} className="reason-bar-row">
                <span className="reason-label">{k}</span>
                <div className="reason-bar">
                  <div className="reason-fill" style={{ width: `${Math.min(v * 20, 100)}%` }} />
                </div>
                <span className="reason-count">{v}×</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-card">
        <h3>Data</h3>
        <p className="settings-hint">
          {dataCount > 0
            ? `✓ ${dataCount.toLocaleString()} places loaded from data/dubai_places.json`
            : '⚠ No data loaded — run collect_dubai_places.py to populate the database'}
        </p>
      </div>

      {flash && <div className="toast">Location saved ✓</div>}
    </div>
  )
}

// ─── Identity picker ──────────────────────────────────────────────────────────
// Asked once per device so every saved place / log entry / photo can be tagged
// with who added it. No passwords — just "which of us is this?".
function IdentityModal({ onPick }) {
  return (
    <div className="identity-overlay">
      <div className="identity-card">
        <span className="identity-heart">💕</span>
        <h2>Who's this?</h2>
        <p>Pick yourself so we can tag what you save. You'll only do this once on this device.</p>
        <div className="identity-buttons">
          {PEOPLE.map(name => (
            <button key={name} className="identity-btn" onClick={() => onPick(name)}>{name}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [allPlaces, setAllPlaces] = useState([])
  const [dataLoading, setDataLoading] = useState(true)

  // Navigation
  const [view, setView] = useState('quiz') // quiz | discover | liked | log | flights | settings

  // Quiz state
  const [quizStep, setQuizStep] = useState(0)
  const [answers, setAnswers] = useState({
    vibe: '',
    budget: 0,
    when: '',
    duration: 0,
    categories: [],
  })
  const setAnswer = (k, v) => setAnswers(a => ({ ...a, [k]: v }))

  // Discover state
  const [queue, setQueue] = useState([])
  const [qIdx, setQIdx] = useState(0)
  const [aiLoading, setAiLoading] = useState(false)
  const [feedbackPlace, setFeedbackPlace] = useState(null)

  // Persistent state
  const [prefs, setPrefs] = useState(() => ls(SK.prefs) || {
    trackFeedback: true,
    dislikedReasons: {},
    swipedLeft: [],
    swipedRight: [],
  })
  // Saved places + visit log now live in the shared cloud (see cloud.js).
  // They start empty and are loaded/synced by the effect below.
  const [liked, setLiked] = useState([])
  const [visitLog, setVisitLog] = useState([])

  // Who is using this device? (Boody / Janjon)
  const [me, setMeState] = useState(() => cloud.getMe())
  const pickMe = name => { cloud.setMe(name); setMeState(name) }
  const [settings, setSettings] = useState(() => ls(SK.settings) || {
    apiKey: '',
    yourLat: null, yourLng: null,
    herLat: null, herLng: null,
  })
  // Flights also live in the shared cloud now (loaded by the effect below).
  const [flights, setFlights] = useState([])

  // Movies watchlist, shared locations, and key dates — all shared + synced.
  const [movies, setMovies] = useState([])
  const [locations, setLocations] = useState(undefined)  // { Boody: {lat,lng}, Janjon: {lat,lng} }
  const [occasions, setOccasions] = useState(null)

  // ─── Coordinates derived from the shared locations ─────────
  // (falls back to the old per-device settings so nothing breaks mid-migration)
  const partner = PEOPLE.find(p => p !== me)
  const myLoc  = (me && locations?.[me]?.lat != null ? locations[me] : null)
    || (settings.yourLat ? { lat: settings.yourLat, lng: settings.yourLng } : null)
  const herLoc = (partner && locations?.[partner]?.lat != null ? locations[partner] : null)
    || (settings.herLat ? { lat: settings.herLat, lng: settings.herLng } : null)
  const midLat = myLoc && herLoc ? (myLoc.lat + herLoc.lat) / 2 : (myLoc?.lat ?? herLoc?.lat ?? null)
  const midLng = myLoc && herLoc ? (myLoc.lng + herLoc.lng) / 2 : (myLoc?.lng ?? herLoc?.lng ?? null)

  // ─── Weather state ────────────────────────────────────────
  const [weather, setWeather] = useState(null)
  // { tempC: number, humidity: number, lat: number, lng: number, fetchedAt: Date }

  // Fetch weather from Open-Meteo (free, no key) whenever we have coordinates
  useEffect(() => {
    const lat = midLat
    const lng = midLng
    if (!lat || !lng) return
    // Don't re-fetch if we have fresh data for same location (< 30 min old)
    if (weather && weather.lat === lat && weather.lng === lng &&
        (Date.now() - new Date(weather.fetchedAt).getTime()) < 30 * 60 * 1000) return
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,relative_humidity_2m&timezone=auto`
    )
      .then(r => r.json())
      .then(d => {
        const c = d.current
        if (c) setWeather({
          tempC: Math.round(c.temperature_2m * 10) / 10,
          humidity: c.relative_humidity_2m,
          lat, lng,
          fetchedAt: new Date().toISOString(),
        })
      })
      .catch(() => {}) // non-fatal
  }, [midLat, midLng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-detect MY location on load (once shared locations have loaded) and
  // store it in the shared cloud so it's global across both phones.
  useEffect(() => {
    if (!me || locations === undefined) return     // wait for identity + first load
    if (locations?.[me]?.lat != null) return       // already known
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const next = await cloud.saveLocation(me, +pos.coords.latitude.toFixed(6), +pos.coords.longitude.toFixed(6))
        setLocations(next)
      } catch { /* ignore */ }
    }, () => {}, { timeout: 8000 })
  }, [me, locations]) // eslint-disable-line react-hooks/exhaustive-deps

  // Settings → "Detect" button (always saves under MY name, shared globally)
  const detectMyLocation = useCallback(() => new Promise((resolve, reject) => {
    if (!me || !navigator.geolocation) return reject(new Error('unavailable'))
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const next = await cloud.saveLocation(me, +pos.coords.latitude.toFixed(6), +pos.coords.longitude.toFixed(6))
        setLocations(next)
        resolve()
      } catch (e) { reject(e) }
    }, reject, { timeout: 10000 })
  }), [me])

  // ─── Live clock for info panel ────────────────────────────
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Load JSON from data folder
  useEffect(() => {
    fetch('/data/dubai_places.json')
      .then(r => r.json())
      .then(d => {
        setAllPlaces(Array.isArray(d) ? d : (d.places || []))
        setDataLoading(false)
      })
      .catch(() => setDataLoading(false))
  }, [])

  // Settings stay per-device (each phone keeps its own location & API key).
  useEffect(() => { ss(SK.settings, settings) }, [settings])

  // Prefs (shared taste / swipe history): load once on open, save on change.
  const prefsLoaded = useRef(false)
  useEffect(() => {
    cloud.fetchPrefs().then(p => { if (p) setPrefs(prev => ({ ...prev, ...p })) })
      .finally(() => { prefsLoaded.current = true })
  }, [])
  useEffect(() => {
    if (!prefsLoaded.current) return            // don't overwrite the cloud before we've read it
    const t = setTimeout(() => { cloud.savePrefs(prefs) }, 600)  // debounce
    return () => clearTimeout(t)
  }, [prefs])

  // ─── Shared data: load Saved + Log + Flights and keep them live-synced ───────
  const refreshShared = useCallback(async () => {
    try {
      const [s, l, fl, mv, loc, occ] = await Promise.all([
        cloud.fetchSaved(), cloud.fetchLog(), cloud.fetchFlights(),
        cloud.fetchMovies(), cloud.fetchLocations(), cloud.fetchOccasions(),
      ])
      setLiked(s)
      setVisitLog(l)
      setFlights(fl)
      setMovies(mv)
      setLocations(loc || {})
      // First date defaults to 19 May 2026 — change it any time in Settings.
      setOccasions(occ || { firstDate: '2026-05-19' })
    } catch (e) { console.warn('refreshShared', e) }
  }, [])

  useEffect(() => {
    refreshShared()
    const unsub = cloud.subscribe(refreshShared)   // live updates from the other person
    return unsub
  }, [refreshShared])

  // ─── Shared-data actions (write to cloud, then refresh) ──────────────────────
  const addSavedPlace = useCallback(async place => {
    setLiked(prev => prev.find(p => p.id === place.id) ? prev : [{ ...place, _addedBy: me }, ...prev])
    try { await cloud.addSaved(place) } catch (e) { console.warn(e) }
  }, [me])

  const removeSavedPlace = useCallback(async id => {
    setLiked(prev => prev.filter(p => p.id !== id))
    try { await cloud.removeSaved(id) } catch (e) { console.warn(e) }
  }, [])

  const addLogEntry = useCallback(async data => {
    const entry = await cloud.addLog(data)
    const files = data._photoFiles || []
    if (entry?.id && files.length) {
      for (const f of files) {
        try { await cloud.addPhoto(entry.id, f) } catch (e) { console.warn(e) }
      }
    }
    await refreshShared()
  }, [refreshShared])

  const updateLogEntry = useCallback(async (id, data) => {
    try { await cloud.updateLog(id, data) } catch (e) { console.warn(e); throw e }
    await refreshShared()
  }, [refreshShared])

  const removeLogEntry = useCallback(async id => {
    setVisitLog(prev => prev.filter(e => e.id !== id))
    try { await cloud.removeLog(id) } catch (e) { console.warn(e) }
  }, [])

  const addLogPhoto = useCallback(async (entryId, files) => {
    const list = Array.isArray(files) ? files : [files]
    for (const f of list) {
      try { await cloud.addPhoto(entryId, f) } catch (e) { console.warn(e) }
    }
    await refreshShared()
  }, [refreshShared])

  const removeLogPhoto = useCallback(async photo => {
    try { await cloud.removePhoto(photo) } catch (e) { console.warn(e) }
    await refreshShared()
  }, [refreshShared])

  const addFlightEntry = useCallback(async f => {
    try { await cloud.addFlight(f) } catch (e) { console.warn(e) }
    await refreshShared()
  }, [refreshShared])

  const updateFlightEntry = useCallback(async (id, f) => {
    try { await cloud.updateFlight(id, f) } catch (e) { console.warn(e) }
    await refreshShared()
  }, [refreshShared])

  const removeFlightEntry = useCallback(async id => {
    setFlights(prev => prev.filter(f => f.id !== id))
    try { await cloud.removeFlight(id) } catch (e) { console.warn(e) }
  }, [])

  // ─── Movies ───────────────────────────────────────────────
  const addMovieEntry = useCallback(async (title, meta = null) => {
    try { await cloud.addMovie(title, meta) } catch (e) { console.warn(e) }
    await refreshShared()
  }, [refreshShared])

  const updateMovieEntry = useCallback(async (id, patch) => {
    setMovies(prev => prev.map(m => m.id !== id ? m : {
      ...m,
      ...(patch.watchedAt !== undefined ? { watchedAt: patch.watchedAt } : {}),
      ...(patch.myRating  !== undefined ? { ratings: { ...m.ratings, [me]: patch.myRating } } : {}),
    }))
    try { await cloud.updateMovie(id, patch) } catch (e) { console.warn(e) }
  }, [me])

  const removeMovieEntry = useCallback(async id => {
    setMovies(prev => prev.filter(m => m.id !== id))
    try { await cloud.removeMovie(id) } catch (e) { console.warn(e) }
  }, [])

  // ─── Occasions / key dates ────────────────────────────────
  const saveOccasionsCfg = useCallback(async occ => {
    setOccasions(occ)
    try { await cloud.saveOccasions(occ) } catch (e) { console.warn(e) }
  }, [])

  // ─── Build queue (quiz-driven) ─────────────────────────────
  const buildQueue = useCallback(async () => {
    if (allPlaces.length === 0) return
    setAiLoading(true)

    const model = buildPreferenceModel(liked, prefs)
    const filterCats = answers.categories?.length > 0 ? answers.categories : null
    const seen = new Set([...prefs.swipedLeft, ...prefs.swipedRight])

    const candidates = allPlaces
      .filter(p => {
        if (seen.has(p.id)) return false
        if (filterCats && !filterCats.includes(p.category)) return false
        return true
      })
      .map(p => ({
        ...p,
        _score: scorePlaceAdvanced(p, model, {
          answers, midLat, midLng, now: new Date(), checkOpenNow: false, weather,
        })
      }))
      .sort((a, b) => b._score - a._score)

    // Optional AI re-ranking on top-40 if API key is set
    if (settings.apiKey && candidates.length >= 20) {
      try {
        const top40 = candidates.slice(0, 40)
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: `Dubai date night curator. Pick the 15 best place IDs for: vibe="${answers.vibe}", budget level=${answers.budget}/4, categories=${JSON.stringify(answers.categories)}.
Candidates: ${JSON.stringify(top40.map(p => ({ id: p.id, name: p.name, cat: p.category, sub: p.subcategory, price: p.price_level, area: p.area, rating: p.rating })))}
Return ONLY a JSON array of 15 IDs. No explanation.`,
            }],
          }),
        })
        const data = await res.json()
        const txt = data.content?.[0]?.text || ''
        const match = txt.match(/\[[\s\S]*?\]/)
        if (match) {
          const ids = JSON.parse(match[0])
          const byId = Object.fromEntries(top40.map(p => [p.id, p]))
          const aiPicks = ids.map(id => byId[id]).filter(Boolean)
          const rest = candidates.filter(p => !ids.includes(p.id))
          setQueue([...aiPicks, ...rest])
          setQIdx(0); setAiLoading(false); setView('discover')
          return
        }
      } catch (err) {
        console.warn('AI ranking failed, falling back to local scoring:', err)
      }
    }

    setQueue(candidates)
    setQIdx(0); setAiLoading(false); setView('discover')
  }, [allPlaces, answers, settings, prefs, liked, weather, midLat, midLng])

  // ─── Feeling Spontaneous ────────────────────────────────────
  const handleSpontaneous = useCallback(() => {
    if (allPlaces.length === 0) return
    setAiLoading(true)

    const run = (currentLat, currentLng) => {
      const model = buildPreferenceModel(liked, prefs)
      const lat = currentLat ?? myLoc?.lat ?? null
      const lng = currentLng ?? myLoc?.lng ?? null
      const now = new Date()
      const seen = new Set([...prefs.swipedLeft, ...prefs.swipedRight])

      const scored = allPlaces
        .filter(p => !seen.has(p.id))
        .map(p => ({
          ...p,
          _score: scorePlaceAdvanced(p, model, {
            answers: { vibe: 'surprise', budget: 0, categories: [] },
            midLat: lat, midLng: lng, now, checkOpenNow: true, weather,
          })
        }))
        .sort((a, b) => b._score - a._score)

      const likedCats = new Set(liked.map(p => p.category))
      const familiar = scored.filter(p => likedCats.size === 0 || likedCats.has(p.category))
      const explore  = scored.filter(p => likedCats.size > 0 && !likedCats.has(p.category))

      const mixed = []
      let f = 0, e = 0
      while (mixed.length < 60) {
        if (f < familiar.length) mixed.push(familiar[f++])
        if (f < familiar.length) mixed.push(familiar[f++])
        if (e < explore.length)  mixed.push(explore[e++])
        if (f >= familiar.length && e >= explore.length) break
      }
      while (f < familiar.length) mixed.push(familiar[f++])
      while (e < explore.length)  mixed.push(explore[e++])

      setQueue(mixed.length > 0 ? mixed : scored)
      setQIdx(0); setAiLoading(false); setView('discover')
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => run(+pos.coords.latitude.toFixed(6), +pos.coords.longitude.toFixed(6)),
        ()  => run(null, null),
        { timeout: 6000 }
      )
    } else {
      run(null, null)
    }
  }, [allPlaces, liked, prefs, weather, myLoc])

  // ─── Swipe handler ─────────────────────────────────────────
  const handleSwipe = useCallback((direction) => {
    const place = queue[qIdx]
    if (!place) return

    if (direction === 'right') {
      addSavedPlace(place)
      setPrefs(p => ({ ...p, swipedRight: [...p.swipedRight, place.id] }))
      setQIdx(i => i + 1)
    } else {
      setPrefs(p => ({ ...p, swipedLeft: [...p.swipedLeft, place.id] }))
      setQIdx(i => i + 1)
      if (prefs.trackFeedback) setFeedbackPlace(place)
    }
  }, [queue, qIdx, prefs.trackFeedback, addSavedPlace])

  const handleFeedback = useCallback((reasons) => {
    setPrefs(p => {
      const updated = { ...p.dislikedReasons }
      reasons.forEach(r => { updated[r] = (updated[r] || 0) + 1 })
      return { ...p, dislikedReasons: updated }
    })
    setFeedbackPlace(null)
  }, [])

  // ─── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    if (view !== 'discover') return
    const handler = e => {
      if (e.key === 'ArrowRight') handleSwipe('right')
      if (e.key === 'ArrowLeft') handleSwipe('left')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [view, handleSwipe])

  // ─── Visible card stack ────────────────────────────────────
  const visibleCards = queue.slice(qIdx, qIdx + 3)
  const isDone = queue.length > 0 && qIdx >= queue.length

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="app">
      {/* ── Info panel ─────────────────────────────────────── */}
      {(() => {
        const lat  = midLat
        const lng  = midLng
        const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
        const dayStr  = DAYS[now.getDay()]
        const dateStr = now.toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })
        const timeStr = now.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', hour12: true })
        return (
          <div className="info-panel">
            {lat && lng && (
              <span className="info-chip info-coords">
                📍 {lat.toFixed(3)}, {lng.toFixed(3)}
              </span>
            )}
            <span className="info-chip info-time">
              {dayStr} · {dateStr} · {timeStr}
            </span>
            {weather ? (
              <span className={`info-chip info-weather${weather.tempC > 35 ? ' info-hot' : ''}`}>
                {weather.tempC > 38 ? '🥵' : weather.tempC > 32 ? '☀️' : '🌤️'} {weather.tempC}°C · 💧{weather.humidity}%
              </span>
            ) : lat && lng ? (
              <span className="info-chip info-weather info-loading">⏳ fetching weather…</span>
            ) : null}
            {me && (
              <span
                className="info-chip info-me"
                onClick={() => { if (window.confirm('Switch who you are on this device?')) setMeState(null) }}
                title="Switch user"
              >
                👤 {me}
              </span>
            )}
            {!cloud.isCloud && (
              <span className="info-chip info-offline" title="Shared database not connected yet — saving locally on this device only">
                ⚠ local only
              </span>
            )}
          </div>
        )
      })()}

      {/* Header */}
      <header className={`app-header${view !== 'quiz' ? ' with-nav' : ''}`}>
        {view === 'quiz' ? (
          <div style={{ width: '100%', textAlign: 'center' }}>
            <span className="logo-wordmark">Dubai</span>
            <div className="logo">Where should we go <em>tonight?</em></div>
          </div>
        ) : (
          <>
            <div className="logo" onClick={() => setView('discover')} style={{ cursor: 'pointer' }}>
              Date <em>Night</em>
            </div>
            <nav className="app-nav">
              <button className={`nav-btn ${view === 'discover' ? 'nav-active' : ''}`} onClick={() => setView('discover')}>✦ Discover</button>
              <button className={`nav-btn ${view === 'liked' ? 'nav-active' : ''}`} onClick={() => setView('liked')}>
                ♡ Saved{liked.length > 0 && <span className="nav-badge">{liked.length}</span>}
              </button>
              <button className={`nav-btn ${view === 'log' ? 'nav-active' : ''}`} onClick={() => setView('log')}>◎ Log</button>
              <button className={`nav-btn ${view === 'movies' ? 'nav-active' : ''}`} onClick={() => setView('movies')}>
                🎬 Movies{movies.filter(m => !m.watchedAt).length > 0 && <span className="nav-badge">{movies.filter(m => !m.watchedAt).length}</span>}
              </button>
              <button className={`nav-btn ${view === 'flights' ? 'nav-active' : ''}`} onClick={() => setView('flights')}>
                ✈ Schedule{flights.length > 0 && <span className="nav-badge">{flights.length}</span>}
              </button>
              <button className={`nav-btn ${view === 'settings' ? 'nav-active' : ''}`} onClick={() => setView('settings')}>⚙ Settings</button>
            </nav>
          </>
        )}
      </header>

      {/* Main */}
      <main className="app-main">

        {/* ── Quiz ── */}
        {view === 'quiz' && occasions && <OccasionBanner occasions={occasions} />}
        {view === 'quiz' && (
          <QuizView
            step={quizStep}
            answers={answers}
            setAnswer={setAnswer}
            onNext={() => {
              if (quizStep < QUIZ_STEPS.length - 1) setQuizStep(s => s + 1)
              else buildQueue()
            }}
            onBack={() => setQuizStep(s => s - 1)}
            loading={aiLoading || dataLoading}
            onSpontaneous={handleSpontaneous}
            flights={flights}
          />
        )}

        {/* ── Discover ── */}
        {view === 'discover' && (
          <div className="discover-wrap">
            {aiLoading ? (
              <div className="center-state">
                <img src={sticker2Src} alt="" className="sticker-state" />
                <p style={{ marginTop: 8 }}>Finding the perfect spots…</p>
              </div>
            ) : isDone ? (
              <div className="center-state">
                <img src={sticker1Src} alt="" className="sticker-state" />
                <h2>That's everything</h2>
                <p>You've seen all our suggestions for this search.</p>
                <button className="pill-btn primary-pill" onClick={buildQueue}>Fresh batch</button>
                <button
                  className="pill-btn outline-pill"
                  onClick={() => {
                    setPrefs(p => ({ ...p, swipedLeft: [], swipedRight: [] }))
                    buildQueue()
                  }}
                >
                  Reset &amp; start over
                </button>
                <button className="pill-btn outline-pill" onClick={() => { setQuizStep(0); setView('quiz') }}>
                  New search
                </button>
              </div>
            ) : (
              <>
                <div className="card-stack">
                  {[...visibleCards].reverse().map((place, i) => (
                    <SwipeCard
                      key={place.id}
                      place={place}
                      onSwipe={handleSwipe}
                      isTop={i === visibleCards.length - 1}
                      stackPos={visibleCards.length - 1 - i}
                      userLat={midLat}
                      userLng={midLng}
                    />
                  ))}
                </div>

                <div className="discover-hint">
                  Drag or use ← → keys · {Math.max(0, queue.length - qIdx)} places left
                </div>

                <div className="discover-actions">
                  <button className="pill-btn outline-pill" onClick={() => { setQuizStep(0); setView('quiz') }}>
                    🔄 New search
                  </button>
                  <button className="pill-btn spontaneous-pill" onClick={handleSpontaneous}>
                    ✨ Spontaneous
                  </button>
                  <button
                    className="pill-btn outline-pill"
                    onClick={() => {
                      if (queue.length - qIdx < 8) buildQueue()
                      else setQIdx(i => i + 5)
                    }}
                  >
                    ⚡ More
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Liked ── */}
        {view === 'liked' && (
          <LikedView
            liked={liked}
            onRemove={removeSavedPlace}
          />
        )}

        {/* ── Log ── */}
        {view === 'log' && (
          <LogView
            log={visitLog}
            onAddEntry={addLogEntry}
            onUpdateEntry={updateLogEntry}
            onRemove={removeLogEntry}
            onAddPhoto={addLogPhoto}
            onRemovePhoto={removeLogPhoto}
            occasions={occasions}
          />
        )}

        {/* ── Movies ── */}
        {view === 'movies' && (
          <MoviesView
            movies={movies}
            me={me}
            onAdd={addMovieEntry}
            onUpdate={updateMovieEntry}
            onRemove={removeMovieEntry}
          />
        )}

        {/* ── Flights ── */}
        {view === 'flights' && (
          <FlightsView
            flights={flights}
            onAdd={addFlightEntry}
            onUpdate={updateFlightEntry}
            onRemove={removeFlightEntry}
          />
        )}

        {/* ── Settings ── */}
        {view === 'settings' && (
          <SettingsView
            settings={settings}
            setSettings={setSettings}
            prefs={prefs}
            setPrefs={setPrefs}
            dataCount={allPlaces.length}
            me={me}
            locations={locations}
            onDetectMyLocation={detectMyLocation}
            occasions={occasions}
            onSaveOccasions={saveOccasionsCfg}
          />
        )}
      </main>

      {/* ── Feedback modal ── */}
      {feedbackPlace && (
        <FeedbackModal
          place={feedbackPlace}
          onSubmit={handleFeedback}
          onDismiss={() => setFeedbackPlace(null)}
        />
      )}

      {/* ── Who am I? (asked once per device) ── */}
      {!me && <IdentityModal onPick={pickMe} />}
    </div>
  )
}
