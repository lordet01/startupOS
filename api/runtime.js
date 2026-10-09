const {projectContext}=require("../lib/venture-context");
const {blueprintSchema,blueprintPrompt,normalizeBlueprint}=require("../lib/blueprint");
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

const BLUEPRINT_MODEL=process.env.OPENAI_BLUEPRINT_MODEL||'gpt-4.1-mini';
const CYCLE_MODEL=process.env.OPENAI_CYCLE_MODEL||MODEL;
function tokenCost(usage,model){
 const input=Number(usage?.input_tokens||0),output=Number(usage?.output_tokens||0);
 const mini=/^gpt-4\.1-mini(?:-|$)/.test(model);
 const inRate=mini?0.40:INPUT_USD_PER_M,outRate=mini?1.60:OUTPUT_USD_PER_M;
 return {input,output,reasoning:Number(usage?.output_tokens_details?.reasoning_tokens||0),usd:(input*inRate+output*outRate)/1e6};
}
function feeCost(usd){return {provider_usd:Number(usd.toFixed(8)),startup_os_fee_usd:Number((usd*.05).toFixed(8)),total_usd:Number((usd*1.05).toFixed(8)),kind:'estimated_token_cost'};}
module.exports=async function handler(req,res){
 setCors(req,res);res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS')return res.status(204).end();
 if(req.method==='GET')return res.status(200).json({ok:true,service:'Startup OS Runtime',model:BLUEPRINT_MODEL,cycle_model:CYCLE_MODEL,blueprint_version:'compact-v2'});
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'OPENAI_API_KEY is not configured'});
 let body=req.body;
 if(typeof body==='string'){try{body=JSON.parse(body);}catch{return res.status(400).json({error:'Invalid JSON body'});}}
 const mode=body?.mode==='cycle'?'cycle':'analyze';
 const project=projectContext(body?.project||{},mode);
 if(!project.session_id||!project.idea)return res.status(400).json({error:'Venture session ID and idea are required'});
 const serialized=JSON.stringify(project);
 if(serialized.length>16000)return res.status(413).json({error:'Sanitized Venture context too large',stage:'context_validation'});
 const model=mode==='cycle'?CYCLE_MODEL:BLUEPRINT_MODEL;
 const limit=mode==='cycle'?Math.max(3000,Math.min(MAX_OUTPUT,6000)):Math.max(5000,Math.min(MAX_OUTPUT,7500));
 const input=mode==='cycle'?
  [{role:'system',content:cyclePrompt()},{role:'user',content:'세션 상태의 사실과 가정을 구분하고 가장 작은 다음 실험을 결정하라.\n'+serialized}]:
  [{role:'system',content:blueprintPrompt()},{role:'user',content:'Build a concise, specific mobile PWA Blueprint for this original idea (not a template):\n'+serialized}];
 const schemaValue=mode==='cycle'?cycleSchema():blueprintSchema();
 const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);
 let total=0,totalInput=0,totalOutput=0,reasoning=0,lastReason='unknown',attempted=0;
 console.log(JSON.stringify({event:'venture_runtime_start',model,mode,context_bytes:serialized.length,output_limit:limit}));
 try{
  for(let attempt=1;attempt<=2;attempt++){
   if(Date.now()-started>37500)break;
   attempted=attempt;
   const maxOutput=attempt===1?limit:Math.min(9000,Math.round(limit*1.5));
   const request={model,input,store:false,max_output_tokens:maxOutput,
     text:{format:{type:'json_schema',name:mode==='cycle'?'startup_os_cycle':'startup_os_compact_blueprint',strict:true,schema:schemaValue}}};
   const upstream=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
      signal:controller.signal,body:JSON.stringify(request)
   });
   const data=await upstream.json().catch(()=>null);
   if(!data)return res.status(502).json({error:'OpenAI returned non-JSON response',stage:'provider_response'});
   if(!upstream.ok)return res.status(upstream.status).json({error:data.error?.message||'OpenAI request failed',stage:'provider',provider_status:upstream.status});
   const t=tokenCost(data.usage,data.model||model);total+=t.usd;totalInput+=t.input;totalOutput+=t.output;reasoning+=t.reasoning;
   const incomplete=(data.status==='incomplete'||Boolean(data.incomplete_details));
   lastReason=data.incomplete_details?.reason||(incomplete?'model_incomplete':'unknown');
   let parsed;
   if(!incomplete&&data.status!=='failed'){
     try{parsed=JSON.parse(extractText(data));}catch{lastReason='invalid_structured_output';}
   }
   if(parsed){
     let result;
     try{result=mode==='cycle'?parsed:normalizeBlueprint(parsed,project);}
     catch(e){lastReason='blueprint_validation_failed';console.warn(JSON.stringify({event:'blueprint_validation_failed',error:e.message,attempt}));}
     if(result){
       const response={
         ok:true,mode,model:data.model||model,response_id:data.id,latency_ms:Date.now()-started,
         usage:{input_tokens:totalInput,output_tokens:totalOutput,reasoning_tokens:reasoning,attempts:attempt},
         cost:feeCost(total),...(mode==='cycle'?{cycle:result}:{analysis:result})
       };
       console.log(JSON.stringify({event:'venture_runtime_success',mode,model:response.model,attempt,latency_ms:response.latency_ms,output_tokens:totalOutput,reasoning_tokens:reasoning}));
       return res.status(200).json(response);
     }
   }
   console.warn(JSON.stringify({event:'venture_runtime_incomplete',mode,attempt,reason:lastReason,max_output_tokens:maxOutput,reasoning_tokens:t.reasoning,elapsed_ms:Date.now()-started}));
   if(attempt===2)break;
  }
  return res.status(502).json({
   error:'GPT 결과가 완성되지 않았습니다. 기존 Idea Note와 입력값은 보존되었습니다. 다시 분석해 주세요.',
   code:'MODEL_INCOMPLETE',stage:'model_completion',reason:lastReason,attempts:attempted,
   latency_ms:Date.now()-started,usage:{input_tokens:totalInput,output_tokens:totalOutput,reasoning_tokens:reasoning},
   cost:feeCost(total)
  });
 }catch(e){
   const timedOut=e.name==='AbortError'||e.name==='TimeoutError';
   console.error(JSON.stringify({event:'venture_runtime_error',mode,error:e.message,latency_ms:Date.now()-started}));
   return res.status(timedOut?504:500).json({error:timedOut?'GPT 응답 시간 초과. 입력값은 보존되어 있습니다.':(e.message||'Runtime failed'),stage:'openai_request'});
 }finally{clearTimeout(timer);}
};
