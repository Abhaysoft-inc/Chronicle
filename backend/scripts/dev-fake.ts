// Run the whole backend with FAKE Sarvam, so you can click through the test console for free.
//
//   npm run dev:fake        then open http://localhost:4001/test/
//
// No API key, no network, no credits. OCR returns one canned Hindi line per page and the
// "LLM" turns each line into an event. On page 11 it also invents two events on purpose, so
// you can see the verification stage flag them. Data goes to a temp folder and is wiped on exit.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.ts';
import { createContext } from '../src/bootstrap.ts';
import { loadConfig } from '../src/config/index.ts';
import { openDb } from '../src/core/db/index.ts';
import { addDocuments } from '../src/modules/documents/documents.service.ts';
import { createUser } from '../src/modules/auth/index.ts';
import { createCase } from '../src/modules/cases/index.ts';
import { FakeChat, FakeDocAi } from '../src/testing/fakes.ts';
import { makePdf } from '../src/testing/helpers.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-fake-'));
const config = loadConfig({ DATA_DIR: dir, PORT: process.env.PORT ?? '4001', DOCAI_POLL_SECONDS: '0', SARVAM_API_KEY: 'fake' });
const ctx = createContext(config, openDb(path.join(dir, 'chronicle.db')), { docai: new FakeDocAi(), chat: new FakeChat() });

// A demo account that owns the demo cases (sign in with these on the login page).
const DEMO = { name: 'Demo Reviewer', email: 'demo@chronicle.test', password: 'demo-password-123' };
const demoUser = await createUser(ctx, DEMO.name, DEMO.email, DEMO.password);

// A ready-made case so the console has something to show straight away.
const demo = createCase(ctx, { title: 'DEMO: 12-page Hindi file (fake OCR)', case_type: 'surgical', claim_summary: 'Fake data for trying the console.', output_language: 'hi-IN' }, demoUser.id);
addDocuments(ctx, demo.id, [{ filename: 'demo-hindi-12-pages.pdf', bytes: await makePdf(12) }], 'hi-IN');
const urdu = createCase(ctx, { title: 'DEMO: Urdu page (Tier 2, withheld from analysis)', case_type: 'general', claim_summary: '', output_language: 'en-IN' }, demoUser.id);
addDocuments(ctx, urdu.id, [{ filename: 'demo-urdu.pdf', bytes: await makePdf(1) }], 'ur-IN');

// Add preloaded clinical test cases if generated sample records exist
const suiteDir = path.join(import.meta.dirname, '..', 'samples', 'clinical-test-suite');
const bundleFile = path.join(suiteDir, 'complete_surgical_case_bundle.pdf');
const deviationFile = path.join(suiteDir, '09_care_deviation_and_gap_record.pdf');

if (fs.existsSync(bundleFile)) {
  const surgicalCase = createCase(ctx, {
    title: 'DEMO: Ramesh Kumar - Lap Appendectomy (Full Case Bundle)',
    case_type: 'surgical',
    claim_summary: 'Patient underwent emergency laparoscopic appendectomy for gangrenous appendicitis. Sourced timeline and post-op recovery review.',
    output_language: 'en-IN',
  }, demoUser.id);
  addDocuments(ctx, surgicalCase.id, [{ filename: 'complete_surgical_case_bundle.pdf', bytes: fs.readFileSync(bundleFile) }], 'hi-IN');
}

if (fs.existsSync(deviationFile)) {
  const auditCase = createCase(ctx, {
    title: 'DEMO: Vikram Singh - Clinical Safety & Deviation Audit',
    case_type: 'emergency',
    claim_summary: 'Clinical safety audit case evaluating allergy contraindications, monitoring gaps, and medication discrepancies.',
    output_language: 'en-IN',
  }, demoUser.id);
  addDocuments(ctx, auditCase.id, [{ filename: '09_care_deviation_and_gap_record.pdf', bytes: fs.readFileSync(deviationFile) }], 'en-IN');
}

const server = createApp(ctx).listen(config.PORT, () => {
  console.log(`FAKE-Sarvam backend on http://localhost:${config.PORT}`);
  console.log(`Test console:        http://localhost:${config.PORT}/test/`);
  console.log('Two demo cases are loaded. Press Process on one of them.');
  console.log(`Sign in with  ${DEMO.email}  /  ${DEMO.password}`);
});

const stop = () => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
