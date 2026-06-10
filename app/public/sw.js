// Date Night PWA — Service Worker
const CACHE = 'date-night-v2'

// Assets to pre-cache on install (app shell)
const PRECACHE = [
  '/',
  '/manifest.json',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  // Remove old caches
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Never intercept non-GET requests (Supabase writes, API posts, …)
  if (request.method !== 'GET') return

  // Network-first for data, APIs, and Supabase so they're always fresh
  if (
    url.pathname.startsWith('/data/') ||
    url.pathname.startsWith('/api/') ||
    url.hostname === 'api.anthropic.com' ||
    url.hostname.endsWith('.supabase.co')
  ) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    )
    return
  }

  // Cache-first for everything else (app shell, fonts, assets)
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE).then(cache => cache.put(request, clone))
        }
        return response
      })
    })
  )
})
