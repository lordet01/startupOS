# StartupOS — Functional Build v3

Mobile-web venture pilot: `Brief → Blueprint → Capability Build → Verification → Preview Deploy → Physical Phone Test`.

The operator workspace is hosted at `https://startup-os-beige.vercel.app/`. Its functional Build Studio is `/builder/`. Existing Venture sessions remain in `startupOS.sessions.v1` browser storage; the old Build/Deploy buttons open the new Studio with the same session ID.

## What changed

The legacy generic form builder is disabled. Producing HTML or receiving HTTP 200 no longer marks an app as functionally verified.

The pilot now assembles reviewed, executable modules for two explicit scopes:

| Module | Actual implementation |
|---|---|
| Receipt OCR ledger | Camera capture and album upload, preview and explicit transmission consent, same-origin image OCR API, editable merchant/date/currency/item amounts, reconciliation warnings, duplicate prevention, persistent save/edit/delete, monthly/category totals, JSON backup |
| Travel ToDo | Multiple trips/dates/D-day, task and packing lists, reservation notes and safe links, completion and filters, persistent edits/deletes, JSON backup |

Family cloud sharing, banks/payments, booking integrations, and push notifications are **not** implemented. The founder must approve the narrowed scope. Unsupported capabilities are blocked, not silently replaced by a manual form.

## Build gates

- `IMPLEMENTED`: trusted module assembled; JS compilation and packaged dependencies checked.
- `INTEGRATION_VERIFIED`: domain checks executed, committed Chromium evidence matches the source hash, and receipt builds pass a **real** synthetic-image OCR provider test.
- `READY`: Vercel deployment actually finished; deployment acceptance is not treated as completion.
- `PENDING_PHYSICAL_PHONE`: hardware camera and standalone install still need physical-device confirmation. User reports stay separate from automated evidence.

The server does not trust client verification flags. It revalidates the current source hash and capability descriptor, and Publish reruns the same verification before deployment. It packages the actual OCR server dependencies with the app and ignores client-submitted HTML.

## Internal operator configuration

These are StartupOS operator settings, not customer requirements:

- `OPENAI_API_KEY`: existing server-side provider key.
- `VERCEL_PUBLISH_TOKEN` and `VERCEL_TEAM_ID`: existing publisher settings.
- Optional `OPENAI_OCR_MODEL`: default `gpt-4.1-mini`; a different model must pass the same live test.

No custom StartupOS custom build key is required. Build integrity comes from deterministic server assembly plus verification re-run immediately before publish.

## Reproducible tests

```sh
npm ci --ignore-scripts
npx playwright install --with-deps chromium
npm test
npm run test:browser
node tests/studio.mjs
node tests/setup.mjs
```

Verification performed on the v3 source: **47 backend/domain/security tests, 18 Chromium mobile workflow tests, 4 session-continuity tests and 2 operator-setup tests** passed. The CI workflow repeats these checks and uploads reports/screenshots.

Browser OCR responses are explicitly mocked to test interaction paths; the camera uses Chromium synthetic media. Those tests are **not** proof of live provider availability, real-receipt accuracy, or an iPhone/Android hardware pass. `/api/build` performs the separate real provider test when the operator runs verification. Missing runtime configuration leaves that gate closed.

## Storage and safety limits

Sessions and app data are local to each browser/origin, not synchronized between devices. Old generic artifacts are preserved separately from new functional builds. A new preview URL does not automatically inherit old app data; export before retiring an old deployment.

OCR images are processed on demand and are not persisted by this app. Provider requests use `store:false`; this is not a claim of provider-wide zero retention. Logs omit receipt images and raw receipt contents. Token-derived cost values are labeled estimates, not reconciled invoices.

This remains an **internal pilot**, not a public multi-tenant release. Operator authentication, durable server-side usage/session storage and globally enforced quotas remain prerequisites for public exposure. The per-process OCR test limit is not a global spending cap.

See `docs/FUNCTIONAL_BUILD_V3.md` for contracts, endpoints, acceptance tests and limitations.
