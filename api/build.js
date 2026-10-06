'use strict';
const fs=require('node:fs'),path=require('node:path');
const B=require('../lib/build-contract'),A=require('../lib/assemble'),D=require('../capabilities/data');
const OCR=require('../lib/receipt-service'),F=require('../lib/receipt-fixture');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.method==='GET')return res.status(200).json({ok:true,version:B.VERSION,mode:'capability-contract-build',contracts:B.contracts,configured:{signing:!!process.env.STARTUP_OS_BUILD_KEY,ocr:!!process.env.OPENAI_API_KEY,publisher:!!process.env.VERCEL_PUBLISH_TOKEN},verification:'not_run'});
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST only'});
  const data=B.body(req);
  if(data.action==='assemble'){
   const desc=B.descriptor(data.project,data.kind,data.acceptedScope);
   const checks=A.validateArtifacts(desc);
   if(checks.some(x=>x.status!=='passed'))return res.status(422).json({ok:false,code:'ASSEMBLY_FAILED',error:'실행 파일 검증 실패',checks});
   const ticket=B.sign('build',{descriptor:desc});
   return res.status(200).json({ok:true,build:{...desc,artifactHash:B.artifactHash(desc),ticket,status:'IMPLEMENTED',contract:B.contracts[desc.kind],checks,verification:null,previewUrl:'/api/build-preview?ticket='+encodeURIComponent(ticket)},cost:{provider_usd:0,platform_fee_usd:0,kind:'deterministic_assembly'}});
  }
  if(data.action==='verify'){
   const desc=B.verifyBuild(data.ticket),checks=[...A.validateArtifacts(desc),...D.selfTests().map(t=>({...t,evidence:'executed domain test'}))];
   let browser;
   try{browser=JSON.parse(fs.readFileSync(path.join(B.ROOT,'lib/browser-evidence.json'),'utf8'));}catch{browser=null;}
   const browserOK=!!(browser&&browser.sourceHash===desc.sourceHash&&Array.isArray(browser.checks)&&browser.checks.length>=8&&browser.checks.every(x=>x.status==='passed'));
   checks.push({id:'browser_regression',status:browserOK?'passed':'failed',evidence:browserOK?'Chromium regression executed on matching module source; mocked OCR transport, separate live gate below':'Browser regression evidence missing or stale',report:browserOK?browser:null});
   let live=null;
   if(desc.kind==='receipt'){
    if(data.liveConsent!==true)throw B.failure('LIVE_TEST_CONSENT_REQUIRED','실제 OCR API 검증에는 소액 사용료가 발생합니다. 실행을 승인하세요.',422);
    try{live=await OCR.recognize(F.fixture().image);checks.push({id:'live_receipt_ocr',status:F.assertResult(live)?'passed':'failed',evidence:'Real OpenAI call using synthetic receipt; expected total and line items checked',responseId:live.response_id,model:live.model,latencyMs:live.latency_ms,usage:live.usage,cost:live.cost});}
    catch(error){checks.push({id:'live_receipt_ocr',status:'failed',evidence:'Live API failed; no simulated fallback',code:error.code,message:error.message});}
   }
   const passed=checks.every(x=>x.status==='passed');
   const verification={status:passed?'INTEGRATION_VERIFIED':'FAILED',checkedAt:new Date().toISOString(),checks,deviceStatus:'PENDING_PHYSICAL_PHONE',artifactHash:B.artifactHash(desc)};
   if(passed)verification.ticket=B.sign('verified',{sid:desc.sid,bid:desc.bid,sourceHash:desc.sourceHash,artifactHash:B.artifactHash(desc),status:'INTEGRATION_VERIFIED',checks:checks.map(x=>({id:x.id,status:x.status})),liveResponseId:live&&live.response_id||null},86400);
   console.log(JSON.stringify({event:'functional_build_verification',sessionId:desc.sid,buildId:desc.bid,passed,failed:checks.filter(x=>x.status!=='passed').map(x=>x.id)}));
   return res.status(200).json({ok:true,verification,cost:live&&live.cost||{provider_usd:0,kind:'no_successful_live_response'}});
  }
  throw B.failure('LEGACY_BUILDER_DISABLED','기존 generic shell Builder는 중단되었습니다. /builder/에서 기능 계약을 확인하고 Build하세요.',422);
 }catch(error){return B.sendError(res,error);}
};
