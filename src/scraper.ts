import { resolveNinStream, NinStreamResult } from './servers/ninstream';
import { resolveStreamnin, StreamninResult } from './servers/streamnin';
import { resolveFilemoon } from './servers/filemoon';

const BASE_URL = 'https://senshi.live';

// Standard Fetch Helper
async function fetchJSON<T>(url: string, headers = {}): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...headers
    }
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.statusText} (${res.status}) for ${url}`);
  }
  return res.json() as Promise<T>;
}

export interface AnimeDetails {
  id: number;
  public_id: string;
  title: string;
  title_english?: string;
  synonyms?: string;
  type?: string;
  ani_status?: string;
  airing_date?: string;
  ani_description?: string;
  genres?: string;
  studios?: string;
  anime_picture: string;
}

export interface Episode {
  id: number;
  ep_id: number;
  mal_id: number;
  ep_title?: string;
  ep_filler: boolean;
  ep_recap: boolean;
  intro_start?: number | null;
  intro_end?: number | null;
  created_at: string;
}

export interface EmbedRaw {
  url: string | null;
  server2: string | null;
  serverFM: string | null;
  download: string | null;
  status: string; // e.g. "Dub", "HardSub"
}

export interface ResolvedStreams {
  server: string; // "ninstream" | "streamnin" | "filemoon"
  status: string; // "Dub" | "HardSub"
  originalUrl: string;
  resolvedStreamUrl?: string; // Resolved .m3u8 / .mp4 URL
  proxyUrl?: string; // Proxy URL if applicable
  filemoonPlaybackData?: any; // Playback GCM decrypted info (for filemoon)
  downloadUrl?: string | null;
  error?: string;
}

// Scrape trending/slider anime list
export async function getTrending(): Promise<any> {
  return fetchJSON<any>(`${BASE_URL}/sliders`);
}

// Scrape release schedule
export async function getSchedule(): Promise<any> {
  return fetchJSON<any>(`${BASE_URL}/schedule`);
}

// Scrape anime metadata using slug/public_id
export async function getAnimeDetails(slugOrId: string): Promise<AnimeDetails> {
  return fetchJSON<AnimeDetails>(`${BASE_URL}/anime/${slugOrId}`);
}

// Scrape episodes list for a specific anime ID
export async function getEpisodes(animeId: number): Promise<Episode[]> {
  return fetchJSON<Episode[]>(`${BASE_URL}/episodes/${animeId}`);
}

// Scrape and resolve all streams for a specific episode
export async function getEpisodeStreams(
  animeId: number,
  episodeNumber: number,
  origin: string
): Promise<ResolvedStreams[]> {
  const embeds = await fetchJSON<EmbedRaw[]>(`${BASE_URL}/episode-embeds/${animeId}/${episodeNumber}`);
  const results: ResolvedStreams[] = [];

  for (const embed of embeds) {
    // 1. Process NinStream (Server 1)
    if (embed.url) {
      try {
        const res = resolveNinStream(embed.url, origin);
        results.push({
          server: 'ninstream',
          status: embed.status,
          originalUrl: embed.url,
          resolvedStreamUrl: res.url,
          proxyUrl: res.proxyUrl,
          downloadUrl: embed.download
        });
      } catch (err: any) {
        results.push({
          server: 'ninstream',
          status: embed.status,
          originalUrl: embed.url,
          error: err.message
        });
      }
    }

    // 2. Process Streamnin (Server 2)
    if (embed.server2) {
      try {
        const res = resolveStreamnin(embed.server2, origin);
        results.push({
          server: 'streamnin',
          status: embed.status,
          originalUrl: embed.server2,
          resolvedStreamUrl: res.url,
          proxyUrl: res.proxyUrl,
          downloadUrl: embed.download
        });
      } catch (err: any) {
        results.push({
          server: 'streamnin',
          status: embed.status,
          originalUrl: embed.server2,
          error: err.message
        });
      }
    }

    // 3. Process Filemoon (Server 3)
    if (embed.serverFM) {
      try {
        const decrypted = await resolveFilemoon(embed.serverFM);
        // Extract direct source URL from GCM decrypted data
        const sourceUrl = decrypted.sources?.[0]?.url;
        results.push({
          server: 'filemoon',
          status: embed.status,
          originalUrl: embed.serverFM,
          resolvedStreamUrl: sourceUrl,
          filemoonPlaybackData: decrypted,
          downloadUrl: embed.download
        });
      } catch (err: any) {
        results.push({
          server: 'filemoon',
          status: embed.status,
          originalUrl: embed.serverFM,
          error: err.message
        });
      }
    }
  }

  return results;
}
