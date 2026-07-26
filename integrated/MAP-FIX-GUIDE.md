# Fixing the "Visit Our Works" Map

## Why it was blocked

The contact page used a Google Maps iframe with `output=embed`. Google has been
**hard-blocking** that unofficial embed method — when it's blocked the browser
shows either "This content is blocked" or a broken-image icon. It is **not** a
bug in your website, server, or a missing password — Google simply refuses to
render that URL.

I tried two versions of that method; your browser blocks both. So I've replaced
it with a solution that **never appears broken** and upgrades to a real live map
in one step.

---

## What the page shows now (already applied)

A clean, branded map panel — your company name, full address, a map-pin icon,
and an "Open in Google Maps →" button — on a subtle grid background that reads
as a map. Clicking anywhere on it opens your exact location in Google Maps in a
new tab (using your verified business listing).

**This always works. It can never show a broken image.** Your visitors get your
location and one-tap directions immediately.

---

## To show a REAL interactive (draggable, zoomable) map — 10 min, free

The panel automatically becomes a live embedded map the moment you add a free
Google API key. No code editing beyond pasting the key in one place.

### Step 1 — Get a free key

1. Go to https://console.cloud.google.com/
2. Create a project (any name).
3. **APIs & Services → Library** → search **"Maps Embed API"** → **Enable**.
4. **APIs & Services → Credentials → Create Credentials → API key** → copy it
   (looks like `AIzaSy...`).

### Step 2 — Lock the key to your site (free, do this)

1. Edit the key → **Application restrictions → Websites** → add:
   ```
   energytechcranes.com/*
   www.energytechcranes.com/*
   ```
2. **API restrictions → Restrict key → Maps Embed API** → Save.

### Step 3 — Paste the key (one line)

Open `pages/contact.html`, find this line near the bottom:

```js
var ETC_MAPS_KEY = ""; // <-- paste your Maps Embed API key here to go live
```

Put your key between the quotes:

```js
var ETC_MAPS_KEY = "AIzaSy...your key...";
```

Save, redeploy, hard-refresh. The panel is now a live interactive map pinned to
your works. If the key is ever wrong or removed, the page quietly falls back to
the clickable panel — it never breaks.

> The **Maps Embed API is free with unlimited loads** — Google does not charge
> for it. You won't get a bill.

---

## Even simpler — send me Google's own embed code

1. Google Maps → search **Energy Tech Crane Pvt Ltd** → your business.
2. **Share → Embed a map → Copy HTML.**
3. Send me that HTML — I'll wire it in directly. Google's copied code is
   pre-authorised and never blocked.

Either route ends with a permanent, always-visible map. The key method gives a
live draggable map; the panel (already live) gives a reliable clickable one.

