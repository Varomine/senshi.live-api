import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  getTrending,
  getSchedule,
  getAnimeDetails,
  getEpisodes,
  getEpisodeStreams
} from './scraper';

const app = new Hono();

// Enable CORS for all endpoints
app.use('*', cors());

// Base64Url Helpers
function decodeBase64Url(str: string): string {
  // Add padding if missing
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

function encodeBase64Url(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Rewrite relative and absolute URLs inside an M3U8 file to go through the proxy
function rewriteM3U8(content: string, playlistUrl: string, origin: string): string {
  const lines = content.split('\n');
  const parentUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);

  const resolvedLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // 1. Keep directives as-is, but check for KEY URIs
    if (trimmed.startsWith('#')) {
      if (trimmed.startsWith('#EXT-X-KEY:')) {
        // Rewrite Key URI if present
        const keyMatch = trimmed.match(/URI="([^"]+)"/);
        if (keyMatch) {
          const relativeUri = keyMatch[1];
          const absoluteUri = new URL(relativeUri, parentUrl).toString();
          const proxyUri = `${origin}/api/proxy?url=${encodeBase64Url(absoluteUri)}`;
          return trimmed.replace(`URI="${relativeUri}"`, `URI="${proxyUri}"`);
        }
      }
      return line;
    }

    // 2. Rewrite playlist and segment URLs
    try {
      const absoluteUrl = new URL(trimmed, parentUrl).toString();
      return `${origin}/api/proxy?url=${encodeBase64Url(absoluteUrl)}`;
    } catch {
      return line;
    }
  });

  return resolvedLines.join('\n');
}

// Welcome / Metadata Route
app.get('/', (c) => {
  return c.json({
    name: 'Senshi.live Video Scraper API',
    version: '1.0.0',
    description: 'An unofficial API to scrape and resolve anime streams from senshi.live.',
    documentation: 'See README.md for endpoint usage.',
    endpoints: {
      trending: '/api/trending',
      schedule: '/api/schedule',
      anime_details: '/api/anime/:slugOrId',
      episodes: '/api/anime/:animeId/episodes',
      streams: '/api/anime/:animeId/episodes/:episodeNumber/streams',
      stream_proxy: '/api/proxy?url=<base64_url>'
    }
  });
});

// Trending / Sliders Route
app.get('/api/trending', async (c) => {
  try {
    const data = await getTrending();
    return c.json({ status: 'success', data });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

// Release Schedule Route
app.get('/api/schedule', async (c) => {
  try {
    const data = await getSchedule();
    return c.json({ status: 'success', data });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

// Anime Details Route
app.get('/api/anime/:slugOrId', async (c) => {
  const slugOrId = c.req.param('slugOrId');
  try {
    const data = await getAnimeDetails(slugOrId);
    return c.json({ status: 'success', data });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

// Episode List Route
app.get('/api/anime/:animeId/episodes', async (c) => {
  const animeId = parseInt(c.req.param('animeId'), 10);
  if (isNaN(animeId)) {
    return c.json({ status: 'error', message: 'Invalid animeId' }, 400);
  }
  try {
    const data = await getEpisodes(animeId);
    return c.json({ status: 'success', data });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

// Resolve Stream URLs Route
app.get('/api/anime/:animeId/episodes/:episodeNumber/streams', async (c) => {
  const animeId = parseInt(c.req.param('animeId'), 10);
  const episodeNumber = parseInt(c.req.param('episodeNumber'), 10);
  const origin = new URL(c.req.url).origin;

  if (isNaN(animeId) || isNaN(episodeNumber)) {
    return c.json({ status: 'error', message: 'Invalid parameters' }, 400);
  }

  try {
    const data = await getEpisodeStreams(animeId, episodeNumber, origin);
    return c.json({ status: 'success', data });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

// General Video Stream Proxy Route
app.get('/api/proxy', async (c) => {
  const targetEncoded = c.req.query('url');
  if (!targetEncoded) {
    return c.text('Missing url parameter', 400);
  }

  let targetUrl: string;
  try {
    targetUrl = decodeBase64Url(targetEncoded);
  } catch {
    return c.text('Invalid base64url encoded URL', 400);
  }

  const originUrl = new URL(c.req.url).origin;

  try {
    // Forward headers like Range, User-Agent, Accept for range requests and streaming compatibility
    const headers: Record<string, string> = {
      'User-Agent': c.req.header('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://senshi.live/',
      'Origin': 'https://senshi.live'
    };

    const rangeHeader = c.req.header('Range');
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    const response = await fetch(targetUrl, { headers });

    const contentType = response.headers.get('content-type') || '';

    // If it's a playlist (.m3u8 / mpegurl), fetch and rewrite its links
    if (
      contentType.includes('mpegurl') ||
      contentType.includes('m3u8') ||
      targetUrl.endsWith('.m3u8')
    ) {
      const text = await response.text();
      const rewritten = rewriteM3U8(text, targetUrl, originUrl);
      return c.text(rewritten, 200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      });
    }

    // Otherwise, stream the binary content (MP4 files or TS segments)
    const body = response.body;
    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
    };

    // Forward important response headers
    const copyHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'content-disposition',
      'cache-control'
    ];

    copyHeaders.forEach(h => {
      const val = response.headers.get(h);
      if (val) responseHeaders[h] = val;
    });

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });

  } catch (err: any) {
    return c.text(`Proxy request failed: ${err.message}`, 500);
  }
});

export default app;
