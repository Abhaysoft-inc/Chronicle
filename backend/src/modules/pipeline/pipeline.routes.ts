import { Router } from 'express';
import type { Ctx } from '../../core/context.ts';
import { requireCase } from '../../core/db/lookups.ts';
import { caseOwner } from '../../core/http/ownership.ts';
import { subscribeProgress } from './pipeline.events.ts';
import { getProgress, getSnapshot, startPipeline } from './pipeline.runner.ts';

export function pipelineRouter(ctx: Ctx): Router {
  const r = Router();
  r.param('caseId', caseOwner(ctx));

  // Start (or resume) processing. Returns immediately; poll GET .../pipeline for progress.
  r.post('/cases/:caseId/process', (req, res) => {
    const caseId = String(req.params.caseId);
    const started = startPipeline(ctx, caseId);
    res.status(202).json({ started, alreadyRunning: !started, stages: getProgress(ctx, caseId) });
  });

  r.get('/cases/:caseId/pipeline', (req, res) => {
    const caseId = String(req.params.caseId);
    const c = requireCase(ctx.db, caseId);
    res.json({ status: c.status, stages: getProgress(ctx, caseId) });
  });

  // Live progress over Server-Sent Events. First message is a full "snapshot" (so late joiners,
  // reconnects and server restarts all start from the truth), then one "update" per change.
  r.get('/cases/:caseId/stream', (req, res) => {
    const caseId = String(req.params.caseId);
    requireCase(ctx.db, caseId); // 404 as normal JSON before the stream starts

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // tell nginx-style proxies not to buffer the stream
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.write('retry: 3000\n\n'); // browser reconnect delay
    send('snapshot', getSnapshot(ctx, caseId));

    const unsubscribe = subscribeProgress(caseId, (s) => send('update', s));
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000); // keeps idle connections open
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return r;
}
