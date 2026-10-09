'use strict';

/* Compact, model-generated plan + deterministic presentation fields.
   The LLM should never spend output tokens repeating client-state or emitting
   tables/role notes that the server can derive from the product blueprint. */

const text=(value,max=500)=>String(value==null?'':value).trim().slice(0,max);
const number=(value)=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const arr=(value,max)=>Array.isArray(value)?value.slice(0,max):[];
function blueprintSchema(){
  const tech={type:'object',properties:{
    area:{type:'string'},service:{type:'string'},reason:{type:'string'},
    monthly_cost_usd:{type:'number',minimum:0}
  },required:['area','service','reason','monthly_cost_usd'],additionalProperties:false};
  const flow={type:'object',properties:{
    title:{type:'string'},user_action:{type:'string'},system_action:{type:'string'}
  },required:['title','user_action','system_action'],additionalProperties:false};
  const phase={type:'object',properties:{
    title:{type:'string'},deliverable:{type:'string'},
    estimated_external_cost_usd:{type:'number',minimum:0}
  },required:['title','deliverable','estimated_external_cost_usd'],additionalProperties:false};
  const fields={
    venture_name:{type:'string'},
    value_proposition:{type:'string'},
    monetization:{type:'string'},
    recommended_price_usd:{type:'number',minimum:0},
    mvp_features:{type:'array',items:{type:'string'},minItems:3,maxItems:6},
    tech_stack:{type:'array',items:tech,minItems:2,maxItems:6},
    service_flow:{type:'array',items:flow,minItems:3,maxItems:6},
    build_plan:{type:'array',items:phase,minItems:2,maxItems:5},
    risks:{type:'array',items:{type:'string'},minItems:2,maxItems:4},
    next_experiment:{type:'string'},
    next_action:{type:'string'}
  };
  return {type:'object',properties:fields,required:Object.keys(fields),additionalProperties:false};
}
function blueprintPrompt(){
  return `You are StartupOS Product Architect. Convert the founder's specific idea into a focused, buildable, budget-aware mobile web/PWA Blueprint, not a long business report.

MANDATORY:
- Respect the founder's actual project. Do not recycle Travel ToDo or OCR Ledger examples, and do not introduce a generic substitute for core features.
- Keep human-facing output in Korean, vendor names in English. SHORT VALUES: one concise sentence for every string (roughly 15–70 Korean characters); no paragraphs or pitch decks.
- Return 3–5 concrete, ordered steps of USER ACTION → SYSTEM PROCESSING. Build phases must have a real deliverable and external cash estimate.
- Choose services for actual capabilities. Distinguish a real secure server-side integration from a mocked/unconnected feature; browser permissions, USB/camera access and third-party APIs must be verified for compatibility.
- Privacy-sensitive photo/skin and health-adjacent services must not promise a medically validated diagnosis or universal sensor compatibility without evidence.
- Prioritize 3–5 MVP functions and 2–5 build phases. Do not include speculative growth/agent commentary.
- Tech cost estimates are ESTIMATES, not actual usage; free tiers depend on eligibility/limits. Choose inexpensive API/serverless/PWA stack, not native apps or in-house GPUs.
- Monetization/price unknown? Recommend a testable hypothesis, not a proven market price.
- Next experiment must test a core feasibility or customer-use assumption, with no fabricated data or results.
- All output must fit a COMPACT JSON schema. Do not echo the entire founder brief or repeat the same text in every field.
`;
}
function normalizeBlueprint(raw,project){
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.mvp_features)||!Array.isArray(raw.service_flow)||!Array.isArray(raw.tech_stack)||!Array.isArray(raw.build_plan)){
    throw new Error('Blueprint payload is missing core arrays');
  }
  const steps=arr(raw.service_flow,6).map((x,i)=>({
    step:i+1,title:text(x.title,90),user_action:text(x.user_action,200),system_action:text(x.system_action,220)
  })).filter(x=>x.title&&x.user_action&&x.system_action);
  const tech=arr(raw.tech_stack,6).map(x=>({
    area:text(x.area,75),service:text(x.service,140),reason:text(x.reason,210),
    monthly_cost_usd:number(x.monthly_cost_usd)
  })).filter(x=>x.area&&x.service);
  const phases=arr(raw.build_plan,5).map((x,i)=>({
    phase:i+1,title:text(x.title,90),deliverable:text(x.deliverable,240),
    estimated_external_cost_usd:number(x.estimated_external_cost_usd)
  })).filter(x=>x.title&&x.deliverable);
  const features=arr(raw.mvp_features,6).map(x=>text(x,180)).filter(Boolean);
  const risks=arr(raw.risks,4).map(x=>text(x,220)).filter(Boolean);
  if(features.length<3||steps.length<3||tech.length<2||phases.length<2){
    throw new Error('Blueprint has insufficient features, user flow or implementation phases');
  }
  const totalMvp=phases.reduce((s,x)=>s+x.estimated_external_cost_usd,0);
  const totalMonthly=tech.reduce((s,x)=>s+x.monthly_cost_usd,0);
  const ctx=project&&typeof project==='object'?project:{};
  const name=text(ctx.name,120)||text(raw.venture_name,120)||'Untitled Venture';
  const coreSummary=text(raw.value_proposition,280);
  return {
    venture_name:name,executive_summary:coreSummary,
    value_proposition:coreSummary,
    target_customer:text(ctx.customer,400),problem:text(ctx.problem,600),
    monetization:text(raw.monetization,180)||text(ctx.monetization,180),
    recommended_price_usd:number(raw.recommended_price_usd),
    mvp_features:features,tech_stack:tech,service_flow:steps,build_plan:phases,
    cost_breakdown:[
      ...tech.map(x=>({item:x.service,cost_type:'monthly estimate',estimated_cost_usd:x.monthly_cost_usd,note:x.reason})),
      ...phases.filter(x=>x.estimated_external_cost_usd>0).map(x=>({item:x.title,cost_type:'one-time build estimate',estimated_cost_usd:x.estimated_external_cost_usd,note:x.deliverable}))
    ],
    estimated_mvp_external_cost_usd:Math.round(totalMvp*100)/100,
    estimated_monthly_ops_usd_at_1000_mau:Math.round(totalMonthly*100)/100,
    risks,launch_gates:phases.slice(0,4).map(x=>'검증: '+x.deliverable),
    next_experiment:text(raw.next_experiment,350),
    next_action:text(raw.next_action,350),
    agent_notes:{} // Only actual /cycle runs may supply agent role review.
  };
}
module.exports={blueprintSchema,blueprintPrompt,normalizeBlueprint};
