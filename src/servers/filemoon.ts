// Proof-of-work and AES-GCM Decryption for Filemoon / Byse Server

// Hashing Helpers from Filemoon PoW Chunk
const be = 512;
const lt = be - 1;
const dr = 2;
const lr = 2654435761;
const hr = 2246822519;

const re = (t: number, e: number) => (t << e | t >>> 32 - e) >>> 0;
const ht = (t: number, e: number) => Math.imul(t, e) >>> 0;

function ye(t: Uint32Array) {
  t[0] = t[0] + t[1] >>> 0;
  t[3] = re(t[3] ^ t[0], 16);
  t[2] = t[2] + t[3] >>> 0;
  t[1] = re(t[1] ^ t[2], 12);
  t[0] = t[0] + t[1] >>> 0;
  t[3] = re(t[3] ^ t[0], 8);
  t[2] = t[2] + t[3] >>> 0;
  t[1] = re(t[1] ^ t[2], 7);
}

function gr(t: Uint8Array): Uint32Array {
  const e = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762]);
  for (let i = 0; i < t.length; i++) {
    e[0] = e[0] + t[i] >>> 0;
    e[0] = re(e[0], 7);
    ye(e);
  }
  for (let i = 0; i < 8; i++) {
    ye(e);
  }
  const r = new Uint32Array(be);
  for (let i = 0; i < be; i++) {
    ye(e);
    r[i] = (e[0] ^ e[2]) >>> 0;
  }
  for (let i = 0; i < dr; i++) {
    for (let s = 0; s < be; s++) {
      const a = r[s] & lt;
      let c = r[s] + r[a] >>> 0;
      c = re(c, 13);
      c = (c ^ ht(r[(s + 1) & lt], lr)) >>> 0;
      r[s] = c;
      e[0] = (e[0] ^ c) >>> 0;
      ye(e);
    }
  }
  const n = new Uint32Array(8);
  const o = be / 8;
  for (let i = 0; i < 8; i++) {
    ye(e);
    let s = e[0];
    const a = i * o;
    for (let c = 0; c < o; c++) {
      const d = r[a + c];
      s = s + d >>> 0;
      s = re(s, 5);
      s = (s ^ ht(d, hr)) >>> 0;
    }
    n[i] = (s ^ e[2]) >>> 0;
  }
  return n;
}

function wr(t: Uint32Array): number {
  let e = 0;
  for (let r = 0; r < t.length; r++) {
    const n = t[r];
    if (n === 0) {
      e += 32;
      continue;
    }
    return e + Math.clz32(n);
  }
  return e;
}

function yr(t: string): Uint8Array {
  const e = new Uint8Array(t.length);
  for (let r = 0; r < t.length; r++) {
    e[r] = t.charCodeAt(r) & 255;
  }
  return e;
}

export function solvePoW(nonce: string, difficulty: number, timeoutMs = 20000): string | null {
  if (difficulty <= 0) return "0";
  const prefix = nonce + ":";
  const startTime = Date.now();
  let val = 0;
  const chunk = 1024;
  while (true) {
    for (let c = 0; c < chunk; c++) {
      const hash = gr(yr(prefix + val));
      if (wr(hash) >= difficulty) {
        return String(val);
      }
      val++;
    }
    if (Date.now() - startTime > timeoutMs) {
      return null;
    }
  }
}

// Decryption Utilities
function decodeBase64Url(e: string): Uint8Array {
  const r = e.replace(/-/g, "+").replace(/_/g, "/");
  const t = r.length % 4 === 0 ? 0 : 4 - (r.length % 4);
  const n = r + "=".repeat(t);
  const binary = atob(n);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function xi(): Record<string, [number, number]> {
  const e: Record<string, [number, number]> = {};
  for (let n = 1; n <= 20; n += 1) {
    const i = n ^ 0;
    const a = (31 - n) ^ 0;
    e[String(n)] = [i, a];
  }
  return e;
}

function Si(version: string, length: number): [number, number] | [] {
  const t = typeof version === "string" ? version.trim() : "";
  const i = xi()[t];
  if (!i) return [];
  const [a, s] = i;
  return a < 1 || s < 1 || a > length || s > length ? [] : [a, s];
}

function selectKeyParts(playback: { key_parts: string[]; version: string }): string[] {
  const r = Array.isArray(playback.key_parts) ? playback.key_parts : [];
  const t = Si(playback.version, r.length);
  if (t.length === 0) return r;
  const n = t
    .map(i => Number(i))
    .filter(i => Number.isInteger(i) && i >= 1 && i <= r.length)
    .map(i => r[i - 1])
    .filter(i => typeof i === "string" && i.length > 0);
  return n.length > 0 ? n : r;
}

function mergeKeyParts(parts: string[]): Uint8Array {
  const r = parts.filter(a => typeof a === "string" && a.length > 0).map(decodeBase64Url);
  const t = r.reduce((a, s) => a + s.length, 0);
  const n = new Uint8Array(t);
  let i = 0;
  for (const a of r) {
    n.set(a, i);
    i += a.length;
  }
  return n;
}

export async function decryptPlaybackPayload(playback: { iv: string; payload: string; key_parts: string[]; version: string }): Promise<any> {
  const selectedParts = selectKeyParts(playback);
  const mergedKey = mergeKeyParts(selectedParts);
  const iv = decodeBase64Url(playback.iv);
  const ciphertextAndTag = decodeBase64Url(playback.payload);
  
  // Decrypt using Web Crypto AES-GCM
  const importedKey = await crypto.subtle.importKey(
    "raw",
    mergedKey,
    "AES-GCM",
    false,
    ["decrypt"]
  );
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    importedKey,
    ciphertextAndTag
  );
  
  const decoded = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(decoded);
}

// Scrapes and resolves Filemoon video stream URLs
export async function resolveFilemoon(filemoonEmbedUrl: string): Promise<any> {
  // Extract file ID/code from URL e.g. https://bysesayeveum.com/e/lo78pg7x6tmk/ -> lo78pg7x6tmk
  const urlObj = new URL(filemoonEmbedUrl);
  const code = urlObj.pathname.split('/').filter(Boolean).pop();
  if (!code) {
    throw new Error("Invalid Filemoon code in URL");
  }

  // 1. Fetch details to get embed_frame_url (nzn3.org mirror)
  const detailHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://senshi.live/',
    'Origin': 'https://senshi.live',
    'X-Embed-Referer': 'https://senshi.live/',
    'X-Embed-Origin': 'senshi.live',
    'X-Embed-Parent': 'https://senshi.live/'
  };

  const detailsRes = await fetch(`https://bysesayeveum.com/api/videos/${code}/embed/details`, {
    headers: detailHeaders
  });

  if (!detailsRes.ok) {
    throw new Error(`Failed to fetch Filemoon details: ${detailsRes.status}`);
  }

  const details: any = await detailsRes.json();
  const embedFrameUrl = details.embed_frame_url;
  if (!embedFrameUrl) {
    throw new Error("Mirror embed_frame_url not found in Filemoon details");
  }

  // Extract mirror host (e.g. nzn3.org)
  const mirrorUrlObj = new URL(embedFrameUrl);
  const mirrorHost = mirrorUrlObj.hostname;

  // Header helpers for nested requests on the mirror
  const mirrorHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': `https://bysesayeveum.com/e/${code}/`,
    'Origin': 'https://bysesayeveum.com',
    'X-Embed-Referer': 'https://senshi.live/',
    'X-Embed-Origin': 'senshi.live',
    'X-Embed-Parent': `https://bysesayeveum.com/e/${code}/`,
    'Content-Type': 'application/json'
  };

  // 2. Fetch challenge (POST)
  const captchaUrl = `https://${mirrorHost}/api/videos/${code}/embed/captcha`;
  const captchaRes = await fetch(captchaUrl, {
    method: 'POST',
    headers: mirrorHeaders,
    body: JSON.stringify({
      fingerprint: { token: "dummy", viewer_id: "dummy", device_id: "dummy", confidence: 1 }
    })
  });

  if (!captchaRes.ok) {
    throw new Error(`Failed to fetch captcha challenge: ${captchaRes.status}`);
  }

  const captchaData: any = await captchaRes.json();
  if (captchaData.error === 'embedding from this domain is not allowed') {
    throw new Error(`Embedding domain verification failed on mirror ${mirrorHost}`);
  }

  const nonce = captchaData.pow_nonce;
  const diff = captchaData.pow_difficulty;
  const powToken = captchaData.pow_token;

  if (!nonce) {
    throw new Error("Failed to retrieve Proof-of-Work challenge");
  }

  // 3. Solve Proof of Work
  const solution = solvePoW(nonce, diff);
  if (!solution) {
    throw new Error("Failed to solve Proof of Work challenge");
  }

  // 4. Verify PoW solution
  const verifyUrl = `https://${mirrorHost}/api/videos/${code}/embed/captcha/verify`;
  const verifyRes = await fetch(verifyUrl, {
    method: 'POST',
    headers: mirrorHeaders,
    body: JSON.stringify({
      pow_token: powToken,
      solution: solution,
      fingerprint: { token: "dummy", viewer_id: "dummy", device_id: "dummy", confidence: 1 }
    })
  });

  if (!verifyRes.ok) {
    throw new Error(`Failed to verify PoW solution: ${verifyRes.status}`);
  }

  const verifyData: any = await verifyRes.json();
  if (verifyData.status !== 'ok' || !verifyData.token) {
    throw new Error("PoW solution verification failed");
  }

  const bypassToken = verifyData.token;

  // 5. Get playback GCM payload
  const playbackUrl = `https://${mirrorHost}/api/videos/${code}/embed/playback`;
  const playbackRes = await fetch(playbackUrl, {
    method: 'POST',
    headers: {
      ...mirrorHeaders,
      'X-Captcha-Token': bypassToken
    },
    body: JSON.stringify({
      fingerprint: { token: "dummy", viewer_id: "dummy", device_id: "dummy", confidence: 1 }
    })
  });

  if (!playbackRes.ok) {
    throw new Error(`Failed to fetch playback configuration: ${playbackRes.status}`);
  }

  const playbackData: any = await playbackRes.json();
  if (!playbackData.playback) {
    throw new Error("Playback payload not found in response");
  }

  // 6. Decrypt payload and return sources
  const decrypted = await decryptPlaybackPayload(playbackData.playback);
  return decrypted;
}
