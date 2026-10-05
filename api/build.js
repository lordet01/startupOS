const MODEL = process.env.OPENAI_BUILD_MODEL || process.env.OPENAI_MODEL || "gpt-6-luna";
const INPUT_USD_PER_M = Number(process.env.OPENAI_INPUT_USD_PER_M || "0.10");
const OUTPUT_USD_PER_M = Number(process.env.OPENAI_OUTPUT_USD_PER_M || "0.50");
const MAX_OUTPUT = Number(process.env.OPENAI_BUILD_MAX_OUTPUT_TOKENS || "4600");

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
function schema(){
  return {
    type:"object",
    properties:{
      app_name:{type:"string"},
      slug:{type:"string"},
      build_summary:{type:"string"},
      index_html:{type:"string"},
      smoke_tests:{type:"array",items:{type:"string"},minItems:3,maxItems:6}
    },
    required:["app_name","slug","build_summary","index_html","smoke_tests"],
    additionalProperties:false
  };
}
function makeManifest(appName){
  return JSON.stringify({
    name:appName||"Venture App",
    short_name:String(appName||"App").slice(0,24),
    start_url:"./",
    display:"standalone",
    background_color:"#0b1220",
    theme_color:"#0b1220",
    icons:[{src:"./icon.svg",sizes:"any",type:"image/svg+xml",purpose:"any maskable"}]
  });
}
function makeServiceWorker(){
  return `const CACHE="venture-app-v1";const ASSETS=["./","./index.html","./manifest.webmanifest","./icon.svg"];self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return res}).catch(()=>caches.match("./index.html"))))});`;
}
function ensurePwaHooks(html){
  let out=String(html||"");
  if(!/manifest\.webmanifest/i.test(out)){
    out=out.replace(/<\/head>/i,'<link rel="manifest" href="./manifest.webmanifest"><meta name="theme-color" content="#0b1220"></head>');
  }
  if(!/serviceWorker\.register/i.test(out)){
    out=out.replace(/<\/body>/i,'<script>if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}))}</script></body>');
  }
  return out;
}

function sanitizeProject(project){
  const p = {...project};
  delete p.prototype;
  delete p.deployment;
  delete p._events;
  if (Array.isArray(p.costs)) p.costs = p.costs.slice(0,20);
  if (Array.isArray(p.decisions)) p.decisions = p.decisions.slice(0,20);
  return p;
}
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:"OPENAI_API_KEY is not configured"});
  let body=req.body;
  if(typeof body==="string"){try{body=JSON.parse(body)}catch{return res.status(400).json({error:"Invalid JSON"})}}
  const project=sanitizeProject(body&&body.project?body.project:{});
  const serialized=JSON.stringify(project);
  if(serialized.length>24000) return res.status(413).json({error:"Venture state too large"});
  const system=`You are Startup OS Builder, a senior product engineer building a functional pilot from a venture blueprint.

Generate a small but polished, mobile-first, installable web app prototype that the founder can actually use on a phone.

Rules:
- Produce one self-contained index.html with inline CSS/JS. The server will add the manifest and service worker.
- Vanilla browser APIs only. No npm/build step and no external JavaScript dependencies.
- Use localStorage for app data so the prototype remains usable after reload.
- Implement the core happy path, not every requested feature.
- Every visible button must work. Avoid dead controls.
- If the blueprint requires a secure third-party API/key that is not available to the generated app, do NOT fake a successful integration. Implement the surrounding real UX and show a clear "integration not connected" test state at the boundary.
- Do not spend output tokens on manifest/service-worker boilerplate; the server injects those hooks.
- Use responsive design optimized for smartphone portrait, but desktop must remain usable.
- Do not mention Startup OS inside the generated product UI.
- Do not include analytics, tracking, ads, or payment unless the blueprint explicitly needs it for the first usable prototype.
- Avoid remote images. Use CSS, text and emoji/SVG when helpful.
- Keep index_html deliberately compact (target under ~22 KB). Implement only the 1-2 core workflows needed to feel usable. Avoid long comments, mock datasets, decorative prose, or unused screens.
- Human-facing copy should be Korean unless the venture clearly requires another language.
- slug must be lowercase ASCII letters/numbers/hyphens only.`;
  const started=Date.now();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),80000);
  console.log(JSON.stringify({event:"mvp_build_start",model:MODEL,payload_bytes:serialized.length}));
  try{
    const upstream=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
      signal:controller.signal,
      body:JSON.stringify({
        model:MODEL,
        input:[
          {role:"system",content:system},
          {role:"user",content:`Venture Session:\n${serialized}\n\nBuild the smallest functional MVP that demonstrates the venture's core value.`}
        ],
        max_output_tokens:MAX_OUTPUT,
        text:{format:{type:"json_schema",name:"startup_os_mvp_build",strict:true,schema:schema()}}
      })
    });
    clearTimeout(timer);
    const data=await upstream.json();
    if(!upstream.ok) return res.status(upstream.status).json({error:data.error?.message||"OpenAI build error",provider_status:upstream.status});
    let result;
    try{result=JSON.parse(extractText(data))}catch{return res.status(502).json({error:"Builder returned invalid structured output"})}
    if(!/^<!doctype html>/i.test((result.index_html||"").trim())) return res.status(502).json({error:"Builder did not return a complete HTML document"});
    result.index_html=ensurePwaHooks(result.index_html);
    result.manifest_json=makeManifest(result.app_name);
    result.service_worker_js=makeServiceWorker();
    const inputTokens=Number(data.usage?.input_tokens||0),outputTokens=Number(data.usage?.output_tokens||0);
    const providerCost=(inputTokens/1e6)*INPUT_USD_PER_M+(outputTokens/1e6)*OUTPUT_USD_PER_M;
    console.log(JSON.stringify({event:"mvp_build_success",model:data.model||MODEL,latency_ms:Date.now()-started,input_tokens:inputTokens,output_tokens:outputTokens,html_bytes:result.index_html.length}));
    return res.status(200).json({
      ok:true,model:data.model||MODEL,response_id:data.id,latency_ms:Date.now()-started,
      usage:{input_tokens:inputTokens,output_tokens:outputTokens},
      cost:{provider_usd:Number(providerCost.toFixed(8)),startup_os_fee_usd:Number((providerCost*.05).toFixed(8))},
      build:result
    });
  }catch(err){
    clearTimeout(timer);
    const timeout=err&&(err.name==="AbortError"||/aborted/i.test(err.message||""));
    return res.status(timeout?504:500).json({error:timeout?"MVP build exceeded 80 seconds. Retry or reduce scope.":(err.message||"Build failed"),stage:"builder"});
  }
};
