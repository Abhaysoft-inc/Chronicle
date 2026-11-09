'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { useToast } from '@/components/ui/toast';
import {
  createReviewRequest,
  listCases,
  listExperts,
  listReviewRequests,
  updateReviewRequest,
} from '@/lib/api/endpoints';
import type { CaseSummary, ExpertProfile, ReviewRequest } from '@/lib/api/types';

export function MarketplaceView() {
  const notify = useToast();
  const [experts, setExperts] = useState<ExpertProfile[]>([]);
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSpecialty, setFilterSpecialty] = useState('');
  const [tab, setTab] = useState<'experts' | 'requests'>('experts');

  // Request Review Modal
  const [selectedExpert, setSelectedExpert] = useState<ExpertProfile | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([listExperts(), listReviewRequests(), listCases()])
      .then(([expList, reqList, caseList]) => {
        setExperts(expList);
        setRequests(reqList);
        setCases(caseList);
        if (caseList.length > 0) setSelectedCaseId(caseList[0].id);
      })
      .catch((err) => notify((err as Error).message, 'bad'))
      .finally(() => setLoading(false));
  }, [notify]);

  async function handleFilter(specialty: string) {
    setFilterSpecialty(specialty);
    setLoading(true);
    try {
      const filtered = await listExperts(specialty || undefined);
      setExperts(filtered);
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitReviewRequest() {
    if (!selectedExpert || !selectedCaseId) return;
    setSubmitting(true);
    try {
      const created = await createReviewRequest({
        case_id: selectedCaseId,
        expert_id: selectedExpert.user_id,
        fee: selectedExpert.fee_per_case,
        notes: requestNotes.trim() || undefined,
      });
      setRequests((prev) => [created, ...prev]);
      notify(`Review request submitted to ${selectedExpert.name}.`, 'ok');
      setSelectedExpert(null);
      setRequestNotes('');
      setTab('requests');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateRequestStatus(reqId: string, status: string) {
    try {
      const updated = await updateReviewRequest(reqId, status);
      setRequests((prev) => prev.map((r) => (r.id === reqId ? updated : r)));
      notify(`Request status updated to ${status}.`, 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    }
  }

  const SPECIALTIES = [
    'All Specialties',
    'General Surgery',
    'Cardiology',
    'Anaesthesiology',
    'Obstetrics & Gynaecology',
    'Orthopaedics',
    'Internal Medicine',
    'Forensic Medicine',
  ];

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto py-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">Medical Expert Marketplace</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verified medical specialists, forensic pathologists, and clinical reviewers for independent case opinion.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={tab === 'experts' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setTab('experts')}
          >
            Browse Specialists
          </Button>
          <Button
            variant={tab === 'requests' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setTab('requests')}
          >
            My Review Requests ({requests.length})
          </Button>
        </div>
      </div>

      {tab === 'experts' ? (
        <div className="flex flex-col gap-4">
          {/* Specialty Filter Pills */}
          <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
            {SPECIALTIES.map((spec) => {
              const val = spec === 'All Specialties' ? '' : spec;
              const active = filterSpecialty === val;
              return (
                <button
                  key={spec}
                  onClick={() => handleFilter(val)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    active
                      ? 'bg-accent text-accent-foreground border-accent font-semibold'
                      : 'bg-card text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {spec}
                </button>
              );
            })}
          </div>

          {loading ? (
            <Card className="text-center py-16 text-sm text-muted-foreground">Loading medical specialists...</Card>
          ) : experts.length === 0 ? (
            <Card className="text-center py-16 text-sm text-muted-foreground">
              No verified medical experts found matching this specialty.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {experts.map((exp) => (
                <Card key={exp.user_id} className="p-5 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-base text-foreground">{exp.name}</h3>
                        <p className="text-xs text-accent font-medium">{exp.specialty}</p>
                      </div>
                      <Pill tone="ok">★ {exp.rating.toFixed(1)}</Pill>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>• <strong>Experience:</strong> {exp.experience_years} years clinical practice</div>
                      {exp.medical_council_no && (
                        <div>• <strong>MCI / NMC Reg:</strong> {exp.medical_council_no}</div>
                      )}
                      <div>• <strong>Fee per Case:</strong> ₹{exp.fee_per_case.toLocaleString('en-IN')}</div>
                    </div>

                    <p className="text-xs text-foreground/80 line-clamp-3 leading-relaxed pt-1">
                      {exp.bio}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-border flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Verified Clinician</span>
                    <Button
                      size="sm"
                      onClick={() => setSelectedExpert(exp)}
                    >
                      Request Review
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Requests Tab */
        <div className="flex flex-col gap-3">
          {requests.length === 0 ? (
            <Card className="text-center py-16 text-sm text-muted-foreground">
              No review requests submitted yet. Browse specialists above to request a formal case opinion.
            </Card>
          ) : (
            requests.map((r) => (
              <Card key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">{r.case_title}</span>
                    <Pill tone={r.status === 'accepted' || r.status === 'completed' ? 'ok' : (r.status === 'declined' ? 'bad' : 'warn')}>
                      {r.status.toUpperCase()}
                    </Pill>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Expert: <strong>{r.expert_name}</strong> · Requester: {r.requester_name} · Fee: ₹{r.fee.toLocaleString('en-IN')} (incl. ₹{r.commission.toLocaleString('en-IN')} platform commission)
                  </div>
                  {r.notes && (
                    <div className="text-xs text-foreground italic">"{r.notes}"</div>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  {r.status === 'requested' && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => handleUpdateRequestStatus(r.id, 'accepted')}>
                        Accept (Assign)
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleUpdateRequestStatus(r.id, 'declined')}>
                        Decline
                      </Button>
                    </>
                  )}
                  {r.status === 'accepted' && (
                    <Button size="sm" onClick={() => handleUpdateRequestStatus(r.id, 'completed')}>
                      Mark Opinion Completed
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Request Review Modal */}
      {selectedExpert && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-semibold text-base text-foreground">
              Request Case Review: {selectedExpert.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              Specialty: {selectedExpert.specialty} · Experience: {selectedExpert.experience_years} years
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Select Case for Review</label>
              <select
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.case_type})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Instructions / Key Questions for Expert</label>
              <textarea
                className="w-full bg-background border border-border rounded-md p-2 text-sm text-foreground"
                rows={3}
                placeholder="e.g. Please examine the intra-operative vitals and whether antibiotic administration timing was appropriate..."
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
              />
            </div>

            <div className="p-3 bg-muted rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span>Expert Fee:</span>
                <span className="font-medium">₹{selectedExpert.fee_per_case.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Platform Commission (10%):</span>
                <span>₹{Math.round(selectedExpert.fee_per_case * 0.1).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-border/60 pt-1 text-foreground">
                <span>Total Consultation Amount:</span>
                <span>₹{selectedExpert.fee_per_case.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedExpert(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmitReviewRequest} disabled={submitting || !selectedCaseId}>
                {submitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
