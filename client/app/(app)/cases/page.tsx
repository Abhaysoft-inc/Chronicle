import { Card } from "@/components/ui/card";
import { CaseList } from "@/features/cases/case-list";
import { CreateCaseForm } from "@/features/cases/create-case-form";

// A synchronous server page: the shell is prerendered, and the case list loads in the browser.
export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-medium tracking-tight">Cases</h1>
        <p className="mt-1 text-sm text-muted">
          Upload a case&apos;s records, and Chronicle reads them, builds a sourced timeline, and flags what an expert should look at.
        </p>
      </div>
      <Card title="New case">
        <CreateCaseForm />
      </Card>
      <section aria-labelledby="all-cases" className="flex flex-col gap-3">
        <h2 id="all-cases" className="text-sm font-semibold">All cases</h2>
        <CaseList />
      </section>
    </div>
  );
}
