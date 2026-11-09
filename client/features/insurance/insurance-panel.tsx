'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { useToast } from '@/components/ui/toast';
import { analyzeClaim, getClaim, updateClaimStatus } from '@/lib/api/endpoints';
import type { InsuranceClaimResult } from '@/lib/api/types';

export function InsurancePanel({ caseId }: { caseId: string }) {
  const notify = useToast();
  const [claim, setClaim] = useState<InsuranceClaimResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  // Form state for analyzing a claim
  const [claimNo, setClaimNo] = useState('CLM-2026-9812');
  const [insurer, setInsurer] = useState('Star Health & Allied Insurance');
  const [billedAmount, setBilledAmount] = useState('125000');
  const [itemsText, setItemsText] = useState(
    'Inj. Ceftriaxone 1g IV (₹4,500) - medication\nExploratory Laparotomy Procedure Charges (₹45,000) - procedure\nICU Monitoring 24hr (₹18,000) - icu\nBlood Investigation Panel & LFT (₹6,500) - investigation'
  );

  useEffect(() => {
    getClaim(caseId)
      .then(setClaim)
      .catch((err) => notify((err as Error).message, 'bad'))
      .finally(() => setLoading(false));
  }, [caseId, notify]);

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      // Parse claimed items
      const lines = itemsText.split('\n').filter((l) => l.trim().length > 0);
      const claimedItems = lines.map((line) => {
        const amtMatch = line.match(/₹?\s*(\d+(?:,\d+)?)/);
        const amount = amtMatch ? Number(amtMatch[1].replace(/,/g, '')) : 5000;
        let category: 'medication' | 'procedure' | 'icu' | 'room' | 'investigation' | 'other' = 'medication';
        if (line.toLowerCase().includes('procedure') || line.toLowerCase().includes('surgery')) category = 'procedure';
        else if (line.toLowerCase().includes('icu')) category = 'icu';
        else if (line.toLowerCase().includes('investigation') || line.toLowerCase().includes('panel')) category = 'investigation';

        return {
          item_name: line.split('(')[0]?.trim() || line.trim(),
          amount,
          category,
        };
      });

      const res = await analyzeClaim(caseId, {
        claim_no: claimNo,
        insurer,
        billed_amount: Number(billedAmount) || 100000,
        claimed_items: claimedItems,
      });

      setClaim(res);
      notify('Insurance claim cross-verified against medical chart.', 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleStatusChange(status: string) {
    try {
      const updated = await updateClaimStatus(caseId, status);
      setClaim(updated);
      notify(`Claim status updated to ${status}.`, 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    }
  }

  const riskTone = (score: number): 'ok' | 'bad' | 'warn' => {
    if (score >= 0.6) return 'bad';
    if (score >= 0.3) return 'warn';
    return 'ok';
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Insurance Claim Intelligence</h2>
          <p className="text-xs text-muted-foreground">
            Compare claimed procedures, medicines, and ICU billing entries against documented clinical administration charts. Detect unbilled or inflated charges.
          </p>
        </div>
      </div>

      {loading ? (
        <Card className="text-center py-12 text-sm text-muted-foreground">Loading claim analysis...</Card>
      ) : !claim ? (
        <Card className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Initiate Claim Reconciliation</h3>
          <p className="text-xs text-muted-foreground">
            Enter the claim details and itemized bill entries to cross-verify against the extracted patient timeline and nursing records.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground">Claim Number</label>
              <input
                type="text"
                className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                value={claimNo}
                onChange={(e) => setClaimNo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Insurance Company</label>
              <input
                type="text"
                className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                value={insurer}
                onChange={(e) => setInsurer(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Total Billed Amount (₹)</label>
              <input
                type="number"
                className="w-full mt-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                value={billedAmount}
                onChange={(e) => setBilledAmount(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">Claimed Items to Audit (One per line)</label>
            <textarea
              className="w-full mt-1 bg-background border border-border rounded-md p-2.5 text-sm text-foreground font-mono"
              rows={4}
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? 'Cross-Auditing Against Records...' : 'Run Claim Intelligence Audit'}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Key Metric Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card className="p-3">
              <span className="text-xs text-muted-foreground">Claim Number</span>
              <div className="text-base font-bold text-foreground mt-1">{claim.claim_no}</div>
              <span className="text-[11px] text-muted-foreground">{claim.insurer ?? 'Insurer'}</span>
            </Card>

            <Card className="p-3">
              <span className="text-xs text-muted-foreground">Total Billed</span>
              <div className="text-base font-bold text-foreground mt-1">₹{claim.billed_amount.toLocaleString('en-IN')}</div>
              <span className="text-[11px] text-muted-foreground">Submitted charges</span>
            </Card>

            <Card className="p-3">
              <span className="text-xs text-muted-foreground">Recommended Approval</span>
              <div className="text-base font-bold text-ok mt-1">₹{claim.approved_amount.toLocaleString('en-IN')}</div>
              <span className="text-[11px] text-muted-foreground">Chart-verified charges</span>
            </Card>

            <Card className="p-3">
              <span className="text-xs text-muted-foreground">Fraud / Discrepancy Risk</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-base font-bold text-foreground">{(claim.fraud_risk_score * 100).toFixed(0)}%</span>
                <Pill tone={riskTone(claim.fraud_risk_score)}>
                  {claim.fraud_risk_score >= 0.5 ? 'HIGH RISK' : 'LOW RISK'}
                </Pill>
              </div>
              <span className="text-[11px] text-muted-foreground">{claim.status.toUpperCase()}</span>
            </Card>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center justify-between bg-card p-3 rounded-lg border border-border">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Claim Review Status:</span>
              <Pill tone={claim.status === 'approved' ? 'ok' : (claim.status === 'flagged' ? 'bad' : 'warn')}>
                {claim.status.replace(/_/g, ' ').toUpperCase()}
              </Pill>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleStatusChange('approved')}>
                Mark Approved
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleStatusChange('flagged')}>
                Flag for Special Investigation (SIU)
              </Button>
              <Button variant="outline" size="sm" onClick={() => setClaim(null)}>
                Re-Analyze Claim
              </Button>
            </div>
          </div>

          {/* Discrepancies Breakdown */}
          {claim.discrepancies.length > 0 && (
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                ⚠️ Chart Verification Discrepancies ({claim.discrepancies.length})
              </h3>
              <div className="space-y-2">
                {claim.discrepancies.map((d, i) => (
                  <div key={i} className="p-2.5 rounded bg-muted/60 border border-border/80 flex flex-col gap-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{d.item}</span>
                      <Pill tone={d.severity === 'critical' ? 'bad' : (d.severity === 'high' ? 'bad' : 'warn')}>
                        {d.severity.toUpperCase()}
                      </Pill>
                    </div>
                    <p className="text-muted-foreground">{d.issue}</p>
                    {d.billed_amount && (
                      <span className="text-[11px] text-bad font-medium">
                        Unsupported Billed Amount: ₹{d.billed_amount.toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Structured Report */}
          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Claim Investigation Report</h3>
            <pre className="text-xs text-muted-foreground bg-muted p-4 rounded-lg whitespace-pre-wrap font-mono leading-relaxed">
              {claim.report_md}
            </pre>
          </Card>
        </div>
      )}
    </div>
  );
}
