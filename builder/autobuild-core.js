(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.StartupOSAutoBuildCore=factory();})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const VERSION=1,END=['COMPLETE','CANCELED'],STOP=['PAUSED','BLOCKED_EXTERNAL','NEEDS_DECISION','PLATEAU','LIMIT','FAILED'];
const clone=v=>JSON.parse(JSON.stringify(v)),now=()=>new Date().toISOString();
const limit=(v,d,max)=>{v=Number(v);return Number.isInteger(v)&&v>=1&&v<=max?v:d};
function fail(message,code='AUTOBUILD_STATE'){throw Object.assign(Error(message),{code})}
function event(r,type,message){r.events.push({at:now(),type,message:String(message).slice(0,800)});r.events=r.events.slice(-200)}
function touch(r){r.revision++;r.updatedAt=now();return r}
function create(project,info,options={}){
 const kind=options.kind,contract=info?.contracts?.[kind];
 if(!project?._sessionId||!contract)fail('이 Venture에 구현 가능한 Build 모듈이 없습니다.','CAPABILITY_UNSUPPORTED');
 if(project.functionalScopeApproved!==kind)fail('Build scope을 먼저 승인하세요.','SCOPE_APPROVAL_REQUIRED');
 const ts=now(),uid=options.runId||'ab_'+(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36));
 const req=[{id:'L0',parentId:null,layer:0,title:project.name,status:'pending',mode:'summary'}];
 const journey=[{id:'J0',parentId:'L0',layer:1,title:contract.title,status:'pending',mode:'summary'}];req.push(...journey);
 (contract.acceptance||[]).forEach((title,i)=>req.push({id:'R'+(i+1),parentId:'J0',layer:2,title:String(title),status:'pending',mode:'automatic',required:true}));
 if((project.serviceFlow||[]).length>20||(project.mvpFeatures||[]).length>40)fail('요구사항이 너무 많습니다. Venture 기획을 나눠 실행하세요.');
 (project.serviceFlow||[]).forEach((flow,i)=>{const id='J'+(i+1);req.push({id,parentId:'L0',layer:1,title:String(flow?.title||flow?.user_action||'사용자 여정'),mode:'manual',required:true,status:'pending'});});
 (project.mvpFeatures||[]).forEach((title,i)=>req.push({id:'M'+(i+1),parentId:'L0',layer:2,title:String(title),mode:'manual',required:true,status:'pending'}));
 req.push({id:'UX',parentId:'L0',layer:1,title:'현재 Build의 주요 여정·UX 직접 검수',mode:'manual',required:true,status:'pending'});
 const instruction=String(options.instruction||'').trim().slice(0,2500),current=project.functionalBuild||null;
 if(current&&(current.sid!==project._sessionId||current.kind!==kind||current.sourceHash!==info.sourceHash))fail('기존 Build를 현재 Venture·엔진으로 New Build한 뒤 시작하세요.','AUTOBUILD_BASE_STALE');
 if(instruction)req.push({id:'I1',parentId:'L0',layer:2,title:instruction,mode:'manual',required:true,status:'pending'});
 const r={version:VERSION,id:uid,sessionId:project._sessionId,ownerKey:String(options.ownerKey||'guest'),name:project.name,kind,sourceHash:info.sourceHash,contractVersion:1,requirements:req,
 status:'NEEDS_APPROVAL',stage:current?(instruction?'propose':'verify'):'assemble',revision:0,createdAt:ts,updatedAt:ts,startedAt:null,deadline:null,
 limits:{maxTurns:limit(options.maxTurns,8,50),maxSameFailure:limit(options.maxSameFailure,3,10),maxMinutes:limit(options.maxMinutes,20,180),maxModelCalls:limit(options.maxModelCalls,12,150)},
 turn:0,modelCalls:0,autoApply:options.autoApply===true,allowModel:options.allowModel===true,liveConsent:options.liveConsent===true,
 instruction,nextInstruction:instruction||'Build scope 조립 후 자동 검증',currentBuildId:current?.bid||null,currentArtifactHash:current?.artifactHash||null,bestBuildId:null,
 verification:null,proposal:null,repairPlan:null,issue:null,lease:null,pauseRequested:false,attempts:[],events:[],failureSignature:'',sameFailure:0,stopReason:'',costUsd:0,costUnknown:false,approvalNote:''};
 event(r,'plan','Venture → 사용자 여정 → 기능 → 구현 시도');return r;
}
function command(input,action,payload={}){
 const r=clone(input);if(r.version!==VERSION)fail('지원하지 않는 실행 버전');
 if(action==='cancel'){if(END.includes(r.status))fail('종료된 실행');if(r.lease&&['propose','verify'].includes(r.lease.stage))r.costUnknown=true;r.status='CANCELED';r.lease=null;r.stopReason='사용자 취소';event(r,'cancel',r.stopReason);return touch(r)}
 if(action==='pause'){if(r.status!=='RUNNING')fail('실행 중이 아닙니다.');if(r.lease)r.pauseRequested=true;else r.status='PAUSED';event(r,'pause',r.lease?'현재 단계 후 일시정지':'일시정지');return touch(r)}
 if(action==='interrupt'){if(r.status!=='RUNNING'||r.lease)fail('진행 중인 요청은 완료를 기다리세요.');r.status='NEEDS_DECISION';r.stopReason=String(payload.reason||'실행 전제조건 변경').slice(0,1500);event(r,'error',r.stopReason);return touch(r)}
 if(action==='configure'){
  if(r.status==='RUNNING'||END.includes(r.status)||r.lease)fail('실행을 정지한 뒤 설정을 변경하세요.');
  for(const [key,max] of Object.entries({maxTurns:50,maxSameFailure:10,maxMinutes:180,maxModelCalls:150})){if(payload[key]!==undefined){const n=Number(payload[key]);if(!Number.isInteger(n)||n<1||n>max)fail('실행 한도 범위 오류');r.limits[key]=n;}}
  if(r.limits.maxTurns<r.turn||r.limits.maxModelCalls<r.modelCalls)fail('사용한 회차·호출보다 한도를 작게 설정할 수 없습니다.');
  for(const key of ['autoApply','allowModel','liveConsent'])if(typeof payload[key]==='boolean')r[key]=payload[key];event(r,'configure','실행 한도·승인 정책 변경');return touch(r);
 }
 if(action==='approve'||action==='resume'||action==='retry'){
  if(action==='approve'&&r.status!=='NEEDS_APPROVAL')fail('승인 대기 상태가 아닙니다.');
  if(action!=='approve'&&!STOP.includes(r.status))fail('재개할 수 없는 실행 상태');
  if(r.lease)fail('이전 요청이 진행 중입니다.','AUTOBUILD_INFLIGHT');
  if(payload.approved!==true)fail('실행 승인이 필요합니다.');
  if(r.turn>=r.limits.maxTurns&&['assemble','apply'].includes(r.stage))fail('최대 반복 한도입니다.');
  if(r.sameFailure>=r.limits.maxSameFailure)fail('동일 실패 한도입니다.');
  if(!r.startedAt)r.startedAt=now();if(!r.deadline||action==='retry')r.deadline=Date.now()+r.limits.maxMinutes*60000;
  r.status='RUNNING';r.pauseRequested=false;r.stopReason='';event(r,action,'실행 승인 · '+r.stage);return touch(r);
 }
 if(action==='recover'){
  if(!r.lease||r.lease.until>Date.now())fail('이전 요청의 완료를 기다리세요.');
  if(['propose','verify'].includes(r.lease.stage))r.costUnknown=true;
  r.lease=null;r.status='NEEDS_DECISION';r.stopReason='이전 요청 응답 미확인 · 비용 및 Build 확인 후 재시도';event(r,'recover',r.stopReason);return touch(r);
 }
 if(action==='feedback'){
  if(r.lease||r.status==='RUNNING'||END.includes(r.status))fail('일시정지 또는 검수 상태에서 추가 지시를 입력하세요.');
  const text=String(payload.instruction||'').trim();if(text.length<3||text.length>2500)fail('추가 지시는 3~2500자');
  r.contractVersion++;r.instruction=text;r.nextInstruction=text;r.stage=r.currentBuildId?'propose':'assemble';r.status='NEEDS_APPROVAL';r.proposal=null;r.repairPlan=null;r.verification=null;r.issue=null;r.stopReason='';r.sameFailure=0;r.failureSignature='';
  r.requirements.push({id:'F'+r.contractVersion,parentId:'L0',layer:2,title:text,mode:'manual',required:true,status:'pending'});r.requirements.filter(x=>x.required).forEach(x=>x.status='pending');event(r,'contract','추가 지시 · 계약 v'+r.contractVersion);return touch(r);
 }
 if(action==='manual'){
  if(r.status!=='REVIEW')fail('최종 검수 상태가 아닙니다.');const req=r.requirements.find(x=>x.id===payload.id&&x.mode==='manual');if(!req)fail('직접 검수 항목이 아닙니다.');req.status=payload.accepted===true?'passed':'pending';event(r,'manual',req.id+' '+req.status);return touch(r);
 }
 if(action==='complete'){
  if(r.status!=='REVIEW'||r.verification?.status!=='INTEGRATION_VERIFIED'||r.verification.artifactHash!==r.currentArtifactHash||!r.verification.checks?.length||r.verification.checks.some(x=>x.status!=='passed')||r.requirements.some(x=>x.required&&x.status!=='passed'))fail('미검증·미확인 완료 기준이 있습니다.');
  if(payload.approved!==true)fail('최종 승인이 필요합니다.');r.status='COMPLETE';r.stage='done';r.nextInstruction='완료 승인됨 · 추가 구현은 새 실행';r.approvalNote=String(payload.note||'완료 승인').slice(0,1000);event(r,'complete',r.approvalNote);return touch(r);
 }
 fail('지원하지 않는 실행 명령');
}
function claim(input,context={}){
 const r=clone(input);if(r.status!=='RUNNING')fail('실행 중이 아닙니다.');if(r.lease)fail('이미 진행 중인 요청이 있습니다.','AUTOBUILD_INFLIGHT');
 if(context.ownerKey!==r.ownerKey||context.sessionId!==r.sessionId)fail('계정 또는 Venture가 변경되었습니다.','AUTOBUILD_OWNER');
 if((context.buildId||null)!==r.currentBuildId)fail('다른 Build가 생성되었습니다. 새 AutoBuild를 시작하세요.','AUTOBUILD_BUILD_CONFLICT');
 if(context.sourceHash!==r.sourceHash)fail('Build 엔진이 변경되었습니다. 새 실행이 필요합니다.','AUTOBUILD_SOURCE_STALE');
 if(r.deadline&&Date.now()>r.deadline){r.status='LIMIT';r.stopReason='실행 시간 한도';event(r,'limit',r.stopReason);return touch(r)}
 if(['assemble','apply','propose'].includes(r.stage)&&r.turn>=r.limits.maxTurns){r.status='LIMIT';r.stopReason='최대 반복 한도';event(r,'limit',r.stopReason);return touch(r)}
 if(r.stage==='propose'&&!r.allowModel){r.status='NEEDS_DECISION';r.stopReason='AI 코드 생성 승인 필요';event(r,'approval',r.stopReason);return touch(r)}
 if(r.stage==='verify'&&r.kind!=='travel'&&!r.liveConsent){r.status='NEEDS_DECISION';r.stopReason='실제 API 검증 사용 승인 필요';event(r,'approval',r.stopReason);return touch(r)}
 if(r.stage==='propose'&&r.modelCalls+3>r.limits.maxModelCalls){r.status='LIMIT';r.stopReason='AI 호출 한도 (내부 재작성 최대 3회 예약)';event(r,'limit',r.stopReason);return touch(r)}
 const id=context.leaseId||'step_'+Date.now()+'_'+Math.random().toString(36).slice(2);r.lease={id,stage:r.stage,until:Date.now()+120000,baseBuildId:r.currentBuildId,priorCalls:r.modelCalls};
 if(r.stage==='propose')r.modelCalls+=3;
 if(['assemble','apply'].includes(r.stage)){const earlier=r.attempts.at(-1);if(earlier?.status==='verifying'&&!earlier.checks.length)earlier.status='superseded';r.turn++;r.attempts.push({turn:r.turn,instruction:r.nextInstruction.slice(0,3000),inputBuildId:r.currentBuildId,status:'building',at:now(),checks:[],changes:[]})}
 event(r,'step',r.stage+' · '+id);return touch(r);
}
function charge(r,cost){if(typeof cost?.provider_usd==='number')r.costUsd+=cost.provider_usd;else if(cost)r.costUnknown=true;}
function checks(rows){return(rows||[]).slice(0,60).map(c=>({id:String(c.id).slice(0,130),status:c.status==='passed'?'passed':'failed',evidence:String(c.message||c.reason||c.evidence||'').slice(0,400),code:String(c.code||'').slice(0,90)}));}
function pauseAfter(r){if(r.pauseRequested&&r.status==='RUNNING'){r.status='PAUSED';r.pauseRequested=false;event(r,'pause','단계 완료 후 일시정지')}return touch(r)}
function receive(input,leaseId,data){
 const r=clone(input),lease=r.lease;if(!lease||lease.id!==leaseId||r.status==='CANCELED')fail('만료된 단계 결과','AUTOBUILD_RESULT_STALE');
 r.lease=null;charge(r,data.cost);const stage=lease.stage,a=r.attempts.at(-1);
 if(stage==='assemble'||stage==='apply'){
  const b=data.build;if(!b||b.sid!==r.sessionId||b.kind!==r.kind||b.sourceHash!==r.sourceHash||!b.artifactHash)fail('다른 Venture·소스의 Build 결과','AUTOBUILD_ARTIFACT_MISMATCH');
  r.currentBuildId=b.bid;r.currentArtifactHash=b.artifactHash;r.verification=null;r.stage=stage==='assemble'&&r.instruction?'propose':'verify';r.proposal=null;r.repairPlan=null;
  r.requirements.filter(x=>x.required).forEach(x=>x.status='pending');
  a.buildId=b.bid;a.artifactHash=b.artifactHash;a.sourceHash=b.sourceHash;a.status='verifying';a.changes=(b.refinementChanges||[]).slice(0,6).map(c=>({file:String(c.file||c.key||'').slice(0,120),from:String(c.from||'').slice(0,1800),to:String(c.to||'').slice(0,1800)}));
  event(r,'build','v'+r.turn+' · '+b.bid+' · '+b.artifactHash.slice(0,12));
 }else if(stage==='propose'){
  r.modelCalls=lease.priorCalls+Math.min(3,Math.max(1,Number(data.attempts)||3));
  if(data.external_steps?.length){r.status='BLOCKED_EXTERNAL';r.stopReason=data.external_steps.slice(0,5).join('\n');r.nextInstruction=r.stopReason;event(r,'external',r.stopReason)}
  else if(!['code_patch','config_patch'].includes(data.status)){r.status='NEEDS_DECISION';r.stopReason=String(data.reason||data.response||'실행 가능한 수정안 없음').slice(0,1500);event(r,'decision',r.stopReason)}
  else{r.proposal={status:data.status,codeEdits:data.codeEdits,config:data.config,changes:data.changes,manual_test:data.manual_test,response:data.response};r.stage='apply';if(!r.autoApply)r.status='NEEDS_APPROVAL';event(r,'proposal',String(data.response||'코드 변경안').slice(0,700));}
 }else if(stage==='verify'){
  const v=data.verification;if(!v||v.artifactHash!==r.currentArtifactHash||!Array.isArray(v.checks)||!v.checks.length)fail('현재 산출물의 검증 결과가 아닙니다.','AUTOBUILD_EVIDENCE_MISMATCH');
  r.verification={artifactHash:v.artifactHash,status:v.status,checkedAt:v.checkedAt,checks:checks(v.checks),evidenceMode:v.smoke?.mode||'server_checks'};
  const bad=r.verification.checks.filter(c=>c.status!=='passed'),passed=v.status==='INTEGRATION_VERIFIED'&&bad.length===0;
  if(a&&a.buildId===r.currentBuildId){a.checks=r.verification.checks;a.evidenceMode=r.verification.evidenceMode;a.status=passed?'passed':'failed'}
  r.requirements.filter(x=>x.mode==='automatic').forEach(x=>{x.status=passed?'passed':'pending';x.artifactHash=r.currentArtifactHash});
  if(passed){r.bestBuildId=r.currentBuildId;r.status='REVIEW';r.stage='review';r.stopReason='';r.issue=null;r.failureSignature='';r.sameFailure=0;r.nextInstruction='현재 Build의 요구사항·사용자 여정 직접 검수';event(r,'verify','검증 통과 · 최종 검수 대기')}
  else{
   r.issue={kind:r.kind,buildId:r.currentBuildId,sourceHash:r.sourceHash,source:'automated_verification',stage:'verify',code:bad[0]?.id||'CHECK_FAILED',message:bad.map(c=>c.id+': '+c.evidence).join('; ').slice(0,1300)};
   r.nextInstruction='실패한 검증을 유지한 채 원인을 수정하세요.\n'+r.issue.message;r.stage='diagnose';
   const signature=bad.map(c=>c.id+':'+c.code).sort().join('|');r.sameFailure=signature===r.failureSignature?r.sameFailure+1:1;r.failureSignature=signature;
   const environment=bad.some(c=>/MISSING|NOT_CONFIGURED|AUTH|QUOTA|RATE_LIMIT|PROVIDER|ENOENT/i.test(c.code)||/browser_e2e_scenarios/.test(c.id));
   if(environment){r.status='BLOCKED_EXTERNAL';r.stopReason=r.issue.message}
   else if(r.sameFailure>=r.limits.maxSameFailure){r.status='PLATEAU';r.stopReason='동일 문제 '+r.sameFailure+'회 실패 · 설계 재검토 필요'}
   else if(r.turn>=r.limits.maxTurns){r.status='LIMIT';r.stopReason='최대 반복 한도'}
   event(r,'failure',r.issue.message);
  }
 }else if(stage==='diagnose'){
  if(data.plan?.status==='PATCH_AVAILABLE'){r.repairPlan=data.plan;r.stage='apply';r.nextInstruction=String(data.plan.after||data.plan.title||r.nextInstruction);if(!r.autoApply)r.status='NEEDS_APPROVAL';event(r,'repair',data.plan.repairId)}
  else{r.stage='propose';r.repairPlan=null;event(r,'instruction',r.nextInstruction)}
 }else fail('지원하지 않는 실행 단계');
 return pauseAfter(r);
}
function reject(input,leaseId,error={}){
 const r=clone(input);if(!r.lease||r.lease.id!==leaseId)fail('만료된 실패 결과','AUTOBUILD_RESULT_STALE');const stage=r.lease.stage;r.lease=null;
 if(['propose','verify'].includes(stage))r.costUnknown=true;
 const code=String(error.code||'REQUEST_FAILED'),message=String(error.message||error.error||'요청 실패').slice(0,1500);if(['assemble','apply'].includes(stage)&&r.attempts.at(-1))r.attempts.at(-1).status='failed';
 r.stopReason=code+': '+message;r.status=/AUTH|KEY_MISSING|NOT_CONFIGURED|PROVIDER|RATE_LIMIT|TIMEOUT|ENOENT|BUILD_STALE|ASSETS/i.test(code)?'BLOCKED_EXTERNAL':'NEEDS_DECISION';
 // Request timeouts or provider errors never trigger an unattended duplicate paid request.
 r.nextInstruction='재시도 전 확인: '+r.stopReason;event(r,'error',r.stopReason);return touch(r);
}
return{VERSION,END,STOP,create,command,claim,receive,reject,clone};
});
