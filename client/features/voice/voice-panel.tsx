'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { useToast } from '@/components/ui/toast';
import { convertAudioToEvent, getVoiceSummary, listAudio, uploadAudio } from '@/lib/api/endpoints';
import type { AudioRecord } from '@/lib/api/types';

export function VoicePanel({ caseId, onEventAdded }: { caseId: string; onEventAdded?: () => void }) {
  const notify = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [records, setRecords] = useState<AudioRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [voiceSummaryLoading, setVoiceSummaryLoading] = useState(false);
  const [voiceAudioUrl, setVoiceAudioUrl] = useState<string | null>(null);
  const [voiceSummaryText, setVoiceSummaryText] = useState<string | null>(null);

  // Statement to event conversion modal state
  const [convertingStatement, setConvertingStatement] = useState<{
    audioId: string;
    text: string;
    speaker: string;
  } | null>(null);
  const [eventType, setEventType] = useState('symptom_report');
  const [rawDate, setRawDate] = useState('');
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    listAudio(caseId)
      .then(setRecords)
      .catch((err) => notify((err as Error).message, 'bad'))
      .finally(() => setLoading(false));
  }, [caseId, notify]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const rec = await uploadAudio(caseId, file, 'hi-IN');
      setRecords((prev) => [rec, ...prev]);
      notify(`Audio "${file.name}" transcribed with Sarvam Saaras.`, 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleGenerateVoiceSummary() {
    setVoiceSummaryLoading(true);
    try {
      const res = await getVoiceSummary(caseId, 'hi-IN', 'meera');
      setVoiceSummaryText(res.text);
      if (res.audioBase64) {
        setVoiceAudioUrl(`data:audio/wav;base64,${res.audioBase64}`);
      }
      notify('Voice summary generated using Sarvam Bulbul.', 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setVoiceSummaryLoading(false);
    }
  }

  async function handleConvert() {
    if (!convertingStatement) return;
    setConverting(true);
    try {
      await convertAudioToEvent(caseId, convertingStatement.audioId, {
        statement_text: convertingStatement.text,
        speaker: convertingStatement.speaker,
        event_type: eventType,
        raw_date: rawDate.trim() || undefined,
      });
      notify('Audio statement added to verified patient timeline.', 'ok');
      setConvertingStatement(null);
      if (onEventAdded) onEventAdded();
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Voice & Audio Intelligence</h2>
          <p className="text-xs text-muted-foreground">
            Upload recorded consultations and patient statements transcribed via Sarvam Saaras. Convert spoken statements directly into searchable timeline evidence.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
            onChange={handleFileUpload}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Transcribing (Saaras)...' : 'Upload Audio Statement'}
          </Button>
          <Button
            size="sm"
            onClick={handleGenerateVoiceSummary}
            disabled={voiceSummaryLoading}
          >
            {voiceSummaryLoading ? 'Generating Speech (Bulbul)...' : 'Generate Spoken Case Summary'}
          </Button>
        </div>
      </div>

      {/* Voice Summary Audio Player Card */}
      {voiceSummaryText && (
        <Card className="p-4 bg-accent/5 border-accent/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-accent flex items-center gap-2">
              🔊 Sarvam Bulbul Voice Synopsis
            </span>
            <Pill tone="info">Bulbul V4 Flash (hi-IN)</Pill>
          </div>
          <p className="text-xs text-foreground italic">{voiceSummaryText}</p>
          {voiceAudioUrl && (
            <audio controls className="w-full h-10 mt-2">
              <source src={voiceAudioUrl} type="audio/wav" />
              Your browser does not support audio playback.
            </audio>
          )}
        </Card>
      )}

      {/* Audio Records List */}
      {loading ? (
        <Card className="text-center py-12 text-sm text-muted-foreground">Loading audio recordings...</Card>
      ) : records.length === 0 ? (
        <Card className="text-center py-12 space-y-2">
          <div className="text-2xl">🎙️</div>
          <h3 className="text-sm font-medium text-foreground">No audio statements recorded</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Upload audio statements from consultations, witness recordings, or patient voice notes to transcribe and cross-verify with clinical charts.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {records.map((rec) => (
            <Card key={rec.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">🎵 {rec.filename}</span>
                  <Pill tone="ok">Transcribed (Saaras)</Pill>
                  <Pill tone="neutral">{rec.language_code}</Pill>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(rec.created_at).toLocaleDateString()}
                </span>
              </div>

              {/* Full Transcript */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-foreground">Full Transcript:</span>
                <p className="text-xs text-muted-foreground bg-muted p-2.5 rounded leading-relaxed">
                  {rec.transcript || 'No transcript text extracted.'}
                </p>
              </div>

              {/* Diarized Statements */}
              {rec.diarization && rec.diarization.length > 0 && (
                <div className="space-y-2 pt-1">
                  <span className="text-xs font-medium text-foreground">Speaker Statements (Diarized):</span>
                  <div className="flex flex-col gap-2">
                    {rec.diarization.map((entry, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between bg-card border border-border p-2.5 rounded text-xs gap-3"
                      >
                        <div className="flex-1 space-y-1">
                          <span className="font-semibold text-accent capitalize">{entry.speaker_id}:</span>
                          <p className="text-foreground">{entry.transcript}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 text-[11px]"
                          onClick={() => {
                            setConvertingStatement({
                              audioId: rec.id,
                              text: entry.transcript,
                              speaker: entry.speaker_id,
                            });
                          }}
                        >
                          + Add as Evidence Event
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Convert Statement Modal */}
      {convertingStatement && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-semibold text-base text-foreground">
              Add Statement to Patient Timeline
            </h3>

            <div className="bg-muted p-2.5 rounded text-xs text-foreground italic">
              "{convertingStatement.text}"
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Event Classification</label>
              <select
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              >
                <option value="symptom_report">Symptom Report / Patient Statement</option>
                <option value="examination">Clinical Examination</option>
                <option value="medication_ordered">Medication Ordered</option>
                <option value="medication_administered">Medication Administered</option>
                <option value="escalation_or_review">Escalation / Doctor Review</option>
                <option value="consent">Consent Given / Refused</option>
                <option value="procedure">Procedure / Intervention</option>
                <option value="other">Other Clinical Event</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Stated Date / Time (Optional)</label>
              <input
                type="text"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                placeholder="e.g. 14/03 20:30 or Day 2 evening"
                value={rawDate}
                onChange={(e) => setRawDate(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setConvertingStatement(null)} disabled={converting}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleConvert} disabled={converting}>
                {converting ? 'Adding...' : 'Add to Timeline'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
