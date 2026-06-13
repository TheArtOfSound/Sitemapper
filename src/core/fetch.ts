export interface FetchTextResult {
  url: string;
  status: number;
  ok: boolean;
  text: string;
  finalUrl: string;
}

export async function fetchText(url: string, timeoutMs: number): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Sitemapper/0.1 (+https://github.com/TheArtOfSound/Sitemapper)',
        accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
      }
    });

    return {
      url,
      status: response.status,
      ok: response.ok,
      text: await response.text(),
      finalUrl: response.url
    };
  } finally {
    clearTimeout(timeout);
  }
}
