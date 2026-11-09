import type { CaseRow } from '../../core/db/lookups.ts';
import { similarity } from '../normalisation/index.ts';
import type { ChecklistItem } from '../records/index.ts';
import type { TimelineEvent } from '../timeline/index.ts';
import { abnormalities, ALLERGY_CLASSES, allergiesIn, canonicalDrug, labIsAbnormal, parseDose, readVitals } from './clinical.ts';
import type { FindingCategory, FindingSeverity } from './findings.schema.ts';

/** A finding before it is stored. `key` gives it a stable identity across re-runs. */
export interface Candidate {
  key: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  explanation: string;
  evidence: string[];
  question: string;
  origin: 'rule' | 'llm';
  confidence: number;
}

// ---------- helpers over timeline events ----------

const summaryOf = (e: TimelineEvent) => e.corrected?.summary_en ?? e.summary_en;
const textOf = (e: TimelineEvent) =>
  `${summaryOf(e)} ${Object.entries(e.details).map(([k, v]) => `${k}: ${v}`).join(' ')} ${e.sources.map((s) => s.quote_original).join(' ')}`;
const drugOf = (e: TimelineEvent) =>
  canonicalDrug(String(e.details.drug ?? '')) ?? canonicalDrug(String(e.details.drug_raw ?? '')) ?? canonicalDrug(textOf(e));
const doseOf = (e: TimelineEvent) => parseDose(String(e.details.dose ?? '')) ?? parseDose(String(e.details.dose_raw ?? '')) ?? parseDose(summaryOf(e));

/** Has a real clock time we can do arithmetic with (not a day, not "night", not an unknown AM/PM). */
const precise = (e: TimelineEvent) =>
  !!e.occurred_at_iso && e.occurred_at_iso.length > 10 && (e.precision === 'minute' || e.precision === 'hour') && !(e.date_note ?? '').includes('AM or PM');
const ms = (e: TimelineEvent) => Date.parse(e.occurred_at_iso!.length > 10 ? e.occurred_at_iso! : `${e.occurred_at_iso}T12:00:00+05:30`);
const day = (e: TimelineEvent) => e.occurred_at_iso?.slice(0, 10) ?? null;
const when = (e: TimelineEvent) => (e.occurred_at_iso ? `${e.occurred_at_iso.slice(0, 10)}${precise(e) ? ` ${e.occurred_at_iso.slice(11, 16)}` : ''}` : 'an undated entry');
const hours = (a: number, b: number) => Math.round(((b - a) / 3_600_000) * 10) / 10;
const pretty = (docType: string) => docType.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const RESPONSE_TYPES = new Set(['escalation_or_review', 'examination', 'medication_ordered', 'medication_administered', 'procedure', 'transfer', 'investigation_ordered', 'diagnosis']);

/** Did anything that counts as a response happen after `e`, within the window? */
function respondedAfter(e: TimelineEvent, events: TimelineEvent[], windowHours: number): boolean {
  return events.some((r) => {
    if (r.id === e.id || !RESPONSE_TYPES.has(r.type) || !r.occurred_at_iso) return false;
    if (precise(e) && precise(r)) {
      const dt = (ms(r) - ms(e)) / 3_600_000;
      return dt >= 0 && dt <= windowHours;
    }
    return day(r) === day(e); // only day-level dates: same day counts
  });
}

// ---------- the rules ----------

const MISSING_QUESTIONS: Record<string, string> = {
  consent_form: 'Was written informed consent obtained before the procedure, and is a signed copy available?',
  operation_notes: 'Is there an operation record documenting findings, steps, complications and counts?',
  anaesthesia_record: 'Is the intra-operative anaesthesia record available?',
  nursing_chart: 'Are the nursing observation and medication administration charts for the stay available?',
  doctor_notes: 'Are the treating doctors\' progress notes for the stay available?',
  prescription: 'Are the drug orders / prescriptions for the stay available?',
  discharge_summary: 'Was a discharge (or death) summary prepared, and is it available?',
  lab_report: 'Are the reports for the investigations that were ordered available?',
};

function missingRecords(checklist: ChecklistItem[]): Candidate[] {
  return checklist
    .filter((i) => i.status === 'missing' || i.status === 'requested')
    .map((i) => ({
      key: `missing:${i.doc_type}`,
      category: 'missing_record',
      severity: i.doc_type === 'consent_form' || i.doc_type === 'operation_notes' ? 'high' : 'medium',
      title: `${pretty(i.doc_type)} not found in the uploaded records${i.status === 'requested' ? ' (requested)' : ''}`,
      explanation: `${i.reason} None of the uploaded pages was classified as a ${pretty(i.doc_type).toLowerCase()}.${i.status === 'requested' ? ' It has been requested.' : ''} This is a gap in the file, not proof that it was never made.`,
      evidence: [],
      question: MISSING_QUESTIONS[i.doc_type] ?? 'Is this document available?',
      origin: 'rule',
      confidence: 0.9,
    }));
}

function allergyConflicts(events: TimelineEvent[]): Candidate[] {
  const allergies: { cls: string; event: TimelineEvent }[] = [];
  for (const e of events) for (const cls of allergiesIn(textOf(e))) allergies.push({ cls, event: e });
  const out: Candidate[] = [];
  for (const { cls, event } of allergies) {
    for (const m of events.filter((x) => x.type === 'medication_ordered' || x.type === 'medication_administered')) {
      const drug = drugOf(m);
      if (!drug || !ALLERGY_CLASSES[cls]?.includes(drug)) continue;
      out.push({
        key: `allergy:${cls}:${m.id}`,
        category: 'possible_care_deviation',
        severity: 'critical',
        title: `Recorded ${cls} allergy, yet ${drug} was ${m.type === 'medication_ordered' ? 'ordered' : 'given'}`,
        explanation: `${event.label} records an allergy to ${cls}. ${m.label} (${when(m)}) records ${drug}, which belongs to that class.`,
        evidence: [event.id, m.id],
        question: `Given the recorded ${cls} allergy, was ${drug} a deliberate, documented decision (for example after allergy assessment), or an oversight?`,
        origin: 'rule',
        confidence: 0.8,
      });
    }
  }
  return out;
}

function doseMismatches(events: TimelineEvent[]): Candidate[] {
  const orders = events.filter((e) => e.type === 'medication_ordered');
  const given = events.filter((e) => e.type === 'medication_administered');
  const out: Candidate[] = [];
  for (const o of orders) {
    const drug = drugOf(o);
    const od = doseOf(o);
    if (!drug || !od) continue;
    const mismatch = given.find((g) => {
      if (drugOf(g) !== drug) return false;
      const gd = doseOf(g);
      if (!gd || gd.unit !== od.unit) return false;
      if (o.occurred_at_iso && g.occurred_at_iso && ms(g) < ms(o)) return false; // given before this order: a different order
      return Math.abs(gd.value - od.value) > 0.001;
    });
    if (!mismatch) continue;
    const gd = doseOf(mismatch)!;
    out.push({
      key: `dose:${o.id}:${mismatch.id}`,
      category: 'possible_care_deviation',
      severity: 'high',
      title: `${drug}: ordered ${od.value} ${od.unit}, recorded as given ${gd.value} ${gd.unit}`,
      explanation: `${o.label} orders ${drug} ${od.value} ${od.unit}; ${mismatch.label} (${when(mismatch)}) records ${gd.value} ${gd.unit}. Brand names and units (g, mg) were normalised before comparing.`,
      evidence: [o.id, mismatch.id],
      question: `Was the ${gd.value} ${gd.unit} dose a documented change of order, or a discrepancy between order and administration?`,
      origin: 'rule',
      confidence: 0.75,
    });
  }
  return out;
}

function statWithoutAdministration(events: TimelineEvent[]): Candidate[] {
  const given = events.filter((e) => e.type === 'medication_administered');
  return events
    .filter((e) => e.type === 'medication_ordered' && /\bstat\b|immediately|at once|तुरंत/i.test(textOf(e)))
    .flatMap((o) => {
      const drug = drugOf(o);
      if (!drug || given.some((g) => drugOf(g) === drug && (!o.occurred_at_iso || !g.occurred_at_iso || ms(g) >= ms(o)))) return [];
      return [{
        key: `stat:${o.id}`,
        category: 'documentation_gap' as const,
        severity: 'medium' as const,
        title: `Stat order for ${drug} with no recorded administration`,
        explanation: `${o.label} (${when(o)}) orders ${drug} immediately, but no administration of ${drug} is recorded after it in the uploaded records.`,
        evidence: [o.id],
        question: `Was the stat dose of ${drug} given and not charted, or was it withheld after reassessment?`,
        origin: 'rule' as const,
        confidence: 0.65,
      }];
    });
}

function givenBeforeOrdered(events: TimelineEvent[]): Candidate[] {
  const out: Candidate[] = [];
  const orders = events.filter((e) => e.type === 'medication_ordered' && precise(e));
  for (const g of events.filter((e) => e.type === 'medication_administered' && precise(e))) {
    const drug = drugOf(g);
    if (!drug) continue;
    const sameDrug = orders.filter((o) => drugOf(o) === drug);
    if (!sameDrug.length) continue;
    const first = sameDrug.reduce((a, b) => (ms(a) <= ms(b) ? a : b));
    if (ms(g) < ms(first) - 30 * 60_000) {
      out.push({
        key: `before:${g.id}`,
        category: 'timeline_conflict',
        severity: 'medium',
        title: `${drug} recorded as given before it was ordered`,
        explanation: `${g.label} records ${drug} given at ${when(g)}, but the first order for ${drug} (${first.label}) is at ${when(first)}.`,
        evidence: [g.id, first.id],
        question: `Was there a verbal or earlier order for ${drug}, or is one of the two times wrong?`,
        origin: 'rule',
        confidence: 0.7,
      });
    }
  }
  return out;
}

function abnormalWithoutResponse(events: TimelineEvent[]): Candidate[] {
  const out: Candidate[] = [];
  for (const e of events.filter((x) => x.type === 'observation_vitals' || x.type === 'examination' || x.type === 'symptom_report')) {
    const bad = abnormalities(readVitals(textOf(e), e.details));
    if (!bad.length || respondedAfter(e, events, 2)) continue;
    const severe = bad.some((b) => b.severe);
    out.push({
      key: `abnormal:${e.id}`,
      category: 'possible_care_deviation',
      severity: severe ? 'critical' : 'high',
      title: `Abnormal observation with no documented response: ${bad.map((b) => b.text).join(', ')}`,
      explanation: `${e.label} (${when(e)}) records ${bad.map((b) => b.text).join(', ')}. No doctor review, escalation, medication or other response is recorded ${precise(e) ? 'within 2 hours after it' : 'on the same day'} in the uploaded records.`,
      evidence: [e.id],
      question: 'Was this observation escalated and acted on? If so, where is that documented?',
      origin: 'rule',
      confidence: precise(e) ? 0.75 : 0.55,
    });
  }
  return out;
}

function monitoringGaps(events: TimelineEvent[]): Candidate[] {
  const vitals = events.filter((e) => e.type === 'observation_vitals' && precise(e)).sort((a, b) => ms(a) - ms(b));
  const boundaries = events.filter((e) => (e.type === 'discharge' || e.type === 'transfer') && e.occurred_at_iso);
  const out: Candidate[] = [];
  for (let i = 1; i < vitals.length; i++) {
    const a = vitals[i - 1]!;
    const b = vitals[i]!;
    const gap = hours(ms(a), ms(b));
    const wasAbnormal = abnormalities(readVitals(textOf(a), a.details)).length > 0;
    const limit = wasAbnormal ? 4 : 8;
    if (gap <= limit || gap > 48) continue;
    if (boundaries.some((x) => ms(x) > ms(a) && ms(x) < ms(b))) continue; // discharged or transferred in between
    out.push({
      key: `gap:${a.id}:${b.id}`,
      category: 'documentation_gap',
      severity: wasAbnormal ? 'high' : 'medium',
      title: `${gap} hours with no recorded vital signs${wasAbnormal ? ' after an abnormal reading' : ''}`,
      explanation: `Vital signs are recorded at ${when(a)} (${a.label}) and next at ${when(b)} (${b.label}): a gap of ${gap} hours${wasAbnormal ? `, although the earlier reading was abnormal` : ''}. The check flags gaps over ${limit} hours (a placeholder threshold for a clinician to confirm).`,
      evidence: [a.id, b.id],
      question: `Was the patient observed during these ${gap} hours, and was that frequency appropriate for their condition?`,
      origin: 'rule',
      confidence: 0.7,
    });
  }
  return out;
}

function labWithoutFollowUp(events: TimelineEvent[]): Candidate[] {
  return events
    .filter((e) => e.type === 'investigation_result' && labIsAbnormal(textOf(e), e.details))
    .filter((e) => !respondedAfter(e, events, 24))
    .map((e) => ({
      key: `labfu:${e.id}`,
      category: 'documentation_gap' as const,
      severity: 'medium' as const,
      title: `Abnormal result with no documented follow-up: ${summaryOf(e).slice(0, 90)}`,
      explanation: `${e.label} (${when(e)}) reports an out-of-range result. No review, treatment change or repeat test is recorded ${precise(e) ? 'within 24 hours' : 'on the same day'} in the uploaded records.`,
      evidence: [e.id],
      question: 'Was this result seen and acted on? Is there a later note, order or repeat test?',
      origin: 'rule' as const,
      confidence: 0.6,
    }));
}

function conflictingTimes(events: TimelineEvent[]): Candidate[] {
  const out: Candidate[] = [];
  const key = events.filter((e) => ['admission', 'procedure', 'discharge', 'death'].includes(e.type) && e.occurred_at_iso);
  for (let i = 0; i < key.length; i++) {
    for (let j = i + 1; j < key.length; j++) {
      const a = key[i]!;
      const b = key[j]!;
      if (a.type !== b.type || similarity(summaryOf(a), summaryOf(b)) < 0.5) continue;
      const differ = precise(a) && precise(b) ? Math.abs(ms(a) - ms(b)) > 60 * 60_000 : day(a) !== day(b);
      if (!differ) continue;
      out.push({
        key: `conflict:${a.id}:${b.id}`,
        category: 'timeline_conflict',
        severity: a.type === 'procedure' || a.type === 'death' ? 'high' : 'medium',
        title: `Records disagree on when the ${a.type.replace(/_/g, ' ')} happened`,
        explanation: `${a.label} puts it at ${when(a)}; ${b.label} puts it at ${when(b)}. Both describe the same ${a.type.replace(/_/g, ' ')}.`,
        evidence: [a.id, b.id],
        question: 'Which time is correct, and why do the records differ?',
        origin: 'rule',
        confidence: 0.65,
      });
    }
  }
  return out;
}

function afterDischarge(events: TimelineEvent[]): Candidate[] {
  const end = events.filter((e) => (e.type === 'discharge' || e.type === 'death') && e.basis === 'stated' && e.occurred_at_iso);
  if (!end.length) return [];
  const last = end.reduce((a, b) => (day(a)! >= day(b)! ? a : b));
  return events
    .filter((e) => e.occurred_at_iso && day(e)! > day(last)! && !['discharge', 'death', 'investigation_result', 'other'].includes(e.type) && e.basis === 'stated')
    .map((e) => ({
      key: `afterdc:${e.id}`,
      category: 'timeline_conflict' as const,
      severity: 'medium' as const,
      title: `Clinical entry dated after ${last.type === 'death' ? 'death' : 'discharge'}`,
      explanation: `${e.label} (${when(e)}, ${e.type.replace(/_/g, ' ')}) is dated after the ${last.type} on ${when(last)} (${last.label}).`,
      evidence: [e.id, last.id],
      question: 'Is this a later admission or follow-up, a late entry, or a wrong date?',
      origin: 'rule' as const,
      confidence: 0.6,
    }));
}

function undatedCriticalEntries(events: TimelineEvent[]): Candidate[] {
  const undated = events.filter((e) => !e.occurred_at_iso && ['medication_administered', 'procedure', 'anaesthesia'].includes(e.type));
  if (!undated.length) return [];
  return [{
    key: 'undated:critical',
    category: 'documentation_gap',
    severity: undated.length > 3 ? 'medium' : 'low',
    title: `${undated.length} medication or procedure entr${undated.length === 1 ? 'y has' : 'ies have'} no date or time`,
    explanation: `${undated.map((e) => e.label).slice(0, 12).join(', ')} record medicines given or procedures done without a readable date or time, so they cannot be placed on the timeline.`,
    evidence: undated.slice(0, 10).map((e) => e.id),
    question: 'Can the times of these entries be established from other records?',
    origin: 'rule',
    confidence: 0.85,
  }];
}

function illegibleCriticalEntries(events: TimelineEvent[]): Candidate[] {
  return events
    .filter((e) => e.legibility !== 'clear' && ['medication_ordered', 'medication_administered', 'procedure'].includes(e.type))
    .map((e) => ({
      key: `illegible:${e.id}`,
      category: 'documentation_gap' as const,
      severity: 'medium' as const,
      title: `Hard-to-read ${e.type.replace(/_/g, ' ')}: ${summaryOf(e).slice(0, 80)}`,
      explanation: `${e.label} was marked as ${e.legibility} handwriting. Drug names, doses and times on it should be checked against the original.`,
      evidence: [e.id],
      question: 'What exactly does this entry say? Can the author or the original chart confirm it?',
      origin: 'rule' as const,
      confidence: 0.8,
    }));
}

/** Every fixed check, over verified, de-duplicated events. */
export function ruleCandidates(_c: CaseRow, events: TimelineEvent[], checklist: ChecklistItem[]): Candidate[] {
  return [
    ...missingRecords(checklist),
    ...allergyConflicts(events),
    ...doseMismatches(events),
    ...statWithoutAdministration(events),
    ...givenBeforeOrdered(events),
    ...abnormalWithoutResponse(events),
    ...monitoringGaps(events),
    ...labWithoutFollowUp(events),
    ...conflictingTimes(events),
    ...afterDischarge(events),
    ...undatedCriticalEntries(events),
    ...illegibleCriticalEntries(events),
  ];
}
