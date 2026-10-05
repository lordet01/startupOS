const MODEL = process.env.OPENAI_BUILD_MODEL || process.env.OPENAI_MODEL || "gpt-6-luna";
const INPUT_USD_PER_M = Number(process.env.OPENAI_INPUT_USD_PER_M || "0.10");
const OUTPUT_USD_PER_M = Number(process.env.OPENAI_OUTPUT_USD_PER_M || "0.50");
const MAX_OUTPUT = Number(process.env.OPENAI_BUILD_MAX_OUTPUT_TOKENS || "2200");

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
      app_type:{type:"string",enum:["checklist","ledger","tracker","planner","form"]},
      entity_name:{type:"string"},
      primary_action_label:{type:"string"},
      empty_state:{type:"string"},
      fields:{
        type:"array",
        items:{
          type:"object",
          properties:{
            key:{type:"string"},
            label:{type:"string"},
            type:{type:"string",enum:["text","number","currency","date","textarea","select","checkbox","photo"]},
            required:{type:"boolean"},
            placeholder:{type:"string"},
            options:{type:"array",items:{type:"string"},maxItems:8}
          },
          required:["key","label","type","required","placeholder","options"],
          additionalProperties:false
        },
        minItems:3,maxItems:8
      },
      integration_boundaries:{
        type:"array",
        items:{
          type:"object",
          properties:{
            service:{type:"string"},
            reason:{type:"string"},
            fallback:{type:"string"}
          },
          required:["service","reason","fallback"],
          additionalProperties:false
        },
        maxItems:4
      },
      smoke_tests:{type:"array",items:{type:"string"},minItems:3,maxItems:6}
    },
    required:["app_name","slug","build_summary","app_type","entity_name","primary_action_label","empty_state","fields","integration_boundaries","smoke_tests"],
    additionalProperties:false
  };
}

function sanitizeProject(project){
  const p={...project};
  delete p.prototype; delete p.deployment; delete p._events;
  if(Array.isArray(p.costs))p.costs=p.costs.slice(0,12);
  if(Array.isArray(p.decisions))p.decisions=p.decisions.slice(0,12);
  return p;
}

function safeText(v){return String(v==null?"":v)}
function safeSlug(v){return safeText(v).toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,36)||"venture-app"}
function jsonForScript(v){return JSON.stringify(v).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026")}

function makeManifest(spec){
  return JSON.stringify({
    name:spec.app_name,
    short_name:String(spec.app_name||"App").slice(0,24),
    start_url:"./",
    display:"standalone",
    background_color:"#08111f",
    theme_color:"#08111f",
    icons:[{src:"./icon.svg",sizes:"any",type:"image/svg+xml",purpose:"any maskable"}]
  });
}

function makeServiceWorker(){
  return 'const C="venture-pwa-v1",A=["./","./index.html","./manifest.webmanifest","./icon.svg"];self.addEventListener("install",e=>e.waitUntil(caches.open(C).then(c=>c.addAll(A))));self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>caches.match("./index.html"))))});';
}

function renderHtml(spec){
  const injected=jsonForScript(spec);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#08111f"><link rel="manifest" href="./manifest.webmanifest">
<title>${safeText(spec.app_name)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#07111e;color:#f7f9fd;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}button,input,textarea,select{font:inherit}.app{max-width:720px;margin:auto;min-height:100vh;padding-bottom:82px}.top{padding:24px 18px 14px;position:sticky;top:0;background:#07111eee;backdrop-filter:blur(12px);z-index:5}.top h1{font-size:25px;margin:4px 0}.muted{color:#93a6bf;font-size:12px;line-height:1.55}.content{padding:10px 16px}.card{background:#102039;border:1px solid #29405e;border-radius:18px;padding:16px;margin-bottom:12px}.metric{font-size:28px;font-weight:850}.btn{border:0;border-radius:12px;padding:12px 14px;background:#1a3357;color:#fff;font-weight:750;cursor:pointer}.primary{background:linear-gradient(135deg,#638cff,#725fff)}.wide{width:100%}.field{margin:0 0 13px}.field label{display:block;font-size:11px;color:#9db0c9;margin-bottom:6px}.field input,.field textarea,.field select{width:100%;background:#071522;border:1px solid #345070;color:#fff;border-radius:10px;padding:11px}.field textarea{min-height:88px}.tabs{position:fixed;bottom:0;left:0;right:0;background:#081422f2;border-top:1px solid #263d59;display:flex;justify-content:center;z-index:10}.tabs div{width:min(720px,100%);display:grid;grid-template-columns:repeat(4,1fr);padding:8px}.tabs button{border:0;background:transparent;color:#7890ad;padding:8px 2px;font-size:11px}.tabs button.on{color:#fff;font-weight:800}.row{display:flex;justify-content:space-between;gap:10px;align-items:center}.record{padding:12px 0;border-bottom:1px solid #263c57}.record:last-child{border-bottom:0}.pill{display:inline-block;border:1px solid #365e84;border-radius:999px;padding:4px 8px;font-size:10px;color:#bcd6f4}.warn{border-color:#725239;background:#2a2115;color:#ffd28d}.empty{text-align:center;padding:48px 18px;color:#90a4bf}.bigAction{font-size:16px;padding:15px}.photoNote{font-size:10px;color:#8298b4;margin-top:5px}
</style>
</head>
<body><main id="app" class="app"></main>
<script>
const SPEC=${injected};
const KEY="venture:"+SPEC.slug+":records";
let records=JSON.parse(localStorage.getItem(KEY)||"[]"),view="home";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>new Intl.NumberFormat("ko-KR",{style:"currency",currency:"KRW",maximumFractionDigits:0}).format(Number(n||0));
function save(){localStorage.setItem(KEY,JSON.stringify(records))}
function fieldInput(f){let base='id="f_'+esc(f.key)+'" '+(f.required?"required":"");if(f.type==="textarea")return '<textarea '+base+' placeholder="'+esc(f.placeholder)+'"></textarea>';if(f.type==="select")return '<select '+base+'><option value="">선택</option>'+f.options.map(o=>'<option>'+esc(o)+'</option>').join("")+'</select>';if(f.type==="checkbox")return '<input '+base+' type="checkbox">';if(f.type==="photo")return '<input '+base+' type="file" accept="image/*" capture="environment"><div class="photoNote">사진은 이 Pilot에서 기기에 저장하지 않고 파일명만 기록합니다.</div>';let type=f.type==="number"||f.type==="currency"?"number":f.type==="date"?"date":"text";return '<input '+base+' type="'+type+'" placeholder="'+esc(f.placeholder)+'">'}
function nav(){return '<div class="tabs"><div>'+[["home","홈"],["add","추가"],["records","기록"],["insights","요약"]].map(x=>'<button data-v="'+x[0]+'" class="'+(view===x[0]?"on":"")+'">'+x[1]+'</button>').join("")+'</div></div>'}
function header(sub){return '<header class="top"><div class="muted">'+esc(SPEC.entity_name)+'</div><h1>'+esc(SPEC.app_name)+'</h1><div class="muted">'+esc(sub||SPEC.build_summary)+'</div></header>'}
function home(){let amountField=SPEC.fields.find(f=>f.type==="currency"||f.type==="number");let total=amountField?records.reduce((s,r)=>s+Number(r[amountField.key]||0),0):0;return header()+ '<section class="content"><div class="card"><div class="muted">저장된 '+esc(SPEC.entity_name)+'</div><div class="metric">'+records.length+'</div>'+(amountField?'<div class="muted" style="margin-top:10px">누적 '+esc(amountField.label)+'</div><div class="metric" style="font-size:20px">'+money(total)+'</div>':'')+'</div><button class="btn primary wide bigAction" id="goAdd">'+esc(SPEC.primary_action_label)+'</button>'+SPEC.integration_boundaries.map(b=>'<div class="card warn"><div class="pill">Integration boundary</div><h3>'+esc(b.service)+'</h3><div class="muted">'+esc(b.reason)+'<br><b>현재 Pilot:</b> '+esc(b.fallback)+'</div></div>').join("")+'<div class="card"><h3>최근 기록</h3>'+recent(3)+'</div></section>'+nav()}
function add(){return header("새 "+SPEC.entity_name+" 입력")+'<section class="content"><form id="form" class="card">'+SPEC.fields.map(f=>'<div class="field"><label>'+esc(f.label)+(f.required?" *":"")+'</label>'+fieldInput(f)+'</div>').join("")+'<button class="btn primary wide" type="submit">저장</button></form></section>'+nav()}
function recent(limit){let arr=records.slice().reverse().slice(0,limit||999);if(!arr.length)return '<div class="empty">'+esc(SPEC.empty_state)+'</div>';return arr.map((r,i)=>'<div class="record"><div class="row"><b>'+esc(primary(r))+'</b><span class="pill">'+new Date(r._at).toLocaleDateString()+'</span></div>'+SPEC.fields.slice(1,4).map(f=>r[f.key]!==""&&r[f.key]!=null?'<div class="muted">'+esc(f.label)+': '+esc(f.type==="currency"?money(r[f.key]):String(r[f.key]))+'</div>':"").join("")+(SPEC.app_type==="checklist"?'<button class="btn" data-toggle="'+esc(r._id)+'" style="margin-top:8px">'+(r._done?"✓ 완료":"완료 처리")+'</button>':"")+'</div>').join("")}
function primary(r){let f=SPEC.fields.find(x=>x.type==="text"||x.type==="textarea")||SPEC.fields[0];return r[f.key]||SPEC.entity_name}
function list(){return header("저장된 기록")+'<section class="content"><div class="card">'+recent(999)+'</div></section>'+nav()}
function insights(){let num=SPEC.fields.filter(f=>f.type==="currency"||f.type==="number");return header("내 데이터 요약")+'<section class="content"><div class="card"><div class="muted">총 기록</div><div class="metric">'+records.length+'</div></div>'+num.map(f=>'<div class="card"><div class="muted">'+esc(f.label)+' 합계</div><div class="metric" style="font-size:22px">'+(f.type==="currency"?money(records.reduce((s,r)=>s+Number(r[f.key]||0),0)):records.reduce((s,r)=>s+Number(r[f.key]||0),0))+'</div></div>').join("")+'<div class="card"><button class="btn wide" id="clearAll">모든 로컬 데이터 삭제</button></div></section>'+nav()}
function render(){document.getElementById("app").innerHTML=view==="add"?add():view==="records"?list():view==="insights"?insights():home();bind()}
function bind(){document.querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{view=b.dataset.v;render()});let g=document.getElementById("goAdd");if(g)g.onclick=()=>{view="add";render()};let form=document.getElementById("form");if(form)form.onsubmit=e=>{e.preventDefault();let r={_id:Date.now().toString(36),_at:new Date().toISOString(),_done:false};SPEC.fields.forEach(f=>{let el=document.getElementById("f_"+f.key);r[f.key]=f.type==="checkbox"?el.checked:f.type==="photo"?(el.files&&el.files[0]?el.files[0].name:""):el.value});records.push(r);save();view="records";render()};document.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>{let r=records.find(x=>x._id===b.dataset.toggle);if(r){r._done=!r._done;save();render()}});let cl=document.getElementById("clearAll");if(cl)cl.onclick=()=>{if(confirm("모든 데이터를 삭제할까요?")){records=[];save();render()}}}
render();if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
</script></body></html>`;
}

module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method==="GET")return res.status(200).json({ok:true,service:"Startup OS MVP Builder",mode:"spec-to-pwa",model:MODEL});
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"OPENAI_API_KEY is not configured"});
  let body=req.body;
  if(typeof body==="string"){try{body=JSON.parse(body)}catch{return res.status(400).json({error:"Invalid JSON"})}}
  const project=sanitizeProject(body&&body.project?body.project:{});
  const serialized=JSON.stringify(project);
  if(serialized.length>24000)return res.status(413).json({error:"Venture state too large"});

  const system=`You are Startup OS Product Spec Builder.
Convert the venture blueprint into a very small functional PWA specification. Do not write code.

Choose one app_type:
- checklist: tasks/items that can be completed
- ledger: repeated records with amount/cost fields
- tracker: repeated observations or measurements
- planner: planned items with dates
- form: generic structured records

Design 3-8 practical fields only. Use "photo" when camera capture is central. For secure/external APIs not yet connected, list them under integration_boundaries and define a usable manual fallback. The prototype must still be useful without pretending the integration works. Korean UI copy. Keep the spec concise.`;

  const started=Date.now();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),45000);
  console.log(JSON.stringify({event:"mvp_spec_start",model:MODEL,payload_bytes:serialized.length}));
  try{
    const upstream=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
      signal:controller.signal,
      body:JSON.stringify({
        model:MODEL,
        input:[
          {role:"system",content:system},
          {role:"user",content:`Venture Session:\n${serialized}\n\nCreate the smallest useful product spec.`}
        ],
        max_output_tokens:MAX_OUTPUT,
        text:{format:{type:"json_schema",name:"startup_os_app_spec",strict:true,schema:schema()}}
      })
    });
    clearTimeout(timer);
    const data=await upstream.json();
    if(!upstream.ok)return res.status(upstream.status).json({error:data.error?.message||"OpenAI build error",provider_status:upstream.status,stage:"openai_spec"});
    let spec;
    try{spec=JSON.parse(extractText(data))}catch{return res.status(502).json({error:"Builder returned invalid app spec",stage:"parse_spec"})}
    spec.slug=safeSlug(spec.slug||spec.app_name);
    const html=renderHtml(spec);
    const inputTokens=Number(data.usage?.input_tokens||0),outputTokens=Number(data.usage?.output_tokens||0);
    const providerCost=(inputTokens/1e6)*INPUT_USD_PER_M+(outputTokens/1e6)*OUTPUT_USD_PER_M;
    const build={
      app_name:spec.app_name,
      slug:spec.slug,
      build_summary:spec.build_summary,
      app_type:spec.app_type,
      index_html:html,
      manifest_json:makeManifest(spec),
      service_worker_js:makeServiceWorker(),
      smoke_tests:spec.smoke_tests,
      app_spec:spec
    };
    console.log(JSON.stringify({event:"mvp_spec_success",model:data.model||MODEL,latency_ms:Date.now()-started,input_tokens:inputTokens,output_tokens:outputTokens,html_bytes:html.length}));
    return res.status(200).json({
      ok:true,model:data.model||MODEL,response_id:data.id,latency_ms:Date.now()-started,
      usage:{input_tokens:inputTokens,output_tokens:outputTokens},
      cost:{provider_usd:Number(providerCost.toFixed(8)),startup_os_fee_usd:Number((providerCost*.05).toFixed(8))},
      build
    });
  }catch(err){
    clearTimeout(timer);
    const timeout=err&&(err.name==="AbortError"||/aborted/i.test(err.message||""));
    console.error(JSON.stringify({event:"mvp_spec_error",latency_ms:Date.now()-started,error:err&&err.message?err.message:"Build failed"}));
    return res.status(timeout?504:500).json({error:timeout?"MVP spec generation exceeded 45 seconds. Retry.":(err.message||"Build failed"),stage:"builder"});
  }
};
