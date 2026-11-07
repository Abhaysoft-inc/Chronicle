import type { z } from 'zod';
import type { ChatClient, ChatJsonRequest } from '../integrations/sarvam/chat.ts';
import type { DocAiClient, DocAiInput, ParseResult } from '../integrations/sarvam/docai.ts';
import { pageCountOf } from './helpers.ts';

// Stand-ins for Sarvam, used by the tests and by `npm run dev:fake`.
// They never touch the network and cost nothing.

/** OCR fake: one block per page. Text carries the global page number so page mapping is checkable. */
export class FakeDocAi implements DocAiClient {
  calls: DocAiInput[] = [];
  private results = new Map<string, ParseResult>();
  async parse(input: DocAiInput): Promise<ParseResult> {
    const k = this.calls.length;
    this.calls.push(input);
    const pages = input.mime === 'application/pdf' ? await pageCountOf(input.bytes) : 1;
    // The OCR stage names chunks "<documentId>_<chunkIndex>.pdf"; chunk n starts at page n*10.
    const chunkIndex = Number(/_(\d+)\.\w+$/.exec(input.filename)?.[1] ?? 0);
    const offset = input.language === 'hi-IN' ? chunkIndex * 10 : 0;
    const blocks = Array.from({ length: pages }, (_, i) => ({
      page: i + 1,
      text: input.language === 'ur-IN' ? 'مریض کو بخار ہے' : `मरीज़ को बुखार है पृष्ठ ${offset + i + 1}`,
      tag: 'paragraph',
      // Same shape as the real Sarvam output: pixel box, 0..1 box, confidence.
      bbox: { x1: 40, y1: 60, x2: 360, y2: 100 },
      bboxNorm: [0.1, 0.1, 0.9, 0.17] as [number, number, number, number],
      confidence: 0.8,
    }));
    const result: ParseResult = {
      jobId: `job${k}`, status: 'completed', blocks, pageCount: pages,
      pages: Array.from({ length: pages }, (_, i) => ({ page: i + 1, width: 400, height: 600 })),
    };
    this.results.set(result.jobId, result);
    return result;
  }
  /** Mirrors DocAiClientFull.getResult: the saved output of a finished job. */
  async getResult(jobId: string): Promise<ParseResult> {
    const r = this.results.get(jobId);
    if (!r) throw new Error('unknown job ' + jobId);
    return r;
  }
}

/**
 * LLM fake: for every block it sees, report one event quoting the block exactly.
 * On page 11 it also fabricates two events: an invented quote and a wrong number,
 * so the verification stage has something to catch.
 */
export class FakeChat implements ChatClient {
  requests: string[] = [];
  async json<S extends z.ZodType>(req: ChatJsonRequest<S>): Promise<z.infer<S>> {
    this.requests.push(req.user);
    const blocks = [...req.user.matchAll(/\[(p(\d+)\.b\d+)\] (.*)/g)].map((m) => ({ id: m[1]!, page: Number(m[2]), text: m[3]! }));
    const mk = (b: (typeof blocks)[number], quote: string, summary: string) => ({
      type: 'symptom_report', occurred_at_raw: null, actor_role: 'doctor', summary_en: summary,
      details: { symptom: 'fever' }, legibility: 'clear',
      sources: [{ page_no: b.page, block_ids: [b.id], quote_original: quote, quote_en: 'patient has fever' }],
    });
    const events = blocks.map((b) => mk(b, b.text, `Fever noted on page ${b.page}`));
    const p11 = blocks.find((b) => b.page === 11);
    if (p11) {
      events.push(mk(p11, 'ऑपरेशन के बाद खून बहना बंद हुआ', 'INVENTED event'));
      events.push(mk(p11, p11.text + '1', 'WRONG NUMBER event')); // "पृष्ठ 111" vs block "पृष्ठ 11"
    }
    const pages = [...new Set(blocks.map((b) => b.page))].map((page_no) => ({ page_no, doc_type: 'doctor_notes' }));
    return req.schema.parse({ pages, events });
  }
}
