'use strict';
const B=require('../lib/build-contract'),A=require('../lib/assemble'),V=require('../lib/verify'),R=require('../lib/repair'),Fixtures=require('../lib/smoke-fixtures');
function assembled(desc,repairPlan){
 const checks=A.validateArtifacts(desc);
 if(checks.some(x=>x.status!=='passed'))return{ok:false,code:'ASSEMBLY_FAILED',error:'생성 파일 검증 실패',checks};
 const encoded=B.encodeDescriptor(desc);
 const build={...desc,descriptor:desc,artifactHash:B.artifactHash(desc),status:'IMPLEMENTED',contract:B.contracts[desc.kind],
  checks,verification:null,previewUrl:'/api/build-preview?d='+encodeURIComponent(encoded),
  repairPlan:repairPlan||null,smokeFixtures:Fixtures.auditDescriptor(desc)};
 const trace=[
  {step:'scope',status:'passed',detail:'Reviewed capability contract / '+desc.kind},
  ...(repairPlan?[{step:'diagnosis',status:'passed',detail:repairPlan.issue.code+' → '+repairPlan.repairId},
    {step:'code_patch',status:'passed',detail:repairPlan.target+' @ '+desc.repairVersion}]:[]),
  {step:'assemble',status:'passed',detail:'PWA entry, JS, runtime API and offline manifest'},
  {step:'syntax',status:'passed',detail:checks.filter(x=>x.id.startsWith('syntax:')).length+' generated scripts compile'},
  {step:'fixture',status:'passed',detail:build.smokeFixtures.map(x=>x.id+' · '+x.sha256.slice(0,10)).join(' / ')},
  {step:'artifact',status:'passed',detail:build.artifactHash.slice(0,16)}
 ];
 return{ok:true,build,repairTrace:trace,cost:{provider_usd:0,platform_fee_usd:0,kind:'deterministic_assembly'}};
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.method==='GET')return res.status(200).json({
    ok:true,version:B.VERSION,mode:'reviewed-repair-then-auto-smoke',
    contracts:B.contracts,sourceHash:B.sourceHash(),repairRecipes:R.RECIPES.map(x=>({id:x.id,kind:x.kind,version:x.version,title:x.title,tests:x.regression})),
    fixtures:Object.fromEntries(Object.entries(Fixtures.CATALOG).map(([k,v])=>[k,{source:v.source,license:v.license,scenario:v.scenario}])),
    configured:{ocr:!!process.env.OPENAI_API_KEY,publisher:!!process.env.VERCEL_PUBLISH_TOKEN}
  });
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST only'});
  const data=B.body(req);
  if(data.action==='repair-plan'){
    const plan=R.planRepair(data.issue,data.priorBuild);
    return res.status(200).json({ok:true,plan});
  }
  if(data.action==='assemble'){
    const desc=B.descriptor(data.project,data.kind,data.acceptedScope);
    const result=assembled(desc,null);
    return res.status(result.ok?200:422).json(result);
  }
  if(data.action==='repair-and-assemble'){
    if(data.approved!==true)throw B.failure('REPAIR_APPROVAL_REQUIRED','수정 계획을 확인하고 Fix & New Build를 승인해야 합니다.',422);
    if(data.project?._sessionId!==data.priorBuild?.sid)throw B.failure('SESSION_MISMATCH','다른 세션 Build를 수정할 수 없습니다.',409);
    const plan=R.planRepair(data.issue,data.priorBuild);
    if(plan.status!=='PATCH_AVAILABLE')throw B.failure('REPAIR_NEEDS_CODE_CHANGE',plan.requiredAction||'수동 코드 수정이 필요합니다.',422);
    const base=B.descriptor(data.project,plan.issue.kind,data.acceptedScope);
    const desc=R.selectRepair(base,plan.repairId);
    const result=assembled(desc,plan);
    return res.status(result.ok?200:422).json(result);
  }
  if(data.action==='verify'){
    const desc=B.assertCurrent({...data.descriptor});
    if(data.sessionId&&data.sessionId!==desc.sid)throw B.failure('SESSION_MISMATCH','다른 세션 Build를 검증할 수 없습니다.',409);
    const verification=await V.verify(desc,{liveConsent:data.liveConsent===true});
    console.log(JSON.stringify({event:'functional_build_verification',sessionId:desc.sid,buildId:desc.bid,passed:verification.status==='INTEGRATION_VERIFIED',failed:verification.checks.filter(x=>x.status!=='passed').map(x=>x.id)}));
    return res.status(200).json({ok:true,verification,cost:verification.cost});
  }
  throw B.failure('LEGACY_BUILDER_DISABLED','이전 generic shell Builder는 중단되었습니다.',422);
 }catch(error){return B.sendError(res,error);}
};
