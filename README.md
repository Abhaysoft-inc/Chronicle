# Chronicle

**Turn a stack of messy medical records into a sourced timeline, a list of care concerns, and a brief an expert can act on.**

Medical negligence cases stall because the records are scattered, handwritten and mostly in Indian languages, while qualified experts are scarce. Chronicle reads the records (printed or handwritten, Hindi, Tamil, Telugu, Bengali and more), reconstructs what happened and when, flags what looks wrong or is missing, and writes a short brief for a medical expert. Every claim links back to the exact spot on the original page.

Built on [Sarvam AI](https://www.sarvam.ai/) (Document Intelligence/Parse, `sarvam-105b` chat, Saaras speech-to-text, Bulbul text-to-speech, Translate).

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [API overview](#api-overview)
- [Supported languages](#supported-languages)
- [Scripts](#scripts)
- [Testing and trying it without spending credits](#testing-and-trying-it-without-spending-credits)
- [Data and privacy](#data-and-privacy)
- [Known limitations](#known-limitations)

---

## Features

**Records to evidence**
- Upload PDF, JPG and PNG (file type is checked from the bytes, not the extension). Large PDFs are split into chunks of 10 pages or fewer for OCR.
- Handwritten and printed OCR in Indic languages through Sarvam Parse, with page-accurate text blocks and bounding boxes.
- An LLM extracts clinical events (admissions, orders, medications given, vitals, labs, procedures, discharge) from the OCR text.
- **Quote verification:** every event carries a quote from the original-script text, and Chronicle checks that quote really appears in the OCR output. Each event shows a *Verified / Not verified* badge.
- Pages that could not be analysed are listed prominently instead of being silently dropped.

**Timeline**
- True chronological order, with dates and times normalised across documents.
- Duplicate events from different documents are detected and linked.
- Confirm, reject or correct any event (the original model output is kept), and add manual events.
- **Review workbench:** the original page next to what OCR read, with the cited text highlighted via "Show on page".

**Findings for expert review**
- Deterministic rules, each explained and cited to events:
  - recorded allergy vs. a drug that was ordered or given
  - ordered dose vs. dose recorded as given
  - stat orders with no recorded administration
  - drug recorded as given before it was ordered
  - abnormal observations with no documented response
  - long gaps in vital signs, especially after an abnormal reading
  - abnormal results with no documented follow-up
  - records that disagree on when something happened
  - clinical entries dated after discharge or death
  - undated medication or procedure entries, and hard-to-read entries
  - expected documents that are missing from the case
- A second pass by the LLM raises concerns the fixed rules cannot express. These are always labelled **AI concern**, never presented as fact, and are dropped if they cite nothing real.
- Experts accept, reject or modify each finding, with severity and an explanation of why it was flagged.

**Expert brief**
- A structured brief is generated at the end of the pipeline: background, treatment summary, potential deviations, evidence, missing documentation and questions for the expert.

**Case management**
- Accounts, sessions and per-user ownership; case status tracking; assigning cases to lawyers, investigators and experts.
- **Missing-records checklist** by case type (surgical, obstetric, medical, emergency), where investigators can mark records as requested, received or unavailable.
- Comments on cases, findings and events, an activity feed, and a pending-reviews queue.
- Dashboard with stat tiles and charts across all cases.

**Copilot and voice**
- Case copilot: ask questions about a case in natural language (including Hindi and Hinglish) and get answers with references to documents and pages. Conversation history is kept per case.
- Upload audio (consultations, statements) and transcribe with Saaras, including speaker diarization. Turn a transcript into a timeline event, or generate a spoken summary with Bulbul.

**Extras**
- Clinical audit: completeness and nursing-consistency scores, missing observations and adverse events.
- Insurance claim analysis: compare billed items against what the records support.
- Expert marketplace: expert profiles and review requests.
- Admin: organisation settings and quota, usage, API keys, per-case export and purge.

---

## How it works

Uploading documents and pressing **Process** runs a resumable pipeline. Each stage only does work that is not done yet, so "resume after a failure" and "re-run after adding a document" are the same operation. Progress streams live to the browser over Server-Sent Events.

```text
ingest → ocr → extract → verify → normalise → findings → brief
```

| Stage | What happens |
|---|---|
| `ingest` | Validate files, split PDFs into chunks of 10 pages or fewer |
| `ocr` | Sarvam Parse returns page-accurate text blocks with bounding boxes |
| `extract` | The LLM turns blocks into clinical events with source quotes |
| `verify` | Each quote is matched against the OCR text of the cited page |
| `normalise` | Dates, drug names and units are normalised; duplicate events are linked |
| `findings` | Rules plus an LLM second opinion produce issues for expert review |
| `brief` | The expert brief is compiled |

Sarvam responses are cached by content hash, and calls are rate-limited with retries, so re-runs are cheap and a demo can run entirely from cache (`CACHE_ONLY=true`).

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js 24+ running TypeScript directly (no build step), Express 5, Zod, built-in `node:sqlite`, Multer, pdf-lib |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| AI | Sarvam: Parse (OCR), `sarvam-105b` chat, Saaras (speech-to-text), Bulbul (text-to-speech), Translate |
| Storage | SQLite plus files on disk, in `DATA_DIR` |

---

## Getting started

### Prerequisites

- **Node.js 24 or newer** (the backend uses native TypeScript execution and `node:sqlite`)
- A **Sarvam API key** from the [Sarvam dashboard](https://dashboard.sarvam.ai). You can skip this for now and use the free fake backend, see [below](#testing-and-trying-it-without-spending-credits).

### 1. Clone

```bash
git clone <your-repo-url> chronicle
cd chronicle
```

### 2. Backend

```bash
cd backend
cp .env.example .env     # Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env`:

```env
SARVAM_API_KEY=your-key-here
# Keep this OUTSIDE OneDrive/Dropbox: file sync locks SQLite files.
DATA_DIR=C:\chronicle-data
```

Then:

```bash
npm install
npm run dev              # http://localhost:4000
```

Check it is up: `http://localhost:4000/health` reports whether a key is configured.

### 3. Frontend

In a second terminal:

```bash
cd client
npm install
npm run dev              # http://localhost:3000
```

Open <http://localhost:3000>, **sign up**, create a case, upload some records and press **Process**.

If the backend is not on `http://localhost:4000`, set `NEXT_PUBLIC_API_URL` before starting the client, or change it in the app from the **Connection** control.

### 4. Try it

1. Create a case and choose its type (surgical, obstetric, medical, emergency, general).
2. Upload records and pick their language, or leave it on **Auto-detect**.
3. Press **Process** and watch the stages complete.
4. Open the timeline and check events against the original page. Review the findings and the brief.

Use only **synthetic** records while developing. See [Data and privacy](#data-and-privacy).

---

## Configuration

All backend settings live in `backend/.env` and are validated at startup. Only `SARVAM_API_KEY` is needed for real analysis.

| Variable | Default | Purpose |
|---|---|---|
| `SARVAM_API_KEY` | none | Sarvam API key |
| `SARVAM_BASE_URL` | `https://api.sarvam.ai` | Sarvam API base URL |
| `DATA_DIR` | `~/chronicle-data` | SQLite database, uploads and cache. Keep it outside OneDrive |
| `PORT` | `4000` | Backend port |
| `CLIENT_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `API_TOKEN` | none | If set, every `/api` request needs an `x-api-token` header |
| `DOCAI_RPM` | `10` | OCR requests per minute (Sarvam docs disagree on the limit, so start low) |
| `CHAT_RPM` | `30` | Chat requests per minute |
| `DOCAI_POLL_SECONDS` | `10` | How often to poll OCR jobs |
| `CHAT_MODEL` | `sarvam-105b` | Chat model |
| `CHAT_MAX_TOKENS` | `4096` | Max tokens per chat response |
| `CHAT_JSON_MODE` | `json_object` | `json_object` works everywhere; `json_schema` is untested for `sarvam-105b` |
| `CACHE_ONLY` | `false` | Serve only from the cache and never call Sarvam. Handy for demos |
| `SESSION_DAYS` | `14` | How long a sign-in lasts; active use extends it |
| `ALLOW_SIGNUP` | `true` | Set to `false` to stop new accounts once your team has signed up |

Frontend: `NEXT_PUBLIC_API_URL` (build-time, default `http://localhost:4000`).

---

## Project structure

```text
Chronicle/
├── backend/                 Express API and the processing pipeline
│   ├── src/
│   │   ├── index.ts         boot: load config, open DB, listen
│   │   ├── app.ts           builds the Express app, mounts one router per module under /api
│   │   ├── bootstrap.ts     composition root: config + db + Sarvam clients → Ctx
│   │   ├── config/          env settings, validated with Zod
│   │   ├── core/            db, http (auth, CORS, validation, errors), Ctx type
│   │   ├── shared/indic/    language tiers, script detection, digit and text normalisation, quote matching
│   │   ├── integrations/sarvam/   Parse (OCR), chat, Saaras, Bulbul, Translate, cache, retries, limits
│   │   └── modules/         one folder per feature (see below)
│   ├── scripts/             dev-fake server, job inspector, OCR spike and refresh tools
│   └── tools/test-console/  plain HTML test console (dev only)
└── client/                  Next.js app
    ├── app/                 routes: marketing, auth, cases, dashboard, marketplace, admin
    ├── components/          ui primitives, layout, marketing
    ├── features/            one folder per feature, mirroring backend modules
    └── lib/                 API client, hooks, formatting, languages
```

### Backend modules

| Area | Modules |
|---|---|
| Pipeline stages | `documents`, `ocr`, `extraction`, `verification`, `normalisation`, `findings`, `brief`, orchestrated by `pipeline` |
| Case work | `cases`, `timeline`, `records`, `collaboration`, `copilot`, `voice`, `audit` |
| Platform | `auth`, `dashboard`, `insurance`, `marketplace`, `enterprise` |

Every module has the same shape (`index.ts` as its public surface, `*.routes.ts` for HTTP only, `*.service.ts` for logic, `*.schema.ts` for Zod schemas). A few rules keep it tidy:

1. Dependencies point downward: `modules` → `integrations`, `shared`, `core`. Never the other way.
2. Modules talk to each other only through `index.ts`.
3. Nothing builds its own Sarvam client; services receive them in `Ctx`, which is also how tests pass fakes.
4. Services never touch Express, and routes never contain logic.

More detail is in [`backend/README.md`](backend/README.md) and [`client/README.md`](client/README.md).

---

## API overview

All routes are under `/api` and need a signed-in session, except `/api/auth/*`. Errors always look like `{ "error": { "code", "message", "details"? } }`.

| Area | Routes |
|---|---|
| Auth | `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Cases | `POST/GET /cases`, `GET /cases/:id`, `PATCH /cases/:id/metadata`, `PATCH /cases/:id/status`, `POST /cases/:id/assign`, `GET /cases/:id/assignments` |
| Documents | `POST/GET /cases/:id/documents`, `GET /documents/:id/file`, `GET /documents/:id/pages/:n` |
| Pipeline | `POST /cases/:id/process`, `GET /cases/:id/pipeline`, `GET /cases/:id/stream` (SSE; send the token as `?token=`) |
| Timeline | `GET /cases/:id/timeline`, `POST /cases/:id/events`, `PATCH /events/:id` |
| Findings and brief | `GET/POST /cases/:id/findings`, `PATCH /findings/:id`, `GET/POST /cases/:id/brief` |
| Missing records | `GET /cases/:id/checklist`, `PATCH /cases/:id/checklist/:docType` |
| Copilot | `POST /cases/:id/copilot/ask`, `GET/DELETE /cases/:id/copilot/history` |
| Voice | `POST/GET /cases/:id/audio`, `POST /cases/:id/audio/:audioId/to-event`, `POST /cases/:id/voice-summary` |
| Collaboration | comments, activities and pending reviews under `/cases/:id/…` |
| Audit and insurance | `/cases/:id/clinical-audit`, `/cases/:id/insurance` |
| Marketplace | `/marketplace/experts`, `/marketplace/profile`, `/marketplace/requests` |
| Admin | `/admin/organization`, `/admin/usage`, `/admin/api-keys`, `POST /cases/:id/purge`, `GET /cases/:id/export` |
| Dashboard | `GET /dashboard` |

`GET /health` is public and reports liveness and whether a key is configured.

---

## Supported languages

| Tier | Languages | Behaviour |
|---|---|---|
| 1 | Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, English | Read and fully analysed |
| 2 | Urdu, Assamese, Nepali, Sanskrit | Read; analysis support is limited |
| 3 | Santhali, Kashmiri | Read for manual review only |

When a document's language is unknown, leave it on **Auto-detect**.

---

## Scripts

Run these from `backend/` unless noted.

| Command | What it does |
|---|---|
| `npm run dev` | Start the API with auto-reload on `:4000` |
| `npm start` | Start the API without watch |
| `npm run dev:fake` | Whole backend on `:4001` with **fake** Sarvam responses (free) |
| `npm test` | Run the tests (no network or API key needed) |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run spike:ocr -- ./sample.jpg hi-IN` | Try Sarvam OCR on a single file (costs credits) |
| `npm run inspect:job` | Inspect a stored OCR job |
| `npm run refresh:ocr` | Re-fetch OCR results |

From `client/`: `npm run dev`, `npm run build`, `npm run lint`.

---

## Testing and trying it without spending credits

- **Fake Sarvam:** `npm run dev:fake` in `backend/` starts the whole backend on port 4001 with canned Sarvam responses. Point the client at it with `NEXT_PUBLIC_API_URL=http://localhost:4001`, or use the **Connection** control in the app.
- **Test console:** with the backend running, open <http://localhost:4000/test/> for a plain HTML console to hit the API directly (dev only, disabled in production).
- **Cache-only mode:** after one real run, set `CACHE_ONLY=true` to replay everything from cache with zero API calls.
- **Tests:** `npm test` runs the unit and pipeline tests offline, using fake Sarvam clients.

---

## Data and privacy

- Medical records are sensitive. **Use synthetic records only** while developing, and never commit real patient data.
- `.gitignore` already excludes `.env*` files, `samples/`, uploads, SQLite files and the data directory. Only `.env.example` is tracked.
- Set `API_TOKEN` and `ALLOW_SIGNUP=false` before exposing the backend beyond your own machine.
- Documents are sent to Sarvam for OCR and analysis. Check that this is acceptable for your data before using real records.
- Per-case export and purge endpoints exist for the admin to hand over or delete a case's data.

---

## Known limitations

- Clinical thresholds in the findings rules are **placeholders for a clinician to confirm**. They are conservative on purpose: a rule that does not understand an entry stays silent rather than guessing. Findings support an expert's review; they are not medical or legal conclusions.
- Tier 2 and 3 languages have weaker coverage. With Auto-detect, they are not withheld from analysis, so results for them deserve extra scrutiny.
- Sarvam rate limits are documented inconsistently, so the defaults are low. Raise `DOCAI_RPM` and `CHAT_RPM` once you know your limits.
- The OCR and chat models can misread handwriting. That is why every event is quote-verified and every low-confidence page is surfaced for manual review.
