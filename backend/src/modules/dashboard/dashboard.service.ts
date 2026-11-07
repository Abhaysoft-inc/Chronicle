import type { Ctx } from '../../core/context.ts';
import { all, get } from '../../core/db/index.ts';

export interface DashboardData {
  totals: {
    cases: number;
    casesInProgress: number;
    documents: number;
    pages: number;
    pagesRead: number;
    pagesNotAnalysed: number;
    events: number;
    verifiedEvents: number;
    unverifiedEvents: number;
    /** Share of events whose every quote was found in the OCR text (0..1). Null with no events. */
    verifiedRate: number | null;
    /** Average of Sarvam's per-block score across all pages (0..1). Null before any OCR. */
    avgConfidence: number | null;
  };
  review: { unreviewed: number; confirmed: number; corrected: number; rejected: number };
  eventsByType: { type: string; count: number }[];
  /** Last 14 days, oldest first, zero days included, so the chart has no gaps. */
  eventsPerDay: { day: string; count: number }[];
  attention: { caseId: string; title: string; reasons: string[] }[];
  recentCases: {
    id: string; title: string; caseType: string; status: string; createdAt: string;
    documents: number; events: number; reviewed: number; unverified: number;
  }[];
}

interface CaseStats {
  id: string; title: string; case_type: string; status: string; created_at: string;
  docs: number; events: number; reviewed: number; unverified: number; page_issues: number;
}

const DAYS = 14;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Every figure the dashboard shows, for one user. Their own cases only. */
export function getDashboard(ctx: Ctx, userId: string): DashboardData {
  const db = ctx.db;
  const one = <T>(sql: string) => get<T>(db, sql, userId)!;

  const statusCounts = all<{ status: string; n: number }>(db, 'SELECT status, COUNT(*) AS n FROM cases WHERE owner_id = ? GROUP BY status', userId);
  const cases = statusCounts.reduce((a, r) => a + r.n, 0);
  const casesInProgress = statusCounts.filter((r) => r.status === 'processing').reduce((a, r) => a + r.n, 0);

  const documents = one<{ n: number }>(`SELECT COUNT(*) AS n FROM documents d JOIN cases c ON c.id = d.case_id WHERE c.owner_id = ?`).n;
  const pages = one<{ total: number; ok: number; issues: number }>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(p.ocr_status = 'ok'), 0) AS ok,
            COALESCE(SUM(p.ocr_status IN ('failed', 'no_text') OR p.warning IS NOT NULL), 0) AS issues
     FROM pages p JOIN documents d ON d.id = p.document_id JOIN cases c ON c.id = d.case_id WHERE c.owner_id = ?`,
  );
  const conf = one<{ avg: number | null }>(
    `SELECT AVG(b.confidence) AS avg FROM ocr_blocks b JOIN documents d ON d.id = b.document_id JOIN cases c ON c.id = d.case_id
     WHERE c.owner_id = ? AND b.confidence IS NOT NULL`,
  );

  // One row per event, with "is every cited quote verified" worked out by the database.
  const events = all<{ type: string; review_status: string; created_at: string; verified: number }>(
    db,
    `SELECT e.type, e.review_status, e.created_at,
            CASE WHEN EXISTS (SELECT 1 FROM event_sources s WHERE s.event_id = e.id)
                  AND NOT EXISTS (SELECT 1 FROM event_sources s WHERE s.event_id = e.id AND COALESCE(s.verified, 0) != 1)
                 THEN 1 ELSE 0 END AS verified
     FROM events e JOIN cases c ON c.id = e.case_id WHERE c.owner_id = ?`,
    userId,
  );

  const review = { unreviewed: 0, confirmed: 0, corrected: 0, rejected: 0 };
  const byType = new Map<string, number>();
  const perDay = new Map<string, number>();
  const today = new Date();
  for (let i = DAYS - 1; i >= 0; i--) perDay.set(dayKey(new Date(today.getTime() - i * 86_400_000)), 0);
  let verified = 0;
  for (const e of events) {
    if (e.review_status in review) review[e.review_status as keyof typeof review]++;
    byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    if (e.verified) verified++;
    const d = e.created_at.slice(0, 10);
    if (perDay.has(d)) perDay.set(d, perDay.get(d)! + 1);
  }

  const caseStats = all<CaseStats>(
    db,
    `SELECT c.id, c.title, c.case_type, c.status, c.created_at,
            (SELECT COUNT(*) FROM documents d WHERE d.case_id = c.id) AS docs,
            (SELECT COUNT(*) FROM events e WHERE e.case_id = c.id) AS events,
            (SELECT COUNT(*) FROM events e WHERE e.case_id = c.id AND e.review_status != 'unreviewed') AS reviewed,
            (SELECT COUNT(*) FROM events e WHERE e.case_id = c.id
               AND EXISTS (SELECT 1 FROM event_sources s WHERE s.event_id = e.id AND COALESCE(s.verified, 0) != 1)) AS unverified,
            (SELECT COUNT(*) FROM pages p JOIN documents d ON d.id = p.document_id
               WHERE d.case_id = c.id AND (p.ocr_status IN ('failed', 'no_text') OR p.warning IS NOT NULL)) AS page_issues
     FROM cases c WHERE c.owner_id = ? ORDER BY c.created_at DESC`,
    userId,
  );

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const attention = caseStats
    .map((c) => {
      const reasons: string[] = [];
      if (c.status === 'failed') reasons.push('Processing failed');
      if (c.status === 'interrupted') reasons.push('Processing was interrupted');
      if (c.unverified > 0) reasons.push(`${plural(c.unverified, 'event')} not verified`);
      if (c.page_issues > 0) reasons.push(`${plural(c.page_issues, 'page')} not analysed`);
      return { caseId: c.id, title: c.title, reasons };
    })
    .filter((c) => c.reasons.length > 0)
    .slice(0, 6);

  return {
    totals: {
      cases,
      casesInProgress,
      documents,
      pages: pages.total,
      pagesRead: pages.ok,
      pagesNotAnalysed: pages.issues,
      events: events.length,
      verifiedEvents: verified,
      unverifiedEvents: events.length - verified,
      verifiedRate: events.length ? verified / events.length : null,
      avgConfidence: conf.avg,
    },
    review,
    eventsByType: [...byType].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    eventsPerDay: [...perDay].map(([day, count]) => ({ day, count })),
    attention,
    recentCases: caseStats.slice(0, 8).map((c) => ({
      id: c.id, title: c.title, caseType: c.case_type, status: c.status, createdAt: c.created_at,
      documents: c.docs, events: c.events, reviewed: c.reviewed, unverified: c.unverified,
    })),
  };
}
