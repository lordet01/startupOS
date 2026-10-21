(function(){
const clone=x=>JSON.parse(JSON.stringify(x));
const listeners=new Set();let current=null,remember='local';
function user(data){return data?{...data,emailVerified:true,displayName:data.displayName||'',getIdToken:async()=> 'test.token.'+data.uid,sendEmailVerification:async()=>{},updateProfile:async v=>{Object.assign(current,v);notify();}}:null;}
function notify(){for(const fn of listeners)fn(current);}
try{current=user(JSON.parse(localStorage.getItem('__testAuth')||sessionStorage.getItem('__testAuth')||'null'));}catch{}
const auth={onAuthStateChanged(fn){listeners.add(fn);setTimeout(()=>fn(current),0);return()=>listeners.delete(fn);},getRedirectResult:async()=>null,
 setPersistence:async value=>{remember=value;window.__testPersistence=value;},
 async signInWithEmailAndPassword(email,password){if(password!=='secret123')throw Object.assign(Error('bad credential'),{code:'auth/invalid-credential'});const value={uid:email.split('@')[0],email,metadata:{lastSignInTime:new Date().toISOString()}};current=user(value);localStorage.removeItem('__testAuth');sessionStorage.removeItem('__testAuth');(remember==='local'?localStorage:sessionStorage).setItem('__testAuth',JSON.stringify(value));notify();return{user:current};},
 async createUserWithEmailAndPassword(email,password){return this.signInWithEmailAndPassword(email,password);},
 async signInWithPopup(){return this.signInWithEmailAndPassword('alpha@example.com','secret123');},async signInWithRedirect(){return this.signInWithPopup();},
 async signOut(){current=null;localStorage.removeItem('__testAuth');sessionStorage.removeItem('__testAuth');notify();},
 sendPasswordResetEmail:async()=>{}
};
async function cloud(path,method='GET',body){
 const r=await window.fetch('/__cloud',{method:method==='GET'?'POST':method,headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:current?.uid,path,action:method==='GET'?'get':'commit',body})});
 const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),{code:'unavailable'});return data;
}
class Reference{
 constructor(path=[]){this.path=path;}
 collection(name){return new Reference([...this.path,name]);}
 doc(name){return new Reference([...this.path,name]);}
 orderBy(){return this;}
 limit(){return this;}
 async get(){const data=await cloud(this.path);return{exists:!!data.value,data:()=>data.value,docs:(data.rows||[]).map(d=>({id:d.id,data:()=>d.value}))};}
 onSnapshot(next,error){let stopped=false,last='';const tick=async()=>{try{const data=await this.get(),signature=JSON.stringify(data.docs.map(d=>[d.id,d.data()]));if(!stopped&&last!==signature){last=signature;next(data);}}catch(e){if(!stopped)error(e);}};tick();const timer=setInterval(tick,120);return()=>{stopped=true;clearInterval(timer);};}
}
const db={collection:name=>new Reference([name]),async runTransaction(fn){for(let tries=0;tries<3;tries++){const writes=[];const result=await fn({get:ref=>ref.get(),set:(ref,value)=>writes.push({path:ref.path,value:clone(value)})});const response=await cloud([], 'PUT',writes);if(response.retry)continue;return result;}throw Error('Concurrent transaction');}};
const app={auth:()=>auth,firestore:()=>db};function authFunction(){return auth;}authFunction.Auth={Persistence:{LOCAL:'local',SESSION:'session'}};authFunction.GoogleAuthProvider=class{};
window.firebase={apps:[],app:()=>app,initializeApp(){this.apps.push(app);return app;},auth:authFunction};
})();
