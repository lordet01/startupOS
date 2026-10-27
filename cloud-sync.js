(function(){
'use strict';
const W=window.StartupOSWorkspace,S=window.StartupOSStore,MAX_BYTES=800000,network=window.StartupOSPreviewNativeFetch||window.fetch.bind(window);
let identityResolved;const firstIdentity=new Promise(resolve=>identityResolved=resolve);
let adapter=null,auth=null,db=null,user=null,ready=false,loaded=false,required=false,generation=0,unsubscribe=null;
let inFlight=new Map();
let remote=new Map(),base={},queue=new Set(),conflicts=new Set(),timer=null,attempt=0,flushing=false;
let modal=false,busy=false,error='',message='',phase='starting',returnFocus=null;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>new Date().toISOString(),read=()=>adapter?adapter.getPack():S.read();
const equal=(a,b)=>a&&b&&W.canonical(a)===W.canonical(b);
function notify(text,bad=false){if(bad)error=text;else message=text;renderUI();}
function checkpoint(){if(user)S.meta('sync',{queue:[...queue],base,conflicts:[...conflicts]});}
function emit(items){if(items.length&&adapter)adapter.applyRemote(items);}
function replace(value){adapter?.replacePack?.(value);}
function signedIn(){if(!ready)throw Error('운영자의 Firebase 인증 설정이 필요합니다.');if(!user)throw Error('먼저 로그인하세요.');}
function script(src){return new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=src;el.onload=resolve;el.onerror=()=>reject(Error('로그인 서비스에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도하세요.'));document.head.appendChild(el);});}
function localized(e){return ({'auth/invalid-credential':'이메일 또는 비밀번호를 확인하세요.','auth/wrong-password':'이메일 또는 비밀번호를 확인하세요.','auth/user-not-found':'이메일 또는 비밀번호를 확인하세요.','auth/email-already-in-use':'이미 가입한 이메일입니다. 로그인 또는 비밀번호 찾기를 이용하세요.','auth/invalid-email':'올바른 이메일을 입력하세요.','auth/weak-password':'비밀번호는 8자 이상으로 설정하세요.','auth/popup-closed-by-user':'로그인 창이 닫혔습니다. 다시 시도할 수 있습니다.','auth/too-many-requests':'요청이 많습니다. 잠시 후 다시 시도하세요.','auth/network-request-failed':'네트워크에 연결한 후 다시 시도하세요.','auth/requires-recent-login':'보안을 위해 다시 로그인한 후 시도하세요.','permission-denied':'프로젝트 저장 권한을 확인할 수 없습니다. Firestore 보안 규칙과 로그인 상태를 확인하세요.'})[e.code]||e.message||'작업에 실패했습니다.';}
async function boot(){
 try{
  const response=await network('/api/cloud-config',{cache:'no-store'});if(!response.ok)throw Error('인증 설정을 읽지 못했습니다.');
  const config=await response.json();required=config.authRequired===true;
  if(!config.enabled){phase='unconfigured';renderUI();return;}
  for(const name of ['firebase-app-compat','firebase-auth-compat','firebase-firestore-compat'])await script('https://www.gstatic.com/firebasejs/10.14.1/'+name+'.js');
  const app=firebase.apps.length?firebase.app():firebase.initializeApp(config.firebase);auth=app.auth();db=app.firestore();ready=true;
  auth.onAuthStateChanged(accountChanged,e=>{identityResolved();phase='error';notify(localized(e),true);});
  auth.getRedirectResult().catch(e=>notify(localized(e),true));
  let identityTimer;try{await Promise.race([firstIdentity,new Promise((_,reject)=>{identityTimer=setTimeout(()=>reject(Error('로그인 복원 시간이 초과되었습니다. 다시 연결해 주세요.')),15000);})]);}finally{clearTimeout(identityTimer);}
 }catch(e){phase='error';notify(localized(e),true);}
}
function accountChanged(next){
 if(user&&next&&user.uid===next.uid){user=next;renderUI();return;}
 const epoch=++generation;
 if(unsubscribe){unsubscribe();unsubscribe=null;}clearTimeout(timer);
 user=next;identityResolved();inFlight=new Map();loaded=false;remote=new Map();base={};queue=new Set();conflicts=new Set();error='';attempt=0;
 const value=S.activate(next?.uid);replace(value);window.dispatchEvent(new CustomEvent("startupos:account",{detail:{uid:next?.uid||null}}));
 if(!next){phase='signed-out';renderUI();return;}
 const pending=S.meta('sync')||{};base=pending.base||{};queue=new Set(pending.queue||[]);conflicts=new Set(pending.conflicts||[]);
 const authTime=Number(next.metadata?.lastSignInTime?Date.parse(next.metadata.lastSignInTime):Date.now());
 if(Date.now()-authTime>30*86400000){message='로그인 유효기간이 지났습니다. 다시 로그인하세요.';auth.signOut();return;}
 if(!S.meta('lastActivity')||authTime>S.meta('lastActivity'))S.meta('lastActivity',Date.now());
 phase=navigator.onLine===false?'offline':'loading';renderUI();
 unsubscribe=db.collection('users').doc(next.uid).collection('ventures').onSnapshot(snapshot=>{
  if(epoch!==generation)return;
  const accepted=[],current=new Map(read().sessions.map(p=>[p._sessionId,p]));remote=new Map();
  for(const document of snapshot.docs){
   const envelope=document.data(),p=envelope?.payload;if(!W.validSession(p)||p._sessionId!==document.id||envelope.ownerUid!==next.uid)continue;
   remote.set(document.id,envelope);
   if(equal(inFlight.get(document.id),p)){base[document.id]={revision:envelope.revision||0,payload:W.clone(p)};conflicts.delete(document.id);if(!equal(current.get(document.id),p))queue.add(document.id);continue;}
   if(adapter?.isBusy?.(document.id)&&!equal(current.get(document.id),p)&&!equal(base[document.id]?.payload,p)){conflicts.add(document.id);continue;}
   const outcome=W.merge(current.get(document.id),p,base[document.id]?.payload);
   if(outcome.action==='conflict'){conflicts.add(document.id);continue;}
   conflicts.delete(document.id);
   if(outcome.action==='accept'){accepted.push(p);base[document.id]={revision:envelope.revision||0,payload:W.clone(p)};queue.delete(document.id);}
   else queue.add(document.id);
  }
  for(const p of current.values())if(!remote.has(p._sessionId))queue.add(p._sessionId);
  emit(accepted);loaded=true;checkpoint();phase=conflicts.size?'conflict':queue.size?'pending':'synced';renderUI();schedule(200);
 },e=>{if(epoch!==generation)return;phase=navigator.onLine===false?'offline':'error';notify(localized(e),true);});
}
function schedule(delay=900){clearTimeout(timer);if(user&&loaded&&queue.size&&!flushing&&navigator.onLine!==false)timer=setTimeout(flush,delay);}
async function pushOne(payload,epoch){
 const uid=user.uid,reference=db.collection('users').doc(uid).collection('ventures').doc(payload._sessionId),expected=base[payload._sessionId];
 if(new TextEncoder().encode(JSON.stringify(payload)).length>MAX_BYTES)throw Error(payload.name+' 데이터가 800KB를 초과합니다. JSON으로 백업한 후 첨부 자료를 줄여 주세요.');
 const revision=await db.runTransaction(async tx=>{
  const snap=await tx.get(reference),old=snap.exists?snap.data():null;
  if(epoch!==generation)throw Error('계정이 변경되었습니다.');
  if(old&&!equal(old.payload,payload)&&(!expected||!equal(old.payload,expected.payload)))throw Object.assign(Error('다른 기기에서 수정한 내용이 있습니다.'),{code:'SYNC_CONFLICT'});
  const rev=(Number(old?.revision)||0)+1,envelope={ownerUid:uid,name:payload.name,updatedAt:payload._updatedAt||now(),revision:rev,payload};
  tx.set(reference,envelope);
  tx.set(reference.collection('versions').doc('r_'+String(rev).padStart(10,'0')),envelope);
  return rev;
 });
 if(epoch!==generation)return;
 base[payload._sessionId]={revision,payload:W.clone(payload)};
 const latest=read().sessions.find(p=>p._sessionId===payload._sessionId);
 if(equal(latest,payload))queue.delete(payload._sessionId);else queue.add(payload._sessionId);
 checkpoint();
}
async function flush(){
 if(!user||!loaded||flushing||navigator.onLine===false)return;
 flushing=true;const epoch=generation;phase='saving';renderUI();
 try{
  for(const sid of [...queue]){
   if(epoch!==generation)return;if(conflicts.has(sid))continue;
   const p=read().sessions.find(x=>x._sessionId===sid);if(!p){queue.delete(sid);continue;}
   if(equal(p,base[sid]?.payload)){queue.delete(sid);continue;}
   try{inFlight.set(sid,W.clone(p));await pushOne(W.clone(p),epoch);attempt=0;error='';}
   catch(e){if(epoch!==generation)return;if(e.code==='SYNC_CONFLICT'){conflicts.add(sid);error='동시에 수정된 프로젝트가 있습니다. 두 수정본을 확인해 주세요.';}else{error=localized(e);attempt++;break;}}finally{inFlight.delete(sid);}
  }
 }finally{
  flushing=false;
  if(epoch!==generation)schedule(50);
  if(epoch===generation){checkpoint();phase=navigator.onLine===false?'offline':conflicts.size?'conflict':error?'error':queue.size?'pending':'synced';renderUI();if(queue.size&&!conflicts.size)schedule(Math.min(60000,2000*Math.pow(2,attempt)));}
 }
}
function localSaved(value){
 if(!user)return;
 for(const p of value.sessions||[])if(W.validSession(p)&&!equal(p,base[p._sessionId]?.payload))queue.add(p._sessionId);
 checkpoint();phase=navigator.onLine===false?'offline':queue.size?'pending':phase;renderUI();schedule();
}
async function importLocal(){
 signedIn();if(!loaded)throw Error('프로젝트를 불러온 후 다시 시도하세요.');const guest=S.guest(),target=read();let added=0;
 for(const p of guest.sessions){
  const current=target.sessions.find(x=>x._sessionId===p._sessionId);if(equal(current,p))continue;
  const copy=W.clone(p);if(current||remote.has(copy._sessionId)){copy._sessionId=W.id();copy.name+=' (이 기기 복구본)';}
  copy._updatedAt=now();target.sessions.push(copy);queue.add(copy._sessionId);added++;
 }
 S.write(target);replace(target);checkpoint();notify(added+'개 프로젝트를 가져왔습니다. 원본은 이 기기에 보존됩니다.');schedule(100);
}
function exportLocal(){
 const value=read(),json=JSON.stringify({format:W.KEY,activeId:value.activeId,savedAt:now(),sessions:value.sessions},null,2);
 const url=URL.createObjectURL(new Blob([json],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='StartupOS-backup-'+now().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importFile(file){
 if(!file||file.size>20000000)throw Error('20MB 이하의 백업 JSON을 선택하세요.');
 const epoch=generation,value=JSON.parse(await file.text()),list=value.sessions;if(epoch!==generation)throw Error('계정이 변경되어 백업 불러오기를 중단했습니다.');
 if(!Array.isArray(list)||!list.length||list.length>2000||list.some(p=>!W.validSession(p)))throw Error('StartupOS 백업 파일 형식이 아닙니다.');
 const target=read();for(const item of list){const copy=W.clone(item);if(target.sessions.some(p=>p._sessionId===copy._sessionId)){copy._sessionId=W.id();copy.name+=' (백업 복구본)';}target.sessions.push(copy);}
 if(!target.activeId)target.activeId=target.sessions[0]._sessionId;S.write(target);replace(target);localSaved(target);notify(list.length+'개 프로젝트를 복구했습니다.');
}
async function resolve(sid,choice){
 signedIn();if(adapter?.isBusy?.(sid))throw Error('진행 중인 작업이나 Brief 편집을 마친 후 수정본을 확인하세요.');const incoming=remote.get(sid);if(!incoming)throw Error('클라우드 수정본을 다시 불러오세요.');
 const local=read().sessions.find(p=>p._sessionId===sid);if(!local)throw Error('로컬 수정본을 찾지 못했습니다.');
 const recovery=W.clone(local);recovery._sessionId=W.id();recovery.name+=' (충돌 복구본)';recovery._updatedAt=now();
 base[sid]={revision:incoming.revision||0,payload:W.clone(incoming.payload)};conflicts.delete(sid);queue.delete(sid);
 emit([incoming.payload,recovery]);queue.add(recovery._sessionId);checkpoint();schedule(100);
 notify(choice==='cloud'?'클라우드 수정본을 열었습니다. 로컬 내용도 복구본으로 보존했습니다.':'두 수정본을 보존했습니다. My Apps에서 복구본을 선택할 수 있습니다.');
}
async function versions(sid){
 signedIn();const epoch=generation;const snapshot=await db.collection('users').doc(user.uid).collection('ventures').doc(sid).collection('versions').orderBy('revision','desc').limit(12).get();
 if(epoch!==generation)throw Error('계정이 변경되었습니다.');return snapshot.docs.map(d=>d.data()).filter(d=>W.validSession(d.payload));
}
async function restore(sid,revision){
 const rows=await versions(sid),old=rows.find(x=>x.revision===revision);if(!old)throw Error('이전 버전을 찾지 못했습니다.');
 const copy=W.clone(old.payload);copy._sessionId=W.id();copy.name+=' (v'+revision+' 복구본)';copy._updatedAt=now();delete copy._deletedAt;delete copy._archivedAt;emit([copy]);queue.add(copy._sessionId);checkpoint();schedule();return copy;
}
async function persistence(){await auth.setPersistence(document.getElementById('cloudRemember')?.checked?firebase.auth.Auth.Persistence.LOCAL:firebase.auth.Auth.Persistence.SESSION);}
async function loginGoogle(){
 if(!ready)throw Error('Firebase 설정이 필요합니다.');await persistence();const provider=new firebase.auth.GoogleAuthProvider();
 try{await auth.signInWithPopup(provider);}catch(e){if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment'].includes(e.code))await auth.signInWithRedirect(provider);else throw e;}
}
async function emailLogin(mode){
 if(!ready)throw Error('Firebase 설정이 필요합니다.');
 const email=document.getElementById('cloudEmail').value.trim(),password=document.getElementById('cloudPassword').value;
 if(!email||!password)throw Error('이메일과 비밀번호를 입력하세요.');await persistence();
 if(mode==='signup'){if(password.length<8)throw Error('비밀번호는 8자 이상이어야 합니다.');const result=await auth.createUserWithEmailAndPassword(email,password);try{await result.user.sendEmailVerification();notify('계정을 만들었습니다. 이메일 인증 링크를 확인하세요.');}catch{notify('가입했습니다. 계정에서 이메일 인증을 다시 요청할 수 있습니다.');}}
 else await auth.signInWithEmailAndPassword(email,password);
}
async function resetPassword(){const email=document.getElementById('cloudEmail').value.trim();if(!email)throw Error('이메일을 입력하세요.');try{await auth.sendPasswordResetEmail(email);}catch(e){if(e.code!=='auth/user-not-found')throw e;}notify('입력한 주소로 재설정 안내를 요청했습니다. 받은 편지함을 확인하세요.');}
async function apiFetch(url,options={}){
 if(phase==='starting'&&String(options.method||'GET').toUpperCase()!=='GET')await booted;
 const target=new URL(url,location.href),same=target.origin===location.origin,epoch=generation;
 if(!same)return network(url,options);
 if(required&&!user){open();throw Object.assign(Error('로그인 후 계속할 수 있습니다. 입력 내용은 저장됩니다.'),{code:'AUTH_REQUIRED'});}
 const headers=new Headers(options.headers||{});
 if(user)headers.set('Authorization','Bearer '+await user.getIdToken());
 if(epoch!==generation)throw Error('계정이 변경되었습니다. 다시 시도하세요.');
 const response=await network(url,{...options,headers});
 if(epoch!==generation)throw Object.assign(Error('계정이 변경되어 이전 응답을 적용하지 않았습니다.'),{code:'ACCOUNT_CHANGED'});
 if(response.status===401){notify('로그인 세션이 만료되었습니다. 다시 로그인하세요.',true);if(user)await auth.signOut();open();}
 return response;
}
function open(){returnFocus=document.activeElement;modal=true;error='';renderUI();setTimeout(()=>document.getElementById('cloudEmail')?.focus(),0);}
function close(){modal=false;renderUI();returnFocus?.focus?.();}
function renderUI(){
 document.querySelectorAll('[data-cloud-button]').forEach(b=>{const label=user?'☁ '+(user.displayName||user.email||'계정').split(' ')[0]:'☁ 로그인';if(b.textContent!==label)b.textContent=label;b.title=user?'계정 · '+phase:'로그인 · 내 앱 동기화';});
 window.dispatchEvent(new CustomEvent('startupos:sync-state',{detail:status()}));
 const old=document.getElementById('cloudOverlay'),inputs={};
 old?.querySelectorAll('input').forEach(el=>{if(el.type!=='file')inputs[el.id]={value:el.value,checked:el.checked};});
 const focus=old?.contains(document.activeElement)?{id:document.activeElement.id,start:document.activeElement.selectionStart}:null;
 old?.remove();if(!modal)return;
 const descriptions={starting:'로그인 연결 확인 중…',unconfigured:'로그인을 활성화하려면 운영자의 인증 서비스 설정이 필요합니다.',loading:'내 프로젝트를 불러오는 중…',synced:'모든 변경사항이 저장되었습니다.',pending:queue.size+'개 프로젝트 저장 대기',saving:'클라우드에 저장 중…',offline:'오프라인 · 이 기기에 저장됨. 연결되면 자동 재시도합니다.',conflict:conflicts.size+'개 프로젝트의 수정본을 확인해 주세요.',error:'연결을 확인하고 다시 시도해 주세요.','signed-out':'현재 작업은 이 브라우저에 보관됩니다.'};
 const overlay=document.createElement('div');overlay.id='cloudOverlay';
 overlay.innerHTML='<section class="cloud-dialog" role="dialog" aria-modal="true" aria-labelledby="cloudTitle"><header><strong id="cloudTitle">계정 · 내 앱 동기화</strong><button data-cloud-command="close" aria-label="닫기">✕</button></header><p class="cloud-sub">'+esc(user?.email||'어느 기기에서든 같은 계정으로 이어서 작업하세요.')+'</p><div class="cloud-state" role="status">'+esc(busy?'처리 중… 잠시 기다려 주세요.':descriptions[phase]||phase)+'</div>'+(error?'<p class="cloud-error" role="alert">'+esc(error)+'</p>':'')+(message?'<p class="cloud-msg">'+esc(message)+'</p>':'')+
 (!user?'<form id="cloudForm" class="cloud-actions"><button type="button" class="cloud-primary" data-cloud-command="google" '+(!ready||busy?'disabled':'')+'>Google로 계속</button><label>이메일<input id="cloudEmail" type="email" autocomplete="email" required></label><label>비밀번호<input id="cloudPassword" type="password" autocomplete="current-password" required></label><label class="cloud-check"><input id="cloudRemember" type="checkbox" checked> 이 기기에서 로그인 유지</label><button type="submit" '+(!ready||busy?'disabled':'')+'>로그인</button><button type="button" data-cloud-command="signup" '+(!ready||busy?'disabled':'')+'>회원가입</button><button type="button" data-cloud-command="reset" '+(!ready||busy?'disabled':'')+'>비밀번호 찾기</button></form>':
 '<div class="cloud-actions"><span>계정 프로젝트 '+remote.size+'개 · 저장 대기 '+queue.size+'개</span><label>표시 이름<input id="cloudName" maxlength="80" value="'+esc(user.displayName||'')+'"></label><button data-cloud-command="profile">이름 저장</button>'+(!user.emailVerified?'<button data-cloud-command="verify">이메일 인증</button>':'<span>이메일 인증됨</span>')+'<label>미사용 시 자동 로그아웃<select id="cloudIdle"><option value="30">30분</option><option value="120">2시간</option><option value="480">8시간</option></select></label><button data-cloud-command="preferences">세션 설정 저장</button><button data-cloud-command="retry">지금 동기화</button><button data-cloud-command="import">이 기기 프로젝트 가져오기 ('+S.guest().sessions.length+')</button><button data-cloud-command="signout">로그아웃</button></div>')+
 [...conflicts].map(sid=>{const p=read().sessions.find(x=>x._sessionId===sid),r=remote.get(sid)?.payload;return '<section class="cloud-conflict"><strong>'+esc(p?.name||sid)+'</strong><p>이 기기: '+esc(p?._updatedAt||'')+'<br>클라우드: '+esc(r?._updatedAt||'')+'</p><button data-cloud-command="resolve" data-sid="'+esc(sid)+'">두 수정본 보존</button><button data-cloud-command="remote" data-sid="'+esc(sid)+'">클라우드 수정본 열기</button></section>';}).join('')+
 '<hr><div class="cloud-actions"><button data-cloud-command="export">전체 백업(JSON)</button><label class="cloud-upload">백업 불러오기<input id="cloudFile" type="file" accept=".json,application/json" hidden></label></div><p class="cloud-note">Mac Chrome의 기존 앱은 원래 Chrome에서 로그인한 후 「이 기기 프로젝트 가져오기」로 옮길 수 있습니다. Blueprint·Build·대화·배포 기록을 함께 보존합니다.</p></section>';
 document.body.appendChild(overlay);
 if(user)document.getElementById('cloudIdle').value=String(S.meta('preferences')?.idleMinutes||120);
 for(const [id,v]of Object.entries(inputs)){const el=document.getElementById(id);if(el){el.value=v.value;el.checked=v.checked;}}
 if(focus){const el=document.getElementById(focus.id);el?.focus();try{el?.setSelectionRange(focus.start,focus.start);}catch{}}
}
function mount(){const header=document.querySelector('.top .row:last-child,.studio-head');if(header&&!header.querySelector('[data-cloud-button]')){const b=document.createElement('button');b.type='button';b.className='cloud-account-btn';b.setAttribute('data-cloud-button','');header.prepend(b);renderUI();}}
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount();});}).observe(document.documentElement,{childList:true,subtree:true});
async function command(cmd,button){
 if(cmd==='close'){close();return;}if(busy)return;busy=true;error='';renderUI();
 try{
  if(cmd==='google')await loginGoogle();
  if(cmd==='signin'||cmd==='signup')await emailLogin(cmd);
  if(cmd==='reset')await resetPassword();
  if(cmd==='signout'){if(queue.size)notify('저장 대기 작업은 이 계정에 보존됩니다. 다시 로그인하면 재시도합니다.');await auth.signOut();}
  if(cmd==='import')await importLocal();
  if(cmd==='export')exportLocal();
  if(cmd==='profile'){signedIn();await user.updateProfile({displayName:document.getElementById('cloudName').value.trim().slice(0,80)});notify('표시 이름을 저장했습니다.');}
  if(cmd==='verify'){signedIn();await user.sendEmailVerification();notify('이메일 인증 링크를 발송했습니다.');}
  if(cmd==='preferences'){S.meta('preferences',{idleMinutes:Number(document.getElementById('cloudIdle').value)||120});notify('세션 설정을 저장했습니다.');}
  if(cmd==='retry'){error='';attempt=0;await flush();}
  if(cmd==='resolve'||cmd==='remote')await resolve(button.dataset.sid,cmd==='remote'?'cloud':'both');
 }catch(e){notify(localized(e),true);}finally{busy=false;renderUI();}
}
document.addEventListener('click',ev=>{const button=ev.target.closest('[data-cloud-button],[data-cloud-command]');if(!button)return;if(button.hasAttribute('data-cloud-button'))open();else command(button.dataset.cloudCommand,button);});
document.addEventListener('submit',ev=>{if(ev.target.id==='cloudForm'){ev.preventDefault();command('signin');}});
document.addEventListener('change',async ev=>{if(ev.target.id==='cloudFile')try{await importFile(ev.target.files[0]);}catch(e){notify(localized(e),true);}});
document.addEventListener('keydown',ev=>{
 if(!modal)return;if(ev.key==='Escape')close();
 if(ev.key==='Tab'){const els=[...document.querySelectorAll('#cloudOverlay button:not(:disabled),#cloudOverlay input:not([hidden]),#cloudOverlay select')].filter(x=>x.offsetParent!==null),first=els[0],last=els[els.length-1];if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last?.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first?.focus();}}
});
let lastActivity=0;for(const name of ['pointerdown','keydown'])document.addEventListener(name,()=>{if(user&&Date.now()-lastActivity>15000){lastActivity=Date.now();S.meta('lastActivity',lastActivity);}},{passive:true});
setInterval(()=>{if(!user||document.visibilityState==='hidden')return;const minutes=S.meta('preferences')?.idleMinutes||120;if(Date.now()-(S.meta('lastActivity')||Date.now())>minutes*60000){message='오랫동안 사용하지 않아 로그아웃했습니다. 저장 대기 작업은 보존됩니다.';auth.signOut();}},30000);
window.addEventListener('online',()=>{error='';schedule(50);renderUI();});window.addEventListener('offline',()=>{phase='offline';renderUI();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(50);});
window.addEventListener('startupos:workspace-storage',()=>{const value=S.read();replace(value);localSaved(value);});
const style=document.createElement('link');style.rel='stylesheet';style.href='/workspace.css';document.head.appendChild(style);
function status(){return{phase,user:user?.uid||null,email:user?.email||'',configured:ready,authRequired:required,remote:remote.size,pending:queue.size,conflicts:conflicts.size,localOnly:S.guest().sessions.length};}
window.StartupOSCloud={connect(a){adapter=a;mount();if(user)replace(S.read());},localSaved,open,status,fetch:apiFetch,exportLocal,importFile,versions,restore,sync:flush};
const booted=boot();mount();
})();

// Shared progress dialog for user-initiated long operations on dashboard and studio.
(function(){
 'use strict';
 const jobs=new Map();let sequence=0,dialog=null,previousFocus=null,timer=null,hidden=false;
 function draw(){
  const job=Array.from(jobs.values()).at(-1);
  if(!job){if(dialog){dialog.remove();dialog=null}if(timer){clearInterval(timer);timer=null}if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});previousFocus=null;hidden=false;return}
  if(!dialog){
   previousFocus=document.activeElement;dialog=document.createElement('div');dialog.id='startupLoading';
   dialog.innerHTML='<style>#startupLoading{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(15,32,57,.48);padding:20px}#startupLoading[hidden]{display:none}#startupLoading .loadingDialog{width:min(100%,380px);box-sizing:border-box;background:#fff;color:#17375e;padding:28px;border-radius:18px;box-shadow:0 18px 60px #0f203944;text-align:center;font:15px/1.55 system-ui,sans-serif}#startupLoading .loadingSpinner{width:34px;height:34px;margin:0 auto 16px;border:4px solid #dce5ef;border-top-color:#173d73;border-radius:50%;animation:startup-spin .8s linear infinite}#startupLoading h2{font-size:19px;margin:0 0 8px;color:#17375e}#startupLoading p{margin:0;color:#526b89}#startupLoading .loadingElapsed{font-size:12px;margin:14px 0}#startupLoading button{border:1px solid #c9d7e8;border-radius:9px;background:white;color:#17375e;padding:10px 16px;cursor:pointer;font:inherit}@keyframes startup-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){#startupLoading .loadingSpinner{animation-duration:2s}}</style><div class="loadingDialog" role="dialog" aria-modal="true" aria-labelledby="startupLoadingTitle" aria-describedby="startupLoadingMessage"><div class="loadingSpinner" aria-hidden="true"></div><h2 id="startupLoadingTitle"></h2><p id="startupLoadingMessage" role="status" aria-live="polite"></p><p class="loadingElapsed"></p><button type="button">백그라운드에서 계속</button></div>';
   document.body.appendChild(dialog);dialog.querySelector('button').onclick=()=>{hidden=true;dialog.hidden=true;if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true})};
   dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();dialog.querySelector('button').click()}else if(e.key==='Tab'){e.preventDefault();dialog.querySelector('button').focus()}});
   if(!hidden)dialog.querySelector('button').focus();
  }
  dialog.hidden=hidden;dialog.querySelector('h2').textContent=job.title;dialog.querySelector('#startupLoadingMessage').textContent=job.message;
  dialog.querySelector('.loadingElapsed').textContent='진행 시간 '+Math.floor((Date.now()-job.started)/1000)+'초 · 작업을 중복 실행하지 마세요';
  if(!timer)timer=setInterval(draw,1000);
 }
 window.StartupOSLoading={start(title,message){const id=++sequence;jobs.set(id,{title,message:message||'잠시만 기다려 주세요.',started:Date.now()});if(jobs.size===1)hidden=false;draw();return id},update(id,message){const job=jobs.get(id);if(job){job.message=message;draw()}},end(id){jobs.delete(id);draw()}};
})();
