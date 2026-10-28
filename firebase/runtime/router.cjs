'use strict';
const ROUTES=new Set(['runtime','idea-note','refine','build','build-preview','cloud-config','session','skin-analysis','receipt-ocr','nearby-restaurants','publish','jobs','auth-session']);
function createRouter(load,{access,jobs}={}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const path=new URL(req.originalUrl||req.url,'https://firebase.invalid').pathname;
 const match=/^\/api\/([a-z-]+)$/.exec(path),name=match?.[1];
 if(!ROUTES.has(name))return res.status(404).json({ok:false,code:'API_NOT_FOUND'});
 if(!['GET','POST','OPTIONS',...(name==='auth-session'?['DELETE']:[])].includes(req.method))return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});
 if(req.method==='POST'){
  const origin=req.headers?.origin,allowed=(process.env.ALLOWED_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);
  const project=process.env.FIREBASE_PROJECT_ID;
  if(project)allowed.push('https://'+project+'.web.app','https://'+project+'.firebaseapp.com');
  if(req.headers?.['sec-fetch-site']==='cross-site'||!origin||!allowed.includes(origin))return res.status(403).json({ok:false,code:'ORIGIN_NOT_ALLOWED'});
 }
 try{
  if(name==='cloud-config'&&req.method==='GET')return await load(name)(req,res);
  if(!access)throw Object.assign(Error('접근 제한 설정이 필요합니다.'),{status:503,code:'ACCESS_NOT_CONFIGURED'});
  if(name==='auth-session')return await access.session(req,res);
  req.firebaseIdentity=await access.authenticate(req);
  // Hosting may forward a function hostname; downstream browser-scope checks
  // use only an origin already accepted by the allowlist above.
  if(req.method==='POST'&&req.headers.origin){req.headers.host=new URL(req.headers.origin).host;req.headers['x-forwarded-proto']='https';}
  if(name==='jobs')return await jobs.handler(req,res);
  if(req.method==='POST'&&['runtime','idea-note','refine','build','publish'].includes(name))return res.status(409).json({ok:false,code:'JOB_REQUIRED',error:'서버 작업 접수 경로로 요청해 주세요.'});
  return await load(name)(req,res);
 }catch(e){return res.status(e.status||500).json({ok:false,code:e.code||'INTERNAL_ERROR',error:e.status?e.message:'서버 요청을 처리하지 못했습니다.'})}
};}
module.exports={createRouter,ROUTES};
