import { request, requestBlob } from './client';
import type {
  AuthUser, Brief, CaseDetail, CaseSummary, DashboardData, Finding, FindingsData, FindingStatus, MeResult, PageData, PipelineSnapshot, PipelineStage, Timeline, UploadResult,
} from './types';

// One function per backend endpoint. Components never build URLs themselves.

export const listCases = () => request<{ cases: CaseSummary[] }>('/cases').then((r) => r.cases);

export const createCase = (input: { title: string; case_type: string; output_language: string }) =>
  request<{ case: CaseSummary }>('/cases', { method: 'POST', json: input }).then((r) => r.case);

export const getCase = (id: string) => request<CaseDetail>(`/cases/${id}`);

export const uploadDocuments = (caseId: string, files: File[], language: string) => {
  const form = new FormData();
  for (const f of files) form.append('files', f, f.name);
  if (language) form.append('language', language);
  return request<UploadResult>(`/cases/${caseId}/documents`, { method: 'POST', form });
};

export const startProcessing = (caseId: string) =>
  request<{ started: boolean; alreadyRunning: boolean; stages: PipelineStage[] }>(`/cases/${caseId}/process`, { method: 'POST' });

export const getPipeline = (caseId: string) => request<PipelineSnapshot>(`/cases/${caseId}/pipeline`);

export const getTimeline = (caseId: string) => request<Timeline>(`/cases/${caseId}/timeline`);

export const patchEvent = (
  eventId: string,
  body: { review_status?: 'confirmed' | 'rejected' | 'unreviewed'; corrections?: { summary_en?: string; raw_date?: string | null } },
) => request<{ id: string; review_status: string }>(`/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', json: body });

export const getPage = (documentId: string, page: number) => request<PageData>(`/documents/${documentId}/pages/${page}`);

export const getOriginalFile = (documentId: string, signal?: AbortSignal) => requestBlob(`/documents/${documentId}/file`, signal);

// ---- accounts and dashboard ----

export const getMe = () => request<MeResult>('/auth/me');

export const signUp = (input: { name: string; email: string; password: string }) =>
  request<{ user: AuthUser }>('/auth/signup', { method: 'POST', json: input }).then((r) => r.user);

export const signIn = (input: { email: string; password: string }) =>
  request<{ user: AuthUser }>('/auth/login', { method: 'POST', json: input }).then((r) => r.user);

export const signOut = () => request<{ ok: boolean }>('/auth/logout', { method: 'POST', json: {} });

export const getDashboard = () => request<DashboardData>('/dashboard');

// ---- findings and brief ----

export const getFindings = (caseId: string) => request<FindingsData>(`/cases/${caseId}/findings`);

export const patchFinding = (findingId: string, status: FindingStatus) =>
  request<Finding>(`/findings/${encodeURIComponent(findingId)}`, { method: 'PATCH', json: { status } });

export const getBrief = (caseId: string) => request<{ brief: Brief }>(`/cases/${caseId}/brief`).then((r) => r.brief);

export const getBriefMarkdown = (caseId: string) => requestBlob(`/cases/${caseId}/brief?format=md`);

