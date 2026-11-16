// App-shell service worker. Never cache authenticated HTML, API responses,
// payment data, sessions, or Supabase traffic.
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting())});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim())});
// All requests use normal network behavior. Offline support is not advertised.
