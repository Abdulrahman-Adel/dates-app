// Vercel serverless function: movie lookup via TMDB (themoviedb.org).
//
// The TMDB API key stays server-side (env var TMDB_API_KEY) so it never
// ships to the phones.
//
//   GET /api/movie-search?q=inception   → search, top 6 matches
//   GET /api/movie-search?id=27205      → full details for one movie (adds runtime)
//
// Response items: { id, title, year, poster, plot, score, genres, runtime? }

const GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
}

const POSTER = p => (p ? `https://image.tmdb.org/t/p/w342${p}` : null)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=86400')   // cache lookups for a day

  const KEY = process.env.TMDB_API_KEY
  if (!KEY) {
    res.status(500).json({ error: 'TMDB_API_KEY env var is not set in Vercel' })
    return
  }

  const { q, id } = req.query || {}

  try {
    // ── Details for one movie (used after the user picks a suggestion) ──
    if (id) {
      const r = await fetch(
        `https://api.themoviedb.org/3/movie/${encodeURIComponent(id)}?api_key=${KEY}&language=en-US`
      )
      if (!r.ok) { res.status(200).json(null); return }
      const m = await r.json()
      res.status(200).json({
        id: m.id,
        title: m.title,
        year: m.release_date ? m.release_date.slice(0, 4) : null,
        poster: POSTER(m.poster_path),
        plot: m.overview || null,
        score: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null,
        genres: (m.genres || []).map(g => g.name).slice(0, 3),
        runtime: m.runtime || null,
      })
      return
    }

    // ── Search ──
    if (!q || !q.trim()) { res.status(400).json({ error: 'missing q' }); return }
    const r = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${KEY}&language=en-US&include_adult=false&query=${encodeURIComponent(q.trim())}`
    )
    if (!r.ok) { res.status(200).json([]); return }
    const data = await r.json()
    const results = (data.results || [])
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 6)
      .map(m => ({
        id: m.id,
        title: m.title,
        year: m.release_date ? m.release_date.slice(0, 4) : null,
        poster: POSTER(m.poster_path),
        plot: m.overview || null,
        score: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null,
        genres: (m.genre_ids || []).map(g => GENRES[g]).filter(Boolean).slice(0, 3),
      }))
    res.status(200).json(results)
  } catch (e) {
    res.status(200).json({ error: String(e) })
  }
}
