// Re-download the SAVED output of an already-finished Sarvam Parse job and show its real structure.
// No new OCR happens, so it costs nothing. Handy when the output format is in doubt.
//
//   npm run inspect:job                 first finished job in the local database
//   npm run inspect:job -- <job_id>     a specific job
//
// Files are written to <DATA_DIR>/spike/job-<id>/. Never prints the API key.
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig, loadDotEnv } from '../src/config/index.ts';

loadDotEnv();
const cfg = loadConfig();
if (!cfg.SARVAM_API_KEY) throw new Error('SARVAM_API_KEY is not set');

let jobId = process.argv[2];
if (!jobId) {
  const db = new DatabaseSync(path.join(cfg.DATA_DIR, 'chronicle.db'), { readOnly: true });
  const row = db.prepare(`SELECT sarvam_job_id AS job FROM ocr_chunks WHERE sarvam_job_id IS NOT NULL ORDER BY rowid LIMIT 1`).get() as { job: string } | undefined;
  if (!row) throw new Error('No finished OCR job found in the database. Pass a job id.');
  jobId = row.job;
}
console.log('job', jobId);

const headers = { 'api-subscription-key': cfg.SARVAM_API_KEY };
const dl = await fetch(`${cfg.SARVAM_BASE_URL}/doc-ai/v1/job/${jobId}/download-url`, { headers });
if (!dl.ok) throw new Error(`download-url failed: HTTP ${dl.status} ${(await dl.text()).slice(0, 200)}`);
const { url } = (await dl.json()) as { url: string };
const zip = Buffer.from(await (await fetch(url)).arrayBuffer());

const outDir = path.join(cfg.DATA_DIR, 'spike', `job-${jobId}`);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'output.zip'), zip);
const archive = new AdmZip(zip);
archive.extractAllTo(path.join(outDir, 'unzipped'), true);

console.log('\nZIP entries:');
for (const e of archive.getEntries()) if (!e.isDirectory) console.log(`  ${String(e.header.size).padStart(8)} B  ${e.entryName}`);

const shape = (v: unknown, depth = 0): string => {
  if (Array.isArray(v)) return `array(${v.length}) of ${v.length ? shape(v[0], depth + 1) : '?'}`;
  if (v && typeof v === 'object') return depth > 3 ? 'object' : '{ ' + Object.entries(v).map(([k, x]) => `${k}: ${shape(x, depth + 1)}`).join(', ') + ' }';
  return typeof v === 'string' ? `string` : typeof v;
};
for (const e of archive.getEntries()) {
  if (e.isDirectory || !e.entryName.endsWith('.json')) continue;
  console.log(`\n--- ${e.entryName} ---`);
  const json = JSON.parse(e.getData().toString('utf8'));
  console.log('shape:', shape(json));
  console.log(JSON.stringify(json, null, 2).slice(0, 1800));
}
console.log(`\nSaved to ${outDir}`);
