(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.StartupOSWorkspace=api;
})(typeof window==='object'?window:null,function(){
 'use strict';
 const KEY='startupOS.sessions.v1',OWNER='startupOS.workspace.owner.v1',PREFIX='startupOS.workspace.v1:';
 const clone=v=>JSON.parse(JSON.stringify(v));
 const id=()=> 'vs_'+Date.now().toString(36)+'_'+(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):Math.random().toString(36).slice(2));
 const validSession=v=>v&&typeof v==='object'&&!Array.isArray(v)&&/^vs_[A-Za-z0-9_-]{3,100}$/.test(v._sessionId||'')&&typeof v.name==='string';
 const canonical=value=>JSON.stringify(sort(value));
 function sort(v){if(Array.isArray(v))return v.map(sort);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])]));return v;}
 function pack(value){return value&&Array.isArray(value.sessions)?{...value,sessions:value.sessions.filter(validSession)}:{activeId:'',sessions:[]};}
 function storage(store){
  let owner='guest';
  const readJSON=k=>{try{return JSON.parse(store.getItem(k)||'null')}catch{return null}};
  // Preserve the original Chrome cache before any authentication or workspace switch.
  const previous=store.getItem(OWNER)||'guest',legacy=readJSON(KEY);
  if(legacy)store.setItem(PREFIX+previous,JSON.stringify(pack(legacy)));
  if(previous!=='guest'){store.setItem(KEY,JSON.stringify(pack(readJSON(PREFIX+'guest'))));store.setItem(OWNER,'guest');}
  function read(){return pack(((store.getItem(OWNER)||'guest')===owner?readJSON(KEY):null)||readJSON(PREFIX+owner));}
  function write(value){
   const safe=pack(value),json=JSON.stringify(safe);
   // Write the durable account namespace first. A quota error leaves the prior cache intact.
   store.setItem(PREFIX+owner,json);store.setItem(OWNER,owner);store.setItem(KEY,json);return safe;
  }
  function activate(uid){
   owner=uid||'guest';
   if(!/^[A-Za-z0-9_:-]{1,160}$/.test(owner))throw Error('Invalid account identity');
   const value=read();write(value);return value;
  }
  return{read,write,activate,owner:()=>owner,key:()=>PREFIX+owner,
   guest:()=>pack(readJSON(PREFIX+'guest')),
   reset(){return write({activeId:'',sessions:[]})},
   meta(key,value){const k=PREFIX+owner+':'+key;if(arguments.length===1)return readJSON(k);store.setItem(k,JSON.stringify(value));return value;}
  };
 }
 function duplicate(p){
  const copy=clone(p);copy._sessionId=id();copy.name=(copy.name+' (복제)').slice(0,140);copy._createdAt=copy._updatedAt=new Date().toISOString();
  copy._events=[{at:copy._createdAt,type:'session_duplicated',message:'Brief와 Blueprint 복제',meta:{sourceId:p._sessionId}}];
  // Build descriptors, deployment ownership, costs and evidence belong to the source venture.
  for(const k of Object.keys(copy))if(/^(functional|prototype|deployment|phoneTest|agentCycle|agentCycles|runtimeLast|refinement|_archivedAt|_deletedAt|_pinned|_lastView|approvals|experiments|metricsHistory|ledger)/.test(k))delete copy[k];
  copy.costs=[];copy.decisions=[];copy.metrics={visitors:0,activation:0,trial:0,paid:0,mrr:0};copy.metricsSource='not_connected';
  copy._phase=copy.serviceFlow?.length?'blueprint':'brief';return copy;
 }
 function merge(local,remote,baseline){
  const l=local&&canonical(local),r=canonical(remote),b=baseline&&canonical(baseline);
  if(!local||l===r||l===b)return{action:'accept',payload:clone(remote)};
  if(r===b)return{action:'keep'};
  return{action:'conflict'};
 }
 function totals(p){
  const legacy=(p.costs||[]).filter(x=>Array.isArray(x)&&x[0]!=='Manual test');
  const rows=legacy.map((x,i)=>({id:'legacy_'+i,action:String(x[0]||''),provider:String(x[1]||''),kind:String(x[2]||'estimated'),usd:Math.max(0,Number(x[3])||0),at:x[5]||'',feeEligible:true})).concat(p.ledger||[]);
  const external=rows.reduce((n,x)=>n+(Number(x.usd)||0),0),fee=rows.reduce((n,x)=>n+(x.feeEligible===false?0:(Number(x.usd)||0)*.05),0);
  const reserved=(p.approvals||[]).filter(x=>x.status==='approved').reduce((n,x)=>n+(Number(x.estimatedUsd)||0),0);
  const budget=Math.max(0,Number(p.budget)||0);
  return{rows,external,fee,total:external+fee,reserved,budget,left:budget-external-fee-reserved};
 }
 function approval(p,values){
  const title=String(values.title||'').trim(),estimatedUsd=Number(values.estimatedUsd);
  if(title.length<3||title.length>200||!Number.isFinite(estimatedUsd)||estimatedUsd<0)throw Error('작업명(3~200자)과 0 이상의 예상 비용을 입력하세요.');
  const record={id:id(),title,estimatedUsd,type:['deploy','payment','ads','other'].includes(values.type)?values.type:'other',status:'pending',createdAt:new Date().toISOString()};
  p.approvals=[record,...(p.approvals||[])];return record;
 }
 function transition(p,aid,next,note){
  const a=(p.approvals||[]).find(x=>x.id===aid);if(!a)throw Error('승인 요청을 찾지 못했습니다.');
  const allowed={pending:['approved','rejected'],approved:['completed','cancelled']};
  if(!allowed[a.status]?.includes(next))throw Error('이미 처리된 승인 요청입니다.');
  if(next==='approved'&&a.estimatedUsd>totals(p).left)throw Error('남은 예산을 초과합니다. 예산을 수정한 뒤 승인하세요.');
  if(next==='completed'&&String(note||'').trim().length<8)throw Error('실제 수행 결과와 증거를 8자 이상 입력하세요.');
  a.status=next;a.updatedAt=new Date().toISOString();if(note)a.note=String(note).slice(0,1800);return a;
 }
 function experiment(p,values){
  const title=String(values.title||'').trim(),hypothesis=String(values.hypothesis||'').trim(),metric=String(values.metric||'').trim(),threshold=Number(values.threshold);
  if(!title||!hypothesis||!metric||!Number.isFinite(threshold)||threshold<0)throw Error('실험명·가설·지표·목표값을 입력하세요.');
  const record={id:id(),title:title.slice(0,150),hypothesis:hypothesis.slice(0,1500),metric:metric.slice(0,120),threshold,direction:values.direction==='lte'?'lte':'gte',status:'planned',createdAt:new Date().toISOString()};
  p.experiments=[record,...(p.experiments||[])];return record;
 }
 function result(p,eid,value,evidence){
  const e=(p.experiments||[]).find(x=>x.id===eid),n=Number(value);
  if(!e||e.status==='completed'||value==null||String(value).trim()===''||!Number.isFinite(n)||n<0||String(evidence||'').trim().length<8)throw Error('측정값과 확인 가능한 근거를 8자 이상 입력하세요.');
  e.status='completed';e.result=n;e.evidence=String(evidence).slice(0,2000);e.source='manual';e.completedAt=new Date().toISOString();e.met=e.direction==='lte'?n<=e.threshold:n>=e.threshold;return e;
 }
 return{KEY,OWNER,PREFIX,clone,id,validSession,canonical,pack,storage,duplicate,merge,totals,approval,transition,experiment,result};
});
