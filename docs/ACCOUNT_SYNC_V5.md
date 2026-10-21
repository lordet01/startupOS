# StartupOS Workspace v5

## Shipped code

The operator workspace keeps one Venture for the complete Brief → Blueprint → Build → Deploy → Phone Test → Iterate flow. Existing reviewed receipt, travel and skin capabilities, physical-device evidence, app branding/PWA installation, screenshot cropping and code refinement remain in place.

| Area | Behavior |
| --- | --- |
| Authentication | Google popup/redirect, email registration/sign-in, reset, verification email, profile name |
| Session lifetime | Firebase-managed ID token refresh, local or browser-session persistence, configurable idle logout, 30-day maximum authentication age |
| API authorization | Google RS256 signature, Firebase project issuer/audience, expiry and authentication age checked before workspace mutation APIs; no service-account private key required for signature verification |
| Account isolation | Separate browser namespaces for guest and each UID; private cache parked before authentication resolves; logout/account switch replace visible workspace; stale in-flight API results discarded |
| Recovery | Original Mac browser sessions retained as guest data; explicit import; JSON export/import; colliding IDs become recovery copies |
| Sync | Debounced transaction writes, persistent pending queue, network retry/backoff, comparison with last acknowledged payload, preservation of simultaneous changes |
| Versions | Immutable Firestore revision snapshots; last 12 versions shown; restore creates a new recovery copy |
| My Apps | Search, sort, favorite, rename, duplicate Brief/Blueprint, archive/unarchive, reversible trash, resume |
| Cost Ledger | Existing token estimates, external expenses with evidence, fee estimate, planning budget, approved-cost reservations, CSV export |
| Approvals | Pending → approve/reject → complete with evidence/cancel; Agent decisions requiring approval create linked requests |
| Growth | Dated manual funnel measurements, source evidence, measurement history, experiment hypothesis/threshold/results; completed evidence included in the next Agent Cycle as founder-entered data |
| Operations | Settings reports auth/AI/publisher readiness without exposing credentials; normal and standalone Build previews reuse account authorization |

Approval records do not send messages, start ads or charge payments. Existing explicit Build/Deploy actions remain the actual execution paths. Cost estimates and planning-budget reservations are not a globally enforced provider spending cap.

## Production activation

Code alone cannot create the user's Firebase project or grant access to their Vercel team. The following operator configuration is still required before real cloud login is available:

1. Enable Google and Email/Password in Firebase Authentication and create a native Firestore database.
2. Authorize the exact production hostname, currently startup-os-beige.vercel.app, in Firebase Authentication. Use a stable hostname for redirect sign-in.
3. Publish firebase/firestore.rules from this revision, including the new versions subcollection and monotonically increasing revision rules. Old v4 rules reject v5 writes safely; the queue stays on the device.
4. Add these **public Firebase web app** settings to the existing Vercel startup-os project and redeploy:
   - FIREBASE_API_KEY
   - FIREBASE_AUTH_DOMAIN
   - FIREBASE_PROJECT_ID
   - FIREBASE_APP_ID
5. GET /api/cloud-config must show enabled: true and authRequired: true.
6. Verify one Google login and one email login with real accounts, then import the original Mac project and check it on the phone.

Setting FIREBASE_PROJECT_ID automatically protects the workspace APIs, regardless of STARTUPOS_AUTH_REQUIRED=false. STARTUPOS_AUTH_REQUIRED=true also closes the APIs before setup is complete. With neither setting, the existing internal-pilot behavior remains available; this is not an anonymously safe public SaaS mode.

Vercel project: startup-os / prj_lPHRFDHd3Ob6rkOuMTnpTqJqrxQh.
Team: team_5Xvxmw5pZpjXlHR1L4Cve7Rs (kmjeon-5238s-projects).

During this implementation the Vercel connector returned 403 forbidden for this team's project configuration. No CLI credentials were available. No production Firebase project/configuration or rule deployment was performed.

## Recover the Mac Chrome skin-analysis project

1. Open the original hostname in the original Mac Chrome profile.
2. Account → 전체 백업(JSON).
3. Sign in → 이 기기 프로젝트 가져오기.
4. On the phone sign into the same account → My Apps.
5. Resume the original project. The original session ID, Blueprint, build descriptor, chat and deployment metadata remain together when the ID does not collide.

A conflict or previous-version restoration creates another session ID while retaining the original build/chat as historical evidence. A copied build must be rebuilt under the new session before further verification/deployment; it is not falsely marked verified.

Browser-local records belonging to separately deployed customer apps remain on those app origins. Workspace synchronization does not silently move the apps' runtime data.

## Storage and security boundaries

- No ID tokens or provider secrets are placed in exported project JSON.
- ID tokens are sent only to the same origin. A manually entered external Runtime URL never receives the workspace token.
- Firebase handles credential persistence and token refresh. Server verification uses cached public Google certificates.
- Per-device server revocation and immediate revocation checks are not implemented; existing ID tokens can remain valid until their normal expiry. Idle logout is browser enforced; the 30-day authentication age is also server enforced.
- Firestore owner-only rules reject anonymous and other-user access. Revision histories are immutable to the client.
- Payload limit: 800KB per project, below Firestore's document limit. Oversized records stay local with a visible error and JSON export.
- Browser namespaces and pending queues use localStorage and its browser quota. A JSON backup and cloud copy are still needed before clearing browser data.
- Revision history stores full session snapshots. Retention cleanup, shared/team workspaces, a global server-enforced quota and provider billing reconciliation remain separate extensions.
- Analytics values are explicitly marked as manually recorded unless an actual analytics connector supplied them. No live PostHog, Stripe checkout or advertising connector is claimed.

## Validation

- npm test: backend/domain, workspace isolation, genuine RSA token checks, budget/approval transitions and experiment outcomes.
- npm run test:workspace:browser: two isolated Chromium contexts with explicitly mocked Firebase Auth/Firestore. Tests cover import, two-device updates, edits during writes, offline conflicts, pending-write refresh, account isolation, reversible management/history, approvals/Growth, cross-origin credential prevention and 401 logout.
- Existing mobile app, studio, screenshot/crop/refinement, Idea Note and Agent Cycle browser suites are retained.
- npm run test:rules: nine access/revision checks executed against a local Firestore emulator with the actual rules file. This verifies rule behavior locally; production rule publishing is still pending.
- Browser mock results do not establish that production Firebase providers, real security rules or real-user sign-in have been activated.
