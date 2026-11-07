import type { ComponentType } from "react";
import { CtaLink } from "@/components/marketing/auth-cta";
import { HeroMock } from "@/components/marketing/hero-mock";
import {
  IconArrow, IconBrief, IconFlag, IconLink, IconPageMissing, IconPen, IconScan, IconShieldCheck, IconTimeline, IconUpload,
} from "@/components/marketing/icons";

type Icon = ComponentType<{ className?: string }>;

const PROBLEMS = [
  { title: "The records are a mess", body: "Handwritten notes, prescriptions and nursing charts, in different languages and scripts." },
  { title: "Someone has to piece it together", body: "Reading everything and working out what happened, and when, takes weeks of careful work." },
  { title: "Experts are hard to find", body: "And their time is best spent judging the care, not decoding handwriting." },
];

// Steps 1 to 3 are built and working today; the brief is next. The page says so rather than overclaim.
const STEPS: { icon: Icon; title: string; body: string; live: boolean }[] = [
  { icon: IconUpload, title: "Upload", body: "Photos, scans or PDFs. Drop in the whole file; mixed languages are fine.", live: true },
  { icon: IconScan, title: "Read", body: "Sarvam Vision reads every page, handwriting included, and keeps the original script.", live: true },
  { icon: IconTimeline, title: "Timeline", body: "Each event is tied to the exact line it came from. Every quote is checked against the OCR text.", live: true },
  { icon: IconBrief, title: "Brief", body: "Care that looks wrong and records that are missing are flagged, then written up as a short brief for the expert.", live: false },
];

const TRUST: { icon: Icon; title: string; body: string }[] = [
  { icon: IconLink, title: "Every fact points to its source", body: "Pick an event and the page opens with the exact lines boxed, so you check the evidence instead of trusting a summary." },
  { icon: IconShieldCheck, title: "Quotes are checked by code", body: "An invented quote or a changed number is caught, marked “Not verified”, and kept out of the analysis." },
  { icon: IconFlag, title: "Flags, never verdicts", body: "Chronicle says what is missing or unusual and asks the expert. It never says anyone was negligent." },
  { icon: IconPageMissing, title: "A missing page is not missing care", body: "Pages that could not be read are listed up front, so a gap in the file is never mistaken for a gap in treatment." },
  { icon: IconScan, title: "Confidence you can see", body: "Handwriting scores lower than print. The page shows where to look more closely before you rely on a reading." },
  { icon: IconPen, title: "Your correction stands", body: "Confirm, reject or edit any event. The original reading is kept next to your change." },
];

const LANGUAGES = ["Hindi", "Tamil", "Telugu", "Bengali", "Marathi", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Odia", "English"];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold tracking-wide text-accent uppercase">{children}</p>;
}

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-5 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] text-muted">
              <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" />
              Medical-legal record review · built on Sarvam AI
            </p>
            <h1 className="mt-6 text-4xl leading-[1.08] font-semibold tracking-tight text-balance md:text-6xl">
              From a stack of handwritten records to a timeline an expert can trust.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted">
              Upload the records, in any Indian language. Chronicle reads them, even the handwriting, lays out what happened and when,
              and shows exactly where on the page each fact came from.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <CtaLink>Start a case <IconArrow className="size-4" /></CtaLink>
              <a href="#how" className="inline-flex h-12 items-center rounded-xl border border-line bg-surface px-6 text-base font-medium hover:bg-surface-2">
                See how it works
              </a>
            </div>
            <p className="mt-5 text-sm text-muted">Handwritten and printed · Hindi, Tamil, Telugu, Bengali, Marathi and more</p>
          </div>
          <div className="mt-16 md:mt-20">
            <HeroMock />
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <Eyebrow>The problem</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">Negligence cases stall on the paperwork.</h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {PROBLEMS.map((p, i) => (
              <div key={p.title} className="rounded-2xl border border-line bg-bg p-6">
                <span className="font-mono text-sm text-muted">0{i + 1}</span>
                <h3 className="mt-3 text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{p.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-lg font-medium">Cases drag on for years.</p>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-6xl px-5 py-24">
          <div className="max-w-2xl">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">From upload to a brief, in four steps.</h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: StepIcon, title, body, live }, i) => (
              <li key={title} className="flex flex-col rounded-2xl border border-line bg-surface p-6">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><StepIcon className="size-5" /></span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${live ? "bg-ok-bg text-ok" : "bg-surface-2 text-muted"}`}>{live ? "Working now" : "Coming next"}</span>
                </div>
                <p className="mt-5 text-xs font-semibold text-muted">STEP {i + 1}</p>
                <h3 className="mt-1 text-xl font-semibold">{title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="scroll-mt-20 border-y border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-5 py-24">
          <div className="max-w-2xl">
            <Eyebrow>Why you can trust it</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">Built so you can check its work.</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              In a dispute, “the software said so” is worthless. Chronicle is designed around evidence you can see and verify yourself.
            </p>
          </div>
          <div className="mt-12 grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            {TRUST.map(({ icon: TrustIcon, title, body }) => (
              <div key={title}>
                <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><TrustIcon className="size-5" /></span>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Languages */}
      <section id="languages" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-6xl px-5 py-24">
          <div className="max-w-2xl">
            <Eyebrow>Languages</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance md:text-4xl">Built for Indian languages first.</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              Records are rarely in one language. Chronicle keeps the original script as the evidence and shows an English reading beside it, clearly labelled as machine-generated.
            </p>
          </div>
          <ul className="mt-9 flex flex-wrap gap-2.5">
            {LANGUAGES.map((l) => (
              <li key={l} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium">{l}</li>
            ))}
          </ul>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">
            Also read by OCR, with analysis coming: Urdu, Assamese, Nepali, Sanskrit and others. Santhali and Kashmiri are read but need manual review.
          </p>
        </div>
      </section>

      {/* Call to action */}
      <section className="px-5 pb-24">
        <div className="mx-auto w-full max-w-6xl rounded-3xl bg-accent px-6 py-14 text-center text-accent-fg md:py-16">
          <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">See it on a real page.</h2>
          <p className="mx-auto mt-3 max-w-xl text-lg opacity-90">Upload a handwritten record and watch the timeline build, with the evidence boxed on the page.</p>
          <CtaLink inverted className="mt-8">Open Chronicle <IconArrow className="size-4" /></CtaLink>
          <p className="mt-4 text-sm opacity-80">A prototype. Use synthetic or consented records only.</p>
        </div>
      </section>
    </>
  );
}
