'use strict';
// Firebase ID tokens are validated on the server, independently of browser state.
// Public Google signing certificates require no service-account private key.
const CERTIFICATES='https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cached=null,pending=null;
const required=()=>Boolean(process.env.FIREBASE_PROJECT_ID)||process.env.STARTUPOS_AUTH_REQUIRED==='true';
function failure(code,message,status=401){return Object.assign(new Error(message),{code,status});}
async function signingKey(header){
 if(header.alg!=='RS256'||typeof header.kid!=='string')throw failure('INVALID_SESSION','올바르지 않은 로그인 토큰입니다.');
 if(!cached||cached.expires<Date.now()){
  if(!pending)pending=(async()=>{
   let r;try{r=await fetch(CERTIFICATES,{signal:AbortSignal.timeout(8000)});}catch{throw failure('AUTH_UNAVAILABLE','로그인 검증 서비스에 연결할 수 없습니다.',503);}
   if(!r.ok)throw failure('AUTH_UNAVAILABLE','로그인 검증 서비스에 연결할 수 없습니다.',503);
   const certs=await r.json(),ttl=Math.min(3600,Number(/max-age=(\d+)/.exec(r.headers.get('cache-control')||'')?.[1])||300);
   cached={certs,keys:new Map(),expires:Date.now()+ttl*1000};
  })().finally(()=>pending=null);
  await pending;
 }
 const pem=cached.certs[header.kid];if(typeof pem!=='string')throw failure('INVALID_SESSION','로그인 토큰 서명을 확인하지 못했습니다.');
 if(!cached.keys.has(header.kid))cached.keys.set(header.kid,await (await import('jose')).importX509(pem,'RS256'));
 return cached.keys.get(header.kid);
}
async function verify(token,{projectId=process.env.FIREBASE_PROJECT_ID,key=signingKey,currentDate=new Date()}={}){
 if(!projectId)throw failure('AUTH_NOT_CONFIGURED','인증 서비스 설정이 필요합니다.',503);
 if(typeof token!=='string'||token.length>12000||token.split('.').length!==3)throw failure('AUTH_REQUIRED','로그인 후 계속할 수 있습니다.');
 try{
  const {payload}=await (await import('jose')).jwtVerify(token,key,{issuer:'https://securetoken.google.com/'+projectId,audience:projectId,algorithms:['RS256'],requiredClaims:['sub','iat','exp','auth_time'],clockTolerance:5,maxTokenAge:'1h',currentDate});
  const seconds=Math.floor(currentDate.getTime()/1000);
  if(typeof payload.sub!=='string'||!payload.sub.length||payload.sub.length>128||typeof payload.auth_time!=='number'||payload.auth_time>seconds+5||payload.auth_time<seconds-30*86400)throw failure('SESSION_EXPIRED','로그인 세션이 만료되었습니다. 다시 로그인하세요.');
  return{uid:payload.sub,email:typeof payload.email==='string'?payload.email:'',emailVerified:payload.email_verified===true,authTime:payload.auth_time,expiresAt:payload.exp};
 }catch(e){if(e.status)throw e;throw failure('SESSION_EXPIRED','로그인 세션을 확인하지 못했습니다. 다시 로그인하세요.');}
}
async function requireAccount(req){
 if(!required())return null;
 const match=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(String(req.headers?.authorization||''));
 if(!match)throw failure('AUTH_REQUIRED','로그인 후 계속할 수 있습니다.');
 return verify(match[1]);
}
function reject(res,e){return res.status(e.status||401).json({ok:false,code:e.code||'AUTH_REQUIRED',error:e.message});}
module.exports={required,verify,requireAccount,reject};
