import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

// ─── Sticker assets ───────────────────────────────────────────────────────────
import leftStickerSrc  from '../Stickers/Left Image.png'
import rightStickerSrc from '../Stickers/Right Image.png'
import sticker1Src     from '../Stickers/Sticker 1.png'
import sticker2Src     from '../Stickers/Sticker 2.png'
import sticker3Src     from '../Stickers/Sticker 3.png'
import peekStickerSrc  from '../Stickers/Peek Sticker.png'

// ─── Storage ──────────────────────────────────────────────────────────────────
const SK = { settings: 'dn_s', log: 'dn_l', prefs: 'dn_p', liked: 'dn_k' }
const ls = k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
const ss = (k, v) => localStorage.setItem(k, JSON.stringify(v))

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
function QuizView({ step, answers, setAnswer, onNext, onBack, loading, onSpontaneous }) {
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
  if (liked.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon">💔</span>
        <h2>Nothing saved yet</h2>
        <p>Swipe right on places you love</p>
      </div>
    )
  }
  return (
    <div className="list-view">
      <h2 className="list-title">Saved <span className="list-count">{liked.length}</span></h2>
      <div className="place-list">
        {liked.map(place => (
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
function LogView({ log, onAddEntry, onRemove }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', rating: 5, notes: '' })

  const submit = () => {
    if (!form.name.trim()) return
    onAddEntry({ id: Date.now().toString(), date: new Date().toISOString(), placeName: form.name, rating: form.rating, notes: form.notes })
    setForm({ name: '', rating: 5, notes: '' })
    setAdding(false)
  }

  return (
    <div className="list-view">
      <div className="list-header">
        <h2 className="list-title">Visit Log{log.length > 0 && <span className="list-count">{log.length}</span>}</h2>
        <button className="pill-btn primary-pill pill-sm" onClick={() => setAdding(a => !a)}>
          {adding ? 'Cancel' : '+ Log visit'}
        </button>
      </div>

      {adding && (
        <div className="log-form">
          <input
            className="form-input"
            placeholder="Place name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            autoFocus
          />
          <div className="star-row">
            <span>Rating</span>
            <div className="stars-input">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  className={`star ${form.rating >= n ? 'star-lit' : ''}`}
                  onClick={() => setForm(f => ({ ...f, rating: n }))}
                >★</button>
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
          <button className="pill-btn primary-pill" onClick={submit} style={{ width: '100%', justifyContent: 'center' }}>
            Save entry
          </button>
        </div>
      )}

      {log.length === 0 && !adding && (
        <div className="empty-state">
          <span className="empty-icon">📖</span>
          <h2>No visits yet</h2>
          <p>Keep track of your date nights</p>
        </div>
      )}

      <div className="log-list">
        {log.map((entry, i) => (
          <div key={entry.id || i} className="log-entry">
            <div className="log-entry-body">
              <div className="log-entry-top">
                <h3 className="log-name">{entry.placeName}</h3>
                <div className="log-stars">{'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}</div>
              </div>
              <p className="log-date">{new Date(entry.date).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              {entry.notes && <p className="log-notes">{entry.notes}</p>}
            </div>
            <button className="icon-btn" onClick={() => onRemove(i)} title="Remove">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Settings View ────────────────────────────────────────────────────────────
function SettingsView({ settings, setSettings, prefs, setPrefs, dataCount }) {
  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }))
  const [flash, setFlash] = useState(false)

  const detectLoc = who => {
    navigator.geolocation?.getCurrentPosition(
      pos => {
        set(`${who}Lat`, +pos.coords.latitude.toFixed(6))
        set(`${who}Lng`, +pos.coords.longitude.toFixed(6))
        setFlash(true); setTimeout(() => setFlash(false), 1500)
      },
      () => alert('Could not detect location')
    )
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
        <p className="settings-hint">Used to score places by distance from your midpoint</p>
        <div className="loc-row">
          <span>Your location</span>
          <div className="loc-right">
            {settings.yourLat && <span className="loc-coords">{settings.yourLat.toFixed(3)}, {settings.yourLng.toFixed(3)}</span>}
            <button className="pill-btn outline-pill pill-sm" onClick={() => detectLoc('your')}>Detect</button>
          </div>
        </div>
        <div className="loc-row">
          <span>Her location</span>
          <div className="loc-right">
            {settings.herLat && <span className="loc-coords">{settings.herLat.toFixed(3)}, {settings.herLng.toFixed(3)}</span>}
            <button className="pill-btn outline-pill pill-sm" onClick={() => detectLoc('her')}>Detect</button>
          </div>
        </div>
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

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [allPlaces, setAllPlaces] = useState([])
  const [dataLoading, setDataLoading] = useState(true)

  // Navigation
  const [view, setView] = useState('quiz') // quiz | discover | liked | log | settings

  // Quiz state
  const [quizStep, setQuizStep] = useState(0)
  const [answers, setAnswers] = useState({
    vibe: '',
    budget: 0,
    when: '',
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
  const [liked, setLiked] = useState(() => ls(SK.liked) || [])
  const [visitLog, setVisitLog] = useState(() => ls(SK.log) || [])
  const [settings, setSettings] = useState(() => ls(SK.settings) || {
    apiKey: '',
    yourLat: null, yourLng: null,
    herLat: null, herLng: null,
  })

  // ─── Weather state ────────────────────────────────────────
  const [weather, setWeather] = useState(null)
  // { tempC: number, humidity: number, lat: number, lng: number, fetchedAt: Date }

  // Fetch weather from Open-Meteo (free, no key) whenever we have coordinates
  useEffect(() => {
    const lat = settings.yourLat || settings.herLat
    const lng = settings.yourLng || settings.herLng
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
  }, [settings.yourLat, settings.yourLng, settings.herLat, settings.herLng])

  // Also try to get user location on first load if no coords saved
  useEffect(() => {
    if (settings.yourLat) return // already have location
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = +pos.coords.latitude.toFixed(6)
      const lng = +pos.coords.longitude.toFixed(6)
      setSettings(s => ({ ...s, yourLat: lat, yourLng: lng }))
    }, () => {}, { timeout: 8000 })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Persist to localStorage
  useEffect(() => { ss(SK.prefs, prefs) }, [prefs])
  useEffect(() => { ss(SK.liked, liked) }, [liked])
  useEffect(() => { ss(SK.log, visitLog) }, [visitLog])
  useEffect(() => { ss(SK.settings, settings) }, [settings])

  // ─── Build queue (quiz-driven) ─────────────────────────────
  const buildQueue = useCallback(async () => {
    if (allPlaces.length === 0) return
    setAiLoading(true)

    const model = buildPreferenceModel(liked, prefs)
    const midLat = settings.yourLat && settings.herLat
      ? (settings.yourLat + settings.herLat) / 2 : settings.yourLat || null
    const midLng = settings.yourLng && settings.herLng
      ? (settings.yourLng + settings.herLng) / 2 : settings.yourLng || null

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
  }, [allPlaces, answers, settings, prefs, liked, weather])

  // ─── Feeling Spontaneous ────────────────────────────────────
  const handleSpontaneous = useCallback(() => {
    if (allPlaces.length === 0) return
    setAiLoading(true)

    const run = (currentLat, currentLng) => {
      const model = buildPreferenceModel(liked, prefs)
      const lat = currentLat ?? settings.yourLat ?? null
      const lng = currentLng ?? settings.yourLng ?? null
      const now = new Date()
      const seen = new Set([...prefs.swipedLeft, ...prefs.swipedRight])

      // Score everything — open-now check is active, no category/budget filter
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

      // Blend: 2 familiar (liked categories) + 1 explore (new category), repeat
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
  }, [allPlaces, liked, prefs, settings, weather])

  // ─── Swipe handler ─────────────────────────────────────────
  const handleSwipe = useCallback((direction) => {
    const place = queue[qIdx]
    if (!place) return

    if (direction === 'right') {
      setLiked(prev => prev.find(p => p.id === place.id) ? prev : [place, ...prev])
      setPrefs(p => ({ ...p, swipedRight: [...p.swipedRight, place.id] }))
      setQIdx(i => i + 1)
    } else {
      setPrefs(p => ({ ...p, swipedLeft: [...p.swipedLeft, place.id] }))
      setQIdx(i => i + 1)
      if (prefs.trackFeedback) setFeedbackPlace(place)
    }
  }, [queue, qIdx, prefs.trackFeedback])

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
  const midLat = settings.yourLat || settings.herLat
  const midLng = settings.yourLng || settings.herLng

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="app">
      {/* ── Info panel ─────────────────────────────────────── */}
      {(() => {
        const lat  = settings.yourLat || settings.herLat
        const lng  = settings.yourLng || settings.herLng
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
              <button className={`nav-btn ${view === 'liked'   ? 'nav-active' : ''}`} onClick={() => setView('liked')}>
                ♡ Saved{liked.length > 0 && <span className="nav-badge">{liked.length}</span>}
              </button>
              <button className={`nav-btn ${view === 'log'      ? 'nav-active' : ''}`} onClick={() => setView('log')}>◎ Log</button>
              <button className={`nav-btn ${view === 'settings' ? 'nav-active' : ''}`} onClick={() => setView('settings')}>⚙ Settings</button>
            </nav>
          </>
        )}
      </header>

      {/* Main */}
      <main className="app-main">

        {/* ── Quiz ── */}
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
                      // Skip ahead 5 for variety, or rebuild if near end
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
            onRemove={id => setLiked(prev => prev.filter(p => p.id !== id))}
          />
        )}

        {/* ── Log ── */}
        {view === 'log' && (
          <LogView
            log={visitLog}
            onAddEntry={e => setVisitLog(prev => [e, ...prev])}
            onRemove={i => setVisitLog(prev => prev.filter((_, j) => j !== i))}
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
    </div>
  )
}
