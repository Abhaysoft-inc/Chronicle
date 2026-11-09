import { z } from 'zod';
import type { Ctx } from '../../core/context.ts';
import { get, newId, run } from '../../core/db/index.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { listTimeline } from '../timeline/index.ts';
import { listFindings } from '../findings/index.ts';

export const AnalyzeClaimInput = z.object({
  claim_no: z.string().trim().min(1),
  policy_no: z.string().trim().optional(),
  insurer: z.string().trim().optional(),
  billed_amount: z.coerce.number().min(0),
  claimed_items: z.array(z.object({
    item_name: z.string().trim().min(1),
    amount: z.coerce.number().min(0),
    category: z.enum(['medication', 'procedure', 'icu', 'room', 'investigation', 'other']).default('medication'),
  })).default([]),
});

export interface DiscrepancyItem {
  item: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  issue: string;
  billed_amount?: number;
}

export interface InsuranceClaimResult {
  id: string;
  case_id: string;
  claim_no: string;
  policy_no: string | null;
  insurer: string | null;
  billed_amount: number;
  approved_amount: number;
  fraud_risk_score: number;
  status: string;
  discrepancies: DiscrepancyItem[];
  report_md: string;
  created_at: string;
}

export function analyzeInsuranceClaim(
  ctx: Ctx,
  caseId: string,
  input: z.infer<typeof AnalyzeClaimInput>,
): InsuranceClaimResult {
  const caseRow = requireCase(ctx.db, caseId);
  const { events } = listTimeline(ctx, caseId);
  const { findings } = listFindings(ctx, caseId);

  const administeredEvents = events.filter((e) => e.type === 'medication_administered');
  const procedureEvents = events.filter((e) => e.type === 'procedure');
  const investigationEvents = events.filter((e) => e.type === 'investigation_result' || e.type === 'investigation_ordered');

  const discrepancies: DiscrepancyItem[] = [];
  let unsupportedBillingTotal = 0;

  // Cross-reference claimed items
  for (const item of input.claimed_items) {
    const itemNorm = item.item_name.toLowerCase();

    if (item.category === 'medication') {
      const match = administeredEvents.some((adm) => {
        const drug = String(adm.details?.drug || adm.details?.drug_raw || adm.summary_en).toLowerCase();
        return drug.includes(itemNorm) || itemNorm.includes(drug);
      });

      if (!match) {
        discrepancies.push({
          item: item.item_name,
          category: 'medication',
          severity: 'high',
          issue: 'Billed medication has no corresponding administration recorded in the nursing charts.',
          billed_amount: item.amount,
        });
        unsupportedBillingTotal += item.amount;
      }
    } else if (item.category === 'procedure') {
      const match = procedureEvents.some((prc) => {
        const txt = `${prc.summary_en} ${JSON.stringify(prc.details)}`.toLowerCase();
        return txt.includes(itemNorm) || itemNorm.includes('surgery') || itemNorm.includes('operation');
      });

      if (!match && procedureEvents.length === 0) {
        discrepancies.push({
          item: item.item_name,
          category: 'procedure',
          severity: 'critical',
          issue: 'Procedure billed but no operative or surgical procedure notes found in uploaded hospital records.',
          billed_amount: item.amount,
        });
        unsupportedBillingTotal += item.amount;
      }
    }
  }

  // Pre-existing condition check from patient history
  const preExistingMentions = events.filter((e) => {
    const raw = `${e.summary_en} ${JSON.stringify(e.details)}`.toLowerCase();
    return raw.includes('k/c/o') || raw.includes('history of') || raw.includes('known case of') || raw.includes('purani bimari');
  });

  if (preExistingMentions.length > 0) {
    discrepancies.push({
      item: 'Patient Medical History',
      category: 'medical_history',
      severity: 'medium',
      issue: `Documented pre-existing history detected in chart: ${preExistingMentions.map((p) => p.summary_en).join('; ')}. Verify disclosure in policy application.`,
    });
  }

  // Calculate fraud risk score (0.0 to 1.0)
  let riskScore = 0.05;
  if (discrepancies.length > 0) {
    riskScore += Math.min(0.85, discrepancies.length * 0.2 + (unsupportedBillingTotal / (input.billed_amount || 1)) * 0.5);
  }
  riskScore = Math.min(0.99, Math.round(riskScore * 100) / 100);

  const approvedAmount = Math.max(0, input.billed_amount - unsupportedBillingTotal);
  const status = riskScore >= 0.5 ? 'flagged' : (discrepancies.length > 0 ? 'under_investigation' : 'approved');

  // Generate Claim Investigation Report
  const reportMd = `
# MedLex Insurance Claim Investigation Report

**Case:** ${caseRow.title}  
**Claim Number:** ${input.claim_no}  
**Insurer:** ${input.insurer ?? 'Not specified'}  
**Policy Number:** ${input.policy_no ?? 'Not specified'}  
**Fraud/Deviation Risk Score:** ${(riskScore * 100).toFixed(0)}%  
**Investigation Status:** ${status.toUpperCase()}  

---

## 1. Financial Reconciliation Summary
- **Total Claimed / Billed Amount:** ₹${input.billed_amount.toLocaleString('en-IN')}
- **Unsupported / Questionable Charges:** ₹${unsupportedBillingTotal.toLocaleString('en-IN')}
- **Recommended Approved Amount:** ₹${approvedAmount.toLocaleString('en-IN')}

## 2. Identified Discrepancies & Audit Findings
${discrepancies.length === 0 ? '_No unsupported billing items or history contradictions identified._' : discrepancies.map((d, i) => `### ${i + 1}. [${d.severity.toUpperCase()}] ${d.item} (${d.category})\n- **Audit Finding:** ${d.issue}\n${d.billed_amount ? `- **Associated Claimed Amount:** ₹${d.billed_amount.toLocaleString('en-IN')}\n` : ''}`).join('\n')}

## 3. Clinical Cross-Verification
- **Documented Administrations:** ${administeredEvents.length} recorded administration entries.
- **Documented Procedures:** ${procedureEvents.length} recorded procedure entries.
- **Pre-existing Condition Indicators:** ${preExistingMentions.length} mention(s) in medical records.
- **Related Clinical Red Flags:** ${findings.length} concern(s) identified in case file.

---
*Report generated by MedLex Insurance Claim Intelligence Engine. For insurer claims adjudicator determination.*
`.trim();

  const claimId = newId('clm');
  run(
    ctx.db,
    `INSERT INTO insurance_claims (id, case_id, claim_no, policy_no, insurer, billed_amount, approved_amount, fraud_risk_score, status, discrepancies_json, report_md)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(case_id) DO UPDATE SET
       claim_no = excluded.claim_no,
       policy_no = excluded.policy_no,
       insurer = excluded.insurer,
       billed_amount = excluded.billed_amount,
       approved_amount = excluded.approved_amount,
       fraud_risk_score = excluded.fraud_risk_score,
       status = excluded.status,
       discrepancies_json = excluded.discrepancies_json,
       report_md = excluded.report_md`,
    claimId, caseId, input.claim_no, input.policy_no ?? null, input.insurer ?? null,
    input.billed_amount, approvedAmount, riskScore, status, JSON.stringify(discrepancies), reportMd,
  );

  return {
    id: claimId,
    case_id: caseId,
    claim_no: input.claim_no,
    policy_no: input.policy_no ?? null,
    insurer: input.insurer ?? null,
    billed_amount: input.billed_amount,
    approved_amount: approvedAmount,
    fraud_risk_score: riskScore,
    status,
    discrepancies,
    report_md: reportMd,
    created_at: new Date().toISOString(),
  };
}

export function getInsuranceClaim(ctx: Ctx, caseId: string): InsuranceClaimResult | null {
  requireCase(ctx.db, caseId);
  const row = get<{
    id: string;
    case_id: string;
    claim_no: string;
    policy_no: string | null;
    insurer: string | null;
    billed_amount: number;
    approved_amount: number;
    fraud_risk_score: number;
    status: string;
    discrepancies_json: string;
    report_md: string;
    created_at: string;
  }>(ctx.db, 'SELECT * FROM insurance_claims WHERE case_id = ?', caseId);

  if (!row) return null;
  return {
    id: row.id,
    case_id: row.case_id,
    claim_no: row.claim_no,
    policy_no: row.policy_no,
    insurer: row.insurer,
    billed_amount: row.billed_amount,
    approved_amount: row.approved_amount,
    fraud_risk_score: row.fraud_risk_score,
    status: row.status,
    discrepancies: JSON.parse(row.discrepancies_json || '[]'),
    report_md: row.report_md,
    created_at: row.created_at,
  };
}

export function updateClaimStatus(ctx: Ctx, caseId: string, status: string): InsuranceClaimResult {
  requireCase(ctx.db, caseId);
  run(ctx.db, 'UPDATE insurance_claims SET status = ? WHERE case_id = ?', status, caseId);
  const current = getInsuranceClaim(ctx, caseId);
  return current!;
}
