# Functional Build v3

## The corrected contract

A file exists ≠ an application works. HTTP 200 ≠ acceptance passed. Vercel READY ≠ a physical phone passed.

The old generic `App Spec → form` builder is disabled. Its artifacts remain in existing browser sessions, but they cannot be published through the v3 API. New `functionalBuild` artifacts coexist with legacy `prototype` data instead of overwriting it.

The current implementation supports two reviewed capability modules, not unrestricted software generation:

| Module | Implemented | Explicitly excluded |
|---|---|---|
| Receipt OCR | Camera capture, album selection, image preview, consent before transmission, live OpenAI image input, editable receipt/line items, unknown values, reconciliation, duplicate prevention, save/reload/edit/delete, monthly/currency/category totals, JSON export, installable PWA shell | Financial account links, payment, shared-family cloud accounts, guaranteed OCR accuracy |
| Travel ToDo | Multiple trips, dates, D-day, task/packing/reservation records, notes/HTTP links, editing/deletion/completion, filters, persistent storage, JSON export, PWA shell | Booking APIs, real-time collaboration, push notifications, payments |

Unsupported requests are blocked with `CAPABILITY_UNSUPPORTED`. The founder must explicitly approve the narrowed implementation scope. Do not silently replace essential capabilities with a manual form.

## State machine and evidence

1. **Contract accepted**: founder agrees to capabilities and exclusions.
2. **IMPLEMENTED**: reviewed files are assembled; each packaged JS file is compiled; dependencies and PWA assets are checked. No LLM call is needed for assembly.
3. **INTEGRATION_VERIFIED**: domain tests execute, a Chromium regression report matches the exact source hash, and receipt builds make a real OCR API call using a synthetic receipt with known line totals. A failed, missing, stale or incomplete check blocks the gate.
4. **Deployment requested**: the server validates signed build/evidence tickets and reassembles the same reviewed code. Client-submitted HTML is ignored. Vercel state must actually become `READY` before the UI shows a launch link.
5. **Physical-phone verification pending**: hardware capture, permission UX, standalone launch, and real-use behavior still require the founder's device. Manual notes are labeled `user_report`; they do not turn into automated test evidence.

The build and evidence tickets bind the session ID, build ID, artifact descriptor hash, source hash, version, expiry and evidence purpose. Old or modified builds must be reverified. Publish requires a matching valid verification ticket and explicit approval. Legacy and unsigned publish requests return 422.

## Executable tests

```sh
npm install
npx playwright install chromium
npm test
npm run test:browser
```

`tests/backend.test.cjs` covers domain rules, source identity, signed-proof integrity, privacy consent, schema rejection, same-session authorization, provider failures, and blocked legacy publish calls.

`tests/browser.mjs` launches actual Chromium at a mobile viewport. Its browser workflow tests use an explicitly mocked OCR transport and Chromium synthetic media. The generated report states that limitation. It exercises camera controls, consent, image upload, editable OCR results, mismatch checks, persistence/reload, duplicate rejection, error feedback, session isolation, travel workflows, offline shell, and camera permission failure.

When all browser checks pass, the runner writes `lib/browser-evidence.json` tied to `sourceHash()`. That report must be committed with the matching capability source. The report is not a claim about OCR provider availability or physical hardware. The separate `/api/build` verify action performs the real OCR provider check at runtime.

## Endpoints

- `GET /api/build`: capability catalog and configuration presence; not an integration success claim.
- `POST /api/build { action: 'assemble', project, kind, acceptedScope: true }`: deterministic signed build.
- `POST /api/build { action: 'verify', ticket, liveConsent: true }`: executable checks and one paid synthetic-image OCR check for receipt builds. No fake fallback.
- `GET /api/build-preview?ticket=...`: same-origin preview assembled from trusted code. It does not accept arbitrary user HTML.
- `POST /api/receipt-ocr`: signed per-session app ticket, explicit consent, image MIME/signature/size validation, actual provider request, strict result validation.
- `POST /api/publish`: valid build and verification tickets, session match, explicit approval. Deploys the reviewed files plus the OCR backend, not a static shell.
- `GET /api/publish?ticket=...`: fetches the actual Vercel state of the signed deployment ID.

## Why generated OCR apps now work

The generated app contains `api/receipt-ocr.js`, `lib/receipt-service.js`, its signing dependency, and browser domain code. The camera app calls its own origin, avoiding a wildcard CORS proxy. API keys remain in Vercel runtime environment variables. The app contains only a limited signed application ticket.

The OCR model defaults to `gpt-4.1-mini`. `OPENAI_OCR_MODEL` can override it, but a different model is not treated as verified until the live test succeeds. Unknown model pricing is reported as `null`, not zero. Known-model token-derived costs are labeled estimates, not an invoice reconciliation.

`store:false` is sent to the provider. The app does not persist receipt images and server logs contain only IDs, usage, timing and item counts. This does not assert that the provider has zero retention; operator privacy terms and provider policies still apply.

## Internal setup

- Existing `OPENAI_API_KEY`: server-only, production + preview.
- New `STARTUP_OS_BUILD_KEY`: independently generated secret for signed build/app/deployment evidence, production + preview.
- Existing `VERCEL_PUBLISH_TOKEN` and `VERCEL_TEAM_ID`: operator-only deployment authorization.
- Optional `OPENAI_OCR_MODEL`.

Preview deployments inherit the appropriate project environment. Do not put provider or publisher keys in app source, browser storage, or generated files. Do not disable deployment protection just to get a test to pass.

## Session preservation

`/builder/` opens the existing session in `startupOS.sessions.v1`. Each run captures its session/build IDs. Switching sessions cannot cause a returned result to be applied to the newly selected session. Previous functional builds are retained in `functionalBuildHistory`. Costs, verification results, diagnostics and device notes are separate fields on that same session.

Storage remains browser-local in this pilot. It is not cross-device cloud synchronization, and a newly issued preview origin does not automatically have the previous origin's data. Export data before retiring an old test deployment. The v3 receipt store is separate from the legacy generic form store.

## Known limits, not hidden as success

- The browser CI camera is simulated; real camera quality and iOS/Android installation must be tested on devices.
- One synthetic OCR test establishes an integration path, not robust accuracy across real receipts. Add a labeled receipt corpus before a customer release.
- Per-process OCR throttling is only best-effort abuse protection, not a distributed hard cost cap.
- Full operator authentication, durable server-side session/usage ledgers and global quotas are prerequisites for exposing this system as a public multi-tenant service.
- Receipt OCR can misread low-quality images. Missing values and reconciliation warnings require human review.
- The verification proof expires in 24 hours; app tickets expire in 30 days. This is an internal-pilot lifecycle, not a permanent customer entitlement system.
- No claim of commercial/legal compliance or automatic profitability is made by a passing Build gate.
