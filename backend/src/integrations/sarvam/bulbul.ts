import type { Config } from '../../config/index.ts';
import type { Cache } from './cache.ts';
import { hashOf } from './cache.ts';
import { failIfNotOk, RateLimiter, withRetry } from './http.ts';

export interface BulbulClient {
  synthesize(text: string, targetLanguageCode?: string, speaker?: string): Promise<{ audioBase64: string }>;
}

export function makeBulbul(
  cfg: Pick<Config, 'SARVAM_API_KEY' | 'SARVAM_BASE_URL' | 'CACHE_ONLY'>,
  cache: Cache,
  fetchImpl: typeof fetch = fetch,
): BulbulClient {
  const limiter = new RateLimiter(30);

  return {
    async synthesize(text: string, targetLanguageCode = 'hi-IN', speaker = 'meera'): Promise<{ audioBase64: string }> {
      const trimmed = text.slice(0, 1000);
      const key = hashOf('bulbul', targetLanguageCode, speaker, trimmed);

      return cache.through('bulbul:tts', key, async () => {
        if (!cfg.SARVAM_API_KEY || cfg.CACHE_ONLY) {
          // Minimal mock WAV header base64 for preview / offline demo
          return {
            audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
          };
        }

        await limiter.wait();
        const res = await withRetry(async () =>
          fetchImpl(`${cfg.SARVAM_BASE_URL}/text-to-speech`, {
            method: 'POST',
            headers: {
              'api-subscription-key': cfg.SARVAM_API_KEY,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              inputs: [trimmed],
              target_language_code: targetLanguageCode,
              speaker,
              model: 'bulbul:v2',
            }),
          }),
        );

        await failIfNotOk(res, 'Bulbul text-to-speech');
        const json = (await res.json()) as { audios?: string[] };
        const audio = json.audios?.[0] ?? '';
        return { audioBase64: audio };
      });
    },
  };
}
