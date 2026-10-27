# StartupOS — Firebase Workspace

비공개 앱 제작 도구. 내 앱 → 기획 → 빌드·검증 → 배포·설치로 작업하며, 빌드 화면에서 AutoBuild와 캡처·수정 채팅을 사용합니다. 화면은 흰 배경과 딥블루 디자인을 공유합니다.

운영 대상: `startupos-6b8d4`. 인증된 `startupWeb`이 작업 화면을 제공하고, `startupApi`와 `startupJob`이 API·장기 작업을 처리합니다. 계정·프로젝트 저장과 접근 제한은 기존 Firebase 구조를 유지합니다.

GitHub `main`의 UI 변경은 `.github/workflows/firebase-ui.yml`에서 코드 테스트 → Workload Identity 인증 → `startupWeb`·Hosting 배포 → 로그인·접근 제한 확인 순서로 처리합니다. 배포 전용 계정은 GitHub의 저장소 ID와 `main` 브랜치에 제한됩니다. 장기 서비스 계정 비밀키는 사용하지 않습니다. API·작업 워커·보안 규칙 변경은 해당 배포 범위를 검토한 별도 작업으로 처리합니다.

- UI 변경 내용: [작업 화면 개편](docs/WORKSPACE_UI_20261025.md)
- Firebase 구성 및 운영 제한: [Firebase 이전](firebase/MIGRATION.md)
- AutoBuild: [Build Studio 통합](docs/AUTOBUILD_INTEGRATION.md) · [에이전트 팀 설계](docs/LEGION_AGENT_TEAM.md)
- 검증: `npm test` (유료 모델 호출·실기기 설치 성공을 의미하지 않음)
- 수동 UI 배포: `npm run deploy:ui` (로컬 배포 인증 필요)

아래에는 기존 기능 계약과 구현 이력이 포함되어 있습니다.

---

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

Workspace sessions synchronize per account after Firebase activation; signed-out projects stay in the original browser until explicitly imported. Generated apps' runtime records remain local to their own browser/origin. Old generic artifacts are preserved separately from new functional builds. A new preview URL does not automatically inherit old app data; export before retiring an old deployment.

OCR images are processed on demand and are not persisted by this app. Provider requests use `store:false`; this is not a claim of provider-wide zero retention. Logs omit receipt images and raw receipt contents. Token-derived cost values are labeled estimates, not reconciled invoices.

This remains an **internal pilot**, not a public multi-tenant release. Configured Firebase protects operator APIs and stores account ventures/revisions. Durable server-side usage accounting and globally enforced quotas remain prerequisites for public exposure. The per-process OCR test limit is not a global spending cap.

See `docs/FUNCTIONAL_BUILD_V3.md` for contracts, endpoints, acceptance tests and limitations.
