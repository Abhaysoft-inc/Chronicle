import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  SARVAM_API_KEY: z.string().default(''),
  SARVAM_BASE_URL: z.string().default('https://api.sarvam.ai'),
  // Outside OneDrive on purpose: sync locks SQLite files.
  DATA_DIR: z.string().default(path.join(os.homedir(), 'chronicle-data')),
  PORT: z.coerce.number().int().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000'),
  API_TOKEN: z.string().default(''),
  DOCAI_RPM: z.coerce.number().positive().default(10),
  CHAT_RPM: z.coerce.number().positive().default(30),
  DOCAI_POLL_SECONDS: z.coerce.number().nonnegative().default(10),
  CHAT_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
  CHAT_MODEL: z.string().default('sarvam-105b'),
  CHAT_JSON_MODE: z.enum(['json_object', 'json_schema']).default('json_object'),
  CACHE_ONLY: bool,
  /** How long a sign-in lasts. Active use extends it. */
  SESSION_DAYS: z.coerce.number().positive().default(14),
  /** Set to false to stop new accounts being created (e.g. after your team has signed up). */
  ALLOW_SIGNUP: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${msg}`);
  }
  return parsed.data;
}

export function loadDotEnv(file = '.env'): void {
  try {
    process.loadEnvFile(file);
  } catch {
    // no .env file: rely on the real environment
  }
}
