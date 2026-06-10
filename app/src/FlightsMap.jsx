import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Home base — Dubai
const DUBAI = { lat: 25.2048, lng: 55.2708 }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Does a flight's trip overlap the given month?
function inMonth(flight, year, month) {
  const dep = new Date(flight.departureDate)
  const ret = new Date(flight.returnDate || flight.departureDate)
  const start = new Date(year, month, 1)
  const end   = new Date(year, month + 1, 0, 23, 59, 59)
  return dep <= end && ret >= start
}

// A gentle curved path between two points (quadratic bezier, bowed upward).
function arcPoints(a, b) {
  const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
  const dx = b.lng - a.lng, dy = b.lat - a.lat
  const dist = Math.sqrt(dx * dx + dy * dy)
  // offset the control point perpendicular to the line for a nice bow
  const offset = Math.min(dist * 0.18, 14)
  const ctrl = { lat: mid.lat + offset, lng: mid.lng - dx * 0.04 }
  const pts = []
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const lat = (1 - t) * (1 - t) * a.lat + 2 * (1 - t) * t * ctrl.lat + t * t * b.lat
    const lng = (1 - t) * (1 - t) * a.lng + 2 * (1 - t) * t * ctrl.lng + t * t * b.lng
    pts.push([lat, lng])
  }
  return pts
}

export default function FlightsMap({ flights }) {
  const mapRef   = useRef(null)
  const mapObj   = useRef(null)
  const layerRef = useRef(null)

  const today = new Date()
  const [offset, setOffset] = useState(0) // months from current month

  const base  = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const year  = base.getFullYear()
  const month = base.getMonth()

  const monthFlights = flights.filter(f => inMonth(f, year, month))
  const mapped   = monthFlights.filter(f => f.lat != null && f.lng != null)
  const unmapped = monthFlights.filter(f => f.lat == null || f.lng == null)

  // init map once
  useEffect(() => {
    if (mapObj.current || !mapRef.current) return
    const map = L.map(mapRef.current, {
      center: [DUBAI.lat, DUBAI.lng],
      zoom: 3,
      scrollWheelZoom: false,
      zoomControl: false,          // cleaner card — pinch / double-click still zoom
      worldCopyJump: true,
    })
    // warm, soft CARTO Voyager tiles — fits the app's cream/gold palette far
    // better than default OSM blue
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap · © CARTO',
      subdomains: 'abcd',
      maxZoom: 12,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapObj.current = map
    return () => { map.remove(); mapObj.current = null }
  }, [])

  // redraw markers whenever the month or flights change
  useEffect(() => {
    const map = mapObj.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()

    // Dubai home marker
    L.marker([DUBAI.lat, DUBAI.lng], {
      icon: L.divIcon({
        className: 'fm-pin fm-home',
        html: '<div class="fm-home-dot">🏠</div><div class="fm-label fm-label-home">Dubai · home</div>',
        iconSize: [0, 0],
      }),
    }).addTo(layer)

    const bounds = [[DUBAI.lat, DUBAI.lng]]
    const nowTs  = new Date()
    const fmtD   = d => new Date(d).toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })

    mapped.forEach(f => {
      bounds.push([f.lat, f.lng])
      const isNow = new Date(f.departureDate) <= nowTs && new Date(f.returnDate) >= nowTs
      // dotted romantic flight trail
      L.polyline(arcPoints(DUBAI, { lat: f.lat, lng: f.lng }), {
        color: isNow ? '#c4604a' : '#c4933f',
        weight: 2.5,
        opacity: isNow ? 0.9 : 0.55,
        dashArray: '1 7',
        lineCap: 'round',
      }).addTo(layer)
      // destination plane marker (pulses while she's actually away)
      L.marker([f.lat, f.lng], {
        icon: L.divIcon({
          className: 'fm-pin',
          html:
            `<div class="fm-plane${isNow ? ' fm-plane-now' : ''}">✈️</div>` +
            `<div class="fm-label">${escapeHtml(f.destination)}` +
            `<span class="fm-label-dates">${fmtD(f.departureDate)} – ${fmtD(f.returnDate)}${isNow ? ' · now' : ''}</span></div>`,
          iconSize: [0, 0],
        }),
      }).addTo(layer)
    })

    if (mapped.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 })
    } else {
      map.setView([DUBAI.lat, DUBAI.lng], 3)
    }
    setTimeout(() => map.invalidateSize(), 50)
  }, [year, month, flights]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fm-wrap">
      <div className="fm-monthbar">
        <button className="fm-arrow" onClick={() => setOffset(o => o - 1)} title="Previous month">‹</button>
        <span className="fm-month">{MONTHS[month]} {year}</span>
        <button className="fm-arrow" onClick={() => setOffset(o => o + 1)} title="Next month">›</button>
      </div>

      <div ref={mapRef} className="fm-map" />

      <div className="fm-legend">
        {monthFlights.length === 0
          ? <span className="fm-empty">No trips this month 💕 — she's around!</span>
          : (
            <>
              <span className="fm-count">{monthFlights.length} trip{monthFlights.length > 1 ? 's' : ''} this month</span>
              {mapped.map(f => (
                <span key={f.id} className="fm-chip">✈️ {f.destination}</span>
              ))}
              {unmapped.map(f => (
                <span key={f.id} className="fm-chip fm-chip-dim" title="Couldn't find this place on the map">📍 {f.destination}</span>
              ))}
            </>
          )
        }
      </div>
    </div>
  )
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}
