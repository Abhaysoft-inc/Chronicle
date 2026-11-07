'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type ToastTone = 'info' | 'ok' | 'bad';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});

/** `const notify = useToast(); notify('Saved', 'ok')` */
export const useToast = () => useContext(ToastContext);

const TONE: Record<ToastTone, string> = {
  info: 'border-line bg-surface text-fg',
  ok: 'border-ok/30 bg-ok-bg text-ok',
  bad: 'border-bad/30 bg-bad-bg text-bad',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId.current++;
    setItems((cur) => [...cur.slice(-3), { id, message, tone }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), tone === 'bad' ? 8000 : 4500);
  }, []);

  const value = useMemo(() => notify, [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role="status" className={`pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow-lg ${TONE[t.tone]}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
