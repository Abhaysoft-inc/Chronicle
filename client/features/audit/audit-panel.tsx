'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { useToast } from '@/components/ui/toast';
import { getClinicalAudit, runClinicalAudit } from '@/lib/api/endpoints';
import type { ClinicalAuditResult } from '@/lib/api/types';

export function AuditPanel({ caseId }: { caseId: string }) {
  const notify = useToast();
  const [audit, setAudit] = useState<ClinicalAuditResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    getClinicalAudit(caseId)
      .then(setAudit)
      .catch((err) => notify((err as Error).message, 'bad'))
      .finally(() => setLoading(false));
  }, [caseId, notify]);

  async function handleRerun() {
    setRunning(true);
    try {
      const res = await runClinicalAudit(caseId);
      setAudit(res);
      notify('Hospital clinical audit re-computed.', 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setRunning(false);
    }
  }

  const scoreTone = (val: number): 'ok' | 'warn' | 'bad' => {
    if (val >= 80) return 'ok';
    if (val >= 50) return 'warn';
    return 'bad';
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Hospital Clinical Audit & Record Completeness</h2>
          <p className="text-xs text-muted-foreground">
            Audit medical record completeness, review nursing chart observation consistency, analyze adverse event documentation, and verify against standard clinical protocols.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRerun} disabled={running}>
          {running ? 'Evaluating Guidelines...' : 'Re-run Clinical Audit'}
        </Button>
      </div>

      {loading ? (
        <Card className="text-center py-12 text-sm text-muted-foreground">Evaluating clinical documentation...</Card>
      ) : !audit ? (
        <Card className="text-center py-12 space-y-2">
          <p className="text-sm text-muted-foreground">No audit data generated yet.</p>
          <Button size="sm" onClick={handleRerun}>Run Clinical Audit</Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Audit Score Gauges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Medical Record Completeness</span>
                <div className="text-3xl font-bold text-foreground mt-1">{audit.completeness_score}%</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Based on expected documentation for this specialty (NMC / NABH standards).
                </p>
              </div>
              <Pill tone={scoreTone(audit.completeness_score)}>
                {audit.completeness_score >= 80 ? 'SATISFACTORY' : (audit.completeness_score >= 50 ? 'NEEDS ATTENTION' : 'DEFICIENT')}
              </Pill>
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Nursing Observation Consistency</span>
                <div className="text-3xl font-bold text-foreground mt-1">{audit.nursing_consistency_score}%</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Interval regularity of vitals and round-the-clock medication charting.
                </p>
              </div>
              <Pill tone={scoreTone(audit.nursing_consistency_score)}>
                {audit.nursing_consistency_score >= 80 ? 'HIGH REGULARITY' : 'MONITORING GAPS'}
              </Pill>
            </Card>
          </div>

          {/* Missing Core Observations */}
          <Card className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Standard Clinical Observation Checks</h3>
            {audit.missing_observations && audit.missing_observations.length > 0 ? (
              <ul className="space-y-1.5 pt-1">
                {audit.missing_observations.map((item, idx) => (
                  <li key={idx} className="text-xs text-bad flex items-start gap-1.5">
                    <span>⚠️</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ok flex items-center gap-1.5 pt-1">
                <span>✓</span> All standard vital sign parameters (BP, Pulse, Temperature, SpO2) are charted.
              </p>
            )}
          </Card>

          {/* Adverse Events Analysis */}
          <Card className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Adverse Event & Complication Documentation</h3>
            {audit.adverse_events && audit.adverse_events.length > 0 ? (
              <ul className="space-y-1.5 pt-1">
                {audit.adverse_events.map((item, idx) => (
                  <li key={idx} className="text-xs text-foreground bg-muted p-2 rounded flex items-start gap-2">
                    <span className="text-bad">🚨</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground pt-1">
                No acute adverse events, cardiac arrests, or documented falls identified in hospital records.
              </p>
            )}
          </Card>

          {/* Full Audit Report */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Hospital Audit Compliance Report</h3>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                Print Audit Report
              </Button>
            </div>
            <pre className="text-xs text-muted-foreground bg-muted p-4 rounded-lg whitespace-pre-wrap font-mono leading-relaxed">
              {audit.audit_report_md}
            </pre>
          </Card>
        </div>
      )}
    </div>
  );
}
