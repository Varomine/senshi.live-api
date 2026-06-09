export interface StreamninResult {
  url: string;
  proxyUrl: string;
}

export function resolveStreamnin(url: string, origin: string): StreamninResult {
  const base64Url = btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const proxyUrl = `${origin}/api/proxy?url=${base64Url}`;
  return {
    url,
    proxyUrl
  };
}
