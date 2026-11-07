import Link from "next/link";
import type { ReactNode } from "react";
import { IconLink, IconScan, IconShieldCheck } from "@/components/marketing/icons";

const POINTS = [
  { icon: IconLink, title: "Every fact points to its source", body: "Pick an event and the page opens with the exact lines boxed." },
  { icon: IconShieldCheck, title: "Quotes are checked by code", body: "Anything that does not match the OCR text is flagged, not trusted." },
  { icon: IconScan, title: "Handwriting and Indian languages", body: "Read with Sarvam Vision, with the original script kept as the evidence." },
];

// Sign-in and sign-up share this frame: the form on the left, what Chronicle is about on the right.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="flex w-fit items-center gap-2 text-[17px] font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-fg" aria-hidden="true">C</span>
          Chronicle
        </Link>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</main>
        <p className="text-center text-xs text-muted">
          A prototype. Use synthetic or consented records only.
        </p>
      </div>

      <aside className="relative hidden overflow-hidden bg-accent text-accent-fg lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div aria-hidden="true" className="absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-32 -left-16 size-96 rounded-full bg-black/10 blur-3xl" />
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance">
            Review records with evidence you can check.
          </h2>
          <ul className="mt-10 flex flex-col gap-7">
            {POINTS.map(({ icon: PointIcon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15"><PointIcon className="size-5" /></span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="mt-0.5 text-sm opacity-85">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
