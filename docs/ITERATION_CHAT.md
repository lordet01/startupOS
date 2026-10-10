# StartupOS · Session Iterate / Preview & Improve (v0.1)

## UX

After a project has a functional Build, the user stays in that Venture Session and uses `Build → Preview & Improve`:

1. **Mobile Preview**: a live 390 px interactive iframe of the *current Build* (`/api/build-preview`). Founder tests the actual PWA functions, rather than seeing a static mockup.
2. **Screenshot**: `현재 화면 캡처` self-hosts html2canvas 1.4.1 (license retained), captures the viewport within the same-origin iframe. `이미지 첨부` is fallback for unsupported graphics/video/iframes.
3. **Annotate**: screenshot opens an HTML Canvas; Pointer Events + `touch-action:none` support mouse, stylus and touch. Draw red marks with undo/clear, attach a short natural-language request.
4. **Chat**: `POST /api/refine` receives the prompt and marked screenshot. A server-side LLM proposes a **reviewed executable configuration diff**, or responds `requires_code` for unsupported work.
5. **Approval**: user sees `before → after`, supported changes, test points. `적용하고 New Build` calls `POST /api/build {action:refine-and-assemble}`. It validates values, Session ID, parent Build, current source and approvals.
6. **New artifact + Verify**: the code generates a fresh Build ID, revision and parent Build ID; embeds changed app settings in `window.APP_CONFIG`. Actual `capabilities/skin.js` and `lib/skin-service.js` read and use them. The existing automatic verification gate runs. If it fails, the new Build remains unverified and cannot be published.
7. **Again**: the preview reopens with the new artifact; chat history and Build history remain linked to that Venture Session. New feedback starts at the current Build.

## What can actually be changed in this initial pilot

**MySkin (skin) only:** photo guide wording, analysis CTA text, result title, observation focus (balanced/tone/texture/shine/redness), short/detailed explanations, observation/ingredient order, max ingredient categories (1–6), show/hide uncertainty labels, blue/teal/violet theme, normal/compact spacing, normal/large result text, divided list/card result layout.

All values are restricted to a reviewed JSON schema and validated server-side. The app still shows ingredient cautions and does not claim medical diagnosis. The revision's settings are carried in the *actual generated artifact*, not simply overlaid in chat.

**Not yet auto-generated:** arbitrary HTML/CSS/JS modifications, new features/DB tables, camera hardware changes, product purchasing API, payments, arbitrary app types, code commit/PR generation. The AI must report `requires_code`, not claim an executable result or silently replace it with a generic form. Support for those requests requires a sandboxed coder/test/publish workflow with approval.

## Model and data boundaries

- Server-only `OPENAI_API_KEY`; screenshots pass to the LLM only after tapping `AI에 수정 요청`.
- Screenshots and drawing strokes are kept in **tab memory** and are not copied into Venture localStorage. The saved chat message records only text and `screenshotAttached: true`, not image pixels. A page reload discards the image.
- Session state and chat history are browser-local for this pilot. New device/origin does **not** automatically sync. No customer-facing authentication, database or collaboration is implied.
- The screenshot engine operates on a same-origin Build Preview iframe; if the browser cannot render an embedded video/canvas securely, the UI provides a manual image-upload fallback.
- Only screenshots (resized to max width 900) are transmitted; screenshot attachment and prompt are bounded by size/length. Use caution with private facial photos; preview screenshot may contain sensitive content.
- Use rate limiting/global spend controls before exposing publicly. Per-function in-memory IP limits are not durable distributed quotas.

## Validation and tracing

- `node --test tests/refinement.test.cjs`: strict config, approval, parent Build identity, two revisions, real MySkin AI prompt switches, screenshot+text payload, unsupported requests.
- `node tests/refinement-ui.mjs`: Playwright interactive iframe, html2canvas capture, mouse/touch annotation, chat, approval, updated preview, two build cycles, session isolation and 390-px layout.
- Existing Build regression and Chromium smoke tests still run. They use mocked providers and simulated cameras; live Vision provider integration is separately verified with pinned fixtures.
- Before using it, old `functional-build-3.2.0` artifacts must be rebuilt on the current `3.3.0` engine. The UI displays a stale Build notice and a one-click link to the safe New Build action.

## Future evolution

A future Code Agent can replace the bounded `config_patch` adapter with `plan → sandbox patch → tests → review diff → commit/deploy`. Preserve the same Session/Build/history contract; do not accept arbitrary unreviewed code directly into the live Vercel deployer.
