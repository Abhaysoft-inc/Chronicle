import { request, requestBlob } from './client';
import type {
  ActivityLogItem,
  ApiKeyItem,
  AudioRecord,
  AuthUser,
  Brief,
  CaseAssignment,
  CaseComment,
  CaseDetail,
  CaseMetadata,
  CaseSummary,
  ChecklistItem,
  ClinicalAuditResult,
  CopilotMessage,
  DashboardData,
  ExpertProfile,
  Finding,
  FindingsData,
  FindingSeverity,
  FindingStatus,
  InsuranceClaimResult,
  MeResult,
  OrganizationInfo,
  PageData,
  PendingReviews,
  PipelineSnapshot,
  PipelineStage,
  ReviewRequest,
  Timeline,
  TimelineEvent,
  UploadResult,
  UsageAnalytics,
} from './types';

// One function per backend endpoint. Components never build URLs themselves.

export const listCases = () => request<{ cases: CaseSummary[] }>('/cases').then((r) => r.cases);

export const createCase = (input: {
  title: string;
  case_type: string;
  output_language: string;
  patient_name?: string;
  patient_age?: number;
  patient_gender?: string;
  hospital_name?: string;
  priority?: string;
}) => request<{ case: CaseSummary }>('/cases', { method: 'POST', json: input }).then((r) => r.case);

export const getCase = (id: string) => request<CaseDetail>(`/cases/${id}`);

export const updateCaseMetadata = (caseId: string, metadata: Partial<CaseMetadata>) =>
  request<{ metadata: CaseMetadata }>(`/cases/${caseId}/metadata`, { method: 'PATCH', json: metadata });

export const updateCaseStatus = (caseId: string, status: string) =>
  request<{ id: string; status: string }>(`/cases/${caseId}/status`, { method: 'PATCH', json: { status } });

export const assignCase = (caseId: string, userId: string, role: string) =>
  request<{ assignments: CaseAssignment[] }>(`/cases/${caseId}/assign`, { method: 'POST', json: { user_id: userId, role } });

export const removeAssignment = (caseId: string, userId: string) =>
  request<{ assignments: CaseAssignment[] }>(`/cases/${caseId}/assignments/${userId}`, { method: 'DELETE' });

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

export const addEvent = (caseId: string, input: { type: string; summary_en: string; raw_date: string | null; actor_role: string | null }) =>
  request<TimelineEvent>(`/cases/${caseId}/events`, { method: 'POST', json: input });

export const getPage = (documentId: string, page: number) => request<PageData>(`/documents/${documentId}/pages/${page}`);

export const getOriginalFile = (documentId: string, signal?: AbortSignal) => requestBlob(`/documents/${documentId}/file`, signal);

// ---- accounts and dashboard ----

export const getMe = () => request<MeResult>('/auth/me');

export const signUp = (input: { name: string; email: string; password: string; role?: string; specialty?: string }) =>
  request<{ user: AuthUser }>('/auth/signup', { method: 'POST', json: input }).then((r) => r.user);

export const signIn = (input: { email: string; password: string }) =>
  request<{ user: AuthUser }>('/auth/login', { method: 'POST', json: input }).then((r) => r.user);

export const signOut = () => request<{ ok: boolean }>('/auth/logout', { method: 'POST', json: {} });

export const getDashboard = () => request<DashboardData>('/dashboard');

// ---- findings and brief ----

export const getFindings = (caseId: string) => request<FindingsData>(`/cases/${caseId}/findings`);

export const patchFinding = (
  findingId: string,
  status: FindingStatus,
  note?: string,
  edit?: { title?: string; explanation?: string; severity?: FindingSeverity },
) => request<Finding>(`/findings/${encodeURIComponent(findingId)}`, { method: 'PATCH', json: { status, note, edit } });

export const createFinding = (
  caseId: string,
  input: {
    category: string;
    severity: string;
    title: string;
    explanation: string;
    question_for_expert?: string;
    evidence_event_ids?: string[];
  },
) => request<{ finding: Finding }>(`/cases/${caseId}/findings`, { method: 'POST', json: input });

export const getBrief = (caseId: string) => request<{ brief: Brief }>(`/cases/${caseId}/brief`).then((r) => r.brief);

export const getBriefMarkdown = (caseId: string) => requestBlob(`/cases/${caseId}/brief?format=md`);
export const getBriefDocx = (caseId: string) => requestBlob(`/cases/${caseId}/brief?format=docx`);
export const getBriefHtml = (caseId: string) => requestBlob(`/cases/${caseId}/brief?format=html`);

// ---- missing records checklist ----

export const getChecklist = (caseId: string) =>
  request<{ items: ChecklistItem[] }>(`/cases/${caseId}/checklist`).then((r) => r.items);

export const patchChecklistItem = (caseId: string, docType: string, input: { status: string; note?: string }) =>
  request<{ items: ChecklistItem[] }>(`/cases/${caseId}/checklist/${docType}`, { method: 'PATCH', json: input }).then((r) => r.items);

// ---- AI Copilot ----

export const askCopilot = (caseId: string, question: string) =>
  request<{ message: CopilotMessage }>(`/cases/${caseId}/copilot/ask`, { method: 'POST', json: { question } }).then((r) => r.message);

export const getCopilotHistory = (caseId: string) =>
  request<{ messages: CopilotMessage[] }>(`/cases/${caseId}/copilot/history`).then((r) => r.messages);

export const clearCopilotHistory = (caseId: string) =>
  request<{ ok: boolean }>(`/cases/${caseId}/copilot/history`, { method: 'DELETE' });

// ---- Voice & Audio Intelligence ----

export const uploadAudio = (caseId: string, file: File, languageCode = 'hi-IN') => {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('language_code', languageCode);
  return request<{ audio: AudioRecord }>(`/cases/${caseId}/audio`, { method: 'POST', form }).then((r) => r.audio);
};

export const listAudio = (caseId: string) =>
  request<{ audio_records: AudioRecord[] }>(`/cases/${caseId}/audio`).then((r) => r.audio_records);

export const convertAudioToEvent = (
  caseId: string,
  audioId: string,
  input: { statement_text: string; speaker: string; raw_date?: string; event_type: string },
) => request<{ event: TimelineEvent }>(`/cases/${caseId}/audio/${audioId}/to-event`, { method: 'POST', json: input }).then((r) => r.event);

export const getVoiceSummary = (caseId: string, targetLang = 'hi-IN', speaker = 'meera') =>
  request<{ text: string; audioBase64: string }>(`/cases/${caseId}/voice-summary`, { method: 'POST', json: { target_lang: targetLang, speaker } });

// ---- Collaboration & Activity Logs ----

export const getActivities = (caseId: string) =>
  request<{ activities: ActivityLogItem[] }>(`/cases/${caseId}/activities`).then((r) => r.activities);

export const getComments = (caseId: string, targetType?: string, targetId?: string) => {
  const q = new URLSearchParams();
  if (targetType) q.set('target_type', targetType);
  if (targetId) q.set('target_id', targetId);
  return request<{ comments: CaseComment[] }>(`/cases/${caseId}/comments?${q.toString()}`).then((r) => r.comments);
};

export const addComment = (caseId: string, targetType: 'case' | 'finding' | 'event', targetId: string, content: string) =>
  request<{ comment: CaseComment }>(`/cases/${caseId}/comments`, {
    method: 'POST',
    json: { target_type: targetType, target_id: targetId, content },
  }).then((r) => r.comment);

export const getPendingReviews = (caseId: string) =>
  request<PendingReviews>(`/cases/${caseId}/pending-reviews`);

// ---- Expert Marketplace ----

export const listExperts = (specialty?: string, minExp?: number) => {
  const q = new URLSearchParams();
  if (specialty) q.set('specialty', specialty);
  if (minExp !== undefined) q.set('min_exp', String(minExp));
  return request<{ experts: ExpertProfile[] }>(`/marketplace/experts?${q.toString()}`).then((r) => r.experts);
};

export const getExpertProfile = (userId: string) =>
  request<{ expert: ExpertProfile }>(`/marketplace/experts/${userId}`).then((r) => r.expert);

export const saveExpertProfile = (input: { specialty: string; experience_years: number; medical_council_no?: string; fee_per_case: number; bio: string }) =>
  request<{ expert: ExpertProfile }>('/marketplace/profile', { method: 'POST', json: input }).then((r) => r.expert);

export const createReviewRequest = (input: { case_id: string; expert_id: string; fee?: number; scheduled_at?: string; notes?: string }) =>
  request<{ request: ReviewRequest }>('/marketplace/requests', { method: 'POST', json: input }).then((r) => r.request);

export const listReviewRequests = () =>
  request<{ requests: ReviewRequest[] }>('/marketplace/requests').then((r) => r.requests);

export const updateReviewRequest = (requestId: string, status: string, notes?: string) =>
  request<{ request: ReviewRequest }>(`/marketplace/requests/${requestId}`, { method: 'PATCH', json: { status, notes } }).then((r) => r.request);

// ---- Insurance Claim Intelligence ----

export const analyzeClaim = (
  caseId: string,
  input: {
    claim_no: string;
    policy_no?: string;
    insurer?: string;
    billed_amount: number;
    claimed_items: { item_name: string; amount: number; category: string }[];
  },
) => request<{ claim: InsuranceClaimResult }>(`/cases/${caseId}/insurance/analyze`, { method: 'POST', json: input }).then((r) => r.claim);

export const getClaim = (caseId: string) =>
  request<{ claim: InsuranceClaimResult | null }>(`/cases/${caseId}/insurance`).then((r) => r.claim);

export const updateClaimStatus = (caseId: string, status: string) =>
  request<{ claim: InsuranceClaimResult }>(`/cases/${caseId}/insurance/status`, { method: 'PATCH', json: { status } }).then((r) => r.claim);

// ---- Hospital Clinical Audit ----

export const getClinicalAudit = (caseId: string) =>
  request<{ audit: ClinicalAuditResult }>(`/cases/${caseId}/clinical-audit`).then((r) => r.audit);

export const runClinicalAudit = (caseId: string) =>
  request<{ audit: ClinicalAuditResult }>(`/cases/${caseId}/clinical-audit/run`, { method: 'POST' }).then((r) => r.audit);

// ---- Enterprise & SaaS Admin ----

export const getOrg = () => request<{ organization: OrganizationInfo }>('/admin/organization').then((r) => r.organization);

export const updateOrg = (input: { name?: string; plan?: string; quota_pages?: number }) =>
  request<{ organization: OrganizationInfo }>('/admin/organization', { method: 'PATCH', json: input }).then((r) => r.organization);

export const getUsage = () => request<UsageAnalytics>('/admin/usage');

export const listApiKeys = () => request<{ api_keys: ApiKeyItem[] }>('/admin/api-keys').then((r) => r.api_keys);

export const createApiKey = (name: string) =>
  request<{ key: string; apiKey: ApiKeyItem }>('/admin/api-keys', { method: 'POST', json: { name } });

export const revokeApiKey = (id: string) => request<{ ok: boolean }>(`/admin/api-keys/${id}`, { method: 'DELETE' });

export const purgeCase = (caseId: string) => request<{ success: boolean; purged_id: string }>(`/cases/${caseId}/purge`, { method: 'POST' });

export const exportCase = (caseId: string) => request<Record<string, unknown>>(`/cases/${caseId}/export`);


