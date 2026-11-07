import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from '../../core/db/index.ts';
import { startTestEnv } from '../../testing/helpers.ts';
import { createCase } from '../cases/index.ts';
import { listFindings, patchFinding, runFindings } from './findings.service.ts';

test('findings: flags missing records for surgical case type', async () => {
  const env = await startTestEnv();
  try {
    const c = createCase(env.ctx, { title: 'Surgical Test', case_type: 'surgical', claim_summary: '', output_language: 'en-IN' }, env.userId);
    const res = await runFindings(env.ctx, c.id);

    assert.ok(res.count >= 2);
    const titles = res.findings.map((f) => f.title);
    assert.ok(titles.some((t) => t.includes('consent')));
    assert.ok(titles.some((t) => t.includes('Operation')));
  } finally {
    await env.close();
  }
});

test('findings: flags allergy conflicts and dose mismatches', async () => {
  const env = await startTestEnv();
  try {
    const c = createCase(env.ctx, { title: 'Audit Test', case_type: 'medical', claim_summary: '', output_language: 'en-IN' }, env.userId);
    run(
      env.ctx.db,
      'INSERT INTO documents (id, case_id, filename, sha256, mime, path) VALUES (?, ?, ?, ?, ?, ?)',
      'doc1', c.id, 'test.pdf', 'hash1', 'application/pdf', '/test.pdf',
    );

    // Insert allergy event
    run(
      env.ctx.db,
      `INSERT INTO events (id, case_id, seq, type, summary_en, details_json, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'e1', c.id, 1, 'symptom_report', 'Patient has known allergy to Penicillin', '{"allergy":"penicillin"}', 'unreviewed',
    );
    run(
      env.ctx.db,
      `INSERT INTO event_sources (event_id, document_id, page_no, block_ids_json, quote_original, verified)
       VALUES (?, ?, ?, ?, ?, 1)`,
      'e1', 'doc1', 1, '["b1"]', 'Allergy to Penicillin',
    );

    // Insert medication order for Augmentin (Penicillin class)
    run(
      env.ctx.db,
      `INSERT INTO events (id, case_id, seq, type, summary_en, details_json, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'e2', c.id, 2, 'medication_ordered', 'Doctor ordered Inj. Augmentin 1.2g IV stat', '{"drug":"Augmentin","dose":"1.2g","frequency":"stat"}', 'unreviewed',
    );
    run(
      env.ctx.db,
      `INSERT INTO event_sources (event_id, document_id, page_no, block_ids_json, quote_original, verified)
       VALUES (?, ?, ?, ?, ?, 1)`,
      'e2', 'doc1', 1, '["b2"]', 'Inj. Augmentin 1.2g IV',
    );

    // Insert medication order with dose 50mg Tramadol
    run(
      env.ctx.db,
      `INSERT INTO events (id, case_id, seq, type, summary_en, details_json, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'e3', c.id, 3, 'medication_ordered', 'Inj. Tramadol 50mg ordered', '{"drug":"Tramadol","dose":"50mg"}', 'unreviewed',
    );
    run(
      env.ctx.db,
      `INSERT INTO event_sources (event_id, document_id, page_no, block_ids_json, quote_original, verified)
       VALUES (?, ?, ?, ?, ?, 1)`,
      'e3', 'doc1', 1, '["b3"]', 'Inj. Tramadol 50mg',
    );

    // Insert administration with dose 100mg Tramadol (mismatch)
    run(
      env.ctx.db,
      `INSERT INTO events (id, case_id, seq, type, summary_en, details_json, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      'e4', c.id, 4, 'medication_administered', 'Administered Inj. Tramadol 100mg IV', '{"drug":"Tramadol","dose":"100mg"}', 'unreviewed',
    );
    run(
      env.ctx.db,
      `INSERT INTO event_sources (event_id, document_id, page_no, block_ids_json, quote_original, verified)
       VALUES (?, ?, ?, ?, ?, 1)`,
      'e4', 'doc1', 1, '["b4"]', 'Inj. Tramadol 100mg',
    );

    const res = await runFindings(env.ctx, c.id);
    const severities = res.findings.map((f) => f.severity);
    assert.ok(severities.includes('critical')); // Allergy conflict
    assert.ok(severities.includes('high'));     // Dose mismatch

    const allergyFinding = res.findings.find((f) => f.severity === 'critical')!;
    assert.ok(allergyFinding.title.includes('allergy conflict'));

    // Test patching finding status
    const updated = patchFinding(env.ctx, allergyFinding.id, 'accepted');
    assert.equal(updated.status, 'accepted');

    const listed = listFindings(env.ctx, c.id);
    assert.equal(listed.summary.accepted, 1);
  } finally {
    await env.close();
  }
});
