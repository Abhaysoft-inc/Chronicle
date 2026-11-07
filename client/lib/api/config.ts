// Where the backend lives. Defaults to the local backend; override with NEXT_PUBLIC_API_URL at
// build time, or per browser from the "Connection" panel (stored in localStorage).
// Browser-only: these read localStorage, so call them from effects and event handlers, not
// while rendering on the server.

const DEFAULT_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const KEY_BASE = 'chronicle.apiBase';
const KEY_TOKEN = 'chronicle.apiToken';

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return ''; // storage blocked (private mode): fall back to defaults
  }
}

export function getApiBase(): string {
  return (read(KEY_BASE) || DEFAULT_BASE).replace(/\/+$/, '');
}

export function getApiToken(): string {
  return read(KEY_TOKEN);
}

export function saveApiSettings(base: string, token: string): void {
  try {
    localStorage.setItem(KEY_BASE, base.trim());
    localStorage.setItem(KEY_TOKEN, token.trim());
  } catch {
    /* nothing to do: settings just will not persist */
  }
}

export const DEFAULT_API_BASE = DEFAULT_BASE;
