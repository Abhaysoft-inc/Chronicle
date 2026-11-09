'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { getBriefDocx, getBriefHtml, getBriefMarkdown } from '@/lib/api/endpoints';
import type { Brief } from '@/lib/api/types';

export function BriefPanel({
  brief,
  caseId,
  onRegenerate,
}: {
  brief: Brief;
  caseId: string;
  onRegenerate: () => Promise<void>;
}) {
  const notify = useToast();
  const [downloading, setDownloading] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(brief.content_md);
      notify('Expert brief copied to clipboard as Markdown.', 'ok');
    } catch {
      notify('Failed to copy to clipboard.', 'bad');
    }
  }

  async function downloadMarkdown() {
    setDownloading(true);
    try {
      const blob = await getBriefMarkdown(caseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expert-brief-${caseId}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify('Brief downloaded successfully (.md).', 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setDownloading(false);
    }
  }

  async function downloadDocx() {
    setDownloadingDocx(true);
    try {
      const blob = await getBriefDocx(caseId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expert-brief-${caseId}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify('Word Document downloaded successfully (.docx).', 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setDownloadingDocx(false);
    }
  }

  async function openPrintableHtml() {
    try {
      const blob = await getBriefHtml(caseId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      notify((err as Error).message, 'bad');
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await onRegenerate();
      notify('Expert brief regenerated from updated timeline and findings.', 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top action toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{brief.title}</h2>
          <p className="text-xs text-muted">
            Target Language: {brief.output_language} · Last updated: {new Date(brief.updated_at).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" loading={regenerating} onClick={handleRegenerate}>
            Regenerate
          </Button>
          <Button variant="secondary" size="sm" onClick={copyMarkdown}>
            Copy MD
          </Button>
          <Button variant="secondary" size="sm" onClick={openPrintableHtml}>
            Print / PDF
          </Button>
          <Button variant="secondary" size="sm" loading={downloadingDocx} onClick={downloadDocx}>
            Export .docx
          </Button>
          <Button variant="primary" size="sm" loading={downloading} onClick={downloadMarkdown}>
            Export .md
          </Button>
        </div>
      </div>

      {/* Structured Sections */}
      <div className="flex flex-col gap-4">
        {/* Section 1: Snapshot */}
        <Card className="flex flex-col gap-2 p-5">
          <div className="border-b border-line pb-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-accent">1. Case Snapshot</h3>
          </div>
          <div className="prose prose-sm max-w-none text-fg/90">
            <div className="whitespace-pre-line text-sm leading-relaxed">{brief.sections.snapshot}</div>
          </div>
        </Card>

        {/* Section 2: Records Reviewed */}
        <Card className="flex flex-col gap-2 p-5">
          <div className="border-b border-line pb-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-accent">2. Records Reviewed & Documentation Gaps</h3>
          </div>
          <div className="prose prose-sm max-w-none text-fg/90">
            <div className="whitespace-pre-line text-sm leading-relaxed">{brief.sections.records_reviewed}</div>
          </div>
        </Card>

        {/* Section 3: Sourced Chronology */}
        <Card className="flex flex-col gap-2 p-5">
          <div className="border-b border-line pb-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-accent">3. Key Sourced Chronology</h3>
          </div>
          <div className="prose prose-sm max-w-none text-fg/90">
            <div className="whitespace-pre-line text-sm leading-relaxed font-mono text-xs">{brief.sections.chronology}</div>
          </div>
        </Card>

        {/* Section 4: Issues for Opinion */}
        <Card className="flex flex-col gap-2 p-5 border-l-4 border-l-warn">
          <div className="border-b border-line pb-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-warn">4. Issues for Clinical & Legal Opinion</h3>
          </div>
          <div className="prose prose-sm max-w-none text-fg/90">
            <div className="whitespace-pre-line text-sm leading-relaxed">{brief.sections.issues_for_opinion}</div>
          </div>
        </Card>

        {/* Section 5: Questions for Expert */}
        <Card className="flex flex-col gap-2 p-5 border-l-4 border-l-accent">
          <div className="border-b border-line pb-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-accent">5. Questions for Independent Expert Review</h3>
          </div>
          <div className="prose prose-sm max-w-none text-fg/90">
            <div className="whitespace-pre-line text-sm leading-relaxed font-medium">{brief.sections.questions_for_expert}</div>
          </div>
        </Card>

        {/* Section 6: Limits of Analysis */}
        <Card className="flex flex-col gap-2 bg-surface-2/40 p-4 text-xs text-muted">
          <div className="font-semibold uppercase tracking-wider text-muted">6. Limits of Analysis</div>
          <div className="whitespace-pre-line leading-relaxed">{brief.sections.limits}</div>
        </Card>
      </div>
    </div>
  );
}
