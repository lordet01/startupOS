(function(){
'use strict';
const B=window.StartupOSDashboard,W=window.StartupOSWorkspace,S=window.StartupOSStore;
if(!B)return;
const esc=B.escape,money=n=>'$'+Number(n||0).toFixed(2);
let search='',filter='active',sort='updated',historyEpoch=0;
const empty=text=>'<section class="card emptyState">'+esc(text)+'</section>';
const button=(label,action,sid,extra='')=>'<button type="button" class="btn" data-work="'+action+'" '+(sid?'data-sid="'+esc(sid)+'"':'')+' '+extra+'>'+label+'</button>';
const stamp=value=>value?new Date(value).toLocaleString():'';
function stage(p){if(p.functionalBuild?.deployment?.readyState==='READY')return '배포 완료';if(p.functionalBuild)return '빌드 완료';if(p.serviceFlow?.length)return '기획 완료';return '작성 중';}
function autoBuildStatus(p){const r=p.functionalAutoBuild;if(!r)return '';const label={RUNNING:'실행 중',NEEDS_APPROVAL:'승인 대기',REVIEW:'검수 대기',COMPLETE:'완료',PAUSED:'일시정지',CANCELED:'취소',BLOCKED_EXTERNAL:'연결 확인',NEEDS_DECISION:'확인 필요',PLATEAU:'설계 재검토',LIMIT:'한도 도달'}[r.status]||r.status;return '<div class="workspace-autobuild">AutoBuild · '+esc(label)+' · '+Number(r.turn||0)+'/'+Number(r.limits?.maxTurns||0)+'</div>';}
function cards(){
 const all=B.getPack().sessions;
 const rows=all.filter(p=>(filter==='trash'?!!p._deletedAt:filter==='archived'?!!p._archivedAt&&!p._deletedAt:!p._archivedAt&&!p._deletedAt)&&[p.name,p.idea,p._sessionId].join(' ').toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 rows.sort((a,b)=>Number(!!b._pinned)-Number(!!a._pinned)||(sort==='name'?a.name.localeCompare(b.name):sort==='stage'?stage(a).localeCompare(stage(b)):String(b._updatedAt).localeCompare(String(a._updatedAt))));
 if(!rows.length){
  if(search||filter!=='active')return empty(search?'검색 결과가 없습니다.':filter==='trash'?'휴지통이 비어 있습니다.':'보관한 앱이 없습니다.');
  return '<section class="toolEmpty"><span class="emptyIcon" aria-hidden="true">＋</span><h3>첫 번째 앱을 만들어 보세요</h3><p>아이디어를 입력하면 기획부터 빌드, 배포까지 이어집니다.</p><button class="btn primary" data-work="new-app">새 앱 만들기</button><button class="btn textBtn" data-work="account">기존 프로젝트 가져오기</button></section>';
 }
 return '<div class="sessionGrid">'+rows.map(p=>{
  const next=p.functionalBuild?.deployment?.readyState==='READY'?'배포된 앱 확인':p.functionalBuild?'앱 수정하기':p.serviceFlow?.length?'빌드 계속하기':'기획 계속하기';
  return '<article class="card sessionCard"><div class="sessionCardTop"><div class="appAvatar" aria-hidden="true">'+esc((p.name||'S').charAt(0).toUpperCase())+'</div><div class="appTitle"><span class="workspace-eyebrow">'+esc(stage(p))+'</span><h3>'+esc(p.name)+'</h3></div>'+button(p._pinned?'★':'☆','pin',p._sessionId,'aria-label="즐겨찾기" aria-pressed="'+!!p._pinned+'"')+'</div><p>'+esc(p.desiredOutcome||p.idea||'사용자와 필요한 기능을 정해 주세요.')+'</p>'+autoBuildStatus(p)+'<div class="workspace-sub">최근 수정 '+esc(stamp(p._updatedAt))+'</div><div class="appCardFooter">'+(p._deletedAt?button('복구','restore-app',p._sessionId):button(next+' →','resume',p._sessionId)+'<details class="appMenu"><summary aria-label="'+esc(p.name)+' 관리">···</summary><div>'+button('이름 변경','rename',p._sessionId)+button('복제','duplicate',p._sessionId)+button(p._archivedAt?'보관 해제':'보관','archive',p._sessionId)+button('변경 이력','history',p._sessionId)+button('휴지통으로','trash',p._sessionId)+'</div></details>')+'</div></article>';
 }).join('')+'</div>';
}
function sessions(){
 const count=B.getPack().sessions.filter(p=>!p._deletedAt&&!p._archivedAt).length,status=window.StartupOSCloud.status();
 return B.shell('<div class="pageHead"><div><h2>내 앱</h2><p class="pageIntro">만들고 있는 앱과 배포한 앱을 한곳에서 관리하세요.</p><span class="pageCount">'+count+'개의 앱</span></div><div class="workspace-actions">'+button('계정 · 동기화','account')+'</div></div><div class="workspace-sync" id="workspaceSync">'+syncText(status)+'</div><div class="workspace-toolbar"><input id="appsSearch" type="search" placeholder="프로젝트 검색" aria-label="프로젝트 검색" value="'+esc(search)+'"><select id="appsFilter" aria-label="프로젝트 분류"><option value="active" '+(filter==='active'?'selected':'')+'>내 프로젝트</option><option value="archived" '+(filter==='archived'?'selected':'')+'>보관함</option><option value="trash" '+(filter==='trash'?'selected':'')+'>휴지통</option></select><select id="appsSort" aria-label="프로젝트 정렬"><option value="updated" '+(sort==='updated'?'selected':'')+'>최근 수정</option><option value="name" '+(sort==='name'?'selected':'')+'>이름순</option><option value="stage" '+(sort==='stage'?'selected':'')+'>단계순</option></select></div><div id="appsCards">'+cards()+'</div>');
}
function syncText(s){return esc(s.user?(s.phase==='synced'?'● 클라우드에 저장됨':s.phase==='offline'?'● 오프라인 · 기기에 저장됨':s.conflicts?'● 수정본 충돌 '+s.conflicts+'개':s.pending?'● 저장 대기 '+s.pending+'개':'● 계정 연결됨'):'이 기기에 저장됨 · 로그인하면 다른 기기에서도 이어서 작업할 수 있습니다.');}
function approvalRows(p){
 return (p.approvals||[]).map(a=>'<article class="workspace-record"><div class="sectionHead"><strong>'+esc(a.title)+'</strong><span class="tag">'+esc({pending:'승인 대기',approved:'승인됨 · 예산 예약',rejected:'반려',completed:'실행 기록됨',cancelled:'취소'}[a.status]||a.status)+'</span></div><p>'+esc(a.type)+' · 예상 '+money(a.estimatedUsd)+' · '+esc(stamp(a.createdAt))+'</p>'+(a.note?'<p>'+esc(a.note)+'</p>':'')+'<div class="workspace-actions">'+(a.status==='pending'?button('승인','approve',p._sessionId,'data-id="'+esc(a.id)+'"')+button('반려','reject',p._sessionId,'data-id="'+esc(a.id)+'"'):a.status==='approved'?button('실행 결과 기록','complete',p._sessionId,'data-id="'+esc(a.id)+'"')+button('승인 취소','cancel',p._sessionId,'data-id="'+esc(a.id)+'"'):'')+'</div></article>').join('')||'<p class="mutedLine">승인 요청이 없습니다.</p>';
}
function cost(){
 const p=B.getSession(),t=W.totals(p);
 return B.shell('<div class="pageHead"><h2>비용 내역</h2>'+button('CSV 내보내기','cost-export',p._sessionId)+'</div><div class="costTotals"><div class="card"><span>공급자 비용 · 추정 포함</span><strong>'+money(t.external)+'</strong></div><div class="card"><span>수수료 추정 · 5%</span><strong>'+money(t.fee)+'</strong></div><div class="card"><span>예약 비용</span><strong>'+money(t.reserved)+'</strong></div><div class="card"><span>남은 계획 예산</span><strong class="'+(t.left<0?'red':'')+'">'+money(t.left)+'</strong></div></div><section class="card"><div class="sectionHead"><h3>예산</h3><span class="tag">'+(t.left<0?'초과':t.total>t.budget*.8?'80% 이상 사용':'계획 예산')+'</span></div><form id="budgetForm" class="workspace-form"><label>MVP 예산 (USD)<input name="budget" type="number" min="0" step="0.01" required value="'+t.budget+'"></label><button class="btn" type="submit">예산 저장</button></form><p class="mutedLine">승인한 예상 비용은 예약 금액으로 계산합니다. 공급자 결제 한도는 해당 공급자 설정에서 관리하세요.</p></section><section class="card"><h3>지출 기록</h3>'+(t.rows.length?'<div class="tableWrap"><table class="table"><thead><tr><th>작업</th><th>공급자</th><th>근거</th><th>USD</th></tr></thead><tbody>'+t.rows.map(x=>'<tr><td>'+esc(x.action)+'</td><td>'+esc(x.provider)+'</td><td>'+esc(x.kind)+(x.evidence?'<br>'+esc(x.evidence):'')+'</td><td>'+Number(x.usd||0).toFixed(6)+'</td></tr>').join('')+'</tbody></table></div>':'<p class="mutedLine">기록된 비용이 없습니다.</p>')+'<details><summary>외부 지출 추가</summary><form id="expenseForm" class="workspace-form"><label>작업<input name="action" required maxlength="200"></label><label>공급자<input name="provider" required maxlength="100"></label><label>금액 (USD)<input name="usd" type="number" min="0" step="0.000001" required></label><label>분류<select name="kind"><option value="invoice">청구서 확인</option><option value="estimate">견적 / 추정</option></select></label><label>근거 / 메모<input name="evidence" required maxlength="500"></label><button class="btn" type="submit">지출 기록</button></form></details></section><section class="card"><h3>승인 · 실행 기록</h3><p class="mutedLine">승인은 계획과 예산을 기록합니다. 배포·결제·광고 집행은 각 서비스에서 실행한 후 결과를 남기세요.</p><form id="approvalForm" class="workspace-form"><label>요청할 작업<input name="title" required minlength="3" maxlength="200"></label><label>유형<select name="type"><option value="deploy">배포</option><option value="payment">결제</option><option value="ads">광고</option><option value="other">기타</option></select></label><label>예상 비용 (USD)<input name="estimatedUsd" type="number" min="0" step="0.01" required value="0"></label><button class="btn" type="submit">승인 요청 추가</button></form>'+approvalRows(p)+'</section><section class="card"><h3>비용 검토</h3><p class="mutedLine">기획 분석·AI 검토·수정 채팅은 서버에 설정된 모델로 실행합니다. 테스트용 수치는 비용에 포함하지 않습니다.</p>'+(p.costBreakdown?.length?'<div class="simpleChecklist">'+p.costBreakdown.map(x=>'<div>'+esc(x.item||x.service||x.name||x.category||JSON.stringify(x))+' · '+esc(x.cost_usd??x.monthly_cost_usd??x.usd??'견적 확인')+'</div>').join('')+'</div>':'<p>기획을 분석하면 권장 스택과 예상 운영비를 비교할 수 있습니다.</p>')+'</section>');
}
function growth(){
 const p=B.getSession(),m=p.metrics||{},manual=p.metricsSource==='manual',connected=p.metricsSource==='connected';
 return B.shell('<div class="pageHead"><div><h2>성과</h2><p class="pageIntro">측정값을 기록하고 다음 실험을 결정하세요.</p></div><span class="tag">'+(manual?'수동 측정':connected?'연결됨':'아직 측정 없음')+'</span></div>'+((manual||connected)?'<div class="kpis">'+[['방문자',m.visitors||0],['활성화',(m.activation||0)+'%'],['구매 전환',(m.paid||0)+'%'],['매출 (USD)',money(m.revenue||0)]].map(x=>'<div class="kpi"><span>'+x[0]+'</span><b>'+esc(String(x[1]))+'</b></div>').join('')+'</div><p class="mutedLine">'+esc(p.metricsPeriod||'')+' · '+esc(p.metricsEvidence||'')+'</p>':empty('측정 데이터를 입력하면 전환율과 실험 결과를 비교할 수 있습니다.'))+
 '<section class="card"><h3>측정 기록</h3><form id="metricsForm" class="workspace-form"><label>측정 기간<input name="period" placeholder="예: 10/21–10/28" required maxlength="100"></label><label>방문자 수<input name="visitors" type="number" min="0" step="1" required></label><label>활성 사용자 수<input name="activated" type="number" min="0" step="1" required></label><label>구매자 수<input name="payers" type="number" min="0" step="1" required></label><label>매출 (USD)<input name="revenue" type="number" min="0" step="0.01" required value="0"></label><label>자료 출처 / 근거<input name="evidence" required minlength="8" maxlength="1000" placeholder="분석 도구 리포트, 측정 방법"></label><button class="btn" type="submit">측정값 저장</button></form>'+(p.metricsHistory?.length?'<details><summary>과거 측정 ('+p.metricsHistory.length+')</summary>'+p.metricsHistory.map(x=>'<p class="mutedLine">'+esc(x.period)+' · 방문 '+x.metrics.visitors+' · 활성 '+x.metrics.activation+'% · 구매 '+x.metrics.paid+'% · '+esc(x.evidence)+'</p>').join('')+'</details>':'')+'</section>'+
 (p.nextExperiment?'<section class="card"><h3>다음 실험 제안</h3><p>'+esc(p.nextExperiment)+'</p>'+button('실험 계획으로 가져오기','suggest-experiment',p._sessionId)+'</section>':'')+
 '<section class="card"><h3>실험 만들기</h3><form id="experimentForm" class="workspace-form"><label>실험명<input name="title" required maxlength="150"></label><label>가설<textarea name="hypothesis" required maxlength="1500"></textarea></label><label>성공 지표<input name="metric" required maxlength="120" placeholder="예: 가입 전환율 (%)"></label><label>목표값<input name="threshold" type="number" min="0" step="any" required></label><label>목표 방향<select name="direction"><option value="gte">목표값 이상</option><option value="lte">목표값 이하</option></select></label><button class="btn" type="submit">실험 추가</button></form></section><section class="card"><h3>실험 기록</h3>'+((p.experiments||[]).map(e=>'<article class="workspace-record"><div class="sectionHead"><strong>'+esc(e.title)+'</strong><span class="tag">'+esc(e.status==='completed'?(e.met?'목표 달성':'목표 미달'):e.status==='running'?'진행 중':'계획됨')+'</span></div><p>'+esc(e.hypothesis)+'</p><p>'+esc(e.metric)+' '+(e.direction==='lte'?'≤':'≥')+' '+e.threshold+'</p>'+(e.status==='completed'?'<p>측정: '+e.result+' · '+esc(e.evidence)+'</p>':'<div class="workspace-actions">'+(e.status==='planned'?button('실험 시작','start-experiment',p._sessionId,'data-id="'+e.id+'"'):'')+button('결과 기록','experiment-result',p._sessionId,'data-id="'+e.id+'"')+'</div>')+'</article>').join('')||'<p class="mutedLine">아직 실험이 없습니다.</p>')+'</section>');
}
function settings(){
 const original=baseSettings();
 return original.replace('</div></main>','<section class="card" id="workspaceSetup"><h3>서비스 연결 상태</h3><p class="mutedLine">확인 중…</p></section></div></main>');
}
let health=null;
async function healthCheck(){
 if(health)return health;
 health=Promise.allSettled(['/api/cloud-config','/api/build','/api/runtime'].map(async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json();})).then(results=>results.map(r=>r.status==='fulfilled'?r.value:null));
 return health;
}
async function showHealth(){
 const target=document.getElementById('workspaceSetup');if(!target)return;
 const [cloud,build,runtime]=await healthCheck();if(!target.isConnected)return;
 target.innerHTML='<h3>서비스 연결 상태</h3><div class="simpleChecklist"><div>로그인 · '+(cloud?.enabled?'설정됨':'설정 필요')+'</div><div>AI · '+(build?.configured?.ocr?'설정됨':'설정 필요')+'</div><div>배포 · '+(build?.configured?.publisher?'설정됨':'설정 필요')+'</div><div>Blueprint 모델 · '+esc(runtime?.model||'연결 확인 필요')+'</div></div>'+(cloud?.missing?.length?'<p class="mutedLine">인증 설정 누락: '+esc(cloud.missing.join(', '))+'</p>':'')+'<p class="mutedLine"><a href="https://github.com/lordet01/startupOS/blob/main/docs/ACCOUNT_SYNC_V5.md" target="_blank" rel="noopener">운영 설정 안내 ↗</a></p>';
}
function download(name,type,content){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csv(values){return values.map(v=>{const text=String(v??'');return '"'+(/^[=+\-@\t\r]/.test(text)?"'":'')+text.replace(/"/g,'""')+'"';}).join(',');}
function historyClose(){historyEpoch++;document.getElementById('workspaceHistory')?.remove();}
async function history(sid){
 historyClose();const epoch=historyEpoch,p=B.getPack().sessions.find(x=>x._sessionId===sid),overlay=document.createElement('div');overlay.id='workspaceHistory';overlay.className='workspace-overlay';
 overlay.innerHTML='<section class="cloud-dialog" role="dialog" aria-modal="true" aria-labelledby="historyTitle"><header><strong id="historyTitle">'+esc(p.name)+' · 이력</strong>'+button('닫기','close-history')+'</header><div id="workspaceVersions">이전 버전 확인 중…</div><h3>작업 기록</h3>'+(p._events||[]).slice(0,15).map(e=>'<p class="mutedLine">'+esc(stamp(e.at))+' · '+esc(e.message)+'</p>').join('')+'</section>';document.body.appendChild(overlay);
 try{const rows=await window.StartupOSCloud.versions(sid);if(epoch!==historyEpoch)return;document.getElementById('workspaceVersions').innerHTML=rows.length?rows.map(v=>'<div class="workspace-record"><span>v'+v.revision+' · '+esc(stamp(v.updatedAt))+'</span>'+button('복구본 만들기','restore-version',sid,'data-revision="'+v.revision+'"')+'</div>').join(''):'클라우드에 저장된 이전 버전이 없습니다.';}
 catch(e){if(epoch===historyEpoch)document.getElementById('workspaceVersions').textContent=e.message;}
}
const baseSettings=()=>B.baseViews.settings();
B.registerViews({sessions,cost,growth,settings});
document.addEventListener('input',ev=>{if(ev.target.id==='appsSearch'){search=ev.target.value;document.getElementById('appsCards').innerHTML=cards();}});
document.addEventListener('change',ev=>{if(ev.target.id==='appsFilter'){filter=ev.target.value;document.getElementById('appsCards').innerHTML=cards();}if(ev.target.id==='appsSort'){sort=ev.target.value;document.getElementById('appsCards').innerHTML=cards();}});
document.addEventListener('click',async ev=>{
 const el=ev.target.closest('[data-work]');if(!el)return;
 const cmd=el.dataset.work,sid=el.dataset.sid||B.getSession()._sessionId;
 try{
  if(cmd==='new-app'){document.getElementById('newVenture').click();return;}
  if(cmd==='account')window.StartupOSCloud.open();
  if(cmd==='rename'){const p=B.getPack().sessions.find(x=>x._sessionId===sid),name=prompt('프로젝트 이름',p.name);if(name?.trim())B.mutate(sid,p=>p.name=name.trim().slice(0,140));}
  if(cmd==='pin')B.mutate(sid,p=>p._pinned=!p._pinned);
  if(cmd==='duplicate'){B.add(W.duplicate(B.getPack().sessions.find(x=>x._sessionId===sid)));B.show('sessions');}
  if(cmd==='archive')B.mutate(sid,p=>p._archivedAt=p._archivedAt?null:new Date().toISOString());
  if(cmd==='trash')B.mutate(sid,p=>p._deletedAt=new Date().toISOString());
  if(cmd==='restore-app')B.mutate(sid,p=>{delete p._deletedAt;delete p._archivedAt;});
  if(cmd==='resume'){
   const p=B.getPack().sessions.find(x=>x._sessionId===sid);
   if(p.functionalAutoBuild&&!['COMPLETE','CANCELED'].includes(p.functionalAutoBuild.status))location.assign('/builder/?sessionId='+encodeURIComponent(sid)+'#autobuildHost');
   else if(p.functionalBuild){const hash=p.functionalBuild.deployment?.readyState==='READY'?'#phone-stage':'#refineHost';location.assign('/builder/?sessionId='+encodeURIComponent(sid)+hash);}
   else B.open(sid,p._lastView||'venture');
  }
  if(cmd==='history')await history(sid);
  if(cmd==='close-history')historyClose();
  if(cmd==='restore-version'){el.disabled=true;await window.StartupOSCloud.restore(sid,Number(el.dataset.revision));historyClose();B.show('sessions');B.toast('이전 버전을 복구본으로 보존했습니다.');}
  const transitions={approve:'approved',reject:'rejected',complete:'completed',cancel:'cancelled'};
  if(transitions[cmd]){let note='';if(cmd==='complete'){note=prompt('실제 수행 결과와 확인 가능한 근거를 입력하세요.');if(note===null)return;}B.mutate(sid,p=>W.transition(p,el.dataset.id,transitions[cmd],note));}
  if(cmd==='cost-export'){const t=W.totals(B.getSession());download('StartupOS-costs.csv','text/csv;charset=utf-8','\ufeff'+[csv(['Action','Provider','Basis','USD','Evidence']),...t.rows.map(x=>csv([x.action,x.provider,x.kind,x.usd,x.evidence||'']))].join('\r\n'));}
  if(cmd==='suggest-experiment'){const p=B.getSession(),f=document.getElementById('experimentForm');f.elements.title.value='다음 성장 실험';f.elements.hypothesis.value=p.nextExperiment;f.elements.metric.value=p.agentCycle?.success_metric||'';f.scrollIntoView({behavior:'smooth',block:'center'});}
  if(cmd==='start-experiment')B.mutate(sid,p=>{const e=p.experiments.find(x=>x.id===el.dataset.id);if(e.status==='planned'){e.status='running';e.startedAt=new Date().toISOString();}});
  if(cmd==='experiment-result'){const value=prompt('실제로 측정한 지표 값을 입력하세요.');if(value===null)return;const evidence=prompt('측정 기간·자료 출처·결과 근거를 입력하세요.');if(evidence===null)return;B.mutate(sid,p=>W.result(p,el.dataset.id,value,evidence));}
 }catch(e){B.toast(e.message);if(cmd==='restore-version')el.disabled=false;}
});
document.addEventListener('submit',ev=>{
 const form=ev.target;if(!['budgetForm','expenseForm','approvalForm','metricsForm','experimentForm'].includes(form.id))return;ev.preventDefault();
 const values=Object.fromEntries(new FormData(form)),sid=B.getSession()._sessionId;
 try{B.mutate(sid,p=>{
  if(form.id==='budgetForm'){const n=Number(values.budget);if(!Number.isFinite(n)||n<0)throw Error('예산을 확인하세요.');p.budget=n;}
  if(form.id==='expenseForm'){const n=Number(values.usd);if(!Number.isFinite(n)||n<0)throw Error('금액을 확인하세요.');p.ledger=[{id:W.id(),action:values.action.slice(0,200),provider:values.provider.slice(0,100),usd:n,kind:values.kind,evidence:values.evidence.slice(0,500),at:new Date().toISOString(),feeEligible:false},...(p.ledger||[])];}
  if(form.id==='approvalForm')W.approval(p,values);
  if(form.id==='experimentForm')W.experiment(p,values);
  if(form.id==='metricsForm'){
   const visitors=Number(values.visitors),activated=Number(values.activated),payers=Number(values.payers),revenue=Number(values.revenue);
   if(![visitors,activated,payers].every(Number.isInteger)||visitors<0||activated<0||payers<0||activated>visitors||payers>visitors||!Number.isFinite(revenue)||revenue<0)throw Error('방문자·활성 사용자·구매자 수와 매출을 확인하세요.');
   const metrics={visitors,activated,payers,revenue,activation:visitors?Number((activated/visitors*100).toFixed(2)):0,paid:visitors?Number((payers/visitors*100).toFixed(2)):0};
   p.metrics=metrics;p.metricsSource='manual';p.metricsPeriod=values.period;p.metricsEvidence=values.evidence;p.metricsHistory=[{at:new Date().toISOString(),source:'manual',period:values.period,evidence:values.evidence,metrics},...(p.metricsHistory||[])].slice(0,30);
  }
 });B.toast('저장했습니다.');}catch(e){B.toast(e.message);}
});
window.addEventListener('startupos:sync-state',ev=>{const el=document.getElementById('workspaceSync');if(el)el.textContent=syncText(ev.detail);});
window.addEventListener('startupos:dashboard-rendered',showHealth);
window.addEventListener('startupos:account',historyClose);
document.addEventListener('keydown',ev=>{if(ev.key==='Escape')historyClose();});
showHealth();
})();
