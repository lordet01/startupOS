(function(){
'use strict';
const C=window.StartupOSAutoBuildCore,B=()=>window.StartupOSBuildBridge;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const drafts=new Map(),running=new Map(),enabled=new Set(),timers=new Map();let accountEpoch=0;
const labels={NEEDS_APPROVAL:'승인 대기',RUNNING:'실행 중',PAUSED:'일시정지',BLOCKED_EXTERNAL:'외부 연결 대기',NEEDS_DECISION:'확인 필요',PLATEAU:'설계 재검토',LIMIT:'한도 도달',FAILED:'실패',REVIEW:'최종 검수',COMPLETE:'완료',CANCELED:'취소'};
const stages={assemble:'구현',propose:'코드 생성',apply:'변경 적용',verify:'검증',diagnose:'실패 분석',review:'직접 검수',done:'완료'};
function draft(sid){if(!drafts.has(sid))drafts.set(sid,{instruction:'',screenshot:null,error:'',newRun:false,tab:'tree',testTurn:null,settings:false,settingsRun:null,options:{maxTurns:8,maxSameFailure:3,maxMinutes:20,maxModelCalls:12,autoApply:false,allowModel:false,liveConsent:false},note:''});return drafts.get(sid)}
const project=sid=>B()?.getSessionById(sid),current=sid=>project(sid)?.functionalAutoBuild;
function planInstruction(p){return ['Venture: '+p.name,p.idea||'', '승인된 Build scope 안에서 다음 기획을 구현하고 기존 사용자 데이터·동작을 유지하세요.',...(p.mvpFeatures||[]).map(x=>'기능: '+x),...(p.serviceFlow||[]).map(x=>'여정: '+[x.title,x.user_action,x.system_action].filter(Boolean).join(' / '))].join('\n').slice(0,2500)}
function isBusy(sid){const r=current(sid);return running.has(sid)||r?.status==='RUNNING'||!!r?.lease;}
function mutate(sid,fn){const b=B(),owner=window.StartupOSStore.owner();return b.patch(sid,p=>{if(owner!==window.StartupOSStore.owner())throw Error('계정 변경');fn(p)});}
function control(sid,action,payload={}){const d=draft(sid);try{const owner=window.StartupOSStore.owner();mutate(sid,p=>{const r=p.functionalAutoBuild;if(!r||r.ownerKey!==owner)throw Error('다른 계정의 실행입니다.');if(['manual','complete'].includes(action)&&(p.functionalBuild?.bid!==r.currentBuildId||p.functionalBuild?.artifactHash!==r.currentArtifactHash))throw Error('현재 Build가 변경되었습니다. 새 AutoBuild로 다시 검증하세요.');p.functionalAutoBuild=C.command(r,action,payload)});d.error='';if(['approve','resume','retry'].includes(action)){enabled.add(current(sid).id);queue(sid)}if(['cancel','pause'].includes(action))enabled.delete(current(sid).id);mount();}catch(e){d.error=e.message;mount()}}
function queue(sid){clearTimeout(timers.get(sid));const r=current(sid);if(!r||!enabled.has(r.id)||r.status!=='RUNNING'||r.lease||running.has(sid))return;timers.set(sid,setTimeout(()=>step(sid),500))}
function recordBuild(p,b,r,trace){const previous=p.functionalBuild;if(previous&&previous.bid!==b.bid)p.functionalBuildHistory=[previous,...(p.functionalBuildHistory||[])].slice(0,4);p.functionalBuild=b;p.functionalJourneyCheck=null;p._phase='blueprint';p.functionalRepairTrace=trace||[];
 if(p.functionalRepair)p.functionalRepair={...p.functionalRepair,status:'PATCHED_PENDING_VERIFY',rebuildId:b.bid};
 p.functionalChat=[...(p.functionalChat||[]),{role:'system',text:'AutoBuild v'+r.turn+' · '+b.bid,buildId:b.bid,at:new Date().toISOString()}].slice(-40);
}
async function execute(sid,r,p,d){const b=B(),f=p.functionalBuild,desc=f?.descriptor||f;
 if(r.stage==='assemble')return b.request('/api/build',{action:'assemble',project:{_sessionId:sid,name:p.name,refinementConfig:f?.refinement||null,codeEdits:f?.codeEdits||[]},kind:r.kind,acceptedScope:p.functionalScopeApproved===r.kind},70000);
 if(r.stage==='propose'){
  const screenshot=d.screenshot;d.screenshot=null;
  return b.request('/api/refine',{action:'code',kind:r.kind,sessionId:sid,buildId:f.bid,priorBuild:desc,message:(r.nextInstruction===r.instruction?r.instruction:[r.nextInstruction,r.instruction].filter(Boolean).join('\n\n')).slice(0,3000),history:(p.functionalChat||[]).slice(-6).map(x=>({role:x.role,text:x.text})),screenshot},70000);
 }
 if(r.stage==='apply'){
  if(r.repairPlan)return b.request('/api/build',{action:'repair-and-assemble',approved:true,project:{_sessionId:sid,name:p.name},priorBuild:desc,issue:r.issue,kind:r.kind,acceptedScope:p.functionalScopeApproved===r.kind},70000);
  if(!r.proposal)throw Error('적용할 코드 변경안이 없습니다.');
  return b.request('/api/build',{action:'refine-and-assemble',approved:true,project:{_sessionId:sid,name:p.name},priorBuild:desc,codeEdits:r.proposal.codeEdits,config:r.proposal.config,summary:r.proposal.response},70000);
 }
 if(r.stage==='verify')return b.request('/api/build',{action:'verify',descriptor:desc,sessionId:sid,liveConsent:r.liveConsent},110000);
 if(r.stage==='diagnose')return b.request('/api/build',{action:'repair-plan',issue:r.issue,priorBuild:desc},25000);
 throw Error('실행할 수 없는 단계');
}
async function step(sid){
 if(running.has(sid)||B()?.isBusy(sid))return;const owner=window.StartupOSStore.owner(),epoch=accountEpoch,p=project(sid),d=draft(sid);let claimed,lease;
 try{mutate(sid,p=>{claimed=C.claim(p.functionalAutoBuild,{ownerKey:owner,sessionId:sid,buildId:p.functionalBuild?.bid||null,sourceHash:B().getInfo()?.sourceHash});p.functionalAutoBuild=claimed});
  if(!claimed.lease){mount();return}lease=claimed.lease;running.set(sid,lease.id);B().refresh();
  const result=await execute(sid,claimed,p,d);
  if(owner!==window.StartupOSStore.owner()||epoch!==accountEpoch)return;
  let accepted=false;
  mutate(sid,p=>{const r=p.functionalAutoBuild;if(!r||r.id!==claimed.id||r.lease?.id!==lease.id)return;
   if((p.functionalBuild?.bid||null)!==lease.baseBuildId){p.functionalAutoBuild=C.reject(r,lease.id,{code:'AUTOBUILD_BUILD_CONFLICT',message:'실행 중 다른 Build가 생성되어 응답을 보존하지 않았습니다.'});return;}
   const next=C.receive(r,lease.id,result);p.functionalAutoBuild=next;
   if(result.build)recordBuild(p,result.build,next,result.repairTrace);
   if(result.verification){p.functionalBuild.verification=result.verification;if(result.verification.status==='INTEGRATION_VERIFIED'){p.functionalAutoBuildBest=C.clone(p.functionalBuild);p._phase='build';if(p.functionalRepair)p.functionalRepair={...p.functionalRepair,status:'REVERIFIED'};}else if(next.issue){p.functionalRepair={...next.issue,status:'REPAIR_REQUIRED'};p.functionalRepairPlan=null;}}
   if(result.status==='code_patch'||result.status==='config_patch'){
    p.functionalProposal={...result,baseBuildId:lease.baseBuildId,createdAt:new Date().toISOString(),source:'autobuild'};
    p.functionalChat=[...(p.functionalChat||[]),{role:'assistant',text:result.response||'AutoBuild 코드 변경안',buildId:lease.baseBuildId,at:new Date().toISOString()}].slice(-40);
   }
   if(result.build&&p.functionalProposal?.source==='autobuild')p.functionalProposal={...p.functionalProposal,status:'BUILT',resultBuildId:result.build.bid};
   if(typeof result.cost?.provider_usd==='number'){p.costs=p.costs||[];p.costs.push(['AutoBuild '+lease.stage,'OpenAI / existing runtime','AutoBuild',result.cost.provider_usd,claimed.id+':'+lease.id]);}
   accepted=true;
  });if(accepted)d.error='';
 }catch(e){if(owner!==window.StartupOSStore.owner()||epoch!==accountEpoch)return;d.error=e.message;if(!lease)enabled.delete(current(sid)?.id);try{mutate(sid,p=>{const r=p.functionalAutoBuild;if(lease&&r?.lease?.id===lease.id)p.functionalAutoBuild=C.reject(r,lease.id,{code:e.code,message:e.message});else if(!lease&&r?.status==='RUNNING'&&!r.lease)p.functionalAutoBuild=C.command(r,'interrupt',{reason:(e.code||'AUTOBUILD_PRECONDITION')+': '+e.message})})}catch{}
 }finally{if(running.get(sid)===lease?.id)running.delete(sid);if(owner===window.StartupOSStore.owner()&&epoch===accountEpoch){B()?.refresh();queue(sid)}}
}
function fields(o,settings){return '<div class="abLimits">'+[['maxTurns','최대 반복',50],['maxSameFailure','동일 실패',10],['maxMinutes','시간 (분)',180],['maxModelCalls','AI 호출',150]].map(([key,label,max])=>'<label>'+label+'<input data-ab-option="'+key+'" type="number" min="1" max="'+max+'" value="'+esc(o[key])+'"></label>').join('')+'</div><div class="abPolicy">'+[['allowModel','AI 코드 생성'],['autoApply','코드 변경 자동 적용'],['liveConsent','실제 API 검증 · 비용 발생']].map(([key,label])=>'<label><input data-ab-option="'+key+'" type="checkbox" '+(o[key]?'checked':'')+'>'+label+'</label>').join('')+'</div>'+(settings?'<button class="btn" id="abSaveSettings">설정 저장</button>':'');}
function formHtml(p,d){return '<form id="abNewForm"><div class="abInput"><label for="abInstruction">구현 지시</label><textarea id="abInstruction" maxlength="2500" rows="3" placeholder="현재 기획대로 구현하거나 이번에 바꿀 기능을 입력하세요.">'+esc(d.instruction)+'</textarea>'+(p.functionalScopeApproved!==B().getKind(p)?'<a class="abLink" href="#scope-stage">Build scope 승인 →</a>':'')+(d.screenshot?'<span class="abTag">캡처 첨부 1</span>':'')+'</div>'+'<details class="abAdvanced"><summary>반복 한도 · AI 사용 설정</summary>'+fields(d.options,false)+'</details>'+'<div class="abFormActions"><span>현재 기획 기준으로 구현 · 검증 반복</span><button class="btn primary" id="abStart" '+(p.functionalScopeApproved!==B().getKind(p)?'disabled':'')+'>AutoBuild 시작</button></div></form>';}
function treeHtml(r){return '<table class="abTable"><thead><tr><th>ID</th><th>요구사항</th><th>검증</th><th>상태</th></tr></thead><tbody>'+r.requirements.map(x=>'<tr><td class="abMono">'+esc(x.id)+'</td><td style="padding-left:'+(10+x.layer*12)+'px">'+esc(x.title)+'</td><td>'+esc(x.mode==='manual'?'직접 검수':x.mode==='automatic'?'서버 검증':'—')+'</td><td>'+(x.mode==='manual'&&r.status==='REVIEW'?'<label class="abManual"><input type="checkbox" data-ab-manual="'+esc(x.id)+'" '+(x.status==='passed'?'checked':'')+'>확인</label>':x.mode==='summary'?'—':x.status==='passed'?'<span class="abGood">통과</span>':'대기')+'</td></tr>').join('')+'</tbody></table>';}
function attemptsHtml(r){return '<table class="abTable"><thead><tr><th>반복</th><th>결과</th><th>검증</th><th>산출물</th><th></th></tr></thead><tbody>'+r.attempts.slice().reverse().map(a=>'<tr><td>v'+a.turn+'</td><td>'+esc({building:'구현 중',verifying:'검증 중',superseded:'초기 조립',passed:'통과',failed:'실패'}[a.status]||a.status)+'</td><td>'+(a.checks.length?a.checks.filter(c=>c.status==='passed').length+'/'+a.checks.length:'—')+'</td><td class="abMono">'+esc(a.artifactHash?.slice(0,12)||'—')+'</td><td><button class="abLink" data-ab-test="'+a.turn+'">검증</button></td></tr>').join('')+'</tbody></table>'+(!r.attempts.length?'<div class="abEmpty">구현 기록 없음</div>':'');}
function testsHtml(r,d){const a=r.attempts.find(a=>a.turn===d.testTurn)||r.attempts.at(-1);const rows=a?(a.checks||[]):r.verification?.checks||[];return '<div class="abVersion"><select id="abTestVersion" aria-label="AutoBuild 검증 버전">'+r.attempts.map(x=>'<option value="'+x.turn+'" '+(x.turn===a?.turn?'selected':'')+'>v'+x.turn+'</option>').join('')+'</select><span class="abTag">'+esc((a?(a.evidenceMode||'검증 미실행'):r.verification?.evidenceMode)||'서버 실행 증거')+'</span></div>'+rows.map(c=>'<details class="abCheck" '+(c.status==='passed'?'':'open')+'><summary><span class="'+(c.status==='passed'?'abGood':'abBad')+'">'+(c.status==='passed'?'PASS':'FAIL')+'</span><code>'+esc(c.id)+'</code></summary><pre>'+esc(c.evidence)+'</pre></details>').join('')+(!rows.length?'<div class="abEmpty">검증 결과 없음</div>':'');}
function changesHtml(r){const a=r.attempts.at(-1);const rows=r.proposal?.changes||a?.changes||[];return rows.map(c=>'<details class="abCode"><summary>'+esc(c.file||c.label||c.key||'변경')+'</summary><div class="abCodeDiff"><pre>'+esc(c.from)+'</pre><pre>'+esc(c.to)+'</pre></div></details>').join('')||'<div class="abEmpty">코드 변경 없음</div>';}
function mount(){
 const b=B(),host=document.getElementById('autobuildHost'),p=b?.getSession();if(!host||!p||!C)return;
 const sid=p._sessionId,d=draft(sid),r=p.functionalAutoBuild,info=b.getInfo(),kind=b.getKind(p),active=r&&!C.END.includes(r.status);
 const disabled=b.isBusy(sid)||running.has(sid)||!!r?.lease,old=r?.lease&&r.lease.until<=Date.now();
 const top='<div class="abHeading"><h2>AutoBuild</h2><span class="abTag">'+esc(kind||'모듈 미지원')+'</span>'+(r?'<span class="abState">'+esc(labels[r.status])+'</span>':'')+'<div class="abControls">'+(r&&!active?'<button class="btn" id="abNew">새 실행</button>':r&&!disabled&&r.status!=='RUNNING'?'<button class="btn" id="abNew">새 실행</button>':'')+'</div></div>';
 if(!info){host.innerHTML=top+'<div class="abEmpty">Build API 연결 중</div>';return}
 if(!kind){host.innerHTML=top+'<div class="abEmpty">구현 모듈 미지원</div>';return}
 if(!r||d.newRun){host.innerHTML=top+(d.error?'<div class="abError">'+esc(d.error)+'</div>':'')+formHtml(p,d);bindForm(sid,d);return}
 const checked=r.requirements.filter(x=>x.required&&x.status==='passed').length,total=r.requirements.filter(x=>x.required).length;
 const controls=(r.status==='NEEDS_APPROVAL'?'<button class="btn primary" data-ab-command="approve">'+(r.stage==='apply'?'변경 승인':'실행 승인')+'</button>':'')+
 (r.status==='RUNNING'?'<button class="btn" data-ab-command="pause">'+(r.pauseRequested?'정지 대기':'일시정지')+'</button>'+(!disabled&&!r.lease?'<button class="btn primary" id="abContinue">계속 실행</button>':''):'')+
 (C.STOP.includes(r.status)&&!r.lease?'<button class="btn primary" data-ab-command="'+(r.status==='PAUSED'?'resume':'retry')+'">'+(r.status==='PAUSED'?'재개':'재시도')+'</button>':'')+
 (old?'<button class="btn" data-ab-command="recover">미확인 요청 복구</button>':'')+
 (!C.END.includes(r.status)?'<button class="btn" data-ab-command="cancel">취소</button>':'')+
 (!disabled&&r.status!=='RUNNING'&&!r.lease&&!C.END.includes(r.status)?'<button class="btn" id="abSettings">설정</button>':'');
 host.innerHTML=top+'<div class="abStatus"><span>'+esc(stages[r.stage])+'</span><span>반복 '+r.turn+'/'+r.limits.maxTurns+'</span><span>검증 '+checked+'/'+total+'</span><span>동일 실패 '+r.sameFailure+'/'+r.limits.maxSameFailure+'</span><span>AI 호출 '+r.modelCalls+'/'+r.limits.maxModelCalls+'</span><span>'+(r.costUnknown?'비용 미확정':'$'+r.costUsd.toFixed(5))+'</span><span class="abTag">탭 제어 · 계정 Workspace 저장</span></div>'+
 '<div class="abActions">'+controls+'</div>'+(d.error?'<div class="abError" role="alert">'+esc(d.error)+'</div>':'')+(r.stopReason?'<div class="abError">'+esc(r.stopReason)+'</div>':'')+
 (r.lease?'<div class="abWorking" role="status">'+esc(stages[r.lease.stage])+' · '+(running.has(sid)?'요청 처리 중':old?'응답 미확인':'다른 탭 또는 이전 요청 확인 대기')+'</div>':'')+
 (d.settings?'<div class="abSettings">'+fields(d.settingsRun||{...r.limits,autoApply:r.autoApply,allowModel:r.allowModel,liveConsent:r.liveConsent},true)+'</div>':'')+
 '<div class="abWorkspace"><div class="abMain"><div class="abTabs">'+[['tree','요구사항'],['attempts','반복'],['tests','검증'],['changes','변경'],['events','로그']].map(([id,label])=>'<button data-ab-tab="'+id+'" class="'+(d.tab===id?'on':'')+'">'+label+'</button>').join('')+'</div><div class="abContent">'+(d.tab==='tree'?treeHtml(r):d.tab==='attempts'?attemptsHtml(r):d.tab==='tests'?testsHtml(r,d):d.tab==='changes'?changesHtml(r):'<div class="abEvents">'+r.events.slice().reverse().map(e=>'<div><time>'+esc(e.at.slice(11,19))+'</time><code>'+esc(e.type)+'</code><span>'+esc(e.message)+'</span></div>').join('')+'</div>')+'</div></div><aside class="abInspector"><h3>다음 지시</h3><pre>'+esc(r.nextInstruction)+'</pre>'+
 (r.issue?'<details '+(r.status==='REVIEW'?'':'open')+'><summary>실패 원인</summary><pre>'+esc(r.issue.message)+'</pre></details>':'')+
 (r.status==='REVIEW'?'<label class="abInput">검수 의견<textarea id="abReviewNote" maxlength="1000" rows="2">'+esc(d.note)+'</textarea></label><button class="btn primary" id="abComplete" '+(checked!==total?'disabled':'')+'>완료 승인</button>':'')+
 (!disabled&&r.status!=='RUNNING'&&!r.lease&&!C.END.includes(r.status)?'<details><summary>추가 지시</summary><textarea id="abFeedback" maxlength="2500" rows="3" placeholder="다음 구현 지시">'+esc(d.feedback||'')+'</textarea><button class="btn" id="abFeedbackSave">계약 갱신</button></details>':'')+
 (p.functionalAutoBuildBest&&p.functionalAutoBuildBest.kind===r.kind&&r.currentBuildId!==p.functionalAutoBuildBest.bid&&!disabled&&r.status!=='RUNNING'&&!C.END.includes(r.status)?'<button class="btn" id="abRestore">최선 버전 복원</button>':'')+
 '</aside></div>';
 bind(sid,d,r);
}
function bindForm(sid,d){const form=document.getElementById('abNewForm');if(!form)return;const text=document.getElementById('abInstruction');text.oninput=()=>d.instruction=text.value;
 document.querySelectorAll('#autobuildHost [data-ab-option]').forEach(el=>el.onchange=()=>d.options[el.dataset.abOption]=el.type==='checkbox'?el.checked:Number(el.value));
 form.onsubmit=e=>{e.preventDefault();const b=B(),p=project(sid);try{if(b.isBusy(sid)||isBusy(sid))throw Error('진행 중인 Build를 정지하세요.');const r=C.create(p,b.getInfo(),{...d.options,kind:b.getKind(p),ownerKey:window.StartupOSStore.owner(),instruction:d.instruction.trim()||planInstruction(p)});mutate(sid,p=>{if(p.functionalAutoBuild)p.functionalAutoBuildHistory=[p.functionalAutoBuild,...(p.functionalAutoBuildHistory||[])].slice(0,3);p.functionalAutoBuild=C.command(r,'approve',{approved:true})});d.newRun=false;d.error='';d.tab='tree';enabled.add(r.id);b.refresh();queue(sid)}catch(e){d.error=e.message;mount()}};
 const newButton=document.getElementById('abNew');if(newButton)newButton.onclick=()=>{d.newRun=false;mount()};
}
function bind(sid,d,r){
 document.querySelectorAll('#autobuildHost [data-ab-command]').forEach(el=>el.onclick=()=>control(sid,el.dataset.abCommand,{approved:true}));
 document.querySelectorAll('#autobuildHost [data-ab-tab]').forEach(el=>el.onclick=()=>{d.tab=el.dataset.abTab;mount()});
 document.querySelectorAll('#autobuildHost [data-ab-manual]').forEach(el=>el.onchange=()=>control(sid,'manual',{id:el.dataset.abManual,accepted:el.checked}));
 document.querySelectorAll('#autobuildHost [data-ab-test]').forEach(el=>el.onclick=()=>{d.tab='tests';d.testTurn=Number(el.dataset.abTest);mount()});
 const version=document.getElementById('abTestVersion');if(version)version.onchange=()=>{d.testTurn=Number(version.value);mount()};
 const next=document.getElementById('abContinue');if(next)next.onclick=()=>{enabled.add(r.id);queue(sid);mount()};
 const newButton=document.getElementById('abNew');if(newButton)newButton.onclick=()=>{d.newRun=true;d.instruction='';d.error='';mount()};
 const setting=document.getElementById('abSettings');if(setting)setting.onclick=()=>{d.settings=!d.settings;d.settingsRun={...r.limits,autoApply:r.autoApply,allowModel:r.allowModel,liveConsent:r.liveConsent};mount()};
 document.querySelectorAll('#autobuildHost .abSettings [data-ab-option]').forEach(el=>el.onchange=()=>d.settingsRun[el.dataset.abOption]=el.type==='checkbox'?el.checked:Number(el.value));
 const save=document.getElementById('abSaveSettings');if(save)save.onclick=()=>{control(sid,'configure',d.settingsRun);d.settings=false;mount()};
 const note=document.getElementById('abReviewNote');if(note)note.oninput=()=>d.note=note.value;
 const complete=document.getElementById('abComplete');if(complete)complete.onclick=()=>control(sid,'complete',{approved:true,note:d.note});
 const feedback=document.getElementById('abFeedback');if(feedback)feedback.oninput=()=>d.feedback=feedback.value;
 const feedbackSave=document.getElementById('abFeedbackSave');if(feedbackSave)feedbackSave.onclick=()=>{control(sid,'feedback',{instruction:d.feedback});d.feedback=''};
 const restore=document.getElementById('abRestore');if(restore)restore.onclick=()=>{try{mutate(sid,p=>{const best=p.functionalAutoBuildBest;if(C.END.includes(p.functionalAutoBuild.status)||best.sid!==sid||best.kind!==p.functionalAutoBuild.kind)throw Error('복원할 수 없는 실행입니다.');if(best.sourceHash!==B().getInfo()?.sourceHash)throw Error('현재 엔진에서 다시 Build해야 합니다.');const old=p.functionalBuild;p.functionalBuildHistory=[old,...(p.functionalBuildHistory||[])].slice(0,4);p.functionalBuild=C.clone(best);const r=C.clone(p.functionalAutoBuild);r.currentBuildId=best.bid;r.currentArtifactHash=best.artifactHash;r.verification=null;r.stage='verify';r.status='PAUSED';r.proposal=null;r.repairPlan=null;r.lease=null;r.stopReason='최선 버전 복원 · 재검증 필요';r.requirements.filter(x=>x.required).forEach(x=>x.status='pending');r.revision++;p.functionalAutoBuild=r;});B().refresh()}catch(e){d.error=e.message;mount()}};
}
window.addEventListener('startupos:studio-account-changed',()=>{accountEpoch++;drafts.clear();enabled.clear();for(const t of timers.values())clearTimeout(t);timers.clear();running.clear();mount()});
window.StartupOSAutoBuild={mount,isBusy,startFromFeedback(sid,input){const d=draft(sid);if(isBusy(sid))throw Error('AutoBuild를 일시정지한 뒤 새 지시를 보내세요.');d.instruction=String(input.message||'').slice(0,2500);d.screenshot=input.screenshot||null;d.options.allowModel=true;d.newRun=true;mount();document.getElementById('autobuildHost')?.scrollIntoView({block:'start',behavior:'smooth'});},step};
if(B())mount();
})();
