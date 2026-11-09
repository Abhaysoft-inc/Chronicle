import path from 'node:path';
import type { Config } from '../config/index.ts';
import type { Db } from './db/index.ts';
import type { Cache } from '../integrations/sarvam/cache.ts';
import type { ChatClient } from '../integrations/sarvam/chat.ts';
import type { DocAiClient } from '../integrations/sarvam/docai.ts';
import type { SaarasClient } from '../integrations/sarvam/saaras.ts';
import type { BulbulClient } from '../integrations/sarvam/bulbul.ts';
import type { TranslateClient } from '../integrations/sarvam/translate.ts';

/** Everything a pipeline stage needs. Tests pass fakes for docai and chat. */
export interface Ctx {
  db: Db;
  config: Config;
  cache: Cache;
  docai: DocAiClient;
  chat: ChatClient;
  saaras: SaarasClient;
  bulbul: BulbulClient;
  translate: TranslateClient;
}

export const uploadsDir = (cfg: Config) => path.join(cfg.DATA_DIR, 'uploads');
export const chunksDir = (cfg: Config) => path.join(cfg.DATA_DIR, 'chunks');
