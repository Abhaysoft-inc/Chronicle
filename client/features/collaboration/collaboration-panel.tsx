'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { useToast } from '@/components/ui/toast';
import { addComment, assignCase, getActivities, getComments, removeAssignment } from '@/lib/api/endpoints';
import type { ActivityLogItem, CaseAssignment, CaseComment } from '@/lib/api/types';

export function CollaborationPanel({
  caseId,
  initialAssignments = [],
}: {
  caseId: string;
  initialAssignments?: CaseAssignment[];
}) {
  const notify = useToast();
  const [assignments, setAssignments] = useState<CaseAssignment[]>(initialAssignments);
  const [activities, setActivities] = useState<ActivityLogItem[]>([]);
  const [comments, setComments] = useState<CaseComment[]>([]);
  const [loading, setLoading] = useState(true);

  // New comment input
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Assignment modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [assigneeRole, setAssigneeRole] = useState<'lawyer' | 'expert' | 'investigator'>('expert');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    Promise.all([getActivities(caseId), getComments(caseId)])
      .then(([actList, cmtList]) => {
        setActivities(actList);
        setComments(cmtList);
      })
      .catch((err) => notify((err as Error).message, 'bad'))
      .finally(() => setLoading(false));
  }, [caseId, notify]);

  async function handleAddComment() {
    if (!newComment.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const added = await addComment(caseId, 'case', caseId, newComment.trim());
      setComments((prev) => [...prev, added]);
      setNewComment('');
      notify('Comment posted.', 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleAssignUser() {
    if (!assigneeId.trim()) return;
    setAssigning(true);
    try {
      const res = await assignCase(caseId, assigneeId.trim(), assigneeRole);
      setAssignments(res.assignments);
      setShowAssignModal(false);
      setAssigneeId('');
      notify('Collaborator assigned to case.', 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemoveAssignee(userId: string) {
    if (!confirm('Remove this collaborator from the case?')) return;
    try {
      const res = await removeAssignment(caseId, userId);
      setAssignments(res.assignments);
      notify('Collaborator removed.', 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Case Collaboration & Audit Trail</h2>
          <p className="text-xs text-muted-foreground">
            Manage assigned lawyers, investigators, and medical experts. Track comments, review responsibilities, and immutable activity logs.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAssignModal(true)}>
          + Assign Team Member
        </Button>
      </div>

      {/* Collaborators List */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Assigned Team Members ({assignments.length})</h3>
        {assignments.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No external lawyers or medical experts assigned yet. Assign a team member to collaborate securely.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {assignments.map((a) => (
              <div key={a.id} className="p-3 bg-muted/60 border border-border rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm text-foreground">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.email}</div>
                  <Pill tone="info" className="mt-1">{a.role.toUpperCase()}</Pill>
                </div>
                <button
                  onClick={() => handleRemoveAssignee(a.user_id)}
                  className="text-xs text-muted-foreground hover:text-bad"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Grid: Comments Thread & Activity Log */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Comments Thread */}
        <Card className="p-4 flex flex-col h-[480px]">
          <h3 className="text-sm font-semibold text-foreground mb-3">Case Notes & Comments</h3>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {comments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">No comments posted yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="bg-muted p-2.5 rounded-lg text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-foreground">{c.user_name}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-foreground leading-relaxed">{c.content}</p>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-border flex gap-2">
            <input
              type="text"
              className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground"
              placeholder="Add a case note or observation..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddComment();
              }}
            />
            <Button size="sm" onClick={handleAddComment} disabled={submittingComment || !newComment.trim()}>
              Post
            </Button>
          </div>
        </Card>

        {/* Activity & Audit Trail */}
        <Card className="p-4 flex flex-col h-[480px]">
          <h3 className="text-sm font-semibold text-foreground mb-3">Activity & Audit Log</h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-10">Loading activity...</p>
            ) : activities.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">No activities recorded yet.</p>
            ) : (
              activities.map((act) => (
                <div key={act.id} className="text-xs p-2 rounded border border-border/60 bg-card space-y-0.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="font-medium text-accent">{act.action.replace(/_/g, ' ').toUpperCase()}</span>
                    <span className="text-muted-foreground">{new Date(act.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="text-foreground">{act.user_name ? `${act.user_name}: ` : ''}{JSON.stringify(act.details)}</div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-semibold text-base text-foreground">Assign Collaborator to Case</h3>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Collaborator User ID or Email</label>
              <input
                type="text"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                placeholder="Enter user id (e.g. u_...)"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Role</label>
              <select
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                value={assigneeRole}
                onChange={(e) => setAssigneeRole(e.target.value as any)}
              >
                <option value="expert">Medical Expert</option>
                <option value="lawyer">Co-Counsel / Lawyer</option>
                <option value="investigator">Investigator</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowAssignModal(false)} disabled={assigning}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAssignUser} disabled={assigning || !assigneeId.trim()}>
                {assigning ? 'Assigning...' : 'Assign'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
