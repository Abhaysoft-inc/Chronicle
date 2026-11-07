// Upgrade already-processed cases with OCR boxes + confidence, from each job's SAVED output.
// No new OCR happens, so it costs nothing. Safe to run repeatedly.
//
//   npm run refresh:ocr                 every case in the local database
//   npm run refresh:ocr -- <case_id>    one case
import { createContext } from '../src/bootstrap.ts';
import path from 'node:path';
import { loadConfig, loadDotEnv } from '../src/config/index.ts';
import { openDb } from '../src/core/db/index.ts';
import { makeDocAi } from '../src/integrations/sarvam/docai.ts';
import { refreshOcrDetails } from '../src/modules/ocr/index.ts';

loadDotEnv();
const config = loadConfig();
if (!config.SARVAM_API_KEY) throw new Error('SARVAM_API_KEY is not set');
const db = openDb(path.join(config.DATA_DIR, 'chronicle.db'));
const ctx = createContext(config, db);
const r = await refreshOcrDetails(ctx, makeDocAi(config), process.argv[2]);
console.log(`Refreshed ${r.chunks} OCR chunk(s): ${r.blocksUpdated} block(s) updated.`);
if (r.skipped.length) console.log(`Skipped ${r.skipped.length} block(s) whose text no longer matches:\n  ` + r.skipped.join('\n  '));
