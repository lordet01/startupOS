'use strict';
// Allow-list: never send generated HTML, PWA files, deployment tokens or full session history to the LLM.
function str(value,max=500){return String(value==null?'':value).slice(0,max);}
function list(value,max=6,len=180){return Array.isArray(value)?value.slice(0,max).map(x=>str(x,len)):[];}
function safeNumber(value,defaultValue=0){const n=Number(value);return Number.isFinite(n)?n:defaultValue;}
function projectContext(project,mode){
  const p=project&&typeof project==='object'&&!Array.isArray(project)?project:{};
  const serviceFlow=Array.isArray(p.serviceFlow)?p.serviceFlow.slice(0,6).map(x=>({
    title:str(x&&x.title,70),user_action:str(x&&x.user_action,125),system_action:str(x&&x.system_action,125)
  })):[];
  const techStack=Array.isArray(p.techStack)?p.techStack.slice(0,8).map(x=>({
    area:str(x&&x.area,45),service:str(x&&x.service||x,100),monthly_cost_usd:safeNumber(x&&x.monthly_cost_usd)
  })):[];
  const metrics=p.metricsSource==='connected'?{
    source:'connected',
    visitors:safeNumber(p.metrics&&p.metrics.visitors),
    activation_pct:safeNumber(p.metrics&&p.metrics.activation),
    paid_pct:safeNumber(p.metrics&&p.metrics.paid),
    mrr_usd:safeNumber(p.metrics&&p.metrics.mrr)
  }:{source:'not_connected',note:'No verified visits, conversion or revenue metrics; do not claim observed performance.'};
  const fb=p.functionalBuild||{};
  const context={
    session_id:str(p._sessionId,100),name:str(p.name,120),idea:str(p.idea,700),
    customer:str(p.customer,400),problem:str(p.problem,600),
    desired_outcome:str(p.desiredOutcome,400),constraints:str(p.constraints,450),
    monetization:str(p.model,180),price_usd:safeNumber(p.price),
    budget_usd:safeNumber(p.budget),stage:str(p._phase||p.stage,35),
    mvp_features:list(p.mvpFeatures,7,145),
    service_flow:serviceFlow,technology:techStack,
    metrics,build:{
      exists:!!fb.bid,
      verified:fb.verification&&fb.verification.status==='INTEGRATION_VERIFIED',
      deployed:fb.deployment&&fb.deployment.readyState==='READY'
    }
  };
  if(mode==='cycle'){
    context.recent_decisions=list(p.decisions,4,220);
    context.previous_cycle=p.agentCycle?{
      bottleneck:str(p.agentCycle.bottleneck,180),
      action:str(p.agentCycle.next_action,180),
      status:str(p.agentCycle.action_status||'pending',40)
    }:null;
    context.phone_feedback=str((p.phoneTest&&p.phoneTest.notes)||(p.functionalDeviceNote)||'',300);
    context.known_risks=list(p.risks,4,130);
  }else{
    context.current_build_plan=Array.isArray(p.buildPlan)?p.buildPlan.slice(0,4).map(x=>({
      title:str(x&&x.title,70),deliverable:str(x&&x.deliverable,140)
    })):[];
  }
  return context;
}
module.exports={projectContext};
