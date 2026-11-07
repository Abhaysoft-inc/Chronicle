import { getApiBase, getApiToken } from './config';

/** Fired on window when the API says the session is no longer valid. */
export const UNAUTHENTICATED_EVENT = 'chronicle:unauthenticated';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function authHeaders(): Record<string, string> {
  const token = getApiToken();
  return token ? { 'x-api-token': token } : {};
}

async function send(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    // credentials: 'include' sends the httpOnly session cookie to the API (a different port, so a cross-origin request).
    res = await fetch(`${getApiBase()}/api${path}`, { ...init, credentials: 'include', headers: { ...authHeaders(), ...(init.headers as object) } });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network_error', `Cannot reach the API at ${getApiBase()}. Is the backend running?`);
  }
  if (!res.ok) {
    // The backend always answers errors as { error: { code, message, details? } }.
    let body: { error?: { code?: string; message?: string; details?: unknown } } | null = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON */
    }
    // The session ended (expired, or signed out elsewhere): tell the auth layer, which sends the user to sign in.
    if (res.status === 401 && body?.error?.code === 'unauthenticated' && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
    }
    throw new ApiError(res.status, body?.error?.code ?? 'http_error', body?.error?.message ?? `Request failed (HTTP ${res.status})`, body?.error?.details);
  }
  return res;
}

export async function request<T>(
  path: string,
  opts: { method?: string; json?: unknown; form?: FormData; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form; // the browser sets the multipart boundary itself
  }
  const res = await send(path, { method: opts.method ?? 'GET', headers, body, signal: opts.signal });
  return (await res.json()) as T;
}

/** For files (the original PDF/image). Goes through fetch so the auth header can be sent. */
export async function requestBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  return (await send(path, { signal })).blob();
}

/** URL for an EventSource. The browser cannot set headers on it, so the token goes in the query. */
export function streamUrl(path: string): string {
  const token = getApiToken();
  return `${getApiBase()}/api${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

export async function fetchHealth(): Promise<{ ok: boolean; sarvamKeyConfigured: boolean; cacheOnly: boolean }> {
  const res = await fetch(`${getApiBase()}/health`);
  return res.json();
}
