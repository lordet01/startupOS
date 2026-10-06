'use strict';
const B=require('../lib/build-contract'),A=require('../lib/assemble');
function credentials(){const token=process.env.VERCEL_PUBLISH_TOKEN,team=process.env.VERCEL_TEAM_ID,project=process.env.VERCEL_HOST_PROJECT_ID||'prj_lPHRFDHd3Ob6rkOuMTnpTqJqrxQh';if(!token)throw B.failure('PUBLISH_NOT_CONFIGURED','운영자 VERCEL_PUBLISH_TOKEN이 필요합니다.',503);return{token,team,project};}
async function vercel(path,method='GET',payload){const c=credentials(),query=c.team?(path.includes('?')?'&':'?')+'teamId='+encodeURIComponent(c.team):'';const response=await fetch('https://api.vercel.com'+path+query,{method,headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(20000)});const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{throw B.failure('PUBLISH_RESPONSE','Vercel 응답 형식 오류: HTTP '+response.status,502);}if(!response.ok)throw B.failure(data.error&&data.error.code||'PUBLISH_FAILED',data.error&&data.error.message||'Vercel 요청 실패',response.status);return data;}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.method==='GET'){
   if(!req.query||!req.query.ticket)return res.status(200).json({ok:true,configured:!!process.env.VERCEL_PUBLISH_TOKEN,authorization:'not_verified',gate:'signed verification required'});
   const p=B.readToken(req.query.ticket,'deployment');
   const data=await vercel('/v13/deployments/'+encodeURIComponent(p.id));
   return res.status(200).json({ok:true,deployment:{id:p.id,sessionId:p.sid,buildId:p.bid,artifactHash:p.artifactHash,readyState:data.readyState||data.state||'UNKNOWN',url:data.url?'https://'+data.url:null,mode:'preview',deviceStatus:'PENDING_PHYSICAL_PHONE',error:data.errorMessage||null}});
  }
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST only'});
  const body=B.body(req);
  if(!body.buildTicket||!body.verificationTicket)throw B.failure('UNVERIFIED_BUILD','일반 입력폼이나 미검증 Build는 배포할 수 없습니다. /builder/에서 기능 검증을 통과하세요.',422);
  const desc=B.verifyBuild(body.buildTicket);B.verifyGate(body.verificationTicket,desc);
  if(body.sessionId!==desc.sid)throw B.failure('SESSION_MISMATCH','다른 세션의 Build를 배포할 수 없습니다.',409);
  if(body.approved!==true)throw B.failure('APPROVAL_REQUIRED','테스트 배포를 승인하세요.',422);
  const checks=A.validateArtifacts(desc);if(checks.some(x=>x.status!=='passed'))throw B.failure('ARTIFACT_INVALID','배포 직전 파일 검증이 실패했습니다.',422);
  // Ignore all client-supplied HTML/code. Reassemble reviewed capabilities server-side.
  const files=A.pack(desc),c=credentials();
  const data=await vercel('/v13/deployments','POST',{name:'startup-os',project:c.project,files,meta:{startupOsSessionId:desc.sid,startupOsBuildId:desc.bid,startupOsArtifactHash:B.artifactHash(desc),startupOsGeneratedApp:'true',startupOsKind:desc.kind}});
  const ticket=B.sign('deployment',{id:data.id,sid:desc.sid,bid:desc.bid,artifactHash:B.artifactHash(desc)},604800);
  return res.status(200).json({ok:true,deployment:{id:data.id,ticket,sessionId:desc.sid,buildId:desc.bid,artifactHash:B.artifactHash(desc),url:data.url?'https://'+data.url:null,readyState:data.readyState||data.state||'QUEUED',mode:'preview',deviceStatus:'PENDING_PHYSICAL_PHONE'},message:'배포 요청이 접수되었습니다. READY 확인 전 완료로 표시하지 않습니다.'});
 }catch(error){return B.sendError(res,error);}
};
