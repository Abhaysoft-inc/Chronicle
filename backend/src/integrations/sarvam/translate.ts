import type { Config } from '../../config/index.ts';
import type { Cache } from './cache.ts';
import { hashOf } from './cache.ts';
import { failIfNotOk, RateLimiter, withRetry } from './http.ts';

export interface TranslateClient {
  translate(text: string, sourceLang: string, targetLang: string, mode?: 'formal' | 'code-mixed'): Promise<string>;
}

export function makeTranslate(
  cfg: Pick<Config, 'SARVAM_API_KEY' | 'SARVAM_BASE_URL' | 'CACHE_ONLY'>,
  cache: Cache,
  fetchImpl: typeof fetch = fetch,
): TranslateClient {
  const limiter = new RateLimiter(30);

  return {
    async translate(text: string, sourceLang: string, targetLang: string, mode = 'formal'): Promise<string> {
      if (!text.trim() || sourceLang === targetLang) return text;
      const key = hashOf('translate', sourceLang, targetLang, mode, text);

      return cache.through('sarvam:translate', key, async () => {
        if (!cfg.SARVAM_API_KEY || cfg.CACHE_ONLY) {
          return text;
        }

        await limiter.wait();
        const res = await withRetry(async () =>
          fetchImpl(`${cfg.SARVAM_BASE_URL}/translate`, {
            method: 'POST',
            headers: {
              'api-subscription-key': cfg.SARVAM_API_KEY,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              input: text,
              source_language_code: sourceLang,
              target_language_code: targetLang,
              mode,
            }),
          }),
        );

        await failIfNotOk(res, 'Sarvam Translate');
        const json = (await res.json()) as { translated_text?: string };
        return json.translated_text ?? text;
      });
    },
  };
}
