import { z } from 'zod';
import type { Config } from '../../config/index.ts';
import type { Cache } from './cache.ts';
import { hashOf } from './cache.ts';
import { failIfNotOk, RateLimiter, SarvamError, withRetry } from './http.ts';

// Sarvam chat: POST /v1/chat/completions, header api-subscription-key.
// - Reasoning tokens count toward max_tokens, so we turn reasoning off for extraction
//   (reasoning_effort: null) and treat finish_reason "length" as "split the input".
// - response_format: json_object works everywhere. json_schema is not confirmed for
//   sarvam-105b, so it is opt-in via CHAT_JSON_MODE and tested in Phase 0.

export class TruncatedError extends Error {
  constructor() {
    super('LLM output was cut off (finish_reason=length). Use a smaller input.');
    this.name = 'TruncatedError';
  }
}

export class InvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOutputError';
  }
}

export interface ChatJsonRequest<S extends z.ZodType> {
  /** Stable name, used in the cache key and logs. */
  task: string;
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
}

export interface ChatClient {
  json<S extends z.ZodType>(req: ChatJsonRequest<S>): Promise<z.infer<S>>;
}

interface ChatResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
}

/** Strip ```json fences and surrounding prose, then parse. */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1]!.trim() : t;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new InvalidOutputError('Response contained no JSON object');
  }
}

export function makeChat(
  cfg: Pick<Config, 'SARVAM_API_KEY' | 'SARVAM_BASE_URL' | 'CHAT_RPM' | 'CHAT_MAX_TOKENS' | 'CHAT_MODEL' | 'CHAT_JSON_MODE'>,
  cache: Cache,
  fetchImpl: typeof fetch = fetch,
): ChatClient {
  const limiter = new RateLimiter(cfg.CHAT_RPM);

  async function call(messages: { role: string; content: string }[], maxTokens: number, schema: z.ZodType): Promise<string> {
    const body: Record<string, unknown> = {
      model: cfg.CHAT_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.1,
      reasoning_effort: null,
    };
    body.response_format =
      cfg.CHAT_JSON_MODE === 'json_schema'
        ? { type: 'json_schema', json_schema: { name: 'result', strict: true, schema: z.toJSONSchema(schema) } }
        : { type: 'json_object' };

    await limiter.wait();
    const res = await fetchImpl(`${cfg.SARVAM_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'api-subscription-key': cfg.SARVAM_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await failIfNotOk(res, 'Chat completion');
    const json = (await res.json()) as ChatResponse;
    const choice = json.choices?.[0];
    if (!choice) throw new SarvamError(502, 'Chat completion returned no choices');
    if (choice.finish_reason === 'length') throw new TruncatedError();
    return choice.message?.content ?? '';
  }

  return {
    async json(req) {
      const maxTokens = req.maxTokens ?? cfg.CHAT_MAX_TOKENS;
      const key = hashOf('chat', cfg.CHAT_MODEL, cfg.CHAT_JSON_MODE, req.task, req.system, req.user, maxTokens);
      return cache.through(`chat:${req.task}`, key, async () => {
        const messages = [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ];
        let lastProblem = '';
        for (let attempt = 0; attempt < 2; attempt++) {
          const msgs = attempt === 0 ? messages : [
            ...messages,
            { role: 'user', content: `Your previous reply was invalid: ${lastProblem}\nReturn ONLY a corrected JSON object.` },
          ];
          const text = await withRetry(() => call(msgs, maxTokens, req.schema));
          try {
            const parsed = req.schema.safeParse(parseJsonLoose(text));
            if (parsed.success) return parsed.data as z.infer<typeof req.schema>;
            lastProblem = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
          } catch (err) {
            lastProblem = (err as Error).message;
          }
        }
        throw new InvalidOutputError(`${req.task}: model output failed validation twice (${lastProblem})`);
      });
    },
  };
}
