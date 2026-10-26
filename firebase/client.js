(function(){
'use strict';
const native=window.StartupOSPreviewNativeFetch||window.fetch.bind(window),cloud=window.StartupOSCloud;
const direct=cloud.fetch.bind(cloud),QUEUED=new Set(['/api/runtime','/api/idea-note','/api/refine','/api/build','/api/publish']);
const abort=()=>new DOMException('요청 대기를 중단했습니다. 서버 작업은 보존됩니다.','AbortError');
async function signOut(auth){const response=await native('/api/auth-session',{method:'DELETE'});if(!response.ok)throw Error('서버 로그아웃에 실패했습니다. 네트워크를 확인해 주세요.');if(window.caches)await Promise.all((await caches.keys()).filter(key=>key.startsWith('so-v3-')).map(key=>caches.delete(key)));if(navigator.serviceWorker)await Promise.all((await navigator.serviceWorker.getRegistrations()).filter(item=>new URL(item.scope).pathname.startsWith('/apps/')).map(item=>item.unregister()));await auth.signOut();location.assign('/login');}
window.StartupOSFirebase={signOut};
function wait(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted)return reject(abort());let timer;const cancel=()=>{clearTimeout(timer);reject(abort());};timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);signal?.addEventListener('abort',cancel,{once:true});});}
cloud.fetch=async function(url,options={}){
 const target=new URL(url,location.href);
 if(target.origin!==location.origin||String(options.method||'GET').toUpperCase()!=='POST'||!QUEUED.has(target.pathname))return direct(url,options);
 if(options.signal?.aborted)throw abort();
 // Identity must be settled before deriving a per-account recovery key.
 await direct('/api/session',{signal:options.signal});
 const owner=cloud.status().user;if(!owner)throw Error('로그인 후 계속해 주세요.');
 const body=typeof options.body==='string'?JSON.parse(options.body):options.body;
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner+'\0'+target.pathname+'\0'+JSON.stringify(body))))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const storageKey='startupos-firebase-job:'+digest;
 let saved;try{saved=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{}
 const key=saved?.key||crypto.randomUUID();
 // Persist before dispatch so a lost submission response can safely be submitted with the same key.
 localStorage.setItem(storageKey,JSON.stringify({key,at:saved?.at||Date.now()}));
 let id=saved?.id;
 if(!id){
  const response=await direct('/api/jobs',{...options,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:target.pathname.slice(5),body,key})});
  if(!response.ok){if(response.status===410)localStorage.removeItem(storageKey);return response;}
  const data=await response.json();id=data.job.id;
  localStorage.setItem(storageKey,JSON.stringify({key,id,at:saved?.at||Date.now()}));
 }
 window.dispatchEvent(new CustomEvent('startupos:server-job',{detail:{id,state:'waiting'}}));
 for(let round=0;round<300;round++){
  if(cloud.status().user!==owner)throw Error('계정이 변경되어 작업 결과 조회를 중단했습니다.');
  const response=await direct('/api/jobs?id='+encodeURIComponent(id),{signal:options.signal,cache:'no-store'});
  if(!response.ok){if(response.status===410)localStorage.removeItem(storageKey);return response;}
  const data=await response.json(),job=data.job;
  if(job.state==='finished'){
   localStorage.removeItem(storageKey);
   window.dispatchEvent(new CustomEvent('startupos:server-job',{detail:{id,state:'finished'}}));
   return new Response(JSON.stringify(job.response.body),{status:job.response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  if(job.state==='interrupted'){localStorage.removeItem(storageKey);throw Object.assign(Error(job.error+' 다시 요청하면 새 작업으로 실행합니다.'),{code:'JOB_INTERRUPTED'});}
  await wait(2000,options.signal);
 }
 throw Object.assign(Error('서버 작업을 계속 조회할 수 있습니다. 같은 요청으로 재시도해 주세요.'),{code:'JOB_PENDING'});
};
// Re-establish the HttpOnly page session when Firebase refreshes an ID token.
let wired=false;
function wire(){if(wired||!window.firebase?.apps.length)return;wired=true;firebase.auth().onIdTokenChanged(async user=>{if(!user)return;try{const response=await native('/api/auth-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:await user.getIdToken()})});if(!response.ok)location.assign('/login');}catch{/* Keep work intact; the next navigation enforces server authentication. */}});}
wire();const timer=setInterval(()=>{wire();if(wired)clearInterval(timer);},200);
})();
