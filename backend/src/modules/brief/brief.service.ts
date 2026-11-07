import type { Ctx } from '../../core/context.ts';
import { all, get, newId, run } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { listDocuments } from '../documents/index.ts';
import { listFindings } from '../findings/index.ts';
import { listTimeline } from '../timeline/index.ts';
import type { Brief } from './brief.schema.ts';

interface BriefRow {
  id: string;
  case_id: string;
  title: string;
  content_md: string;
  sections_json: string;
  output_language: string;
  created_at: string;
  updated_at: string;
}

const BANNED_PHRASES = ['negligent', 'gross negligence', 'malpractice', 'at fault', 'liable', 'guilty of malpractice'];

function scrubNeutralTone(text: string): string {
  let out = text;
  for (const phrase of BANNED_PHRASES) {
    const reg = new RegExp(`\\b${phrase}\\b`, 'gi');
    out = out.replace(reg, 'for expert clinical determination');
  }
  return out;
}

export async function generateBrief(ctx: Ctx, caseId: string): Promise<Brief> {
  const caseRow = requireCase(ctx.db, caseId);
  const docs = listDocuments(ctx, caseId);
  const { events } = listTimeline(ctx, caseId, { verifiedOnly: true });
  const { findings } = listFindings(ctx, caseId);

  const pageIssues = all<{ document_id: string; page_no: number; ocr_status: string; warning: string | null }>(
    ctx.db,
    `SELECT p.document_id, p.page_no, p.ocr_status, p.warning FROM pages p
     JOIN documents d ON d.id = p.document_id
     WHERE d.case_id = ? AND (p.warning IS NOT NULL OR p.ocr_status IN ('failed','no_text'))
     ORDER BY d.created_at, p.page_no`,
    caseId,
  );

  const admissionEvent = events.find((e) => e.type === 'admission');
  const dischargeEvent = events.find((e) => e.type === 'discharge');

  // 1. Snapshot Section
  const snapshotLines = [
    `### Case Summary`,
    `- **Case Title:** ${caseRow.title}`,
    `- **Case Classification:** ${caseRow.case_type.toUpperCase()}`,
    `- **Language for Review:** ${caseRow.output_language}`,
    `- **Hospital Stay:** ${admissionEvent?.raw_date ?? 'Stated in records'} to ${dischargeEvent?.raw_date ?? 'Stated in records'}`,
    caseRow.claim_summary ? `- **Matter Summary:** ${caseRow.claim_summary}` : '',
  ].filter(Boolean);
  const snapshot = snapshotLines.join('\n');

  // 2. Records Reviewed Section
  const recordsLines = [
    `### Documents Received & Analysed`,
    `A total of **${docs.length} document(s)** were ingested and processed:`,
    ...docs.map((d, i) => `${i + 1}. **${d.filename}** (${d.page_count ?? 1} page${(d.page_count ?? 1) === 1 ? '' : 's'}, language: ${d.language ?? 'Indic default'})`),
  ];
  if (pageIssues.length > 0) {
    recordsLines.push(
      `\n> [!WARNING] **Pages Excluded from Analysis:**\n> ${pageIssues.length} page(s) could not be fully analysed: ` +
      pageIssues.map((p) => `Page ${p.page_no} (${p.warning ?? p.ocr_status})`).join(', ') +
      '. A missing or illegible page must be checked against physical records.'
    );
  }
  const records_reviewed = recordsLines.join('\n');

  // 3. Key Chronology Section
  const chronologyLines = [
    `### Key Sourced Chronology`,
    events.length === 0
      ? 'No clinical events have been extracted and verified yet.'
      : events
          .map((e) => {
            const dateStr = e.raw_date ? `**${e.raw_date}**: ` : '';
            const citation = e.sources[0]
              ? ` *(Source: Page ${e.sources[0].page_no}, Quote: "${e.sources[0].quote_original}")*`
              : '';
            return `- [${e.label}] ${dateStr}${e.summary_en}${citation}`;
          })
          .join('\n'),
  ];
  const chronology = chronologyLines.join('\n');

  // 4. Issues for Opinion Section
  const issuesLines = [
    `### Clinical Findings & Potential Care Deviations`,
    findings.length === 0
      ? 'No automated care deviations or documentation gaps were flagged by the rule engine.'
      : findings
          .map((f, i) => {
            const sevBadge = `[${f.severity.toUpperCase()}]`;
            const evRef = f.evidence_event_ids.length > 0 ? ` (Events: ${f.evidence_event_ids.join(', ')})` : '';
            return `${i + 1}. **${sevBadge} ${f.title}**${evRef}\n   - **Detail:** ${f.explanation}\n   - **For Medical Opinion:** ${f.question_for_expert}`;
          })
          .join('\n\n'),
  ];
  const issues_for_opinion = issuesLines.join('\n');

  // 5. Questions for Expert Section
  const questionsLines = [
    `### Targeted Questions for Medical Expert Review`,
    findings.length === 0
      ? '1. Does the documented management adhere to standard clinical guidelines for this presentation?'
      : findings.map((f, i) => `${i + 1}. **Regarding ${f.title}:** ${f.question_for_expert}`).join('\n'),
  ];
  const questions_for_expert = questionsLines.join('\n');

  // 6. Limits of Analysis Section
  const limits = [
    `### Limits of Automated Analysis`,
    `- This brief is an automated medical-legal compilation generated from OCR readings and clinical rules.`,
    `- It does not constitute a medical diagnosis, clinical opinion, or legal conclusion.`,
    `- Every cited fact links to original script quotes and page crops which must be verified against physical hospital records by the reviewing clinician.`,
  ].join('\n');

  // Full Markdown document
  const content_md = scrubNeutralTone([
    `# Medical Expert Brief: ${caseRow.title}`,
    `*Generated by Chronicle for independent clinical review. All citations link to original source pages.*\n`,
    snapshot,
    `\n---\n`,
    records_reviewed,
    `\n---\n`,
    chronology,
    `\n---\n`,
    issues_for_opinion,
    `\n---\n`,
    questions_for_expert,
    `\n---\n`,
    limits,
  ].join('\n'));

  const sections = {
    snapshot,
    records_reviewed,
    chronology,
    issues_for_opinion,
    questions_for_expert,
    limits,
  };

  const existing = get<BriefRow>(ctx.db, 'SELECT * FROM briefs WHERE case_id = ?', caseId);
  const id = existing?.id ?? newId('b');

  run(
    ctx.db,
    `INSERT INTO briefs (id, case_id, title, content_md, sections_json, output_language, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(case_id) DO UPDATE SET
       title = excluded.title, content_md = excluded.content_md, sections_json = excluded.sections_json,
       output_language = excluded.output_language, updated_at = excluded.updated_at`,
    id,
    caseId,
    `Expert Brief: ${caseRow.title}`,
    content_md,
    JSON.stringify(sections),
    caseRow.output_language,
  );

  return getBrief(ctx, caseId);
}

export function getBrief(ctx: Ctx, caseId: string): Brief {
  requireCase(ctx.db, caseId);
  const row = get<BriefRow>(ctx.db, 'SELECT * FROM briefs WHERE case_id = ?', caseId);
  if (!row) {
    // Generate brief on the fly if not generated yet
    return {
      id: `b_${caseId}`,
      case_id: caseId,
      title: 'Expert Brief (Draft)',
      content_md: '# Medical Expert Brief\n\nRun the pipeline to compile this case brief.',
      sections: {
        snapshot: 'Pending case processing.',
        records_reviewed: 'Pending case processing.',
        chronology: 'Pending case processing.',
        issues_for_opinion: 'Pending case processing.',
        questions_for_expert: 'Pending case processing.',
        limits: 'Automated extraction pending.',
      },
      output_language: 'en-IN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  return {
    id: row.id,
    case_id: row.case_id,
    title: row.title,
    content_md: row.content_md,
    sections: JSON.parse(row.sections_json || '{}'),
    output_language: row.output_language,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
