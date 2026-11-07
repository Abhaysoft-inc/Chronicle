import Link from 'next/link';
import { HeaderActions } from './auth-cta';

const LINKS = [
  ['How it works', '#how'],
  ['Why trust it', '#trust'],
  ['Languages', '#languages'],
] as const;

/** Landing-page header. No API status or settings here; those belong inside the app. */
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-fg" aria-hidden="true">C</span>
          Chronicle
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-7 text-sm text-muted md:flex">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} className="hover:text-fg">{label}</a>
          ))}
        </nav>
        <HeaderActions />
      </div>
    </header>
  );
}
