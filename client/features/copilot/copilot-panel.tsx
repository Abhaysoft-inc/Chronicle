'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { useToast } from '@/components/ui/toast';
import { askCopilot, clearCopilotHistory, getCopilotHistory } from '@/lib/api/endpoints';
import type { CopilotMessage } from '@/lib/api/types';

export function CopilotPanel({ caseId }: { caseId: string }) {
  const notify = useToast();
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    getCopilotHistory(caseId)
      .then((history) => setMessages(history))
      .catch((err) => notify((err as Error).message, 'bad'))
      .finally(() => setInitialLoading(false));
  }, [caseId, notify]);

  async function handleSend(promptText?: string) {
    const q = promptText || question;
    if (!q.trim() || loading) return;

    setLoading(true);
    if (!promptText) setQuestion('');

    // Optimistically add user message
    const tempUserMsg: CopilotMessage = {
      id: `temp-${Date.now()}`,
      case_id: caseId,
      role: 'user',
      content: q,
      references: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const assistantMsg = await askCopilot(caseId, q);
      setMessages((prev) => [...prev.filter((m) => m.id !== tempUserMsg.id), tempUserMsg, assistantMsg]);
    } catch (err) {
      notify((err as Error).message, 'bad');
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    if (!confirm('Clear all Copilot conversation history for this case?')) return;
    try {
      await clearCopilotHistory(caseId);
      setMessages([]);
      notify('Copilot chat history cleared.', 'ok');
    } catch (err) {
      notify((err as Error).message, 'bad');
    }
  }

  const SUGGESTIONS = [
    'What was the surgical procedure sequence and post-op vitals?',
    'Are there any conflicting medication dosages or documented allergies?',
    'मरीज़ के डिस्चार्ज के समय क्या निर्देश दिए गए थे?',
    'Is there any evidence of monitoring delay or documentation gaps?',
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">AI Medical-Legal Copilot</h2>
          <p className="text-xs text-muted-foreground">
            Chat with all uploaded case documents in natural language (Hindi, English, Hinglish). Every answer cites supporting evidence.
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleClear}>
            Clear History
          </Button>
        )}
      </div>

      <Card className="flex flex-col h-[560px] p-0 overflow-hidden">
        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {initialLoading ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Loading copilot history...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <div className="inline-flex p-3 rounded-full bg-accent/10 text-accent text-xl">💡</div>
              <h3 className="text-sm font-medium text-foreground">Ask anything about this medical case</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Search across hundreds of pages, check clinical treatment sequences, cross-examine doctor and nursing notes, or identify contradictions.
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto pt-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s)}
                    className="text-xs text-left px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'bg-muted border border-border text-foreground'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>

                  {/* Document & Event References */}
                  {m.references && m.references.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-border/50 flex flex-col gap-1 text-xs">
                      <span className="font-semibold text-muted-foreground">Cited Sources:</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {m.references.map((ref, idx) => (
                          <Pill key={idx} tone="info">
                            {ref.filename ? `${ref.filename} (p.${ref.page_no})` : ''}
                            {ref.event_label ? `Event ${ref.event_label}` : ''}
                            {ref.quote ? `: "${ref.quote.slice(0, 40)}..."` : ''}
                          </Pill>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 px-1">
                  {m.role === 'user' ? 'You' : 'MedLex Copilot (Sarvam-105B)'} • {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 bg-muted/50 rounded-lg w-fit">
              <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full" />
              MedLex Copilot is analyzing documents and evidence...
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-border bg-card flex gap-2 items-center">
          <input
            type="text"
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Ask a question in English, Hindi, or Hinglish..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={loading}
          />
          <Button onClick={() => handleSend()} disabled={loading || !question.trim()}>
            Send
          </Button>
        </div>
      </Card>
    </div>
  );
}
