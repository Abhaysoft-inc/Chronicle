'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { useToast } from '@/components/ui/toast';
import { BriefPanel } from '@/features/brief/brief-panel';
import { DocumentsTable } from '@/features/documents/documents-table';
import { UploadPanel } from '@/features/documents/upload-panel';
import { FindingsPanel } from '@/features/findings/findings-panel';
import { PageIssues } from '@/features/pipeline/page-issues';
import { PipelinePanel } from '@/features/pipeline/pipeline-panel';
import { usePipelineStream } from '@/features/pipeline/use-pipeline-stream';
import { TimelinePanel } from '@/features/timeline/timeline-panel';
import { PageViewer } from '@/features/viewer/page-viewer';
import type { ViewerTarget } from '@/features/viewer/types';
import { getBrief, getCase, getFindings, getTimeline, startProcessing } from '@/lib/api/endpoints';
import { caseStatusTone, humanize } from '@/lib/format';
import { useLoader } from '@/lib/hooks/use-loader';
import { languageName } from '@/lib/languages';
import { WorkspaceSkeleton } from './workspace-skeleton';

type Tab = 'documents' | 'timeline' | 'findings' | 'brief' | 'viewer';

export function CaseWorkspace({ caseId }: { caseId: string }) {
  const notify = useToast();
  const detail = useLoader(caseId, () => getCase(caseId));
  const timeline = useLoader(caseId, () => getTimeline(caseId));
  const findings = useLoader(caseId, () => getFindings(caseId));
  const brief = useLoader(caseId, () => getBrief(caseId));
  const [tab, setTab] = useState<Tab>('documents');
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const [starting, setStarting] = useState(false);

  const { reload: reloadDetail } = detail;
  const { reload: reloadTimeline } = timeline;
  const { reload: reloadFindings } = findings;
  const { reload: reloadBrief } = brief;

  const reloadAll = useCallback(() => {
    reloadDetail();
    reloadTimeline();
    reloadFindings();
    reloadBrief();
  }, [reloadDetail, reloadTimeline, reloadFindings, reloadBrief]);

  // Live progress. When a run finishes, reload everything it produced.
  const { snapshot, mode } = usePipelineStream(caseId, (finalStatus) => {
    reloadAll();
    if (finalStatus === 'failed') notify('Processing failed. The red stage below says why.', 'bad');
    else notify(finalStatus === 'processed_with_warnings' ? 'Processing finished, with some pages not read.' : 'Processing finished.', finalStatus === 'processed' ? 'ok' : 'info');
  });

  if (detail.error) {
    return (
      <div className="flex flex-col gap-3">
        {/* Retrying a 404 cannot help, so only offer it for other failures. */}
        <ErrorNote error={detail.error} onRetry={(detail.error as { status?: number }).status === 404 ? undefined : detail.reload} />
        <Link href="/cases" className="text-sm text-accent underline">Back to all cases</Link>
      </div>
    );
  }
  if (!detail.data) return <WorkspaceSkeleton />;

  const { case: c, documents, page_issues, events } = detail.data;
  const stages = snapshot?.stages ?? detail.data.pipeline;
  const status = snapshot?.status ?? c.status;
  const running = status === 'processing';

  async function process() {
    setStarting(true);
    try {
      const r = await startProcessing(caseId);
      if (r.alreadyRunning) notify('Already processing.', 'info');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setStarting(false);
    }
  }

  const show = (t: ViewerTarget) => {
    setViewer(t);
    setTab('viewer');
  };

  const findingsCount = findings.data?.summary.total;

  const TABS: [Tab, string][] = [
    ['documents', `Documents & processing`],
    ['timeline', `Timeline${events.total ? ` (${events.total})` : ''}`],
    ['findings', `Findings${findingsCount !== undefined && findingsCount > 0 ? ` (${findingsCount})` : ''}`],
    ['brief', 'Expert Brief'],
    ['viewer', 'Page viewer'],
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* One compact row: breadcrumb, title, status, and the facts. Vertical space is precious on the review screen. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href="/cases" className="text-sm text-muted hover:text-fg">Cases</Link>
        <span className="text-muted" aria-hidden="true">/</span>
        <h1 className="text-lg font-semibold tracking-tight">{c.title}</h1>
        <Pill tone={caseStatusTone(status)}>{humanize(status)}</Pill>
        <p className="text-xs text-muted sm:ml-auto">
          {humanize(c.case_type)} · brief in {languageName(c.output_language)} · {documents.length} document{documents.length === 1 ? '' : 's'}
        </p>
      </div>

      <div role="tablist" aria-label="Case sections" className="flex gap-1 border-b border-line">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'documents' && (
        <div className="flex flex-col gap-5">
          <Card title="Upload records" description="Add every document for this case: notes, prescriptions, nursing charts, lab reports.">
            <UploadPanel caseId={caseId} onUploaded={reloadAll} />
          </Card>
          <Card title={`Documents (${documents.length})`}>
            <DocumentsTable documents={documents} onView={(id) => show({ documentId: id, page: 1, blockIds: [] })} />
          </Card>
          <Card title="Processing" description="Read the pages, find events, check quotes, flag care deviations, and compile expert brief.">
            <div className="flex flex-col gap-4">
              <PipelinePanel stages={stages} running={running} hasDocuments={documents.length > 0} mode={mode} starting={starting} onProcess={process} />
              <PageIssues issues={page_issues} documents={documents} onView={(id, page) => show({ documentId: id, page, blockIds: [] })} />
              {!running && events.total > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ok/30 bg-ok-bg px-3 py-2 text-sm text-ok">
                  <span>{events.total} events found{events.unverified > 0 ? `, ${events.unverified} need checking` : ', all verified'}.</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setTab('timeline')}>View timeline</Button>
                    {findingsCount !== undefined && findingsCount > 0 && (
                      <Button size="sm" variant="secondary" onClick={() => setTab('findings')}>View findings ({findingsCount})</Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === 'timeline' && (
        <TimelinePanel
          caseId={caseId}
          timeline={timeline.data}
          loading={timeline.loading}
          error={timeline.error}
          documents={documents}
          onChanged={reloadAll}
          onRetry={timeline.reload}
        />
      )}

      {tab === 'findings' && (
        findings.loading && !findings.data ? (
          <Card className="p-8 text-center text-sm text-muted">Analyzing clinical records for care deviations and missing documents...</Card>
        ) : findings.error ? (
          <ErrorNote error={findings.error} onRetry={findings.reload} />
        ) : findings.data ? (
          <FindingsPanel
            findingsData={findings.data}
            onRefresh={reloadAll}
            onSelectEvent={() => setTab('timeline')}
          />
        ) : null
      )}

      {tab === 'brief' && (
        brief.loading && !brief.data ? (
          <Card className="p-8 text-center text-sm text-muted">Compiling expert brief...</Card>
        ) : brief.error ? (
          <ErrorNote error={brief.error} onRetry={brief.reload} />
        ) : brief.data ? (
          <BriefPanel
            brief={brief.data}
            caseId={caseId}
            onRegenerate={async () => {
              await brief.reload();
            }}
          />
        ) : null
      )}

      {tab === 'viewer' && <PageViewer documents={documents} value={viewer} onChange={setViewer} />}
    </div>
  );
}
