const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const INPUT_USD_PER_M = Number(process.env.OPENAI_INPUT_USD_PER_M || "0.10");
const OUTPUT_USD_PER_M = Number(process.env.OPENAI_OUTPUT_USD_PER_M || "0.50");
const MAX_OUTPUT = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || "3400");

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allow = (process.env.ALLOWED_ORIGIN || "https://lordet01.github.io").split(",").map(s => s.trim());
  if (!origin || allow.includes(origin) || /https:\/\/[^/]+\.vercel\.app$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function extractText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    if (item.type !== "message") continue;
    for (const c of item.content || []) {
      if ((c.type === "output_text" || c.type === "text") && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n");
}

function schema() {
  return {
    type: "object",
    properties: {
      venture_name: { type: "string" },
      executive_summary: { type: "string" },
      venture_score: { type: "integer", minimum: 0, maximum: 100 },
      target_customer: { type: "string" },
      problem: { type: "string" },
      value_proposition: { type: "string" },
      monetization: { type: "string" },
      recommended_price_usd: { type: "number", minimum: 0 },
      mvp_features: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 7 },
      tech_stack: {
        type: "array",
        items: {
          type: "object",
          properties: {
            area: { type: "string" },
            service: { type: "string" },
            reason: { type: "string" },
            monthly_cost_usd: { type: "number", minimum: 0 }
          },
          required: ["area","service","reason","monthly_cost_usd"],
          additionalProperties: false
        },
        minItems: 4,
        maxItems: 8
      },
      service_flow: {
        type: "array",
        items: {
          type: "object",
          properties: {
            step: { type: "integer", minimum: 1 },
            title: { type: "string" },
            user_action: { type: "string" },
            system_action: { type: "string" }
          },
          required: ["step","title","user_action","system_action"],
          additionalProperties: false
        },
        minItems: 3,
        maxItems: 7
      },
      build_plan: {
        type: "array",
        items: {
          type: "object",
          properties: {
            phase: { type: "integer", minimum: 1 },
            title: { type: "string" },
            deliverable: { type: "string" },
            estimated_external_cost_usd: { type: "number", minimum: 0 }
          },
          required: ["phase","title","deliverable","estimated_external_cost_usd"],
          additionalProperties: false
        },
        minItems: 3,
        maxItems: 6
      },
      cost_breakdown: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item: { type: "string" },
            cost_type: { type: "string" },
            estimated_cost_usd: { type: "number", minimum: 0 },
            note: { type: "string" }
          },
          required: ["item","cost_type","estimated_cost_usd","note"],
          additionalProperties: false
        },
        minItems: 3,
        maxItems: 8
      },
      estimated_mvp_external_cost_usd: { type: "number", minimum: 0 },
      estimated_monthly_ops_usd_at_1000_mau: { type: "number", minimum: 0 },
      risks: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
      launch_gates: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6 },
      next_experiment: { type: "string" },
      next_action: { type: "string" },
      agent_notes: {
        type: "object",
        properties: {
          ceo: { type: "string" },
          market: { type: "string" },
          product: { type: "string" },
          finance: { type: "string" },
          tech: { type: "string" },
          legal: { type: "string" },
          growth: { type: "string" }
        },
        required: ["ceo","market","product","finance","tech","legal","growth"],
        additionalProperties: false
      }
    },
    required: [
      "venture_name","executive_summary","venture_score","target_customer","problem","value_proposition",
      "monetization","recommended_price_usd","mvp_features","tech_stack","service_flow","build_plan","cost_breakdown",
      "estimated_mvp_external_cost_usd","estimated_monthly_ops_usd_at_1000_mau","risks","launch_gates","next_experiment","next_action","agent_notes"
    ],
    additionalProperties: false
  };
}

function systemPrompt(mode) {
  return `You are Startup OS, an AI venture operating committee for a non-developer founder.
Your objective is not to produce impressive documents. Move the venture toward a profitable released product with the least reasonable external cost.

Hard product constraints:
- Build mobile-first web apps/PWAs. Avoid native iOS/Android unless absolutely unavoidable.
- Backend should use minimum-cost managed/serverless cloud services.
- AI must be consumed through APIs; do not propose self-hosting or model training for the MVP.
- Prefer deterministic rules, database lookup, or simple code when AI is unnecessary.
- Prefer free tiers and usage-based services for early validation.
- Recommend concrete third-party services where useful (for example Vercel, Firebase/Supabase, Stripe, PostHog, Resend, OpenAI). Every service must have a practical reason and an estimated early-stage monthly cost.
- Design the actual end-user service flow step by step: what the user does, what the system does, and what output is produced.
- Produce an implementation plan in build order. Each phase must have one concrete deliverable and a realistic external cash cost. Do not include founder labor as an external cash cost.
- Produce a cost breakdown that distinguishes one-time/setup, monthly fixed, and usage-based costs where relevant.
- If the founder leaves monetization, price, technology, or flow uncertain, choose the simplest testable option instead of inheriting assumptions from unrelated ventures.
- Separate assumptions from evidence.
- Keep the MVP small enough for one founder to validate.
- Consider privacy, copyright, platform policy, and user-data risks.
- Write all human-facing content in Korean. Product/service names may stay in English.
- Be concise and actionable.

For mode="${mode}", produce a structured venture decision that a founder can directly use to build the product. Avoid vague labels such as "AI backend" or "cloud"; name the concrete service/API and where it is used. If this is a cycle, use current metrics and prior decisions to identify the single biggest bottleneck and the cheapest next experiment. Do not expand scope without a measurable reason.`;
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "Startup OS Runtime", model: MODEL, api: "OpenAI Responses API" });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OPENAI_API_KEY is not configured on the server." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON body" }); }
  }
  const mode = body && body.mode === "cycle" ? "cycle" : "analyze";
  const project = body && body.project ? body.project : {};
  const serialized = JSON.stringify(project);
  if (serialized.length > 16000) return res.status(413).json({ error: "Project payload too large" });

  const input = [
    { role: "system", content: systemPrompt(mode) },
    { role: "user", content: `현재 Venture State(JSON):\n${serialized}\n\n이 상태를 분석하여 다음 의사결정을 내려라.` }
  ];

  const started = Date.now();
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        input,
        max_output_tokens: MAX_OUTPUT,
        text: {
          format: {
            type: "json_schema",
            name: "startup_os_venture_decision",
            strict: true,
            schema: schema()
          }
        }
      })
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error?.message || "OpenAI API error", provider_status: upstream.status });
    }

    const raw = extractText(data);
    let analysis;
    try { analysis = JSON.parse(raw); }
    catch { return res.status(502).json({ error: "Model returned non-JSON output", raw: raw.slice(0, 1000) }); }

    const inputTokens = Number(data.usage?.input_tokens || 0);
    const outputTokens = Number(data.usage?.output_tokens || 0);
    const providerCost = (inputTokens / 1e6) * INPUT_USD_PER_M + (outputTokens / 1e6) * OUTPUT_USD_PER_M;
    const platformFee = providerCost * 0.05;

    return res.status(200).json({
      ok: true,
      mode,
      model: data.model || MODEL,
      response_id: data.id,
      latency_ms: Date.now() - started,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      cost: {
        provider_usd: Number(providerCost.toFixed(8)),
        startup_os_fee_usd: Number(platformFee.toFixed(8)),
        total_usd: Number((providerCost + platformFee).toFixed(8))
      },
      analysis
    });
  } catch (err) {
    return res.status(500).json({ error: err && err.message ? err.message : "Runtime failure" });
  }
};
