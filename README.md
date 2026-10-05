# Startup OS — Pilot v0.1

Startup OS is an AI-native venture operating system for non-developers. The pilot focuses on mobile-first web apps/PWAs and models the full path from idea → validation → build → launch → growth → profitability.

## What is implemented

- Venture intake and thesis editor
- Venture Score / MVP readiness dashboard
- Role-based agent control room
- Goal-driven scheduler simulation
- Cost-aware technology recommendation
- Third-party cost ledger + 5% Startup OS fee model
- Launch gates and human-approval points
- Growth funnel / experiment simulator
- Local persistence via `localStorage`
- Vercel production deployment
- Responsive mobile-first UI

## Why the pilot runs in Demo Runtime

GitHub Pages is static hosting. Putting OpenAI/Claude/Stripe secret keys directly in browser JavaScript would expose credentials. Therefore the pilot separates the product UI from the future AI runtime.

Production architecture should add a minimal serverless adapter (Cloudflare Worker, Firebase Functions, etc.) that:

1. stores provider secrets,
2. routes tasks to the most cost-effective model,
3. records usage/cost in a ledger,
4. enforces budget caps and approval gates,
5. returns structured agent results to the web UI.

## Local run

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

No build step or package install is required.

## Production service

Canonical service URL:

https://startup-os-beige.vercel.app/

Vercel serves both the static Startup OS UI and the same-origin `/api/runtime` Serverless Function. GitHub is used as the source repository and deployment trigger only.

The former GitHub Pages URL is deprecated and redirects to the Vercel production service.

## Next production milestones

1. Serverless AI gateway + provider adapters (OpenAI first)
2. Firebase Auth / Firestore project persistence
3. Stripe billing and real cost ledger
4. GitHub repository generation/build agent
5. Market research connectors and evidence citations
6. Real analytics ingestion (PostHog)
7. Scheduler with durable jobs and approval workflow
8. Multi-tenant workspaces
