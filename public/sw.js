/*
 * Minimal offline shell for HD HOTELS – TECHNIK.
 *
 * Rules, in order of importance:
 *  1. Nothing private is ever cached: API routes, server functions and media
 *     always go to the network so a signed-out device cannot replay data.
 *  2. Navigations are network-first with a cached offline notice as fallback.
 *  3. Fingerprinted build assets are cache-first — they never change content.
 */
const VERSION = 'hdt-v1'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`
const OFFLINE_URL = '/offline.html'

const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const isPrivate = (url) =>
  url.pathname.startsWith('/api/') || url.pathname.startsWith('/_serverFn') || url.searchParams.has('_serverFn')

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isPrivate(url)) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL)
        return (await cache.match(OFFLINE_URL)) ?? new Response('Offline', { status: 503 })
      }),
    )
    return
  }

  const cacheable =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:css|js|woff2?|png|svg|webmanifest)$/.test(url.pathname)

  if (!cacheable) return

  event.respondWith(
    caches.open(ASSETS).then(async (cache) => {
      const hit = await cache.match(request)
      if (hit) return hit
      const response = await fetch(request)
      if (response.ok && response.type === 'basic') cache.put(request, response.clone())
      return response
    }),
  )
})
