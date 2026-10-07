'use strict';
const fs=require('node:fs'),path=require('node:path');
const B=require('./build-contract'),A=require('./assemble'),D=require('../capabilities/data'),OCR=require('./receipt-service'),F=require('./receipt-fixture');

async function verify(desc,{liveConsent=false}={}){
  desc=B.assertCurrent({...desc});
  const checks=[...A.validateArtifacts(desc),...D.selfTests().map(t=>({...t,evidence:'executed domain test'}))];
  let browser=null;
  try{browser=JSON.parse(fs.readFileSync(path.join(B.ROOT,'lib/browser-evidence.json'),'utf8'));}catch{}
  const browserOK=!!(browser&&browser.sourceHash===desc.sourceHash&&Array.isArray(browser.checks)&&browser.checks.length>=8&&browser.checks.every(x=>x.status==='passed'));
  checks.push({id:'browser_regression',status:browserOK?'passed':'failed',evidence:browserOK?'Chromium regression executed on matching source; OCR transport mocked in browser suite, live provider checked separately':'Browser regression evidence missing or stale',report:browserOK?browser:null});
  let live=null;
  if(desc.kind==='receipt'){
    if(liveConsent!==true)throw B.failure('LIVE_TEST_CONSENT_REQUIRED','실제 OCR API 검증에는 소액 사용료가 발생합니다. 실행을 승인하세요.',422);
    try{
      live=await OCR.recognize(F.fixture().image);
      checks.push({id:'live_receipt_ocr',status:F.assertResult(live)?'passed':'failed',evidence:'Real OpenAI call using a synthetic receipt; expected total and line items checked',responseId:live.response_id,model:live.model,latencyMs:live.latency_ms,usage:live.usage,cost:live.cost});
    }catch(error){
      checks.push({id:'live_receipt_ocr',status:'failed',evidence:'Live OCR provider test failed; no simulated fallback',code:error.code,message:error.message});
    }
  }
  const passed=checks.every(x=>x.status==='passed');
  return {
    status:passed?'INTEGRATION_VERIFIED':'FAILED',
    checkedAt:new Date().toISOString(),
    checks,
    deviceStatus:'PENDING_PHYSICAL_PHONE',
    artifactHash:B.artifactHash(desc),
    cost:live&&live.cost||{provider_usd:0,kind:'no_successful_live_response'}
  };
}
module.exports={verify};
