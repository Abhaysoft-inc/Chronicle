import { Suspense } from "react";
import { CaseWorkspace } from "@/features/cases/case-workspace";
import { WorkspaceSkeleton } from "@/features/cases/workspace-skeleton";

// `params` is runtime data, so with Cache Components it is read inside <Suspense>. The page
// itself stays synchronous: the shell prerenders, the skeleton shows, and the workspace loads
// its data in the browser.
export default function CasePage({ params }: PageProps<"/cases/[id]">) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      {params.then(({ id }) => (
        <CaseWorkspace caseId={id} />
      ))}
    </Suspense>
  );
}
