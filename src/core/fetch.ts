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

export async function fetchHeadOrGetStatus(url: string, timeoutMs: number): Promise<{ status?: number; finalUrl?: string; ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'Sitemapper/0.1 (+https://github.com/TheArtOfSound/Sitemapper)',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
      }
    });

    return {
      status: response.status,
      finalUrl: response.url,
      ok: response.ok
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}
