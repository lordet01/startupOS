const {projectContext}=require("../lib/venture-context");
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

function cycleSchema(){
  return {
    type:"object",
    properties:{
      bottleneck:{type:"string"},
      evidence:{type:"string"},
      evidence_level:{type:"string",enum:["observed","hypothesis","missing"]},
      decision:{type:"string",enum:["continue","refine","pivot","pause"]},
      rationale:{type:"string"},
      experiment:{type:"string"},
      next_action:{type:"string"},
      success_metric:{type:"string"},
      success_threshold:{type:"string"},
      estimated_external_cost_usd:{type:"number",minimum:0},
      human_approval_required:{type:"boolean"},
      missing_evidence:{type:"array",items:{type:"string"},maxItems:4},
      role_notes:{
        type:"object",
        properties:{
          ceo:{type:"string"},market:{type:"string"},product:{type:"string"},
          tech:{type:"string"},finance:{type:"string"},legal:{type:"string"},growth:{type:"string"}
        },
        required:["ceo","market","product","tech","finance","legal","growth"],
        additionalProperties:false
      }
    },
    required:["bottleneck","evidence","evidence_level","decision","rationale","experiment","next_action","success_metric","success_threshold","estimated_external_cost_usd","human_approval_required","missing_evidence","role_notes"],
    additionalProperties:false
  };
}
function cyclePrompt(){
  return `You are StartupOS Venture Operating Committee. Provide ONE actual structured decision, not a generic report.
This is a *single LLM committee pass* considering CEO, Market, Product, Tech, Finance, Legal and Growth perspectives. Do not pretend seven independent agents, web research, code changes, deployment or experiments were performed.
Given only the current session context:
1. Identify the single biggest verified obstacle to the NEXT useful release or test.
2. Distinguish observed facts from hypotheses and missing information. If metrics.source=not_connected, do not claim real traffic, conversion, users, sales or measured outcomes.
3. Propose ONE low-cost concrete experiment, the next practical action, measurable success metric and threshold. Never treat model-generated scores as evidence.
4. Each role note must be concise, actionable and context-specific. The CEO selects the final decision; Tech references the existing PWA, integrations and functional verification when relevant; Finance states an estimated EXTERNAL cost (not a charge already incurred); Legal notes real privacy/consent risks only if relevant.
5. Do not overwrite Blueprint, change code, call services, charge payment, deploy or buy ads. The next action must explicitly remain pending for the founder to perform/approve.
6. Preserve the founder's B2C intent, low-cost API/serverless-only stack and web/PWA boundaries. Do not invent facts or make claims about new market research.
7. Respond in Korean (role keys in English). Keep it compact and no buzzwords.`;
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
  const rawProject = body && body.project ? body.project : {};
  const project = projectContext(rawProject,mode);
  if (!project.session_id || !project.idea) return res.status(400).json({error:"Venture session ID and idea are required."});
  const serialized = JSON.stringify(project);
  if (serialized.length > 16000) return res.status(413).json({error:"Sanitized Venture context too large",stage:"context_validation"});
  const input = mode==="cycle" ? [
    {role:"system",content:cyclePrompt()},
    {role:"user",content:"현재 세션에서 증거가 확인되는 사항과 불확실한 사항을 구분하여 다음 액션을 결정해라.\\nVenture context:\\n"+serialized}
  ] : [
    {role:"system",content:systemPrompt(mode)},
    {role:"user",content:"현재 Venture State(JSON):\\n"+serialized+"\\n\\n이 상태를 분석하여 사업 Blueprint를 작성하라."}
  ];

  const started = Date.now();
  console.log(JSON.stringify({event:"venture_runtime_start",mode,model:MODEL,payload_bytes:serialized.length}));
  const controller = new AbortController();
  const upstreamTimer = setTimeout(() => controller.abort(), 55000);
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        input,
        max_output_tokens: mode==="cycle" ? Math.min(MAX_OUTPUT,2600) : MAX_OUTPUT,
        text: {
          format: {
            type: "json_schema",
            name: mode==="cycle" ? "startup_os_cycle_decision" : "startup_os_venture_decision",
            strict: true,
            schema: mode==="cycle" ? cycleSchema() : schema()
          }
        }
      })
    });

    clearTimeout(upstreamTimer);
    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error?.message || "OpenAI API error", provider_status: upstream.status });
    }

    if (data.status && data.status !== "completed") return res.status(502).json({error:"Model output incomplete",stage:"model_completion"});
    const raw = extractText(data);
    let analysis;
    try { analysis = JSON.parse(raw); }
    catch { return res.status(502).json({error:"Model returned non-JSON output",stage:"structured_output"}); }
    if (mode==="cycle" && (!analysis.role_notes || !analysis.next_action || !analysis.bottleneck)) {
      return res.status(502).json({error:"Cycle response missing required decisions",stage:"structured_output"});
    }

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
      ...(mode==="cycle" ? {cycle:analysis} : {analysis})
    });
  } catch (err) {
    clearTimeout(upstreamTimer);
    const isTimeout = err && (err.name === "AbortError" || /aborted/i.test(err.message || ""));
    console.error(JSON.stringify({event:"venture_runtime_error",mode,latency_ms:Date.now()-started,error:err && err.message ? err.message : "Runtime failure"}));
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? "OpenAI response exceeded 55 seconds. Please retry." : (err && err.message ? err.message : "Runtime failure"),
      stage: "openai_request"
    });
  }
};
