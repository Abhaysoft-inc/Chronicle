'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { useToast } from '@/components/ui/toast';
import { getChecklist, patchChecklistItem } from '@/lib/api/endpoints';
import type { ChecklistItem } from '@/lib/api/types';

export function ChecklistPanel({ caseId }: { caseId: string }) {
  const notify = useToast();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [newStatus, setNewStatus] = useState<string>('requested');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getChecklist(caseId)
      .then(setItems)
      .catch((err) => notify((err as Error).message, 'bad'))
      .finally(() => setLoading(false));
  }, [caseId, notify]);

  async function handleSaveStatus() {
    if (!editingItem) return;
    setSaving(true);
    try {
      const updated = await patchChecklistItem(caseId, editingItem.doc_type, {
        status: newStatus,
        note: note.trim() || undefined,
      });
      setItems(updated);
      setEditingItem(null);
      notify(`Updated ${editingItem.doc_type} status to ${newStatus}.`, 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setSaving(false);
    }
  }

  const formatDocType = (dt: string) =>
    dt.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const statusTone = (status: string): 'ok' | 'bad' | 'warn' | 'neutral' => {
    switch (status) {
      case 'present': return 'ok';
      case 'received': return 'ok';
      case 'missing': return 'bad';
      case 'requested': return 'warn';
      case 'unavailable': return 'neutral';
      default: return 'neutral';
    }
  };

  const presentCount = items.filter((i) => i.status === 'present' || i.status === 'received').length;
  const missingCount = items.filter((i) => i.status === 'missing' || i.status === 'requested').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Missing Records & Documentation Gap Analysis</h2>
          <p className="text-xs text-muted-foreground">
            Audit expected medical records by case type, identify gaps in nursing & consent records, and track document requests.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="ok">{presentCount} Present</Pill>
          <Pill tone="bad">{missingCount} Missing / Action Required</Pill>
        </div>
      </div>

      {loading ? (
        <Card className="text-center py-12 text-sm text-muted-foreground">Loading record checklist...</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <Card key={item.doc_type} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">{formatDocType(item.doc_type)}</span>
                    <Pill tone={statusTone(item.status)}>{item.status.toUpperCase()}</Pill>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{item.reason}</p>
                </div>
                {item.status !== 'present' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingItem(item);
                      setNewStatus(item.status === 'missing' ? 'requested' : item.status);
                      setNote(item.note ?? '');
                    }}
                  >
                    Update Status
                  </Button>
                )}
              </div>

              {item.found_on && item.found_on.length > 0 && (
                <div className="text-xs bg-muted/60 rounded p-2 flex flex-col gap-1">
                  <span className="font-medium text-foreground">Verified Document Presence:</span>
                  {item.found_on.map((f, i) => (
                    <span key={i} className="text-muted-foreground">
                      • {f.filename} (Page{f.pages.length > 1 ? 's' : ''}: {f.pages.join(', ')})
                    </span>
                  ))}
                </div>
              )}

              {item.note && (
                <div className="text-xs text-muted-foreground border-l-2 border-accent pl-2 mt-1">
                  <strong>Investigator Note:</strong> {item.note}
                  {item.updated_by_name && ` (by ${item.updated_by_name})`}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-semibold text-base text-foreground">
              Update Document: {formatDocType(editingItem.doc_type)}
            </h3>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Document Status</label>
              <select
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                <option value="missing">Missing (Unreceived)</option>
                <option value="requested">Requested from Hospital / Authority</option>
                <option value="received">Received (Ready for Upload)</option>
                <option value="unavailable">Confirmed Unavailable / Non-Existent</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Investigator Note / Reference</label>
              <textarea
                className="w-full bg-background border border-border rounded-md p-2.5 text-sm text-foreground focus:ring-1 focus:ring-accent"
                rows={3}
                placeholder="e.g. Formal notice sent to Medical Superintendent on 12-Nov..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditingItem(null)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveStatus} disabled={saving}>
                {saving ? 'Saving...' : 'Save Status'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
