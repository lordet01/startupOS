(function(){
'use strict';
const KEY='startupOS.sessions.v1',MAX_BYTES=800000;
let adapter=null,app=null,auth=null,db=null,ready=false,initialLoaded=false,user=null,unsubscribe=null;
let remote=new Map(),blocked=new Set(),queue=new Set(),timer=null,modal=false,busy=false,error='',message='',phase='starting',lastPushed=new Map();
const escape=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const eid=()=> 'vs_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);
const clone=v=>JSON.parse(JSON.stringify(v));
const safeSession=v=>v&&typeof v==='object'&&!Array.isArray(v)&&typeof v._sessionId==='string'&&/^vs_[a-zA-Z0-9_-]{3,64}$/.test(v._sessionId)&&typeof v.name==='string';
const sizeOf=v=>new TextEncoder().encode(JSON.stringify(v)).length;
function pack(){try{return adapter?adapter.getPack():JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}}
function notify(msg,isError){(isError?error=msg:message=msg);renderUI()}
function emit(sessions){
 if(!adapter||!sessions.length)return;
 try{adapter.applyRemote(sessions);window.dispatchEvent(new CustomEvent('startupos:cloud-updated',{detail:{count:sessions.length}}))}
 catch(e){notify('클라우드 프로젝트 반영 실패: '+e.message,true)}
}
function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Firebase SDK 연결 실패'));document.head.appendChild(s)})}
async function boot(){
 try{
  const response=await fetch('/api/cloud-config',{cache:'no-store'});
  if(!response.ok)throw Error('인증 서비스 설정을 읽을 수 없습니다.');
  const data=await response.json();
  if(!data.enabled){phase='unconfigured';renderUI();return}
  for(const name of ['firebase-app-compat','firebase-auth-compat','firebase-firestore-compat'])await script('https://www.gstatic.com/firebasejs/10.14.1/'+name+'.js');
  app=firebase.apps.length?firebase.app():firebase.initializeApp(data.firebase);
  auth=firebase.auth();db=firebase.firestore();
  await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  phase='signed-out';ready=true;
  auth.onAuthStateChanged(async u=>{
   if(unsubscribe){unsubscribe();unsubscribe=null}
   user=u;remote=new Map();blocked=new Set();lastPushed=new Map();initialLoaded=false;queue.clear();
   if(!u){phase='signed-out';notify('로그인하면 My Apps를 모든 기기에서 사용할 수 있습니다.');return}
   phase='loading';renderUI();
   unsubscribe=db.collection('users').doc(u.uid).collection('ventures').onSnapshot(s=>{
     const records=[],newRemote=new Map();
     s.docs.forEach(doc=>{
       const d=doc.data();
       if(!d||!safeSession(d.payload)||d.payload._sessionId!==doc.id)return;
       newRemote.set(doc.id,d);records.push(d.payload);
     });
     const current=pack(),local=new Map((current&&current.sessions||[]).map(x=>[x._sessionId,x]));
     const accepted=[],conflicts=[];
     records.forEach(v=>{
       const currentLocal=local.get(v._sessionId),incoming=newRemote.get(v._sessionId),previous=remote.get(v._sessionId);
       if(currentLocal&&JSON.stringify(currentLocal)!==JSON.stringify(v)){
         // Do not silently replace changes that have never been uploaded from this browser.
         if(!previous&&String(currentLocal._updatedAt||'')>String(v._updatedAt||'')){blocked.add(v._sessionId);conflicts.push(v.name);return}
         if(previous&&JSON.stringify(currentLocal)!==JSON.stringify(previous.payload)&&JSON.stringify(previous.payload)!==JSON.stringify(v)){blocked.add(v._sessionId);conflicts.push(v.name);return}
       }
       blocked.delete(v._sessionId);
       accepted.push(v);
     });
     remote=newRemote;
     if(!initialLoaded){
       (current&&current.sessions||[]).forEach(v=>{if(!remote.has(v._sessionId))blocked.add(v._sessionId)});
     }
     initialLoaded=true;phase=conflicts.length?'conflict':'synced';
     emit(accepted);
     renderUI();
     // Freshly created projects are uploaded automatically; pre-login local projects require explicit import.
   },e=>{phase='error';notify('클라우드 읽기 실패: '+e.message,true)});
   notify('계정에 연결했습니다. Mac의 기존 프로젝트는 해당 Mac에서 가져와야 합니다.');
  });
  if(location.hash.includes('access_token'))auth.getRedirectResult().catch(()=>{});
 }catch(e){phase='error';notify(e.message||'클라우드 초기화 실패',true)}
}
async function loginGoogle(){
 if(!ready)throw Error('Firebase 설정이 필요합니다.');
 const provider=new firebase.auth.GoogleAuthProvider();
 try{await auth.signInWithPopup(provider)}
 catch(e){if(['auth/popup-blocked','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment'].includes(e.code)){await auth.signInWithRedirect(provider);return}throw e}
}
async function emailLogin(mode){
 const email=document.getElementById('cloudEmail')?.value.trim(),password=document.getElementById('cloudPassword')?.value;
 if(!email||!password)throw Error('이메일과 비밀번호를 입력하세요.');
 if(mode==='signup'){if(password.length<8)throw Error('비밀번호는 8자 이상이어야 합니다.');await auth.createUserWithEmailAndPassword(email,password)}
 else await auth.signInWithEmailAndPassword(email,password);
}
async function resetPassword(){
 const email=document.getElementById('cloudEmail')?.value.trim();if(!email)throw Error('이메일을 입력하세요.');
 await auth.sendPasswordResetEmail(email);notify('비밀번호 재설정 메일을 발송했습니다.')
}
async function pushOne(v,force){
 if(!safeSession(v))throw Error('유효하지 않은 프로젝트입니다.');
 const copy=clone(v);const bytes=sizeOf(copy);
 if(bytes>MAX_BYTES)throw Error(copy.name+' 데이터가 800KB를 초과합니다. JSON으로 백업하고 저장 구조를 축소해야 합니다.');
 const ref=db.collection('users').doc(user.uid).collection('ventures').doc(v._sessionId);
 await db.runTransaction(async tx=>{
   const snapshot=await tx.get(ref);
   if(snapshot.exists&&!force){
     const old=snapshot.data().payload;
     if(JSON.stringify(old)!==JSON.stringify(copy)&&String(old?._updatedAt||'')>String(copy._updatedAt||''))throw Error('다른 기기에서 더 새로운 수정본을 저장했습니다: '+v.name);
   }
   tx.set(ref,{name:copy.name,updatedAt:copy._updatedAt||new Date().toISOString(),payload:copy,ownerUid:user.uid});
 });
 lastPushed.set(v._sessionId,JSON.stringify(copy));return true;
}
async function flush(){
 if(!user||!initialLoaded)return;
 const ids=[...queue];queue.clear();
 if(!ids.length)return;
 const local=pack();
 for(const id of ids){
  if(blocked.has(id))continue;
  const v=local&&local.sessions.find(p=>p._sessionId===id);if(!v)continue;
  const serialized=JSON.stringify(v),existing=remote.get(id);
  if(lastPushed.get(id)===serialized||existing&&JSON.stringify(existing.payload)===serialized)continue;
  try{await pushOne(v,false)}catch(e){blocked.add(id);notify(e.message+' · 계정에서 충돌 해결/가져오기를 선택하세요.',true)}
 }
 if(!error)notify('변경사항이 클라우드에 저장되었습니다.');
}
function localSaved(next){
 if(!user||!initialLoaded||!next||!Array.isArray(next.sessions))return;
 next.sessions.forEach(v=>{
  if(!safeSession(v)||blocked.has(v._sessionId))return;
  const data=JSON.stringify(v),r=remote.get(v._sessionId);
  if(r&&JSON.stringify(r.payload)===data||lastPushed.get(v._sessionId)===data)return;
  queue.add(v._sessionId);
 });
 clearTimeout(timer);timer=setTimeout(flush,900);
}
async function importLocal(){
 if(!user||!initialLoaded)throw Error('클라우드 로그인과 최초 동기화를 기다려 주세요.');
 const local=pack(),rows=(local&&local.sessions||[]).filter(safeSession);
 let count=0,errors=[];
 for(const item of rows){
  if(!blocked.has(item._sessionId))continue;
  try{
   let copy=clone(item);
   const existing=remote.get(copy._sessionId);
   if(existing&&JSON.stringify(existing.payload)!==JSON.stringify(copy)){
     copy._sessionId=eid();copy.name+=' (이 기기 복구본)';copy._updatedAt=new Date().toISOString();
     emit([copy]); // A new ID preserves both versions.
   }
   await pushOne(copy,false);blocked.delete(item._sessionId);count++;
  }catch(e){errors.push(e.message)}
 }
 if(errors.length){phase='conflict';notify(count+'개 가져옴, '+errors.length+'개 실패: '+errors.join(' / '),true)}
 else {phase='synced';error='';notify(count+'개 로컬 프로젝트를 계정에 가져왔습니다. 다른 기기에서 새로고침하세요.')}
}
function exportLocal(){
 const value=pack();if(!value||!Array.isArray(value.sessions))throw Error('백업할 세션이 없습니다.');
 const json=JSON.stringify({format:'startupOS.sessions.v1',savedAt:new Date().toISOString(),sessions:value.sessions},null,2);
 const url=URL.createObjectURL(new Blob([json],{type:'application/json'})),a=document.createElement('a');
 a.href=url;a.download='startupOS-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importFile(file){
 if(!file||file.size>20000000)throw Error('20MB 이하의 백업 JSON을 선택하세요.');
 const data=JSON.parse(await file.text()),list=Array.isArray(data.sessions)?data.sessions:[],local=pack()||{activeId:'',sessions:[]};
 if(!list.length||list.length>2000||list.some(x=>!safeSession(x)))throw Error('StartupOS 백업 파일 형식이 아닙니다.');
 const byId=new Set(local.sessions.map(x=>x._sessionId));let added=0;
 list.forEach(v=>{
  const copy=clone(v);
  if(byId.has(copy._sessionId)){copy._sessionId=eid();copy.name+=' (백업 복구본)'}
  local.sessions.unshift(copy);byId.add(copy._sessionId);blocked.add(copy._sessionId);added++;
 });
 if(!local.activeId)local.activeId=local.sessions[0]._sessionId;
 if(adapter)adapter.applyRemote(local.sessions);else localStorage.setItem(KEY,JSON.stringify(local));
 notify(added+'개 복구했습니다. 계정으로 옮기려면 「이 기기 프로젝트 가져오기」를 누르세요.');
}
function renderUI(){
 document.querySelectorAll('[data-cloud-button]').forEach(b=>{
   const label=user?'☁ '+(user.displayName||user.email||'Account').split(' ')[0]:(phase==='unconfigured'?'☁ 설정 필요':'☁ 로그인');
   if(b.textContent!==label)b.textContent=label;
 });
 const old=document.getElementById('cloudOverlay');if(old)old.remove();
 if(!modal)return;
 const overlay=document.createElement('div');overlay.id='cloudOverlay';
 overlay.innerHTML='<section class="cloud-dialog" role="dialog" aria-modal="true" aria-label="StartupOS account">'+
 '<header><strong>☁ StartupOS 계정 · My Apps</strong><button data-cloud-command="close" aria-label="닫기">✕</button></header>'+
 '<p class="cloud-sub">'+escape(user?'로그인됨 · '+(user.email||user.uid):'프로젝트를 기기마다 이어서 작업하려면 로그인하세요.')+'</p>'+
 '<div class="cloud-state">'+escape(phase==='unconfigured'?'관리자의 Firebase 설정이 아직 없습니다. 로컬 백업은 지금도 가능합니다.':phase==='loading'?'프로젝트 불러오는 중…':phase==='synced'?'● 클라우드 동기화 연결됨':phase==='conflict'?'● 서로 다른 수정본 발견 · 복구본 가져오기가 필요합니다.':phase==='signed-out'?'로그인 전 · 현재 프로젝트는 이 브라우저에만 있습니다.':phase==='error'?'클라우드에 연결할 수 없습니다.':'연결 확인 중')+'</div>'+
 (error?'<p class="cloud-error" role="alert">'+escape(error)+'</p>':'')+
 (message?'<p class="cloud-msg">'+escape(message)+'</p>':'')+
 (!user?'<div class="cloud-actions"><button class="cloud-primary" data-cloud-command="google" '+(!ready?'disabled':'')+'>Google 계정으로 계속</button>'+
 '<input id="cloudEmail" type="email" placeholder="이메일" autocomplete="email"><input id="cloudPassword" type="password" placeholder="비밀번호 (8자 이상)" autocomplete="current-password">'+
 '<button data-cloud-command="signin" '+(!ready?'disabled':'')+'>이메일 로그인</button><button data-cloud-command="signup" '+(!ready?'disabled':'')+'>이메일 회원가입</button><button data-cloud-command="reset" '+(!ready?'disabled':'')+'>비밀번호 찾기</button></div>':
 '<div class="cloud-actions"><span>계정 프로젝트 '+remote.size+'개 · 이 기기에만 있는 프로젝트 '+blocked.size+'개</span>'+
 '<button class="cloud-primary" data-cloud-command="import" '+(!initialLoaded?'disabled':'')+'>이 기기 프로젝트 가져오기 ('+blocked.size+')</button>'+
 '<button data-cloud-command="signout">로그아웃</button></div>')+
 '<hr><div class="cloud-actions"><button data-cloud-command="export">이 기기 전체 백업(JSON)</button><label class="cloud-upload">백업 파일 불러오기<input id="cloudFile" type="file" accept=".json,application/json" hidden></label></div>'+
 '<p class="cloud-note">기존 Mac Chrome의 피부 분석 앱은 자동으로 사라지지 않습니다. Mac에서 로그인한 다음 「이 기기 프로젝트 가져오기」를 눌러야 휴대폰 My Apps에 나타납니다. 기존 이름·Blueprint·Build·채팅·배포 기록을 함께 복사합니다.</p></section>';
 document.body.appendChild(overlay);
}
function mount(){
 const header=document.querySelector('.top .row:last-child, .studio-head');
 if(header&&!header.querySelector('[data-cloud-button]')){
  const b=document.createElement('button');b.type='button';b.className='cloud-account-btn';b.setAttribute('data-cloud-button','');b.textContent=user?'☁ Account':'☁ 로그인';header.prepend(b);renderUI();
 }
}
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})}).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-cloud-button],[data-cloud-command]');if(!b)return;
 if(b.hasAttribute('data-cloud-button')){modal=true;error='';renderUI();return}
 const cmd=b.dataset.cloudCommand;
 if(cmd==='close'){modal=false;renderUI();return}
 if(busy)return;
 try{
  busy=true;
  if(cmd==='google')await loginGoogle();
  if(cmd==='signin'||cmd==='signup')await emailLogin(cmd);
  if(cmd==='reset')await resetPassword();
  if(cmd==='signout')await auth.signOut();
  if(cmd==='import')await importLocal();
  if(cmd==='export')exportLocal();
  error='';
 }catch(e){notify(e.message||'작업에 실패했습니다.',true)}
 finally{busy=false;renderUI()}
});
document.addEventListener('change',async ev=>{
 if(ev.target.id!=='cloudFile')return;
 try{await importFile(ev.target.files[0])}catch(e){notify(e.message,true)}
});
const style=document.createElement('style');style.textContent=
 '.cloud-account-btn{flex-shrink:0;border:1px solid #48618a;border-radius:11px;background:#1c3154;color:#fff;min-height:41px;padding:7px 11px;max-width:118px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:750;cursor:pointer}'+
 '#cloudOverlay{position:fixed;inset:0;z-index:9999;background:#020815dc;display:flex;justify-content:center;align-items:center;padding:14px;overflow-y:auto}'+
 '.cloud-dialog{background:#10203a;color:#edf4ff;width:min(490px,100%);max-height:94vh;overflow:auto;border:1px solid #48618a;border-radius:18px;padding:19px;box-shadow:0 20px 80px #0009}'+
 '.cloud-dialog header{display:flex;align-items:center;justify-content:space-between;gap:10px}.cloud-dialog header button{font-size:17px;background:transparent;border:0;color:#fff;cursor:pointer}'+
 '.cloud-sub,.cloud-note,.cloud-msg{font-size:12px;line-height:1.55;color:#bdcce2}.cloud-note{font-size:11px}.cloud-state{border:1px solid #325171;background:#0b1a2d;border-radius:10px;padding:11px;font-size:12px;margin:11px 0}'+
 '.cloud-error{color:#ffc6c6;font-size:12px}.cloud-dialog .cloud-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.cloud-actions span{width:100%;font-size:12px;color:#c5d2e7}'+
 '.cloud-actions input{width:100%;border:1px solid #3d5373;background:#081523;color:#fff;padding:12px;border-radius:9px}.cloud-actions button,.cloud-upload{border:1px solid #38527c;background:#1b3255;border-radius:10px;color:white;cursor:pointer;padding:11px 13px;font-size:12px;font-weight:750}'+
 '.cloud-actions button.cloud-primary{background:linear-gradient(110deg,#567dff,#6f64ea)}.cloud-actions button:disabled{opacity:.4;cursor:not-allowed}.cloud-dialog hr{border:0;border-top:1px solid #2f425d;margin:16px 0}'+
 '@media(max-width:760px){.top .cloud-account-btn{max-width:70px;font-size:10px;padding:5px}.studio-head .cloud-account-btn{max-width:78px;font-size:10px}}';
document.head.appendChild(style);
window.StartupOSCloud={connect(a){adapter=a;mount();if(initialLoaded&&remote.size)emit([...remote.values()].map(x=>x.payload));},localSaved,open(){modal=true;renderUI()},status(){return{phase,user:user&&user.uid,remote:remote.size,localOnly:blocked.size}}};
boot();mount();
})();