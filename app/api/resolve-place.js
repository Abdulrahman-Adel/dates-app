// Vercel serverless function: expand a Google Maps link and pull out the
// place name + coordinates.
//
// Why this exists: short links like https://maps.app.goo.gl/xxxx are just
// redirects, and a browser can't read where they land (CORS). So we expand
// them here on the server, then parse the real URL for the place name.
//
// Request:  GET /api/resolve-place?url=<google maps link>
// Response: { name, lat, lng, finalUrl }   (any field may be null)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const raw = (req.query && req.query.url) || ''
  if (!raw) {
    res.status(400).json({ error: 'missing url' })
    return
  }

  let url
  try {
    url = new URL(raw.trim())
  } catch {
    res.status(400).json({ error: 'invalid url' })
    return
  }

  // Only follow Google's own map domains — don't turn this into an open proxy.
  const allowed = [
    'maps.app.goo.gl', 'goo.gl', 'g.co', 'maps.google.com',
    'www.google.com', 'google.com',
  ]
  const host = url.hostname.replace(/^www\./, '')
  if (!allowed.includes(url.hostname) && !allowed.includes(host)) {
    res.status(400).json({ error: 'not a google maps link' })
    return
  }

  let finalUrl = url.toString()
  try {
    // Follow the redirect chain to the canonical maps URL.
    const r = await fetch(finalUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DateNightBot/1.0)' },
    })
    finalUrl = r.url || finalUrl
    // Some short links resolve via an HTML <meta>/JS hop; grab the body too.
    const body = await r.text().catch(() => '')
    const parsed = parseMaps(finalUrl, body)
    res.status(200).json({ ...parsed, finalUrl })
  } catch (e) {
    res.status(200).json({ name: null, lat: null, lng: null, finalUrl, error: String(e) })
  }
}

function parseMaps(finalUrl, body = '') {
  let name = null
  let lat = null
  let lng = null

  // ── Place name from the /place/<Name>/ path segment ──
  const placeMatch = finalUrl.match(/\/place\/([^/@]+)/)
  if (placeMatch) {
    try {
      name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim()
    } catch {
      name = placeMatch[1].replace(/\+/g, ' ').trim()
    }
  }

  // ── Coordinates ──
  // Prefer the precise marker coords (!3d<lat>!4d<lng>); fall back to @lat,lng.
  const marker = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  const at = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (marker) {
    lat = parseFloat(marker[1]); lng = parseFloat(marker[2])
  } else if (at) {
    lat = parseFloat(at[1]); lng = parseFloat(at[2])
  }

  // ── Fallbacks from the HTML body (some links don't expose name in the URL) ──
  if (!name && body) {
    const og = body.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
                || body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
    if (og) name = decodeHtml(og[1]).replace(/ - Google Maps$/i, '').trim()
    if (!name) {
      const title = body.match(/<title>([^<]+)<\/title>/i)
      if (title) name = decodeHtml(title[1]).replace(/ - Google Maps$/i, '').trim()
    }
  }

  if (name === 'Unnamed' || name === '') name = null
  return { name, lat, lng }
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
}
