import type { Ctx } from '../../core/context.ts';
import { get, newId, run } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { listTimeline } from '../timeline/index.ts';
import { listFindings } from '../findings/index.ts';
import { getChecklist } from '../records/index.ts';

export interface ClinicalAuditResult {
  id: string;
  case_id: string;
  completeness_score: number;
  nursing_consistency_score: number;
  missing_observations: string[];
  adverse_events: string[];
  audit_report_md: string;
  created_at: string;
}

export function runClinicalAudit(ctx: Ctx, caseId: string): ClinicalAuditResult {
  const caseRow = requireCase(ctx.db, caseId);
  const checklist = getChecklist(ctx, caseId);
  const { events } = listTimeline(ctx, caseId);
  const { findings } = listFindings(ctx, caseId);

  // 1. Completeness Score (0 - 100%)
  const totalExpected = checklist.length || 1;
  const presentDocs = checklist.filter((c) => c.status === 'present').length;
  let completenessScore = Math.round((presentDocs / totalExpected) * 100);

  // 2. Nursing Chart Consistency Score (0 - 100%)
  const vitalsEvents = events.filter((e) => e.type === 'observation_vitals');
  const administrationEvents = events.filter((e) => e.type === 'medication_administered');
  const totalNursingEvents = vitalsEvents.length + administrationEvents.length;

  let nursingScore = 80;
  if (totalNursingEvents === 0) {
    nursingScore = 20;
  } else if (totalNursingEvents < 5) {
    nursingScore = 50;
  } else if (totalNursingEvents > 15) {
    nursingScore = 95;
  }

  // Deduct for documented observation gaps
  const gapFindings = findings.filter((f) => f.category === 'documentation_gap');
  nursingScore = Math.max(10, nursingScore - gapFindings.length * 15);

  // 3. Missing Clinical Observations
  const missingObservations: string[] = [];
  const recordedFields = new Set<string>();
  for (const v of vitalsEvents) {
    for (const k of Object.keys(v.details)) recordedFields.add(k.toLowerCase());
  }

  const standardObservations = ['pulse', 'bp', 'temperature', 'spo2', 'respiratory_rate'];
  for (const std of standardObservations) {
    const hasField = [...recordedFields].some((f) => f.includes(std) || f.includes(std.replace('_', ' ')));
    if (!hasField && vitalsEvents.length > 0) {
      missingObservations.push(`Regular ${std.toUpperCase()} charting absent in recorded vital charts.`);
    }
  }

  if (vitalsEvents.length === 0) {
    missingObservations.push('Complete absence of round-the-clock vital sign observation charts.');
  }

  // 4. Adverse Event Analysis
  const adverseEvents: string[] = [];
  const adverseKeywords = ['cardiac arrest', 'fall', 'shock', 'anaphylaxis', 'sepsis', 'hemorrhage', 'bleed', 'collapsed', 'deteriorat'];
  for (const e of events) {
    const txt = `${e.summary_en} ${JSON.stringify(e.details)}`.toLowerCase();
    for (const kw of adverseKeywords) {
      if (txt.includes(kw)) {
        adverseEvents.push(`[${e.label}] Documented adverse observation: ${e.summary_en} (${e.raw_date ?? 'undated'})`);
        break;
      }
    }
  }

  // 5. Generate Audit Report
  const reportMd = `
# Hospital Clinical Audit & Record Completeness Report

**Case:** ${caseRow.title}  
**Specialty / Case Type:** ${caseRow.case_type.toUpperCase()}  
**Documentation Completeness Score:** ${completenessScore}%  
**Nursing Observation Consistency Score:** ${nursingScore}%  
**Audit Evaluation Date:** ${new Date().toISOString().slice(0, 10)}  

---

## 1. Documentation Completeness Overview
- **Expected Records Received:** ${presentDocs} of ${totalExpected} expected record categories.
- **Missing Categories:** ${checklist.filter((c) => c.status !== 'present').map((c) => c.doc_type).join(', ') || 'None (Complete file)'}
- **NABH / NMC Compliance Rating:** ${completenessScore >= 80 ? 'SATISFACTORY' : (completenessScore >= 50 ? 'NEEDS IMPROVEMENT' : 'NON-COMPLIANT')}

## 2. Nursing & Inpatient Observation Consistency
- **Vital Sign Entries Documented:** ${vitalsEvents.length}
- **Medication Administration Entries:** ${administrationEvents.length}
- **Identified Monitoring Gaps:** ${gapFindings.length} flagged monitoring gap(s).
${missingObservations.length > 0 ? `### Missing Standard Observations:\n${missingObservations.map((m) => `- ${m}`).join('\n')}` : '- All core vital parameters documented.'}

## 3. Adverse Event & Escalation Audit
${adverseEvents.length > 0 ? adverseEvents.map((a) => `- ${a}`).join('\n') : '_No acute adverse events identified in uploaded clinical notes._'}

## 4. Recommendations for Clinical Governance
1. ${completenessScore < 80 ? 'Ensure all expected operative notes and signed consent records are mandatorily uploaded to the medical record repository.' : 'Maintain current document classification standards.'}
2. ${nursingScore < 80 ? 'Standardize nursing observation intervals to prevent unmonitored time lapses in high-dependency wards.' : 'Vital chart monitoring frequency conforms to standard clinical practice.'}
3. Maintain full traceable audit logs for all medical record revisions.

---
*Report generated by MedLex Hospital Clinical Audit Engine.*
`.trim();

  const auditId = newId('aud');
  run(
    ctx.db,
    `INSERT INTO clinical_audits (id, case_id, completeness_score, nursing_consistency_score, missing_observations_json, adverse_events_json, audit_report_md)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(case_id) DO UPDATE SET
       completeness_score = excluded.completeness_score,
       nursing_consistency_score = excluded.nursing_consistency_score,
       missing_observations_json = excluded.missing_observations_json,
       adverse_events_json = excluded.adverse_events_json,
       audit_report_md = excluded.audit_report_md`,
    auditId, caseId, completenessScore, nursingScore, JSON.stringify(missingObservations), JSON.stringify(adverseEvents), reportMd,
  );

  return {
    id: auditId,
    case_id: caseId,
    completeness_score: completenessScore,
    nursing_consistency_score: nursingScore,
    missing_observations: missingObservations,
    adverse_events: adverseEvents,
    audit_report_md: reportMd,
    created_at: new Date().toISOString(),
  };
}

export function getClinicalAudit(ctx: Ctx, caseId: string): ClinicalAuditResult | null {
  requireCase(ctx.db, caseId);
  const row = get<{
    id: string;
    case_id: string;
    completeness_score: number;
    nursing_consistency_score: number;
    missing_observations_json: string;
    adverse_events_json: string;
    audit_report_md: string;
    created_at: string;
  }>(ctx.db, 'SELECT * FROM clinical_audits WHERE case_id = ?', caseId);

  if (!row) {
    // If not generated yet, auto-run on demand
    return runClinicalAudit(ctx, caseId);
  }

  return {
    id: row.id,
    case_id: row.case_id,
    completeness_score: row.completeness_score,
    nursing_consistency_score: row.nursing_consistency_score,
    missing_observations: JSON.parse(row.missing_observations_json || '[]'),
    adverse_events: JSON.parse(row.adverse_events_json || '[]'),
    audit_report_md: row.audit_report_md,
    created_at: row.created_at,
  };
}
