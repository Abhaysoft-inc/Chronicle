'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { updateCaseMetadata, updateCaseStatus } from '@/lib/api/endpoints';
import type { CaseDetail, CaseMetadata } from '@/lib/api/types';

export function MetadataModal({
  caseDetail,
  onClose,
  onUpdated,
}: {
  caseDetail: CaseDetail;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const notify = useToast();
  const meta = caseDetail.metadata;
  const c = caseDetail.case;

  const [patientName, setPatientName] = useState(meta?.patient_name ?? '');
  const [patientAge, setPatientAge] = useState(meta?.patient_age ? String(meta.patient_age) : '');
  const [patientGender, setPatientGender] = useState(meta?.patient_gender ?? 'male');
  const [hospitalName, setHospitalName] = useState(meta?.hospital_name ?? '');
  const [priority, setPriority] = useState<string>(meta?.priority ?? 'medium');
  const [incidentDate, setIncidentDate] = useState(meta?.incident_date ?? '');
  const [admissionDate, setAdmissionDate] = useState(meta?.admission_date ?? '');
  const [dischargeDate, setDischargeDate] = useState(meta?.discharge_date ?? '');
  const [status, setStatus] = useState<string>(c.status);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateCaseMetadata(c.id, {
        patient_name: patientName.trim() || undefined,
        patient_age: patientAge ? Number(patientAge) : undefined,
        patient_gender: patientGender,
        hospital_name: hospitalName.trim() || undefined,
        priority: priority as any,
        incident_date: incidentDate.trim() || undefined,
        admission_date: admissionDate.trim() || undefined,
        discharge_date: dischargeDate.trim() || undefined,
      });

      if (status !== c.status) {
        await updateCaseStatus(c.id, status);
      }

      notify('Case metadata updated successfully.', 'ok');
      onUpdated();
      onClose();
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="font-semibold text-base text-foreground">
            Edit Patient & Case Metadata
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Patient Name</label>
            <input
              type="text"
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
              placeholder="e.g. Ramesh Kumar"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Age</label>
              <input
                type="number"
                className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
                placeholder="Years"
                value={patientAge}
                onChange={(e) => setPatientAge(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Gender</label>
              <select
                className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
                value={patientGender}
                onChange={(e) => setPatientGender(e.target.value)}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-foreground">Hospital / Facility Name</label>
            <input
              type="text"
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
              placeholder="e.g. Apollo Multi-Speciality Hospital, New Delhi"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Case Status Tracking</label>
            <select
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="created">New / Created</option>
              <option value="processing">Processing</option>
              <option value="under_review">Under Review</option>
              <option value="completed">Completed / Signed Off</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Priority</label>
            <select
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Incident / Surgery Date</label>
            <input
              type="text"
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
              placeholder="DD/MM/YYYY"
              value={incidentDate}
              onChange={(e) => setIncidentDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Admission Date</label>
            <input
              type="text"
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
              placeholder="DD/MM/YYYY"
              value={admissionDate}
              onChange={(e) => setAdmissionDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Discharge Date</label>
            <input
              type="text"
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
              placeholder="DD/MM/YYYY"
              value={dischargeDate}
              onChange={(e) => setDischargeDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Metadata'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
