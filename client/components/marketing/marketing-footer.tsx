import Link from 'next/link';

export function MarketingFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-10 text-sm text-muted md:flex-row md:items-start md:justify-between">
        <div className="max-w-md">
          <p className="flex items-center gap-2 font-semibold text-fg">
            <span className="grid size-6 place-items-center rounded-md bg-accent text-xs font-bold text-accent-fg" aria-hidden="true">C</span>
            Chronicle
          </p>
          <p className="mt-2">
            A prototype built on Sarvam AI: Sarvam Vision reads the pages and Sarvam-105B turns them into events.
          </p>
        </div>
        <div className="max-w-md md:text-right">
          <p>
            Chronicle does not give medical or legal opinions. It organises records and flags what an expert should look at.
            Use synthetic or consented records only.
          </p>
          <p className="mt-2"><Link href="/cases" className="font-medium text-accent hover:underline">Open Chronicle →</Link></p>
        </div>
      </div>
    </footer>
  );
}
