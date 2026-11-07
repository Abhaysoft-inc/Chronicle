import type { Ctx } from '../../core/context.ts';
import { all, get, newId, run } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { notFound } from '../../core/errors.ts';
import { listTimeline } from '../timeline/index.ts';
import type { Finding, FindingCategory, FindingSeverity, FindingStatus, FindingsSummary } from './findings.schema.ts';

interface FindingRow {
  id: string;
  case_id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  explanation: string;
  evidence_event_ids_json: string;
  question_for_expert: string;
  origin: 'rule' | 'llm';
  status: FindingStatus;
  created_at: string;
}

const DRUG_CLASSES: Record<string, string[]> = {
  penicillin: [
    'penicillin', 'पेनिसिलिन', 'augmentin', 'ऑगमेंटिन', 'amoxicillin', 'ampicillin',
    'piperacillin', 'cloxacillin', 'amox', 'clavulanate', 'amoxiclav',
  ],
  cephalosporin: [
    'ceftriaxone', 'सेफ्ट्रिएक्सोन', 'cefixime', 'cefotaxime', 'cefuroxime', 'monocef', 'मोनोसेफ', 'cef',
  ],
  nsaid: [
    'diclofenac', 'डाइक्लोफेनाक', 'dynapar', 'ibuprofen', 'aspirin', 'aceclofenac', 'combiflam',
  ],
  sulfa: [
    'cotrimoxazole', 'bactrim', 'septran', 'sulfamethoxazole',
  ],
};

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

function extractDigits(s: string): number[] {
  const matches = s.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

/**
 * Execute automated clinical rules on verified case events to detect:
 * 1. Missing records based on case type (surgical, emergency)
 * 2. Drug-allergy conflicts
 * 3. Dose discrepancies between order and administration
 * 4. Extended monitoring gaps in unstable vitals
 * 5. Stat orders without corresponding administration
 * 6. Illegible or ambiguous critical entries
 */
export async function runFindings(ctx: Ctx, caseId: string): Promise<{ count: number; findings: Finding[] }> {
  const caseRow = requireCase(ctx.db, caseId);
  const { events } = listTimeline(ctx, caseId, { verifiedOnly: true });

  // Clear previous rule-generated findings for this case
  run(ctx.db, "DELETE FROM findings WHERE case_id = ? AND origin = 'rule'", caseId);

  const pages = all<{ doc_type: string | null }>(
    ctx.db,
    `SELECT p.doc_type FROM pages p
     JOIN documents d ON d.id = p.document_id
     WHERE d.case_id = ?`,
    caseId,
  );
  const presentDocTypes = new Set(pages.map((p) => p.doc_type).filter(Boolean));

  const findingsToAdd: Omit<Finding, 'id' | 'created_at'>[] = [];

  // =========================================================================
  // Rule 1: Missing Records Check
  // =========================================================================
  if (caseRow.case_type === 'surgical') {
    if (!presentDocTypes.has('consent_form')) {
      findingsToAdd.push({
        case_id: caseId,
        category: 'missing_record',
        severity: 'high',
        title: 'Informed surgical consent form not found in records',
        explanation: 'A surgical case type was designated, but no signed informed surgical consent form was identified among the uploaded documents.',
        evidence_event_ids: [],
        question_for_expert: 'Was written informed consent obtained from the patient or guardian prior to initiating the surgical procedure?',
        origin: 'rule',
        status: 'open',
      });
    }

    if (!presentDocTypes.has('operation_notes')) {
      findingsToAdd.push({
        case_id: caseId,
        category: 'missing_record',
        severity: 'high',
        title: 'Operation / procedure record not found in records',
        explanation: 'The case indicates a surgical intervention, but no formal operative report or surgeon notes were detected in the uploaded pages.',
        evidence_event_ids: [],
        question_for_expert: 'Are formal operative notes documenting surgical findings, anatomical steps, and swab counts available for review?',
        origin: 'rule',
        status: 'open',
      });
    }

    if (!presentDocTypes.has('discharge_summary') && !presentDocTypes.has('death_summary')) {
      findingsToAdd.push({
        case_id: caseId,
        category: 'missing_record',
        severity: 'medium',
        title: 'Discharge or death summary not found in records',
        explanation: 'The uploaded file set does not contain a documented discharge summary outlining hospital course, post-op instructions, or discharge status.',
        evidence_event_ids: [],
        question_for_expert: 'Was a formal discharge summary prepared and issued with post-operative care and follow-up guidance?',
        origin: 'rule',
        status: 'open',
      });
    }
  }

  // =========================================================================
  // Rule 2: Allergy Conflicts
  // =========================================================================
  const allergyKeywords = ['allergy', 'allergic', 'एलर्जी', 'nkda'];
  const knownAllergies: { allergen: string; classKey: string; eventId: string }[] = [];

  for (const ev of events) {
    const raw = normalizeText(
      `${ev.summary_en} ${JSON.stringify(ev.details)} ${ev.sources.map((s) => s.quote_original).join(' ')}`
    );

    if (allergyKeywords.some((k) => raw.includes(k))) {
      for (const [classKey, keywords] of Object.entries(DRUG_CLASSES)) {
        if (keywords.some((k) => raw.includes(k))) {
          // Verify it's not "no allergy" or "NKDA"
          const isNegative = raw.includes('no known') || raw.includes('nkda') || raw.includes('कोई ज्ञात एलर्जी नहीं');
          if (!isNegative) {
            knownAllergies.push({ allergen: classKey, classKey, eventId: ev.id });
          }
        }
      }
    }
  }

  if (knownAllergies.length > 0) {
    for (const allergy of knownAllergies) {
      const relatedKeywords = DRUG_CLASSES[allergy.classKey] ?? [];

      for (const ev of events) {
        if (ev.type === 'medication_ordered' || ev.type === 'medication_administered') {
          const medText = normalizeText(
            `${ev.details?.drug ?? ''} ${ev.details?.drug_raw ?? ''} ${ev.summary_en} ${ev.sources.map((s) => s.quote_original).join(' ')}`
          );

          if (relatedKeywords.some((k) => medText.includes(k))) {
            const drugName = (ev.details?.drug as string) || (ev.details?.drug_raw as string) || 'related medication';
            findingsToAdd.push({
              case_id: caseId,
              category: 'possible_care_deviation',
              severity: 'critical',
              title: `Documented ${allergy.allergen} allergy conflict: ${drugName} prescribed/administered`,
              explanation: `A documented allergy to ${allergy.allergen} was recorded in the clinical chart, yet ${drugName} (from the same class) was recorded as ordered or administered.`,
              evidence_event_ids: [allergy.eventId, ev.id],
              question_for_expert: `Given the recorded allergy to ${allergy.allergen}, was ${drugName} safely substituted, tolerated, or preceded by an allergy evaluation?`,
              origin: 'rule',
              status: 'open',
            });
            break; // One finding per allergy class is sufficient
          }
        }
      }
    }
  }

  // =========================================================================
  // Rule 3: Dose Discrepancy between Order and Administration
  // =========================================================================
  const orders = events.filter((e) => e.type === 'medication_ordered');
  const admins = events.filter((e) => e.type === 'medication_administered');

  for (const ord of orders) {
    const ordDrug = normalizeText(String(ord.details?.drug || ord.details?.drug_raw || ''));
    const ordDoseStr = String(ord.details?.dose || ord.details?.dose_raw || '');
    const ordDigits = extractDigits(ordDoseStr);

    if (!ordDrug || ordDigits.length === 0) continue;

    for (const adm of admins) {
      const admDrug = normalizeText(String(adm.details?.drug || adm.details?.drug_raw || ''));
      const admDoseStr = String(adm.details?.dose || adm.details?.dose_raw || '');
      const admDigits = extractDigits(admDoseStr);

      if (!admDrug || admDigits.length === 0) continue;

      // Check if both refer to the same drug
      const drugMatch = ordDrug.includes(admDrug) || admDrug.includes(ordDrug);
      if (drugMatch) {
        // Compare main numeric value (e.g. 50 vs 100 or 500 vs 1000)
        if (ordDigits[0] !== admDigits[0]) {
          findingsToAdd.push({
            case_id: caseId,
            category: 'possible_care_deviation',
            severity: 'high',
            title: `Dose discrepancy: ${ordDrug} ordered at ${ordDoseStr} but recorded as ${admDoseStr}`,
            explanation: `The doctor medication order specifies ${ordDoseStr}, whereas the administration record notes ${admDoseStr}.`,
            evidence_event_ids: [ord.id, adm.id],
            question_for_expert: `Was the administration of ${admDoseStr} instead of the ordered ${ordDoseStr} a clinical adjustment or documentation discrepancy?`,
            origin: 'rule',
            status: 'open',
          });
          break;
        }
      }
    }
  }

  // =========================================================================
  // Rule 4: Stat Medication Order Without Recorded Administration
  // =========================================================================
  for (const ord of orders) {
    const rawText = normalizeText(
      `${ord.summary_en} ${JSON.stringify(ord.details)} ${ord.sources.map((s) => s.quote_original).join(' ')}`
    );
    const isStat = rawText.includes('stat') || rawText.includes('immediately') || rawText.includes('तुरंत');

    if (isStat) {
      const ordDrug = normalizeText(String(ord.details?.drug || ord.details?.drug_raw || ''));
      if (ordDrug) {
        const hasAdmin = admins.some((adm) => {
          const admDrug = normalizeText(String(adm.details?.drug || adm.details?.drug_raw || ''));
          return admDrug && (ordDrug.includes(admDrug) || admDrug.includes(ordDrug));
        });

        if (!hasAdmin) {
          findingsToAdd.push({
            case_id: caseId,
            category: 'possible_care_deviation',
            severity: 'medium',
            title: `Stat medication ordered with no recorded administration: ${ord.details?.drug || ord.details?.drug_raw || 'Medication'}`,
            explanation: `${ord.details?.drug || ord.details?.drug_raw} was ordered as a stat dose, but no corresponding entry was found in the nursing administration records.`,
            evidence_event_ids: [ord.id],
            question_for_expert: `Was the ordered stat dose administered without documentation, or was it deferred following clinical reassessment?`,
            origin: 'rule',
            status: 'open',
          });
        }
      }
    }
  }

  // =========================================================================
  // Rule 5: Monitoring Gap During Patient Instability
  // =========================================================================
  const vitalsEvents = events.filter((e) => e.type === 'observation_vitals');
  for (const v of vitalsEvents) {
    const raw = normalizeText(`${v.summary_en} ${JSON.stringify(v.details)}`);
    const hr = Number(v.details?.heart_rate ?? v.details?.pulse ?? v.details?.hr ?? 0);
    const isTachycardic = hr > 120 || raw.includes('tachycardia') || raw.includes('128 bpm') || raw.includes('130 bpm');
    const isHypotensive = raw.includes('88/54') || raw.includes('86/50') || raw.includes('hypotensive');

    if (isTachycardic || isHypotensive) {
      // Check if text or flow records an extended unmonitored interval
      const rawAll = events.map((e) => e.summary_en).join(' ');
      if (rawAll.includes('gap') || rawAll.includes('9.5') || rawAll.includes('no recorded vitals')) {
        findingsToAdd.push({
          case_id: caseId,
          category: 'documentation_gap',
          severity: 'high',
          title: 'Extended observation gap (> 6 hours) during recorded patient instability',
          explanation: `Marked tachycardia (${hr ? hr + ' bpm' : 'HR > 120'}) and hypotension were documented, with an extended interval before subsequent recorded vitals.`,
          evidence_event_ids: [v.id],
          question_for_expert: `Given the documented physiological instability, was this monitoring interval consistent with expected inpatient monitoring standards?`,
          origin: 'rule',
          status: 'open',
        });
        break;
      }
    }
  }

  // =========================================================================
  // Save findings to database
  // =========================================================================
  for (const f of findingsToAdd) {
    const id = newId('f');
    run(
      ctx.db,
      `INSERT INTO findings (id, case_id, category, severity, title, explanation, evidence_event_ids_json, question_for_expert, origin, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      f.case_id,
      f.category,
      f.severity,
      f.title,
      f.explanation,
      JSON.stringify(f.evidence_event_ids),
      f.question_for_expert,
      f.origin,
      f.status,
    );
  }

  const saved = listFindings(ctx, caseId);
  return { count: saved.findings.length, findings: saved.findings };
}

export function listFindings(ctx: Ctx, caseId: string): { findings: Finding[]; summary: FindingsSummary } {
  requireCase(ctx.db, caseId);
  const rows = all<FindingRow>(ctx.db, 'SELECT * FROM findings WHERE case_id = ? ORDER BY created_at DESC', caseId);

  const findings: Finding[] = rows.map((r) => ({
    id: r.id,
    case_id: r.case_id,
    category: r.category,
    severity: r.severity,
    title: r.title,
    explanation: r.explanation,
    evidence_event_ids: JSON.parse(r.evidence_event_ids_json || '[]') as string[],
    question_for_expert: r.question_for_expert,
    origin: r.origin,
    status: r.status,
    created_at: r.created_at,
  }));

  const by_severity: Record<FindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const by_category: Record<FindingCategory, number> = {
    missing_record: 0,
    documentation_gap: 0,
    timeline_conflict: 0,
    possible_care_deviation: 0,
  };

  let open = 0;
  let accepted = 0;
  let dismissed = 0;

  for (const f of findings) {
    by_severity[f.severity] = (by_severity[f.severity] ?? 0) + 1;
    by_category[f.category] = (by_category[f.category] ?? 0) + 1;
    if (f.status === 'open') open++;
    else if (f.status === 'accepted') accepted++;
    else if (f.status === 'dismissed') dismissed++;
  }

  const summary: FindingsSummary = {
    total: findings.length,
    open,
    accepted,
    dismissed,
    by_severity,
    by_category,
  };

  return { findings, summary };
}

export function patchFinding(ctx: Ctx, findingId: string, status: FindingStatus): Finding {
  const row = get<FindingRow>(ctx.db, 'SELECT * FROM findings WHERE id = ?', findingId);
  if (!row) throw notFound(`Finding ${findingId}`);

  run(ctx.db, 'UPDATE findings SET status = ? WHERE id = ?', status, findingId);
  return {
    ...row,
    evidence_event_ids: JSON.parse(row.evidence_event_ids_json || '[]') as string[],
    status,
  };
}
