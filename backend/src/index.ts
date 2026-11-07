import path from 'node:path';
import { createApp } from './app.ts';
import { createContext } from './bootstrap.ts';
import { loadConfig, loadDotEnv } from './config/index.ts';
import { openDb } from './core/db/index.ts';
import { recoverInterrupted } from './modules/pipeline/index.ts';

loadDotEnv();
const config = loadConfig();

if (/onedrive/i.test(path.resolve(config.DATA_DIR))) {
  console.warn('[warn] DATA_DIR is inside OneDrive. Sync can lock the SQLite file. Set DATA_DIR to e.g. C:\\chronicle-data');
}
if (!config.SARVAM_API_KEY && !config.CACHE_ONLY) {
  console.warn('[warn] SARVAM_API_KEY is not set. Uploads work, but processing will fail until it is.');
}

const db = openDb(path.join(config.DATA_DIR, 'chronicle.db'));
const ctx = createContext(config, db);
recoverInterrupted(ctx);

createApp(ctx).listen(config.PORT, () => {
  console.log(`Chronicle API on http://localhost:${config.PORT}  (data: ${config.DATA_DIR})`);
});
