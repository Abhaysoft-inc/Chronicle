// Phase 0 spike: run ONE file through Sarvam Parse and save the raw output.
//
//   npm run spike:ocr -- <file.pdf|png|jpg> [language-code]
//   npm run spike:ocr -- ./samples/nursing-hi.jpg hi-IN
//
// Costs about Rs 0.50 per page. Does not touch the database or the cache.
// What to look at afterwards (in <DATA_DIR>/spike/<name>/):
//   - raw ZIP contents: is the primary file really JSON? what are the block field names?
//   - do bounding boxes look like pixels, 0..1 fractions, or points?
//   - does handwriting come out readable? are digits native (५००) or Latin (500)?
//   - do tables survive? do mixed Hindi/English lines keep both scripts?
// If field names differ from what extractBlocks() accepts, it fails with the real keys listed.
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, loadDotEnv } from '../src/config/index.ts';
import { extractBlocks, makeDocAi } from '../src/integrations/sarvam/docai.ts';
import { scriptProfile } from '../src/shared/indic/text.ts';

loadDotEnv();
const [file, language] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npm run spike:ocr -- <file> [language-code, e.g. hi-IN]');
  process.exit(1);
}
const config = loadConfig();
if (!config.SARVAM_API_KEY) {
  console.error('SARVAM_API_KEY is not set (put it in backend/.env).');
  process.exit(1);
}

const bytes = fs.readFileSync(file);
const ext = path.extname(file).toLowerCase();
const mime = ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';
const outDir = path.join(config.DATA_DIR, 'spike', path.basename(file, ext) + (language ? `_${language}` : ''));
fs.mkdirSync(outDir, { recursive: true });

console.log(`Sending ${file} (${(bytes.length / 1024).toFixed(0)} KB), language=${language ?? '(omitted: Indic default)'} ...`);
const started = Date.now();
const { jobId, status, zip } = await makeDocAi(config).parseRawZip({ bytes, filename: path.basename(file), mime, language });
console.log(`Job ${jobId} ${status} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

fs.writeFileSync(path.join(outDir, 'output.zip'), zip);
const archive = new AdmZip(zip);
archive.extractAllTo(path.join(outDir, 'unzipped'), true);
console.log('\nZIP contents:');
for (const e of archive.getEntries()) console.log(`  ${e.isDirectory ? '[dir]' : `${String(e.header.size).padStart(8)} B`}  ${e.entryName}`);

try {
  const { blocks, pageCount } = extractBlocks(JSON.parse(
    archive.getEntries().find((e) => e.entryName.endsWith('.json') && !e.entryName.includes('metadata') && !e.entryName.endsWith('manifest.json'))!.getData().toString('utf8'),
  ));
  const profile = scriptProfile(blocks.map((b) => b.text).join(' '));
  console.log(`\nParsed OK: ${pageCount} page(s), ${blocks.length} block(s), dominant script ${profile.dominant} (${(profile.share * 100).toFixed(0)}%)`);
  console.log('Tags seen:', [...new Set(blocks.map((b) => b.tag))].join(', '));
  console.log('\nFirst blocks:');
  for (const b of blocks.slice(0, 8)) console.log(`  p${b.page} [${b.tag}] ${JSON.stringify(b.text).slice(0, 110)}  bbox=${JSON.stringify(b.bbox)}`);
} catch (err) {
  console.log(`\nCould not read blocks with the current reader: ${(err as Error).message}`);
  console.log('Open unzipped/ to see the real structure, then adjust extractBlocks() in src/integrations/sarvam/docai.ts.');
}
console.log(`\nSaved to ${outDir}`);
