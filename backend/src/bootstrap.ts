import type { Config } from './config/index.ts';
import type { Ctx } from './core/context.ts';
import type { Db } from './core/db/index.ts';
import { createSarvam } from './integrations/sarvam/index.ts';

/**
 * Composition root: the only place that knows how every piece is wired together.
 * Modules receive a Ctx and never build their own clients, which is what lets tests
 * swap in fakes (override `docai` / `chat`, or pass a fake fetch).
 */
export function createContext(config: Config, db: Db, overrides: Partial<Ctx> & { fetchImpl?: typeof fetch } = {}): Ctx {
  const { fetchImpl, ...rest } = overrides;
  const sarvam = createSarvam(config, db, fetchImpl);
  return { db, config, ...sarvam, ...rest };
}
