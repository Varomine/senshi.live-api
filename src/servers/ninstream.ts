export interface NinStreamResult {
  url: string;
  proxyUrl: string;
}

export function resolveNinStream(url: string, origin: string): NinStreamResult {
  // NinStream is a direct playlist url that requires Referer header.
  // We return the raw url and also provide a proxy endpoint url.
  const base64Url = btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const proxyUrl = `${origin}/api/proxy?url=${base64Url}`;
  return {
    url,
    proxyUrl
  };
}
