# Senshi.live Video Scraper API

An unofficial REST API to scrape anime details, episodes, and stream servers from `senshi.live`. Designed as a Cloudflare Worker using Hono and TypeScript. It automatically resolves NinStream (Server 1), Streamnin (Server 2), and Filemoon (Server 3) links to direct video sources, including a built-in solver for Filemoon's custom Proof-of-Work (PoW) captcha protection.

## Features

- **Trending & Schedule Endpoints:** Query currently trending anime and release calendars directly.
- **Anime Details & Episodes:** Retrieve full metadata, synopsis, studio, and episode lists by anime slug or ID.
- **Server Scraper & Resolver:**
  - **NinStream:** Provides direct HLS `.m3u8` links.
  - **Streamnin:** Provides direct `.mp4` video downloads.
  - **Filemoon:** Automatically runs client-side Proof-of-Work (PoW) challenge solving and decrypts GCM payload on the Worker to fetch final CDN stream URLs.
- **HLS Stream Proxy:** Bypasses `403 Forbidden` referrer checks on players (like standard browsers or video players) by forwarding chunked streams with whitelisted headers.

---

## Getting Started

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the wrangler dev server:
   ```bash
   npm run dev
   ```

3. Test endpoints:
   - Root API Info: `http://localhost:8787/`
   - Anime details: `http://localhost:8787/api/anime/d096i`

### Deploying to Cloudflare

Deploy the API directly to Cloudflare Workers with Wrangler:
```bash
npm run deploy
```

---

## API Endpoints Reference

### 1. Root API Info
Returns documentation and list of available endpoints.
* **Route:** `GET /`
* **Response Sample:**
  ```json
  {
    "name": "Senshi.live Video Scraper API",
    "version": "1.0.0",
    "description": "An unofficial API to scrape and resolve anime streams from senshi.live.",
    "endpoints": {
      "trending": "/api/trending",
      "schedule": "/api/schedule",
      "anime_details": "/api/anime/:slugOrId",
      "episodes": "/api/anime/:animeId/episodes",
      "streams": "/api/anime/:animeId/episodes/:episodeNumber/streams",
      "stream_proxy": "/api/proxy?url=<base64_url>"
    }
  }
  ```

### 2. Trending Anime
Fetch trending sliders on the homepage.
* **Route:** `GET /api/trending`
* **Response Sample:**
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": 16,
        "anime_id": 57658,
        "image_url": "/sliderpics/8239e9bb-4a5d-4a07-95b8-0217dfd77217.jpg",
        "anime": {
          "id": 57658,
          "public_id": "d096i",
          "title": "Jujutsu Kaisen: Shimetsu Kaiyuu - Zenpen",
          "anime_picture": "/posters/57658.webp"
        }
      }
    ]
  }
  ```

### 3. Release Schedule
Fetch release calendar for upcoming anime episodes.
* **Route:** `GET /api/schedule`

### 4. Anime Details
Fetch metadata for a single anime by its slug (public_id) or ID.
* **Route:** `GET /api/anime/:slugOrId`
* **Parameters:**
  - `slugOrId`: e.g. `d096i` or `57658`
* **Response Sample:**
  ```json
  {
    "status": "success",
    "data": {
      "id": 57658,
      "public_id": "d096i",
      "title": "Jujutsu Kaisen: Shimetsu Kaiyuu - Zenpen",
      "title_english": "Jujutsu Kaisen: The Culling Game Part 1",
      "anime_picture": "/posters/57658.webp",
      "studios": "MAPPA",
      "score": 8.63
    }
  }
  ```

### 5. Episode List
Fetch all episode listings for an anime.
* **Route:** `GET /api/anime/:animeId/episodes`
* **Parameters:**
  - `animeId`: Numeric MAL ID (e.g. `57658`)
* **Response Sample:**
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": 26896,
        "ep_id": 1,
        "mal_id": 57658,
        "ep_title": "Execution",
        "ep_filler": false,
        "created_at": "2026-01-08T17:52:58.651Z"
      }
    ]
  }
  ```

### 6. Resolve Episode Streams
Resolve all direct video streams for an episode.
* **Route:** `GET /api/anime/:animeId/episodes/:episodeNumber/streams`
* **Parameters:**
  - `animeId`: Numeric MAL ID (e.g. `57658`)
  - `episodeNumber`: Episode sequence ID (e.g. `1`)
* **Response Sample:**
  ```json
  {
    "status": "success",
    "data": [
      {
        "server": "ninstream",
        "status": "Dub",
        "originalUrl": "https://ninstream.com/titkSXXqjF1...",
        "resolvedStreamUrl": "https://ninstream.com/titkSXXqjF1...",
        "proxyUrl": "https://<your-worker>.workers.dev/api/proxy?url=aHR0cHM6Ly9uaW5zd...",
        "downloadUrl": null
      },
      {
        "server": "filemoon",
        "status": "HardSub",
        "originalUrl": "https://bysesayeveum.com/e/lo78pg7x6tmk/",
        "resolvedStreamUrl": "https://edge1-madrid-sprintcdn.r66nv9ed.com/hls2/.../master.m3u8?t=...",
        "downloadUrl": "https://bzzhr.to/f6wxr7rjt92e"
      }
    ]
  }
  ```

### 7. Stream Proxy
Fetches and rewrites playlist streams to run through the worker, bypassing the whitelisted `Referer` restrictions of NinStream/Streamnin.
* **Route:** `GET /api/proxy`
* **Query Params:**
  - `url`: Base64Url encoded target URL.
* **Behavior:**
  - Parses HLS `.m3u8` contents and replaces relative paths/segments with proxied links.
  - Proxies Range requests and chunked TS bytes directly with proper cors headers.

---

## Technical Architecture Notes

### Filemoon (Server 3) Security Bypass
Filemoon employs nested iframes to prevent scraping. The scraper resolves this via:
1. **Nesting Simulation:** Emulates the exact header chain: `senshi.live` -> `bysesayeveum.com` -> `nzn3.org` (mirror embed).
2. **Proof-of-Work Solving:** Solves Filemoon's custom Blake-based PoW hash algorithm.
3. **AES-GCM Decryption:** Reconstructs the 256-bit AES GCM key by selecting key parts according to a mathematical formula based on the version tag (e.g., version `"19"`), then decrypts the GCM payload on the Worker via `crypto.subtle` to yield final CDN links.
