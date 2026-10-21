(function(){
'use strict';
const fetch=(url,options)=>window.StartupOSCloud.fetch(url,options);
const store=window.StartupOSStore;let studioOwner=store.owner();
const KEY='startupOS.sessions.v1',root=document.getElementById('studio');
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pack,active='',info=null,globalError='',pending=new Map(),polls=new Map();
try{pack=store.read();if(!pack||!Array.isArray(pack.sessions))throw new Error('저장된 Venture Session이 없습니다.');active=new URLSearchParams(location.search).get('sessionId')||pack.activeId;if(!pack.sessions.some(x=>x._sessionId===active))active=pack.sessions[0]&&pack.sessions[0]._sessionId||'';}catch(e){globalError=e.message;pack={sessions:[]};}
const session=()=>pack.sessions.find(x=>x._sessionId===active),job=sid=>pending.get(sid);
function ingestVerifyIssue(){
 const params=new URLSearchParams(location.search),raw=params.get('verifyIssue');
 if(!raw)return;
 params.delete('verifyIssue');
 history.replaceState(null,'',location.pathname+'?'+params.toString()+'#verify-stage');
 try{
  if(raw.length>1800)throw new Error('Report too large');
  const issue=JSON.parse(raw),p=session();
  if(!p||issue.source!=='user_report'||issue.sessionId!==p._sessionId||!p.functionalBuild||issue.buildId!==p.functionalBuild.bid)throw new Error('Session/Build mismatch');
  const allowed=['skin','receipt','travel'];
  if(!allowed.includes(issue.kind))throw new Error('Unsupported capability');
  patch(p._sessionId,x=>{
   const now=new Date().toISOString();
   x.functionalRepair={status:'REPAIR_REQUIRED',source:'user_report',buildId:issue.buildId,kind:issue.kind,sourceHash:String(issue.sourceHash||'').slice(0,80),stage:String(issue.stage||'unknown').slice(0,70),code:String(issue.code||'USER_REPORT').slice(0,70),message:String(issue.message||'사용자 기능 오류 보고').slice(0,360),reportedAt:now};x.functionalRepairPlan=null;
   x.functionalRepairHistory=[x.functionalRepair,...(x.functionalRepairHistory||[])].slice(0,25);
   x.functionalDiagnostics={stage:'repair_required',label:'실사용 오류 접수',error:x.functionalRepair.message,code:x.functionalRepair.code,reportedAt:now};
  });
 }catch(e){globalError='Verify 오류 보고를 저장할 수 없습니다: '+e.message;}
}
function repairFor(p){return p&&p.functionalRepair&&p.functionalBuild&&p.functionalRepair.buildId===p.functionalBuild.bid&&p.functionalRepair.status==='REPAIR_REQUIRED'?p.functionalRepair:null}
const repairLoading=new Set();
function planFor(p){const issue=repairFor(p),plan=p.functionalRepairPlan;return issue&&plan&&plan.issue?.buildId===issue.buildId&&plan.issue?.code===issue.code&&plan.issue?.stage===issue.stage&&plan.issue?.source===issue.source&&plan.issue?.message===issue.message&&plan.currentSourceHash===info?.sourceHash?plan:null;}
function repairTimeline(p){
 const items=p.functionalRepairTrace||p.functionalDiagnostics?.timeline||[];
 return '<div class="repairTimeline">'+items.map(x=>'<div class="checkrow"><span>'+(x.status==='failed'?'✕':x.status==='running'?'◌':'✓')+'</span><div><strong>'+esc(x.step)+'</strong><div class="tiny">'+esc(x.detail||x.message||x.status||'')+'</div></div></div>').join('')+'</div>';
}
function setRepairProgress(sid,step,message){
 const jobData=pending.get(sid);if(jobData)jobData.message=message;
 patch(sid,p=>{const d=p.functionalDiagnostics||{};d.step=step;d.message=message;d.timeline=d.timeline||[];const found=d.timeline.find(x=>x.step===step);if(found){found.message=message;found.status='running';}else d.timeline.push({step,status:'running',message,at:new Date().toISOString()});p.functionalDiagnostics=d;});
 render();
}
async function refreshRepairPlan(sid){
 const p=pack.sessions.find(x=>x._sessionId===sid),issue=p&&repairFor(p);
 if(!info||!issue||planFor(p)||repairLoading.has(sid))return;
 repairLoading.add(sid);
 try{
  const data=await request('/api/build',{action:'repair-plan',issue,priorBuild:p.functionalBuild.descriptor||p.functionalBuild},22000);
  patch(sid,x=>{if(repairFor(x)?.buildId===issue.buildId)x.functionalRepairPlan=data.plan;});
 }catch(e){
  patch(sid,x=>{x.functionalRepairPlan={status:'PLAN_FAILED',currentSourceHash:info.sourceHash,issue,requiredAction:e.message};});
 }finally{repairLoading.delete(sid);render();}
}

function patch(sid,fn){const current=store.read();if(!current||!Array.isArray(current.sessions))throw new Error('세션 저장소가 사라졌습니다.');const p=current.sessions.find(x=>x._sessionId===sid);if(!p)throw new Error('원래 세션이 없습니다.');fn(p);p._updatedAt=new Date().toISOString();store.write(current);pack=current;if(window.StartupOSCloud)window.StartupOSCloud.localSaved(current);return p;}
function log(sid,event,detail){patch(sid,p=>{p._events=[{at:new Date().toISOString(),type:event,message:detail},...(p._events||[])].slice(0,100);});}
function selectKind(p){
  var tech=(p.techStack||[]).map(x=>typeof x==="string"?x:[x.area,x.service,x.reason].filter(Boolean).join(" "));
  var flow=(p.serviceFlow||[]).map(x=>[x.title,x.user_action,x.system_action].filter(Boolean).join(" "));
  var text=[p.name,p.idea,p.problem,p.desiredOutcome].concat(p.mvpFeatures||[],tech,flow).filter(Boolean).join(" ");
  if(/영수증|receipt|ocr\s*가계부|품목.{0,12}ocr|ocr.{0,12}품목/i.test(text))return "receipt";
  if(/여행|travel|trip|packing|준비물|예약.{0,10}일정/i.test(text))return "travel";
  if(/피부|화장품|skin|skincare|모공|피부톤|스킨케어|피부 분석/i.test(text))return "skin";
  return "";
}
function money(value){return value==null?'미확정':'$'+Number(value).toFixed(6);}
function actionKey(j){if(!j)return "";if(j.label==="기능 코드 조립")return "build";if(j.label==="자동 기능 검증")return "verify";if(j.label==="테스트 배포 요청")return "publish";return ""}
function workButton(id,label,key,disabled){
 const j=job(active),running=!!(j&&actionKey(j)===key),seconds=running?Math.floor((Date.now()-j.started)/1000):0;
 return '<button class="btn primary workBtn '+(running?'running':'')+'" id="'+id+'" '+(disabled||running?'disabled':'')+'><span class="workLabel">'+(running?'<span class="tinySpinner"></span><span class="btnRunText">Working · '+seconds+'s</span>':label)+'</span></button>';
}
function stateText(f){if(!f)return '아직 기능 Build 없음';if(f.verification&&f.verification.status==='INTEGRATION_VERIFIED')return '연동 검증 통과 · 폰 실사용 미검증';if(f.verification&&f.verification.status==='FAILED')return '검증 실패 · 배포 차단';return '구현됨 · 실제 검증 대기';}
function checks(rows){return (rows||[]).map(x=>'<div class="checkrow"><span>'+(x.status==='passed'?'✓':'✕')+'</span><div><strong>'+esc(x.id)+'</strong><div class="tiny">'+esc(x.message||x.evidence||x.status)+'</div>'+(x.responseId?'<div class="tiny">'+esc(x.model)+' · '+esc(x.responseId)+' · '+Math.round(x.latencyMs||0)+'ms</div>':'')+'</div></div>').join('');}
function trace(p){const d=p.functionalDiagnostics;if(!d)return '<div class="hint">실행 이력이 없습니다.</div>';return '<pre class="trace">'+esc(JSON.stringify(d,null,2))+'</pre>';}
const brandOptions={skin:[['GlowNote','#7c3aed'],['피부로그','#0f766e'],['SkinBloom','#db2777']],receipt:[['PocketLedger','#2563eb'],['한눈가계부','#0f766e'],['ReceiptFlow','#ea580c']],travel:[['TripNest','#2563eb'],['여행주머니','#7c3aed'],['ReadyGo','#0f766e']]};
function brandingPanel(p,kind){const opts=brandOptions[kind]||brandOptions.travel,b=p.appBranding||{name:p.name,variant:0};return '<h3>앱 이름과 아이콘</h3><p class="tiny">추천 스타일을 선택하거나 이름을 직접 입력하세요. 변경 후 Deploy하면 홈 화면 아이콘에 반영됩니다.</p><div style="display:flex;gap:8px;flex-wrap:wrap">'+opts.map((o,i)=>'<button class="btn" data-brand="'+i+'" aria-pressed="'+(b.variant===i)+'" style="flex:1;min-width:90px"><span style="display:block;font-size:30px;background:'+o[1]+';color:white;border-radius:18px;padding:14px;margin-bottom:8px">'+['◆','▤','✦'][i]+'</span>'+esc(o[0])+'</button>').join('')+'</div><label class="field"><span>홈 화면 앱 이름</span><input id="brand-name" maxlength="40" value="'+esc(b.name||opts[0][0])+'"></label><p class="tiny">배포 완료 → Open app → 홈 화면에 설치. Android는 설치 버튼, iPhone은 Safari 공유 → 홈 화면에 추가 안내가 앱 안에 표시됩니다.</p>';}
function render(){
 const p=session();
 if(info&&repairFor(p)&&!planFor(p)&&!repairLoading.has(active)&&planFor(p)?.status!=='PLAN_FAILED')setTimeout(()=>refreshRepairPlan(active),0);
 if(!p){root.innerHTML='<div class="studio-head"><a class="toplink" href="/">← My Apps</a><button class="cloud-account-btn" data-cloud-button>☁ 로그인</button></div><div class="pageTitle"><div><h1>Build</h1><div class="muted">Session not found</div></div></div><div class="errorbox">'+esc(globalError||'세션이 없습니다.')+'</div><a class="btn" href="/">← StartupOS</a>';return;}
 const f=p.functionalBuild,kind=selectKind(p),contract=info&&info.contracts[kind],busy=!!job(active),repair=repairFor(p),plan=planFor(p),autoVerified=!!(f&&f.sid===p._sessionId&&f.verification&&f.verification.status==='INTEGRATION_VERIFIED'),smokeVerified=!!(autoVerified&&f.verification.smoke?.status==='PASSED'&&f.verification.artifactHash===f.artifactHash),verified=!!(smokeVerified&&!repair),deployment=f&&f.deployment,ready=!!(verified&&deployment&&deployment.readyState==='READY');
 const stageData=[['🧩','Contract',!!contract&&p.functionalScopeApproved===kind],['🛠','Build',!!f],['✓','Verify',verified],['🚀','Deploy',ready],['📱','Phone',!!(ready&&p.functionalDeviceEvidence&&p.functionalDeviceEvidence.buildId===f.bid&&p.functionalDeviceEvidence.note)]];
 const inScope=contract?contract.acceptance:[];
 const outScope=contract?contract.exclusions:[];
 root.innerHTML=
 '<div class="studio-head"><a class="toplink" href="/">← StartupOS</a><select id="session">'+pack.sessions.map(s=>'<option value="'+esc(s._sessionId)+'" '+(s._sessionId===active?'selected':'')+'>'+esc(s.name)+' · '+esc(s._sessionId.slice(-7))+'</option>').join('')+'</select></div>'+
 '<div class="pageTitle"><div><h1>Build</h1><div class="muted">'+esc(p.name)+'</div></div><div class="metaRow"><span class="metaChip">'+esc(kind||'New capability needed')+'</span><span class="metaChip">'+esc(p._sessionId.slice(-8))+'</span><span class="metaChip">'+esc(stateText(f))+'</span></div></div>'+
 (f&&f.sid!==p._sessionId?'<div class="notice warn">복구한 원본의 Build와 대화 기록입니다. 이 프로젝트에서 New Build를 실행하면 이어서 수정할 수 있습니다.</div>':'')+
 '<div class="stages">'+stageData.map(([icon,text,pass],i)=>'<div class="stagebox '+(pass?'pass':'pending')+'"><span class="stageIcon">'+icon+'</span><div><strong>'+String(i+1)+'. '+text+'</strong><span class="stageState">'+(pass?'Done':'Pending')+'</span></div></div>').join('')+'</div>'+
 (busy?'<section class="card"><div class="sectionHead"><h2>'+esc(job(active).label)+'</h2><span id="elapsed" class="tiny"></span></div><div class="busyline"></div><div class="muted">'+esc(job(active).message)+'</div>'+repairTimeline(p)+'</section>':'')+
 (p.functionalDiagnostics&&p.functionalDiagnostics.error?'<div class="errorbox" role="alert"><strong>'+esc(p.functionalDiagnostics.error)+'</strong><div class="tiny">'+esc(p.functionalDiagnostics.code||'')+' · HTTP '+esc(p.functionalDiagnostics.httpStatus||'-')+'</div></div>':'')+
 (repair?'<section class="card repairCard" id="repair-stage"><div class="sectionHead"><h2>Fix plan · Verify 실패 원인</h2><span class="badge">REPAIR REQUIRED</span></div>'+
 '<div class="notice error"><strong>'+esc(repair.code)+' · '+esc(repair.stage)+'</strong><p>'+esc(repair.message)+'</p></div>'+
 (!plan?'<div class="hint">수정 계획 확인 중…</div>':
 plan.status==='PATCH_AVAILABLE'?
 '<div class="repairCompare"><div><h3>현재 문제</h3><p>'+esc(plan.before||repair.message)+'</p></div><div><h3>수정 내용</h3><p>'+esc(plan.after)+'</p></div></div>'+
 '<div class="metaRow"><span class="metaChip">변경: '+esc(plan.target)+'</span><span class="metaChip">Patch '+esc(plan.version)+'</span></div>'+
 '<details><summary>재빌드 시 검사할 항목 ('+plan.tests.length+')</summary>'+checks(plan.tests.map(x=>({id:x,status:'pending',evidence:'Fix & New Build 후 자동 검사'})))+'</details>':
 '<div class="notice warn">'+esc(plan.requiredAction||'이 오류에 적용할 수 있는 검토된 자동 패치가 없습니다.')+'</div>')+
 '<div style="margin-top:14px">'+(plan?.status==='PATCH_AVAILABLE'?workButton('fixBuild','🔧 Fix & New Build','build',busy):'<button class="btn" id="refreshRepairPlan">수정 계획 다시 확인</button>')+'</div></section>':'')+
 '<section class="card" id="scope-stage"><div class="sectionHead"><h2>Build scope</h2>'+(contract?'<span class="badge">'+esc(contract.title||kind)+'</span>':'')+'</div>'+
 (contract?'<div class="metaRow" style="margin-bottom:12px"><span class="metaChip">Session blueprint → '+esc(contract.title||kind)+'</span><span class="metaChip">Blueprint matched</span></div><div class="two"><div><h3>In scope</h3><div class="scopeList">'+inScope.map(x=>'<div class="scopeItem">✓ '+esc(x)+'</div>').join('')+'</div><div><h3>Out scope</h3><div class="scopeList">'+outScope.map(x=>'<div class="scopeItem">— '+esc(x)+'</div>').join('')+'</div></div><label class="check"><input id="scope" type="checkbox" '+(p.functionalScopeApproved===kind?'checked':'')+' '+(busy?'disabled':'')+'>이 범위로 Build</label>'+(repair?'<div class="notice warn">오류가 기록된 Build입니다. 위 Fix plan에서 수정 패치를 적용하세요. 일반 New Build는 같은 문제를 해결하지 못합니다.</div>':workButton('assemble',f?'New Build':'Build','build',busy||p.functionalScopeApproved!==kind))+'':'<div class="notice warn"><strong>구현 가능한 모듈이 아직 없습니다.</strong><div class="hint">Blueprint는 준비됐지만 서버에 검증 가능한 실행 모듈이 없습니다. 실행할 수 없는 앱을 자동으로 생성했다고 표시하지 않습니다.</div><button class="btn" id="requestCapability">구현 필요 상태 저장</button></div>')+
 '</section>'+
 (f?'<section class="card"><div class="sectionHead"><h2>Build artifact</h2><span class="badge">IMPLEMENTED</span></div><div class="metaRow"><span class="metaChip">'+esc(f.bid)+'</span><span class="metaChip">'+esc(f.kind)+'</span><span class="metaChip">'+esc(f.createdAt)+'</span></div><div class="toolbar" style="margin-top:12px"><a class="btn primary" href="'+esc(f.previewUrl)+'" target="_blank" rel="noopener">Open app ↗</a><button class="btn" id="preview-toggle">Preview</button></div><div id="preview-area"></div><details><summary>Artifact checks</summary>'+checks(f.checks)+'</details>'+(p.functionalRepairTrace?.length?'<details open><summary>이번 Build 실행 내역</summary>'+repairTimeline(p)+'</details>':'')+'</section>'+
 (f?'<section id="refineHost" class="refineHost" aria-label="모바일 미리보기 및 채팅 개선"></section>':'')+
 '<section class="card" id="verify-stage"><div class="sectionHead"><h2>Verify</h2><span class="badge">'+(verified?'PASSED':repair?'REPAIR NEEDED':autoVerified?'USER FLOW TEST':'PENDING')+'</span></div>'+workButton('verify',autoVerified?'Run again':'Run automated tests','verify',busy)+
 (autoVerified&&!repair?'<div class="notice"><strong>자동 스모크 테스트</strong><p>웹 테스트 이미지/합성 영수증 → 사용자 입력 → 동의 → 결과 → 저장·재조회, 별도 실제 Vision/OCR API 확인</p><span class="badge">'+(smokeVerified?'SMOKE PASSED':'NOT VERIFIED')+'</span></div>':'')+
 (f.verification?'<details '+(verified?'':'open')+'><summary>Verification evidence</summary>'+checks(f.verification.checks)+'</details>':'')+(f.verification?.smoke?'<details><summary>자동 테스트 이미지 및 실행 단계</summary>'+(f.verification.smoke.fixtures||[]).map(x=>'<div class="scopeItem">'+esc(x.id)+' · '+esc(x.source)+' · '+esc(x.sha256.slice(0,14))+'</div>').join('')+'</details>':'')+
 (f.verification&&f.verification.status==='FAILED'?'<div class="notice error">테스트 실패: Build로 돌아가 수정해야 합니다. <button class="btn" id="retryBuild">← Build 단계</button></div>':'')+'</section>'+
 '<section class="card" id="deploy-stage">'+brandingPanel(p,kind)+'<div class="sectionHead"><h2>Deploy</h2><span class="badge">'+(ready?'LIVE':deployment?esc(deployment.readyState||'DEPLOYING'):'PENDING')+'</span></div><div class="toolbar">'+workButton('publish','Deploy verified build','publish',!verified||busy)+''+(deployment?'<button class="btn" id="refresh-deploy">Refresh</button>':'')+(ready?'<a class="btn" target="_blank" rel="noopener" href="'+esc(deployment.url)+'">Open app ↗</a>':'')+'</div>'+(deployment&&deployment.url?'<div class="tiny" style="margin-top:10px">'+esc(deployment.url)+'</div>':'')+'</section>':'')+
 (ready?'<section class="card" id="phone-stage"><div class="sectionHead"><h2>휴대폰 설치 · 실사용 확인</h2><span class="badge">'+(p.functionalDeviceEvidence&&p.functionalDeviceEvidence.buildId===f.bid&&p.functionalDeviceEvidence.note?'RECORDED':'PENDING')+'</span></div><label class="field"><span>홈 화면 아이콘으로 실행해 촬영·분석·저장을 확인하세요.</span><textarea id="device-note" placeholder="Galaxy S23 / Chrome · camera, analyze, save OK">'+esc(p.functionalDeviceNote||'')+'</textarea></label><button class="btn" id="save-device">Save</button></section>':'<section class="card" id="phone-stage"><div class="sectionHead"><h2>휴대폰 설치 · 실사용 확인</h2><span class="badge">LOCKED</span></div><div class="hint">Vercel Deployment가 READY가 된 후 실제 휴대폰에서 확인할 수 있습니다.</div></section>')+
 '<details class="card"><summary>Diagnostics</summary>'+trace(p)+'<div class="tiny">'+esc((p.functionalBuildHistory||[]).length)+' previous builds · last cost '+money(p.functionalLastCost&&p.functionalLastCost.provider_usd)+'</div></details>';
 bind();if(window.StartupOSRefinement)window.StartupOSRefinement.mount();
}

async function request(url,body,timeout=70000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{const r=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:controller.signal});const text=await r.text();let result;try{result=JSON.parse(text);}catch{throw Object.assign(new Error('서버가 JSON이 아닌 응답을 반환했습니다.'),{httpStatus:r.status});}if(!r.ok||!result.ok)throw Object.assign(new Error(result.error||'요청 실패'),{httpStatus:r.status,code:result.code});return result;}catch(e){if(e.name==='AbortError')throw new Error('요청 제한시간을 초과했습니다. 상태를 확인한 뒤 수동으로 재시도하세요.');throw e;}finally{clearTimeout(timer);}}
async function perform(sid,label,message,fn){if(pending.has(sid))return;const owner=store.owner();const runId=crypto.randomUUID(),started=Date.now();pending.set(sid,{runId,started,label,message});patch(sid,p=>{p.functionalDiagnostics={runId,label,stage:'running',startedAt:new Date().toISOString()};});render();try{await fn(runId);if(owner!==store.owner())return;patch(sid,p=>{if(p.functionalDiagnostics.runId===runId)p.functionalDiagnostics={...p.functionalDiagnostics,stage:'finished',elapsedMs:Date.now()-started,httpStatus:200};});}catch(e){if(owner!==store.owner())return;patch(sid,p=>{if(p.functionalDiagnostics.runId===runId)p.functionalDiagnostics={...p.functionalDiagnostics,stage:'failed',error:e.message,code:e.code,httpStatus:e.httpStatus||null,elapsedMs:Date.now()-started};});}finally{pending.delete(sid);render();}}
function charge(p,cost,label,id){p.functionalLastCost=cost;if(cost&&cost.provider_usd!=null){p.costs||=[];if(!p.costs.some(row=>row[4]===id))p.costs.push([label,'OpenAI / live verification','Verification',cost.provider_usd,id]);}}
function bind(){document.getElementById('session').onchange=ev=>{active=ev.target.value;const url=new URL(location.href);url.searchParams.set('sessionId',active);history.replaceState(null,'',url);pack.activeId=active;store.write(pack);render();if(repairFor(session()))refreshRepairPlan(active);};const p=session(),sid=active;
 const scope=document.getElementById('scope');if(scope)scope.onchange=()=>{patch(sid,x=>{x.functionalScopeApproved=scope.checked?selectKind(x):null;});render();};
 for(const button of ['backToBuild','retryBuild']){const el=document.getElementById(button);if(el)el.onclick=()=>document.getElementById('scope-stage')?.scrollIntoView({behavior:'smooth',block:'start'});}
 const unsupported=document.getElementById('requestCapability');
 if(unsupported)unsupported.onclick=()=>{
  const p=session();
  patch(sid,x=>{x.functionalRequest={status:'NEEDS_CAPABILITY_IMPLEMENTATION',at:new Date().toISOString(),features:(x.mvpFeatures||[]).slice(0,8),idea:String(x.idea||'').slice(0,1600)};});
  log(sid,'capability_requested','Functional implementation required');
  render();
 };

 async function applyVerification(sid,build){
  setRepairProgress(sid,'smoke_verify','검증 시작: 웹 테스트 이미지, 실제 API와 앱 흐름 테스트');
  const result=await request('/api/build',{action:'verify',descriptor:build.descriptor||build,sessionId:sid,liveConsent:true},110000);
  const checks=result.verification?.checks||[],failed=checks.filter(x=>x.status!=='passed');
  patch(sid,x=>{
   if(x.functionalBuild?.bid!==build.bid)throw Error('다른 Build 결과입니다. 검증 응답을 버렸습니다.');
   x.functionalBuild.verification=result.verification;
   x.functionalRepairTrace=(x.functionalRepairTrace||[]).concat([
    {step:'smoke_verify',status:failed.length?'failed':'passed',detail:checks.length+' checks · '+failed.length+' failures'},
    {step:'live_api',status:failed.length?'failed':'passed',detail:checks.filter(z=>z.id.startsWith('live_')).map(z=>z.id+':'+z.status).join(', ')}
   ]);
   if(failed.length){
    const issue={status:'REPAIR_REQUIRED',source:'automated_verification',buildId:build.bid,kind:build.kind,sourceHash:build.sourceHash,stage:'verify',code:failed[0].id,message:failed.map(z=>z.id+': '+(z.message||z.reason||z.evidence||'failed')).join('; ').slice(0,480),reportedAt:new Date().toISOString()};
    x.functionalRepair=issue;x.functionalRepairPlan=null;
    x.functionalRepairHistory=[issue,...(x.functionalRepairHistory||[])].slice(0,25);x._phase='blueprint';
   }else{
    if(x.functionalRepair)x.functionalRepair={...x.functionalRepair,status:'VERIFIED_AFTER_PATCH',resolvedAt:new Date().toISOString()};
    x._phase='build';
   }
   charge(x,result.cost,'Build automatic smoke',build.bid+':'+result.verification.checkedAt);
  });
  log(sid,'automatic_smoke_completed',failed.length?'FAILED '+failed.map(x=>x.id).join(', '):'PASSED');
  if(failed.length)throw Object.assign(Error('자동 스모크 테스트 실패: '+failed.map(x=>x.id).join(', ')),{code:'SMOKE_FAILED'});
 }
 window.StartupOSBuildBridge.applyRefinement=async function(targetSid,changePayload,summary){
  const outcome={ok:false,error:null,buildId:null};
  await perform(targetSid,'기능 코드 조립','채팅 승인안 적용 → 새 앱 생성 → 자동 스모크 테스트',async()=>{
    const p=pack.sessions.find(x=>x._sessionId===targetSid),before=p&&p.functionalBuild;
    if(!before)throw Object.assign(Error('이 세션에 기존 Build가 없습니다.'),{code:'NO_PREVIOUS_BUILD'});
    if(p.functionalRepair&&p.functionalRepair.status==='REPAIR_REQUIRED')throw Object.assign(Error('실패한 기능의 Repair를 먼저 완료하세요.'),{code:'REPAIR_FIRST'});
    setRepairProgress(targetSid,'chat_refinement','승인한 기능·UI 설정을 새 Build에 반영합니다.');
    const payload=changePayload?.codeEdits?{codeEdits:changePayload.codeEdits,config:changePayload.config}:{config:changePayload?.config||changePayload};
    const result=await request('/api/build',{action:'refine-and-assemble',project:{_sessionId:targetSid,name:p.name},priorBuild:before.descriptor||before,...payload,approved:true,summary:summary||''});
    setRepairProgress(targetSid,'artifact','변경 항목 '+(result.build.refinementChanges||[]).map(x=>x.label).join(', ')+' → '+result.build.bid);
    patch(targetSid,x=>{
      x.functionalBuildHistory=[before,...(x.functionalBuildHistory||[])].slice(0,12);
      x.functionalBuild=result.build;
      x.functionalJourneyCheck=null;
      x.functionalRefinementLast={at:new Date().toISOString(),parentBuildId:before.bid,buildId:result.build.bid,summary:String(summary||'').slice(0,300),changes:result.build.refinementChanges};
      x._phase='blueprint';
      x.functionalRepairTrace=result.repairTrace;
      if(x.functionalProposal)x.functionalProposal={...x.functionalProposal,status:'BUILT',resultBuildId:result.build.bid};
      x.functionalChat=[...(x.functionalChat||[]),{role:'system',text:'새 Build '+result.build.bid.slice(-8)+' 생성 · '+result.build.refinementChanges.map(x=>x.label).join(', '),buildId:result.build.bid,at:new Date().toISOString()}].slice(-40);
    });
    log(targetSid,'chat_refined_build','Applied '+result.build.refinementChanges.map(x=>x.key).join(','));
    outcome.buildId=result.build.bid;
    await applyVerification(targetSid,result.build);
    outcome.ok=true;
  });
  if(!outcome.ok){
    const p=pack.sessions.find(x=>x._sessionId===targetSid);
    outcome.error=p?.functionalDiagnostics?.error||'새 Build 또는 자동 검증이 실패했습니다.';
  }
  return outcome;
 };
 const assemble=document.getElementById('assemble');
 if(assemble)assemble.onclick=()=>perform(sid,'기능 코드 조립','새 기능 산출물을 생성하고 자동 검증합니다.',async()=>{
  const current=pack.sessions.find(x=>x._sessionId===sid);
  if(repairFor(current))throw Object.assign(Error('오류가 있는 Build입니다. 위 Fix plan → Fix & New Build를 실행하세요.'),{code:'REPAIR_PLAN_REQUIRED'});
  setRepairProgress(sid,'assemble','기능 계약과 코드 파일 조립');
  const result=await request('/api/build',{action:'assemble',project:{_sessionId:sid,name:current.name,refinementConfig:current.functionalBuild?.refinement||null,codeEdits:current.functionalBuild?.codeEdits||[]},kind:selectKind(current),acceptedScope:current.functionalScopeApproved===selectKind(current)});
  setRepairProgress(sid,'syntax','서버 조립 및 JS / PWA 구문 검사 완료');
  patch(sid,x=>{
   if(x.functionalBuild)x.functionalBuildHistory=[x.functionalBuild,...(x.functionalBuildHistory||[])].slice(0,10);
   x.functionalBuild=result.build;x.functionalRepairTrace=result.repairTrace;
   x.functionalJourneyCheck=null;x._phase='blueprint';
  });
  log(sid,'functional_implemented','New artifact assembled');
  await applyVerification(sid,result.build);
 });
 const refreshPlan=document.getElementById('refreshRepairPlan');
 if(refreshPlan)refreshPlan.onclick=()=>{
  patch(sid,x=>{x.functionalRepairPlan=null;});refreshRepairPlan(sid);
 };
 const fixBuild=document.getElementById('fixBuild');
 if(fixBuild)fixBuild.onclick=()=>perform(sid,'기능 코드 조립','오류 수정 레시피를 적용하고 새 Build를 검증합니다.',async()=>{
  const current=pack.sessions.find(x=>x._sessionId===sid),issue=repairFor(current),plan=planFor(current);
  if(!issue||!plan||plan.status!=='PATCH_AVAILABLE')throw Object.assign(Error('적용 가능한 Fix plan을 먼저 확인하세요.'),{code:'REPAIR_PLAN_MISSING'});
  if(current.functionalScopeApproved!==selectKind(current))throw Object.assign(Error('Build scope을 먼저 승인하세요.'),{code:'SCOPE_APPROVAL_REQUIRED'});
  setRepairProgress(sid,'diagnosis','오류 '+issue.code+' → 검토된 수정 레시피 '+plan.repairId);
  const result=await request('/api/build',{action:'repair-and-assemble',approved:true,project:{_sessionId:sid,name:current.name},priorBuild:current.functionalBuild.descriptor||current.functionalBuild,issue,kind:issue.kind,acceptedScope:true});
  setRepairProgress(sid,'code_patch',plan.target+' · 패치 '+plan.version+' 적용');
  patch(sid,x=>{
   if(x.functionalBuild)x.functionalBuildHistory=[x.functionalBuild,...(x.functionalBuildHistory||[])].slice(0,10);
   x.functionalBuild=result.build;x.functionalRepairPlan=null;
   x.functionalJourneyCheck=null;
   x.functionalRepairTrace=result.repairTrace;
   if(x.functionalRepair)x.functionalRepair={...x.functionalRepair,status:'PATCHED_PENDING_VERIFY',rebuildId:result.build.bid,rebuildAt:new Date().toISOString()};
   x._phase='blueprint';
  });
  setRepairProgress(sid,'artifact','새 Build '+result.build.bid+' · '+result.build.artifactHash.slice(0,12));
  log(sid,'repair_patch_applied',plan.repairId+' → '+result.build.bid);
  await applyVerification(sid,result.build);
 });
 const verify=document.getElementById('verify');if(verify)verify.onclick=()=>{const build=p.functionalBuild;perform(sid,'자동 기능 검증','브라우저 회귀 증거와 실제 API 응답을 확인합니다.',async()=>{const result=await request('/api/build',{action:'verify',descriptor:build.descriptor||build,sessionId:sid,liveConsent:true});patch(sid,x=>{if(x.functionalBuild.bid!==build.bid)throw new Error('새 Build가 생성되어 이전 응답을 적용하지 않았습니다.');x.functionalBuild.verification=result.verification;x._phase=result.verification.status==='INTEGRATION_VERIFIED'?'build':'blueprint';
 if(result.verification.status==='FAILED'){
  const failed=(result.verification.checks||[]).filter(a=>a.status!=='passed');
  x.functionalRepair={status:'REPAIR_REQUIRED',source:'automated_verification',buildId:build.bid,kind:build.kind,sourceHash:build.sourceHash,stage:'verify',code:failed[0]?.id||'CHECK_FAILED',message:failed.map(a=>a.id+': '+(a.message||a.evidence||'fail')).join('; ').slice(0,500),reportedAt:new Date().toISOString()};
  x.functionalRepairHistory=[x.functionalRepair,...(x.functionalRepairHistory||[])].slice(0,25);
 }else if(x.functionalRepair?.buildId===build.bid&&x.functionalRepair.source==='automated_verification'){
  x.functionalRepair={...x.functionalRepair,status:'REVERIFIED',resolvedAt:new Date().toISOString()};
 }
 charge(x,result.cost,'Build live verification',build.bid+':'+result.verification.checkedAt);});log(sid,'functional_verified',result.verification.status);});};
 const journey=document.getElementById('journeyPass');if(journey)journey.onclick=()=>{
  const checkbox=document.getElementById('journeyConfirm');
  if(!checkbox?.checked){globalError='촬영·분석·저장 흐름을 실제 확인한 뒤 체크하세요.';render();return}
  patch(sid,x=>{x.functionalJourneyCheck={source:'user_confirmed_in_preview',buildId:x.functionalBuild.bid,status:'PASSED',at:new Date().toISOString(),steps:['photo_capture','consent','live_result','saved_result']};});
  log(sid,'journey_check_passed','User confirmed real photo, analysis and storage flow');render();
 };
 const journeyFail=document.getElementById('journeyFail');if(journeyFail)journeyFail.onclick=()=>{
  const message=window.prompt('촬영·분석·저장에서 어떤 문제가 있었나요?', '사진 촬영 후 분석으로 이동하지 않음');
  if(message===null)return;
  patch(sid,x=>{const f=x.functionalBuild;const issue={status:'REPAIR_REQUIRED',source:'user_report',kind:f.kind,buildId:f.bid,sourceHash:f.sourceHash,stage:'interactive_verify',code:'INTERACTIVE_FLOW_FAILED',message:String(message).trim().slice(0,400)||'사용자 확인 중 기능 실패',reportedAt:new Date().toISOString()};x.functionalRepair=issue;x.functionalRepairPlan=null;x.functionalRepairHistory=[issue,...(x.functionalRepairHistory||[])].slice(0,25);});
  log(sid,'verify_failed','Interactive app flow failed; needs code repair');render();
 };
 const preview=document.getElementById('preview-toggle');if(preview)preview.onclick=()=>{const area=document.getElementById('preview-area');if(area.firstChild){area.replaceChildren();return;}const frame=document.createElement('iframe');frame.className='preview-frame';frame.allow='camera';frame.title='실제 기능 앱 미리보기';frame.src=p.functionalBuild.previewUrl;area.appendChild(frame);};
 const brandName=document.getElementById('brand-name');if(brandName)brandName.oninput=()=>patch(sid,x=>{x.appBranding={...(x.appBranding||{}),name:brandName.value.slice(0,40)};});document.querySelectorAll('[data-brand]').forEach(el=>el.onclick=()=>{const n=Number(el.dataset.brand);patch(sid,x=>{x.appBranding={name:brandOptions[selectKind(x)][n][0],variant:n};});render();});
 const publish=document.getElementById('publish');if(publish)publish.onclick=()=>{const build=p.functionalBuild;perform(sid,'테스트 배포 요청','서버가 현재 소스로 다시 조립하고 실제 검증을 재실행한 뒤 배포합니다.',async()=>{const result=await request('/api/publish',{sessionId:sid,approved:true,liveConsent:true,branding:pack.sessions.find(x=>x._sessionId===sid).appBranding,descriptor:build.descriptor||build});patch(sid,x=>{if(x.functionalBuild.bid!==build.bid)throw new Error('다른 Build로 전환되었습니다.');x.functionalBuild.verification=result.verification;x.functionalBuild.deployment=result.deployment;charge(x,result.cost,'Publish re-verification',build.bid+':publish:'+new Date().toISOString());});log(sid,'deployment_requested',result.deployment.id);pollDeployment(sid,build.bid);});};
 const refresh=document.getElementById('refresh-deploy');if(refresh)refresh.onclick=()=>pollDeployment(sid,p.functionalBuild.bid);
 const save=document.getElementById('save-device');if(save)save.onclick=()=>{const note=document.getElementById('device-note').value;patch(sid,x=>{x.functionalDeviceNote=note;x.functionalDeviceEvidence={source:'user_report',at:new Date().toISOString(),note,buildId:x.functionalBuild&&x.functionalBuild.bid};});log(sid,'phone_user_report','실기기 사용자 확인 기록 저장');render();};
}
async function pollDeployment(sid,bid){if(polls.has(sid))return;const owner=store.owner();polls.set(sid,true);try{for(let i=0;i<20;i++){if(owner!==store.owner())break;const p=pack.sessions.find(x=>x._sessionId===sid),d=p&&p.functionalBuild&&p.functionalBuild.bid===bid&&p.functionalBuild.deployment;if(!d||!d.id)break;const result=await request('/api/publish?id='+encodeURIComponent(d.id));patch(sid,x=>{if(x.functionalBuild.bid!==bid)return;x.functionalBuild.deployment={...d,...result.deployment};if(result.deployment.readyState==='READY')x._phase='deploy';});render();if(['READY','ERROR','CANCELED'].includes(result.deployment.readyState))break;await new Promise(r=>setTimeout(r,3000));}}catch(e){if(owner!==store.owner())return;patch(sid,x=>{x.functionalDiagnostics={label:'Deployment status',error:e.message,code:e.code,httpStatus:e.httpStatus,stage:'failed'};});render();}finally{polls.delete(sid);}}
setInterval(()=>{const j=job(active),seconds=j?Math.floor((Date.now()-j.started)/1000):0;const el=document.getElementById('elapsed');if(el&&j)el.textContent=seconds+'초';document.querySelectorAll('.btnRunText').forEach(x=>{if(j)x.textContent='Working · '+seconds+'s';});},500);
window.addEventListener('storage',ev=>{if(ev.key===store.key()){try{pack=store.read();if(!pending.size)render();}catch{}}});
function focusHash(){var target=document.getElementById((location.hash||"#scope-stage").slice(1))||document.getElementById("scope-stage");if(target)target.scrollIntoView({block:"start"});}
window.StartupOSBuildBridge={
 getSession:()=>session(), getSessionById:(sid)=>pack.sessions.find(x=>x._sessionId===sid),
 getActiveId:()=>active, patch, refresh:render, request, log, getInfo:()=>info
};
ingestVerifyIssue();
render();
if(window.StartupOSCloud)window.StartupOSCloud.connect({
 getPack:()=>pack,
 isBusy:sid=>pending.has(sid),
 replacePack:value=>{const switched=studioOwner!==store.owner();studioOwner=store.owner();if(switched){pending.clear();polls.clear();}pack=value;active=pack.sessions.some(x=>x._sessionId===active)?active:pack.activeId||pack.sessions[0]?._sessionId||"";globalError="";if(switched||!pending.size)render();if(switched)window.dispatchEvent(new CustomEvent("startupos:studio-account-changed"));},
 applyRemote:items=>{
  const fresh=store.read()||{sessions:[],activeId:""};
  if(!Array.isArray(fresh.sessions))fresh.sessions=[];
  let changed=false;
  items.forEach(p=>{if(!p||!p._sessionId||!p._sessionId.startsWith("vs_"))return;const idx=fresh.sessions.findIndex(x=>x._sessionId===p._sessionId);const value=JSON.parse(JSON.stringify(p));if(idx<0){fresh.sessions.unshift(value);changed=true}else if(JSON.stringify(fresh.sessions[idx])!==JSON.stringify(value)){fresh.sessions[idx]=value;changed=true}});
  if(changed){store.write(fresh);pack=fresh;if(!session()&&pack.sessions.length)active=pack.sessions[0]._sessionId;if(!pending.size)render()}
 }
});request('/api/build').then(data=>{info=data;render();if(repairFor(session()))refreshRepairPlan(active);if(location.hash)setTimeout(focusHash,30);}).catch(e=>{globalError=e.message;render();});
window.addEventListener("hashchange",focusHash);
})();

