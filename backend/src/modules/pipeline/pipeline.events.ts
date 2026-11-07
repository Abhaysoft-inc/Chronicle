import { EventEmitter } from 'node:events';

// In-process pub/sub for pipeline progress. The pipeline runs inside this one server process,
// so a plain EventEmitter is enough. (Several server processes would need Redis or similar.)
// Progress itself is persisted in SQLite, so a client that connects late, reconnects, or
// outlives a server restart can always be sent the CURRENT state first. No events are "lost".

export interface ProgressStage {
  stage: string;
  status: string;
  progress: string | null;
  error: string | null;
  updated_at: string | null;
}

export interface ProgressSnapshot {
  status: string;
  stages: ProgressStage[];
}

const bus = new EventEmitter();
bus.setMaxListeners(0); // many browser tabs may watch the same case

export function publishProgress(caseId: string, snapshot: ProgressSnapshot): void {
  bus.emit(caseId, snapshot);
}

/** Listen to one case. Returns an unsubscribe function. */
export function subscribeProgress(caseId: string, fn: (s: ProgressSnapshot) => void): () => void {
  bus.on(caseId, fn);
  return () => bus.off(caseId, fn);
}
