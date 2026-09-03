// Deliberately minimal: this app depends on a live network connection
// (payments, live status polling), so we do NOT cache API responses.
// This service worker exists only so iOS/Android will treat the site as
// installable to the home screen.
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => self.clients.claim());
self.addEventListener('fetch', () => {}); // no-op: always go to network
