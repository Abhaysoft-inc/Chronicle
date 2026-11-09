import AdmZip from 'adm-zip';
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

/** Generates a standard Microsoft Word DOCX file from the brief markdown. */
export function exportBriefDocx(brief: Brief): Buffer {
  const zip = new AdmZip();
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const lines = brief.content_md.split('\n');
  const paragraphsXml = lines
    .map((line) => {
      const clean = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
      if (!clean) return '<w:p/>';
      if (clean.startsWith('# ')) {
        return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${clean.slice(2)}</w:t></w:r></w:p>`;
      }
      if (clean.startsWith('## ')) {
        return `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${clean.slice(3)}</w:t></w:r></w:p>`;
      }
      if (clean.startsWith('### ')) {
        return `<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${clean.slice(4)}</w:t></w:r></w:p>`;
      }
      return `<w:p><w:r><w:t>${clean}</w:t></w:r></w:p>`;
    })
    .join('');

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphsXml}
  </w:body>
</w:document>`;

  zip.addFile('[Content_Types].xml', Buffer.from(contentTypes, 'utf8'));
  zip.addFile('_rels/.rels', Buffer.from(rootRels, 'utf8'));
  zip.addFile('word/document.xml', Buffer.from(docXml, 'utf8'));
  return zip.toBuffer();
}

/** Generates clean printable HTML format for PDF printing. */
export function exportBriefHtml(brief: Brief, caseTitle: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${caseTitle} - MedLex Medical-Legal Brief</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1e293b; }
    h1 { font-size: 24px; border-bottom: 2px solid #0284c7; padding-bottom: 8px; color: #0f172a; }
    h2 { font-size: 20px; margin-top: 30px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; color: #1e293b; }
    h3 { font-size: 16px; margin-top: 24px; color: #334155; }
    ul { padding-left: 20px; }
    li { margin-bottom: 6px; }
    strong { color: #0f172a; }
    .badge { display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: #e0f2fe; color: #0369a1; }
    .footer { margin-top: 50px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
      Print or Save as PDF
    </button>
    <span style="font-size: 13px; color: #64748b;">MedLex Medical-Legal Intelligence Platform</span>
  </div>
  <div>
    ${brief.content_md
      .replace(/# (.*)/g, '<h1>$1</h1>')
      .replace(/## (.*)/g, '<h2>$1</h2>')
      .replace(/### (.*)/g, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.*)/gm, '<li>$1</li>')
      .replace(/\n\n/g, '<p></p>')
    }
  </div>
  <div class="footer">
    MedLex Intelligence Platform | Generated on ${brief.created_at.slice(0, 10)} | Confidential & Privileged Document
  </div>
</body>
</html>`;
}
