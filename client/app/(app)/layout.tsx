import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Spinner } from "@/components/ui/spinner";
import { RequireAuth } from "@/features/auth/require-auth";

// Everything in the workspace needs a signed-in user; signed-out visitors are sent to /login.
// The guard and the sidebar read the current path, which only exists at request time, so with
// Cache Components they must sit inside <Suspense>. The fallback is what prerendering ships.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center text-sm text-muted" role="status">
          <span className="flex items-center gap-2"><Spinner className="size-4" /> Loading…</span>
        </div>
      }
    >
      <RequireAuth>
        <AppShell>{children}</AppShell>
      </RequireAuth>
    </Suspense>
  );
}
