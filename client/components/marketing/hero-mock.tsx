// A static, CSS-only picture of the review screen: the page on the left with the cited line boxed,
// the events on the right. Purely decorative (aria-hidden), so no screenshots or image files are needed
// and it follows the light/dark theme. The "paper" stays white on purpose, like a real scan.

function Line({ w, strong = false }: { w: string; strong?: boolean }) {
  return <span className={`block h-1.5 rounded-full ${strong ? 'bg-neutral-400' : 'bg-neutral-300'}`} style={{ width: w }} />;
}

export function HeroMock() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-4xl">
      <div className="absolute -inset-x-6 -inset-y-8 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_50%_40%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent)] blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/10">
        <div className="flex items-center gap-1.5 border-b border-line bg-surface-2 px-4 py-2.5">
          <i className="size-2.5 rounded-full bg-neutral-400/60" /><i className="size-2.5 rounded-full bg-neutral-400/60" /><i className="size-2.5 rounded-full bg-neutral-400/60" />
          <span className="ml-3 text-xs text-muted">Fitness certificate · images (1).jpg · page 1</span>
        </div>

        <div className="grid gap-0 md:grid-cols-[1.15fr_1fr]">
          {/* the page */}
          <div className="bg-surface-2 p-4 md:p-5">
            <div className="mx-auto max-w-[19rem] rounded-md bg-white p-4 text-neutral-800 shadow-md">
              <p className="text-center text-[11px] font-bold tracking-wide text-red-700/80">NISHNAI CLINIC</p>
              <div className="mt-2 space-y-1.5"><Line w="70%" strong /><Line w="55%" /></div>
              <div className="relative mt-4 rounded-sm border-2 border-amber-500 bg-amber-400/10 px-2 py-1.5 shadow-[0_0_0_3px_rgba(245,158,11,0.28)]">
                <p className="font-serif text-[13px] leading-snug text-blue-900/80 italic">Age: 29 yrs &nbsp; Sex: Male &nbsp; Wt: 59 kg</p>
              </div>
              <p className="mt-4 text-center text-[10px] font-semibold tracking-widest">FITNESS CERTIFICATE</p>
              <div className="mt-2 space-y-1.5"><Line w="100%" /><Line w="92%" /><Line w="64%" /></div>
              <p className="mt-3 font-serif text-[12px] text-blue-900/70 italic">Pulse – 80/min &nbsp; BP – 120/80</p>
              <div className="mt-3 space-y-1.5"><Line w="88%" /><Line w="40%" /></div>
            </div>
          </div>

          {/* the events */}
          <div className="flex flex-col gap-2 border-t border-line p-3 md:border-t-0 md:border-l">
            <div className="rounded-xl border border-accent bg-surface p-3 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono font-semibold text-fg">E001</span>
                <span>Admission</span>
                <span className="ml-auto font-medium text-ok">✓ Verified</span>
              </div>
              <p className="mt-1.5 text-sm font-medium">Patient examined and certified fit to travel.</p>
              <div className="mt-2 rounded-md border-l-4 border-ok bg-surface-2 px-2.5 py-1.5 text-[13px]">
                Age: 29 yrs Sex: Male Wt: 59 kg
                <span className="mt-0.5 block text-[11px] text-muted">images (1).jpg · p.1</span>
              </div>
              <div className="mt-2.5 flex gap-1.5">
                <span className="rounded-md border border-line px-2.5 py-1 text-xs font-medium">Confirm</span>
                <span className="rounded-md border border-bad/40 px-2.5 py-1 text-xs font-medium text-bad">Reject</span>
              </div>
            </div>
            <div className="rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted"><span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono font-semibold text-fg">E002</span><span>Examination</span></div>
              <p className="mt-1 text-sm font-medium">Vital signs recorded as normal.</p>
            </div>
            <div className="rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono font-semibold text-fg">E003</span><span>Medication</span>
                <span className="ml-auto font-medium text-bad">⚠ Not verified</span>
              </div>
              <p className="mt-1 text-sm font-medium">Antibiotic given at night.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
