import type { Config } from '../../config/index.ts';
import type { Db } from '../../core/db/index.ts';
import { makeBulbul, type BulbulClient } from './bulbul.ts';
import { makeCache, type Cache } from './cache.ts';
import { makeChat, type ChatClient } from './chat.ts';
import { makeDocAi, type DocAiClient } from './docai.ts';
import { makeSaaras, type SaarasClient } from './saaras.ts';
import { makeTranslate, type TranslateClient } from './translate.ts';

export interface SarvamClients {
  cache: Cache;
  docai: DocAiClient;
  chat: ChatClient;
  saaras: SaarasClient;
  bulbul: BulbulClient;
  translate: TranslateClient;
}

/** Build every Sarvam client from config. Pass a fake fetch in tests. */
export function createSarvam(config: Config, db: Db, fetchImpl: typeof fetch = fetch): SarvamClients {
  const cache = makeCache(db, config.CACHE_ONLY);
  return {
    cache,
    docai: makeDocAi(config, fetchImpl),
    chat: makeChat(config, cache, fetchImpl),
    saaras: makeSaaras(config, cache, fetchImpl),
    bulbul: makeBulbul(config, cache, fetchImpl),
    translate: makeTranslate(config, cache, fetchImpl),
  };
}
