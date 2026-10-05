# Startup OS Runtime Setup

The GitHub Pages UI is static. The real AI runtime lives in `api/runtime.js` and is ready for Vercel Serverless.

## 1. Deploy the repository to Vercel

Import `lordet01/startupOS` as a Vercel project. No build command is required.

## 2. Add server-side environment variables

Add at least:

- `OPENAI_API_KEY` — required
- `OPENAI_MODEL=gpt-6-luna` — default low-cost planning model
- `ALLOWED_ORIGIN=https://lordet01.github.io`

Optional cost constants are documented in `.env.example`.

Never put `OPENAI_API_KEY` in `config.js`, GitHub Pages, localStorage, or client JavaScript.

## 3. Verify runtime

Open:

`https://<vercel-project>.vercel.app/api/runtime`

Expected JSON contains:

`{"ok":true,"service":"Startup OS Runtime",...}`

## 4. Link GitHub Pages to runtime

In Startup OS → Settings → Runtime endpoint, enter:

`https://<vercel-project>.vercel.app/api/runtime`

The endpoint is stored locally in the browser. A later production version should provision this automatically per workspace.

## Runtime behavior

- Uses OpenAI Responses API.
- Returns strict structured JSON for venture planning.
- Uses one cost-efficient model call per venture cycle.
- Records input/output token usage.
- Estimates provider cost.
- Adds a 5% Startup OS fee in the UI ledger.
- Keeps deployment/payment/ad-spend actions behind human approval.

## Example template

The pilot includes:

**나만의 여행계획 특화 ToDo List 플래너 개발**

Load it from the Overview or New Venture dialog, then click **Analyze with GPT**.
