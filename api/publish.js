'use strict';
const B=require('../lib/build-contract'),A=require('../lib/assemble'),V=require('../lib/verify');
function credentials(){
  const token=process.env.VERCEL_PUBLISH_TOKEN,team=process.env.VERCEL_TEAM_ID,project=process.env.VERCEL_HOST_PROJECT_ID||'prj_lPHRFDHd3Ob6rkOuMTnpTqJqrxQh';
  if(!token)throw B.failure('PUBLISH_NOT_CONFIGURED','운영자 VERCEL_PUBLISH_TOKEN이 필요합니다.',503);
  return{token,team,project};
}
async function vercel(path,method='GET',payload){
  const c=credentials(),query=c.team?(path.includes('?')?'&':'?')+'teamId='+encodeURIComponent(c.team):'';
  const response=await fetch('https://api.vercel.com'+path+query,{method,headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(20000)});
  const raw=await response.text();let data;
  try{data=JSON.parse(raw);}catch{throw B.failure('PUBLISH_RESPONSE','Vercel 응답 형식 오류: HTTP '+response.status,502);}
  if(!response.ok)throw B.failure(data.error&&data.error.code||'PUBLISH_FAILED',data.error&&data.error.message||'Vercel 요청 실패',response.status);
  return data;
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET'){
      if(!req.query||!req.query.id)return res.status(200).json({ok:true,configured:!!process.env.VERCEL_PUBLISH_TOKEN,gate:'server re-verifies before every publish',signingKeyRequired:false});
      const id=String(req.query.id||'');
      if(!/^dpl_[A-Za-z0-9]{10,80}$/.test(id))throw B.failure('DEPLOYMENT_ID_INVALID','배포 ID 형식 오류',400);
      const data=await vercel('/v13/deployments/'+encodeURIComponent(id));
      return res.status(200).json({ok:true,deployment:{id,readyState:data.readyState||data.state||'UNKNOWN',url:data.url?'https://'+data.url:null,mode:'preview',deviceStatus:'PENDING_PHYSICAL_PHONE',error:data.errorMessage||null}});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST only'});
    const body=B.body(req);if(!body.descriptor)throw B.failure('INVALID_BUILD','Build descriptor가 필요합니다.',400);const desc=B.assertCurrent({...body.descriptor});
    if(body.sessionId!==desc.sid)throw B.failure('SESSION_MISMATCH','다른 세션의 Build를 배포할 수 없습니다.',409);
    if(body.approved!==true)throw B.failure('APPROVAL_REQUIRED','테스트 배포를 승인하세요.',422);
    const verification=await V.verify(desc,{liveConsent:body.liveConsent===true});
    if(verification.status!=='INTEGRATION_VERIFIED'){
      return res.status(422).json({ok:false,code:'BUILD_NOT_VERIFIED',error:'Publish 직전 재검증에 실패했습니다.',verification,cost:verification.cost});
    }
    const checks=A.validateArtifacts(desc);
    if(checks.some(x=>x.status!=='passed'))throw B.failure('ARTIFACT_INVALID','배포 직전 파일 검증이 실패했습니다.',422);
    const files=A.pack(desc),c=credentials();
    const data=await vercel('/v13/deployments','POST',{name:'startup-os',project:c.project,files,meta:{startupOsSessionId:desc.sid,startupOsBuildId:desc.bid,startupOsArtifactHash:B.artifactHash(desc),startupOsGeneratedApp:'true',startupOsKind:desc.kind,startupOsKeylessBuild:'true'}});
    return res.status(200).json({
      ok:true,verification,cost:verification.cost,
      deployment:{id:data.id,sessionId:desc.sid,buildId:desc.bid,artifactHash:B.artifactHash(desc),url:data.url?'https://'+data.url:null,readyState:data.readyState||data.state||'QUEUED',mode:'preview',deviceStatus:'PENDING_PHYSICAL_PHONE'},
      message:'Publish 직전 서버 재검증을 통과했고 배포 요청이 접수되었습니다. READY 확인 전 완료로 표시하지 않습니다.'
    });
  }catch(error){return B.sendError(res,error);}
};
