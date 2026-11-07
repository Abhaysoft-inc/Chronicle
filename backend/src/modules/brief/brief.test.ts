import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../../core/db/index.ts';
import { startTestEnv } from '../../testing/helpers.ts';
import { createCase } from '../cases/index.ts';
import { generateBrief, getBrief } from './brief.service.ts';

test('brief: generates structured brief with neutral tone and citations', async () => {
  const env = await startTestEnv();
  try {
    const c = createCase(env.ctx, { title: 'Appendectomy Review', case_type: 'surgical', claim_summary: 'Post-op audit', output_language: 'en-IN' }, env.userId);
    run(
      env.ctx.db,
      'INSERT INTO documents (id, case_id, filename, sha256, mime, path) VALUES (?, ?, ?, ?, ?, ?)',
      'doc1', c.id, 'test.pdf', 'hash1', 'application/pdf', '/test.pdf',
    );

    // Add a verified clinical event
    run(
      env.ctx.db,
      `INSERT INTO events (id, case_id, seq, type, summary_en, details_json, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'e10', c.id, 1, 'admission', 'Patient admitted with RIF pain and fever', '{}', 'unreviewed',
    );
    run(
      env.ctx.db,
      `INSERT INTO event_sources (event_id, document_id, page_no, block_ids_json, quote_original, verified)
       VALUES (?, ?, ?, ?, ?, 1)`,
      'e10', 'doc1', 1, '["b10"]', 'मरीज़ को पेट में दर्द',
    );

    const brief = await generateBrief(env.ctx, c.id);
    assert.ok(brief.title.includes('Appendectomy Review'));
    assert.ok(brief.content_md.includes('Case Summary'));
    assert.ok(brief.content_md.includes('Key Sourced Chronology'));
    assert.ok(brief.content_md.includes('Limits of Automated Analysis'));
    assert.ok(brief.sections.snapshot);
    assert.ok(brief.sections.chronology);

    // Retrieve saved brief
    const fetched = getBrief(env.ctx, c.id);
    assert.equal(fetched.id, brief.id);
    assert.equal(fetched.content_md, brief.content_md);
  } finally {
    await env.close();
  }
});
