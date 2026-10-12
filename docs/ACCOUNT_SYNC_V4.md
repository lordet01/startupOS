# StartupOS v4: Login, My Apps, cross-device restoration

## Previous limitation
Browser localStorage key startupOS.sessions.v1 held venture/session state only in the original Chrome profile and hostname. Mac Chrome skin apps cannot appear in Android Chrome until migrated. Browser data is never deleted by this patch.

## Implemented paths
- Shared login dialog for dashboard and /builder/: Firebase Google Sign-In, email/password sign-in, registration, password reset, sign-out.
- Firestore users/{uid}/ventures/{sessionId} stores the **entire session** (brief, blueprint, build, refinement/chat, deploy, and test metadata). User-scoped Firestore rules deny cross-user reads and writes.
- Main navigation Sessions is now **My Apps**, preserving session dropdown/IDs.
- Existing browser-only sessions are not auto-uploaded on login. Account dialog **이 기기 프로젝트 가져오기** explicitly migrates this browser's local sessions.
- Session-ID collision with conflicting cloud data produces a new recovery-copy session ID, preserving the existing cloud version.
- Account UI supports local JSON backup and restore when online provider is not available.
- Active session remains locally selected (the user can switch to imported sessions from My Apps).

## Required Firebase configuration before real login
1. Create a Firebase project, enable a Cloud Firestore database (Native mode).
2. Firebase Authentication > Sign-in method: enable Google and Email/Password providers.
3. Firebase Authentication > Settings > Authorized domains: add startup-os-beige.vercel.app and any configured custom domain.
4. Firebase Firestore > Rules: publish contents of firebase/firestore.rules. Verify anonymous/cross-UID access denied before using real venture data.
5. Vercel project startup-os > Environment Variables: add Firebase **web app public config** under the following exact keys for Production and Preview as appropriate:
   FIREBASE_API_KEY
   FIREBASE_AUTH_DOMAIN
   FIREBASE_PROJECT_ID
   FIREBASE_APP_ID
6. Redeploy. Check GET /api/cloud-config returns enabled: true. A Firebase web apiKey is public client configuration; it is NOT a Firebase service-account private key.
7. Sign in to both devices under the SAME Google account or email/password identity.

## Recovery procedure for the existing skin-analysis app
1. On the MacBook, open startup-os-beige.vercel.app in the **original Chrome profile**, not incognito and not another profile.
2. Before changing any local storage, click Account > **이 기기 전체 백업(JSON)**.
3. Sign in to the chosen account and click **이 기기 프로젝트 가져오기**. The Skin Analysis session is copied up with its original session ID, build and chat history.
4. On Android Chrome visit the same origin, sign in to the same account, then open **My Apps** and choose Skin Analysis.
5. If the Mac localStorage profile is lost, the original local-only venture cannot be recovered merely by logging in. Use an earlier local JSON backup if available.

## Security and limitations
- Keep OPENAI_API_KEY, VERCEL_PUBLISH_TOKEN and Firebase service-account private credentials server-side only. Never put them in client-config.
- Auth and Firestore must actually be configured/published for cloud login to work; the UI displays "설정 필요" until that is true.
- The Firestore per-document max is 1 MiB; this implementation refuses uploads >800 kB instead of silently dropping data. Local JSON backup still preserves oversized sessions.
- Venture session metadata syncs, but app runtime records saved to a separate published app domain are independent and not migrated.
- The current sync is a pilot; durable offline retries, per-user size quotas, conflict comparison UI, versioned change history, and security/privacy audit should be added before untrusted multi-tenant public launch.
- Build or Deploy "verified" flags are not changed by this synchronization feature.

## Two-device verification criteria
- Login UI present on Android and Mac, in main and Build Studio.
- Firebase Google and email/password flows complete for each device.
- Firestore rules reject unauthenticated and cross-user read/write requests.
- Local skin-analysis session remains intact on Mac prior to first explicit import.
- Mac import uploads the Skin Analysis record; Android My Apps retrieves original ID, build and refinement history.
- Mac update appears on Android and reverse, without destroying unrelated sessions.
- Session ID collisions are preserved under recovery copy; original cloud version unchanged.
- JSON backup + restore independently work even before backend activation.
