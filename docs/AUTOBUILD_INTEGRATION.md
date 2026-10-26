# AutoBuild in the existing Build Studio

This integration extends the original StartupOS repository. My Apps, Venture/Blueprint, account workspaces, mobile preview, full/partial capture, annotation, improvement chat, Deploy and Phone Test remain in place. The dashboard's existing Build links open `/builder/?sessionId=…`; no separate AutoBuild project or account is created.

## Operation

1. Open a Venture's Build page and approve its existing Build scope.
2. Enter implementation instructions, or leave them blank to use that Venture's idea, features and journeys. Set iteration, repeated-failure, time and model-call limits. Enable AI code generation when needed. Approve automatic patch application only if desired; otherwise each proposal waits for `변경 승인`.
3. Start AutoBuild. New projects first assemble the supported capability; the instruction then goes to the existing code builder. Existing projects start from their current Build.
4. Inspect Requirements, Iterations, Verification, Changes and Log. Code, verification and preview refer to the same Venture and artifact hash. The existing chat's AutoBuild button carries its text and optional annotated capture into a new run form.
5. A failed check produces a corrective instruction. A reviewed repair recipe is preferred; otherwise `/api/refine` produces a source patch. The next Build is assembled and verified again. Configuration, provider/auth failures, missing browser evidence, repeated failure and limits stop the loop for an explicit decision.
6. When automatic checks pass, test the original journeys and requested behavior in the existing preview. Check each manual requirement, enter a review note, then approve completion. AutoBuild never invokes Publish; the original Deploy button remains a separate explicit action.

## Implementation

- `builder/autobuild-core.js`: versioned state transitions, hierarchical requirement records, approval gates, step leases, artifact binding, model-call reservations, stop conditions and contract revisions. CommonJS export supports backend tests; the same module runs in the browser.
- `builder/autobuild.js`: existing BuildBridge adapter and operational panel. It calls existing `/api/build` assembly/verification/repair and `/api/refine` source editing. It writes actual new Build descriptors into `functionalBuild`, so the established preview and chat see the changes.
- Runs, history and best verified Build live in `functionalAutoBuild`, `functionalAutoBuildHistory` and `functionalAutoBuildBest` inside the same Venture. Existing workspace writes, account namespaces and cloud sync handle them. Venture duplication already strips functional execution records and billed cost history.
- Original page/controller changes only add the panel, scripts, chat handoff and guards against concurrent manual Build work. The root dashboard layout, authentication, workspace persistence, backend credential handling and publish API are retained. My Apps adds a compact run status and resumes active runs in AutoBuild; Build navigation focuses that panel. Studio navigation links back to the original Venture, My Apps, Cost and Growth views.

## Honest pilot limits

This is a browser-driven integration using the existing skin/receipt/travel capability editor, not the durable server worker envisioned by `AUTOBUILD_DESIGN.md`. New repositories, arbitrary APIs/data models and unsupported capability kinds still require a separate adapter. The requirement tree is built from the Venture's existing structured features/journeys plus reviewed capability acceptance; it is not claimed to be a new LLM requirements analysis service.

Closing the tab stops orchestration. Reload preserves records and requires explicit continuation; an in-flight request has to finish or expire before explicit recovery. Provider timeouts never trigger an automatic duplicate paid call. Leases and limits are client-side pilot controls, not atomic cross-device locking or globally enforced spending quotas. Existing Firebase activation is still required for real account sign-in and cross-device sync; guest runs stay in the browser.

Each proposal reserves up to three internal code-agent model calls before the request. Known usage settles to actual attempts; ambiguous failures retain the reservation. Reported costs remain estimates or `비용 미확정`; the integration does not invent provider prices or invoices. Existing server credentials remain server-side.

Server verification executes artifact/domain/boot checks and validates the existing committed browser evidence against the base source hash. That cached evidence does not execute every new AI patch or prove a physical-phone pass. Original Venture features, journeys, initial instructions and UX therefore remain required **manual** completion gates. AutoBuild does not silently remove these when the capability smoke tests pass. New feedback increments the requirement contract and clears previous verification/manual acceptance. It resets repeated-failure detection for the changed instruction, while retaining used turns and model calls.

## Validation

Validation on this branch: **133 Node tests passed** (`npm test`), including 13 AutoBuild tests and the existing backend/domain/auth/workspace suites. JavaScript syntax and `git diff --check` passed. The AutoBuild suite exercises real `/api/build` assembly and travel verification, an actual executable source-patch rebuild with a different artifact hash, failed-check → diagnosis → patch → re-verification, explicit final/manual approvals, owner/build/source/evidence mismatch, leases, pause/cancel, timeout recovery, external blockers, call reservation, iteration/time/repeated-failure stops and preserved Studio controls.

Browser QA uses the original dashboard and Studio, real assembly/preview/verification handlers, and a clearly isolated **test-only** provider transport. It checks that a deliberately failed requirement causes another source edit and new artifact, then validates the changed preview, real travel create/save/reload, human completion, Venture isolation, record persistence and capture/chat handoff. Targeted browser QA passed: dashboard → Build; automatic application and per-change approval policies; pause/resume; first failed requirement → second source change → 23/23 checks; manual approval through completion; actual preview travel/item creation, completion and reload; full capture and text/image handoff; My Apps status/resume; Venture isolation; reload retention; per-turn evidence separation; 390px responsive layout without page overflow. A QA-only UUID compatibility shim compensates for the internal HTTP preview; production HTTPS source was not altered for that environment. No live model call, Firebase account acceptance, external deployment or physical-phone acceptance is implied by this test. The full legacy Playwright runner was not re-executed; its fixture asset lists and expected Build anchor were updated for the new integration.
