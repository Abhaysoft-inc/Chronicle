# Chronicle client

Next.js 16 (App Router, Cache Components) + React 19 + Tailwind 4. Talks to the Chronicle backend.
This is **not** the Next.js you may know: read `node_modules/next/dist/docs/` before changing routing or data fetching (see `AGENTS.md`).

## Run

```bash
npm run dev          # http://localhost:3000  (backend must be running on :4000)
npm run build        # also checks Cache Components rules
npm run lint
```

Backend URL: defaults to `http://localhost:4000`. Override with `NEXT_PUBLIC_API_URL` at build time, or per browser
from the **Connection** button in the header (also where an optional API token goes).

## What it does

- **Cases** (`/`): list and create cases.
- **Case workspace** (`/cases/[id]`):
  - **Documents & processing:** drag-and-drop upload with a language choice, **live pipeline progress over Server-Sent Events**
    (falls back to polling only if the stream cannot connect), and a prominent list of pages that were *not* analysed.
  - **Timeline:** events with the original-script quote as evidence, a *Verified / Not verified* badge, and confirm / reject / correct.
  - **Page viewer:** the original file next to what OCR read, with the cited text highlighted ("Show on page").

## Structure

```text
app/                    routes only; thin, synchronous server pages
  page.tsx              cases list + create
  cases/[id]/page.tsx   reads params inside <Suspense>, renders the workspace
components/
  ui/                   Button, Pill, Card, Field, Toast, Spinner (no feature knowledge)
  layout/               app header, connection settings
features/               one folder per feature, like backend/src/modules
  cases/  documents/  pipeline/  timeline/  viewer/
lib/
  api/                  config, fetch wrapper, types, one function per endpoint
  hooks/use-loader.ts   small data-loading hook (no extra library)
  format.ts  languages.ts
```

Rules: components never build URLs (use `lib/api/endpoints.ts`); features do not import each other's internals
(shared types go in `lib/api/types.ts` or the feature's `types.ts`); OCR text always uses the `.indic` class and a `lang` attribute.

## Notes

- Pages are synchronous and data loads in the browser, so with Cache Components the shell prerenders and `params` is read inside `<Suspense>`.
- Evidence rule in the UI: the quote in the *original script* is the evidence. The English line is labelled machine-generated.
- The timeline is in extraction order for now. Date normalisation and findings/brief views arrive with those backend stages.
