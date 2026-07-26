// routes/reviews.js
//
// Public endpoint that returns your Google Business reviews as JSON for the
// website to display. The Google Places API key stays on the SERVER (env var
// GOOGLE_PLACES_KEY) and is never exposed to the browser.
//
// Setup (see GOOGLE-REVIEWS-SETUP.md):
//   1. Get a free Google Places API key, enable "Places API".
//   2. Set two env vars on the server:
//        GOOGLE_PLACES_KEY = your key
//        GOOGLE_PLACE_ID   = ChIJXbmRIio_-gkRZJq3hEWcyhQ   (ETC's listing)
//   3. Redeploy. The homepage then shows live Google reviews automatically.
//
// If the key is not set, this returns { configured:false } and the website
// quietly keeps showing the built-in testimonials — nothing breaks.

const https = require('https');

// Cache reviews in memory for 6 hours so we don't hit Google on every visit
// (Google rate-limits, and reviews change slowly).
let cache = { at: 0, data: null };
const CACHE_MS = 6 * 60 * 60 * 1000;

function fetchGoogle(placeId, key) {
  return new Promise((resolve, reject) => {
    const url =
      'https://maps.googleapis.com/maps/api/place/details/json' +
      '?place_id=' + encodeURIComponent(placeId) +
      '&fields=rating,user_ratings_total,reviews,name' +
      '&reviews_sort=newest' +
      '&key=' + encodeURIComponent(key);
    https.get(url, (r) => {
      let body = '';
      r.on('data', (c) => (body += c));
      r.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function register(router) {
  router.get('/api/reviews', async (req, res) => {
    const key = process.env.GOOGLE_PLACES_KEY || '';
    const placeId = process.env.GOOGLE_PLACE_ID || '';
    if (!key || !placeId) {
      res.json({ configured: false });
      return;
    }
    // Serve from cache when fresh.
    if (cache.data && Date.now() - cache.at < CACHE_MS) {
      res.json(cache.data);
      return;
    }
    try {
      const g = await fetchGoogle(placeId, key);
      if (g.status !== 'OK' || !g.result) {
        res.json({ configured: true, ok: false, error: g.status || 'no_result' });
        return;
      }
      const out = {
        configured: true,
        ok: true,
        name: g.result.name,
        rating: g.result.rating,
        total: g.result.user_ratings_total,
        reviews: (g.result.reviews || []).slice(0, 6).map((rv) => ({
          author: rv.author_name,
          rating: rv.rating,
          text: rv.text,
          when: rv.relative_time_description,
          photo: rv.profile_photo_url || '',
        })),
      };
      cache = { at: Date.now(), data: out };
      res.json(out);
    } catch (e) {
      res.json({ configured: true, ok: false, error: 'fetch_failed' });
    }
  });
}

module.exports = { register };
