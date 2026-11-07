# Chronicle backend

Reads medical records (handwritten, Indic languages) with Sarvam, builds a sourced timeline,
and (next) flags care problems and writes an expert brief. See `../IMPLEMENTATION_PLAN.md`.

## Run

```bash
cp .env.example .env        # add SARVAM_API_KEY; set DATA_DIR outside OneDrive
npm install
npm run dev                 # http://localhost:4000
npm test                    # 24 tests, no network, no API key needed
npm run dev:fake            # whole backend on :4001 with FAKE Sarvam (free): good for trying the client or test console
# plain HTML test console (dev only): http://localhost:4000/test/
npm run typecheck
npm run spike:ocr -- ./sample.jpg hi-IN    # Phase 0: try Sarvam OCR on one file (~Rs 0.50/page)
```

Needs Node 24+ (runs TypeScript directly and uses the built-in `node:sqlite`; there is no build step).

## Structure

```text
src/
  index.ts            boot: load config, open DB, listen
  app.ts              builds the Express app; mounts one router per module under /api
  bootstrap.ts        composition root: wires config + db + Sarvam clients into a Ctx

  config/             env settings, validated with Zod
  core/               things every module needs, and which know nothing about features
    db/               SQLite connection, schema, "does this id exist?" lookups
    http/             auth token, CORS, input validation, one error format
    context.ts        the Ctx type (db + config + clients) passed to every module
    errors.ts         AppError, notFound, badRequest
  shared/indic/       language tiers, script detection, digits, normalisation, quote matching
  integrations/sarvam/  everything that talks to Sarvam: Parse (OCR), chat, cache, retries, limits

  modules/            one folder per feature. Pipeline stages are modules too.
    cases/            create / list / inspect cases
    documents/        uploads, file-type check, split into <=10-page chunks   (stage 1)
    ocr/              Sarvam Parse -> page-accurate blocks                    (stage 2)
    extraction/       blocks -> events with sources, via the LLM              (stage 3)
    verification/     checks every quote really appears in the OCR text       (stage 4)
    timeline/         read events + sources, human corrections
    pipeline/         runs the stages in order, progress, resume
  testing/            helpers used by tests only
scripts/              one-off tools (Phase 0 OCR spike)
```

Coming next, each as its own folder under `modules/`: `normalisation/` (stage 5 dates, drug names, merging),
`findings/` (stage 6 rules), `brief/` (stage 7), `translation/`.

### Module layout

Every module follows the same shape, so you always know where to look:

```text
modules/<name>/
  index.ts              the module's public surface: the only file other modules may import
  <name>.routes.ts      HTTP only: parse input, call the service, shape the response
  <name>.service.ts     the logic. Takes a Ctx. No Express in here.
  <name>.schema.ts      Zod schemas (when the module has them)
  <name>.test.ts        tests live next to the code
```

### Rules

1. **Dependencies point downward:** `modules` -> `integrations`, `shared`, `core`. Never the other way.
   `core` and `shared` import nothing from `modules` or `integrations` (the one exception: `core/http`
   recognises Sarvam error types so it can turn them into the right status code).
2. **Modules talk through `index.ts`.** `pipeline` imports `ocr`, never `ocr/ocr.service.ts`.
   Keep it one-way: `cases -> pipeline -> {documents, ocr, extraction, verification}`.
3. **Nothing builds its own Sarvam client.** Services receive them in `Ctx`. Tests pass fakes.
4. **Services never touch Express; routes never contain logic.**
5. **Adding a stage** = new folder under `modules/`, one line in `pipeline.runner.ts`, one `include` in `app.ts` if it has routes.

## API

| Method and path | What it does |
|---|---|
| `GET /health` | Liveness; says whether a key is configured |
| `POST /api/cases` | Create a case `{title, case_type?, claim_summary?, output_language?}` |
| `GET /api/cases`, `GET /api/cases/:id` | List; detail with documents, pipeline progress, **pages that were not analysed**, event counts |
| `POST /api/cases/:id/documents` | Multipart `files` (+ optional `language`, e.g. `hi-IN`). PDF/JPG/PNG, type sniffed from bytes |
| `POST /api/cases/:id/process` | Start or resume the pipeline. `202`, then poll below |
| `GET /api/cases/:id/pipeline` | Per-stage status (a plain snapshot) |
| `GET /api/cases/:id/stream` | **Live progress over SSE.** First an `event: snapshot` with the current state, then an `event: update` on every change. Send the token as `?token=` (browsers cannot set headers on `EventSource`) |
| `GET /api/cases/:id/timeline[?verified=true]` | Events with sources and a `verified` flag |
| `GET /api/documents/:id/file` | The original upload |
| `GET /api/documents/:id/pages/:n` | OCR blocks + bounding boxes for the page viewer |
| `PATCH /api/events/:id` | Confirm / reject / correct (original LLM output is kept) |

Errors always look like `{ "error": { "code", "message", "details"? } }`.
If `API_TOKEN` is set, send it as the `x-api-token` header.
