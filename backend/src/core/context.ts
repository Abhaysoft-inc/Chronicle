import path from 'node:path';
import type { Config } from '../config/index.ts';
import type { Db } from './db/index.ts';
import type { Cache } from '../integrations/sarvam/cache.ts';
import type { ChatClient } from '../integrations/sarvam/chat.ts';
import type { DocAiClient } from '../integrations/sarvam/docai.ts';

/** Everything a pipeline stage needs. Tests pass fakes for docai and chat. */
export interface Ctx {
  db: Db;
  config: Config;
  cache: Cache;
  docai: DocAiClient;
  chat: ChatClient;
}

export const uploadsDir = (cfg: Config) => path.join(cfg.DATA_DIR, 'uploads');
export const chunksDir = (cfg: Config) => path.join(cfg.DATA_DIR, 'chunks');
