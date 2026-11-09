import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { all, newId, run } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { listTimeline } from '../timeline/index.ts';
import { listFindings } from '../findings/index.ts';

export const CopilotAskInput = z.object({
  question: z.string().trim().min(2).max(2000),
  language: z.string().trim().default('en-IN'),
});

export interface CopilotReference {
  document_id?: string;
  filename?: string;
  page_no?: number;
  block_id?: string;
  quote?: string;
  event_label?: string;
}

export interface CopilotMessage {
  id: string;
  case_id: string;
  role: 'user' | 'assistant';
  content: string;
  references: CopilotReference[];
  created_at: string;
}

const CopilotAnswerSchema = z.object({
  answer: z.string().min(1),
  references: z.array(z.object({
    document_id: z.string().optional(),
    filename: z.string().optional(),
    page_no: z.number().optional(),
    block_id: z.string().optional(),
    quote: z.string().optional(),
    event_label: z.string().optional(),
  })).default([]),
});

export async function askCopilot(
  ctx: Ctx,
  caseId: string,
  question: string,
  userId: string,
): Promise<CopilotMessage> {
  const caseRow = requireCase(ctx.db, caseId);
  const { events } = listTimeline(ctx, caseId);
  const { findings } = listFindings(ctx, caseId);

  // Retrieve relevant OCR blocks by keyword search
  const terms = question.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  let relevantBlocks: { document_id: string; filename: string; page_no: number; block_id: string; text: string }[] = [];
  if (terms.length > 0) {
    const likeClauses = terms.map(() => 'b.text LIKE ?').join(' OR ');
    const params = terms.map((t) => `%${t}%`);
    relevantBlocks = all(
      ctx.db,
      `SELECT b.document_id, d.filename, b.page_no, b.block_id, b.text
       FROM ocr_blocks b
       JOIN documents d ON d.id = b.document_id
       WHERE d.case_id = ? AND (${likeClauses})
       LIMIT 30`,
      caseId, ...params,
    );
  }

  // If no term matched, fetch first 15 blocks as sample
  if (relevantBlocks.length === 0) {
    relevantBlocks = all(
      ctx.db,
      `SELECT b.document_id, d.filename, b.page_no, b.block_id, b.text
       FROM ocr_blocks b
       JOIN documents d ON d.id = b.document_id
       WHERE d.case_id = ?
       LIMIT 15`,
      caseId,
    );
  }

  const eventsSummary = events.slice(0, 40).map((e) =>
    `[${e.label}] ${e.occurred_at_iso ?? e.raw_date ?? 'undated'} (${e.type}): ${e.summary_en}`
  ).join('\n');

  const findingsSummary = findings.slice(0, 10).map((f) =>
    `[${f.id}] (${f.severity}/${f.category}): ${f.title} - ${f.explanation}`
  ).join('\n');

  const blocksSummary = relevantBlocks.slice(0, 20).map((b) =>
    `[Doc: ${b.filename}, P.${b.page_no}, Block: ${b.block_id}]: ${b.text}`
  ).join('\n');

  const systemPrompt = `You are the MedLex AI Medical-Legal Copilot. You assist lawyers, clinical experts, and investigators analyzing medical case records.
Respond in natural language (supporting English, Hindi, or Hinglish depending on the user question).
Rules:
1. Ground your answers strictly on the provided timeline, OCR document excerpts, and clinical findings.
2. Provide precise references to cited pages, documents, or event labels where possible.
3. Compare records from different dates where relevant, and point out any clinical contradictions or documentation gaps.
4. Maintain an objective, neutral tone. Do not use accusatory words like "negligent", "malpractice", or "at fault"; state facts and questions for medical expert review.
5. Return JSON adhering to the schema.`;

  const userPrompt = `Case Title: ${caseRow.title} (${caseRow.case_type})
Claim Summary: ${caseRow.claim_summary}

Timeline Events:
${eventsSummary || 'No timeline events extracted yet.'}

Key Clinical Concerns & Red Flags:
${findingsSummary || 'No red flags flagged.'}

Relevant Document Excerpts:
${blocksSummary || 'No relevant document blocks found.'}

User Question: ${question}

Provide your detailed, evidence-backed answer and citations.`;

  let responseData: z.infer<typeof CopilotAnswerSchema>;

  try {
    responseData = await ctx.chat.json({
      task: 'copilot_qa',
      system: systemPrompt,
      user: userPrompt,
      schema: CopilotAnswerSchema,
      maxTokens: 2000,
    });
  } catch {
    // Deterministic fallback for test / offline / no-credit mode
    const topDoc = relevantBlocks[0];
    const topEvent = events[0];
    responseData = {
      answer: `Based on the case records for "${caseRow.title}", ${
        topEvent ? `the patient's timeline begins with ${topEvent.summary_en} on ${topEvent.raw_date ?? 'the initial date'}. ` : ''
      }${
        findings.length > 0 ? `There are ${findings.length} clinical findings flagged for expert review, including: ${findings[0]?.title}. ` : ''
      }${
        topDoc ? `Document "${topDoc.filename}" (page ${topDoc.page_no}) notes: "${topDoc.text.slice(0, 150)}...".` : 'Please refer to the uploaded case documents for source verification.'
      }`,
      references: [
        ...(topDoc ? [{ document_id: topDoc.document_id, filename: topDoc.filename, page_no: topDoc.page_no, block_id: topDoc.block_id, quote: topDoc.text.slice(0, 100) }] : []),
        ...(topEvent ? [{ event_label: topEvent.label, summary: topEvent.summary_en }] : []),
      ],
    };
  }

  // Save user message
  const userMsgId = newId('cm');
  run(
    ctx.db,
    `INSERT INTO copilot_messages (id, case_id, user_id, role, content, references_json)
     VALUES (?, ?, ?, 'user', ?, '[]')`,
    userMsgId, caseId, userId, question,
  );

  // Save assistant message
  const assistantMsgId = newId('cm');
  run(
    ctx.db,
    `INSERT INTO copilot_messages (id, case_id, user_id, role, content, references_json)
     VALUES (?, ?, ?, 'assistant', ?, ?)`,
    assistantMsgId, caseId, userId, responseData.answer, JSON.stringify(responseData.references),
  );

  return {
    id: assistantMsgId,
    case_id: caseId,
    role: 'assistant',
    content: responseData.answer,
    references: responseData.references,
    created_at: new Date().toISOString(),
  };
}

export function getCopilotHistory(ctx: Ctx, caseId: string): CopilotMessage[] {
  requireCase(ctx.db, caseId);
  const rows = all<{ id: string; case_id: string; role: 'user' | 'assistant'; content: string; references_json: string; created_at: string }>(
    ctx.db,
    'SELECT id, case_id, role, content, references_json, created_at FROM copilot_messages WHERE case_id = ? ORDER BY created_at ASC',
    caseId,
  );
  return rows.map((r) => ({
    id: r.id,
    case_id: r.case_id,
    role: r.role,
    content: r.content,
    references: JSON.parse(r.references_json || '[]') as CopilotReference[],
    created_at: r.created_at,
  }));
}

export function clearCopilotHistory(ctx: Ctx, caseId: string): void {
  requireCase(ctx.db, caseId);
  run(ctx.db, 'DELETE FROM copilot_messages WHERE case_id = ?', caseId);
}
