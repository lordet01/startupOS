'use strict';
const fs=require('node:fs'),path=require('node:path');
const B=require('./build-contract'),A=require('./assemble'),D=require('../capabilities/data'),OCR=require('./receipt-service'),Skin=require('./skin-service'),F=require('./receipt-fixture');

async function verify(desc,{liveConsent=false}={}){
  desc=B.assertCurrent({...desc});
  const checks=[...A.validateArtifacts(desc),...D.selfTests().map(t=>({...t,evidence:'executed domain test'}))];
  let browser=null;
  try{browser=JSON.parse(fs.readFileSync(path.join(B.ROOT,'lib/browser-evidence.json'),'utf8'));}catch{}
  const requiredBrowser=desc.kind==='skin'?['skin_module_mobile_camera_and_consent','skin_real_api_boundary_and_ingredient_result','skin_save_reload_and_delete','skin_api_failure_never_masquerades_as_success']:desc.kind==='receipt'?['camera_permission_and_capture_ui','ocr_transport_to_editable_line_items','corrected_receipt_save_and_reload']:['travel_trip_dates_and_creation','travel_task_completion_and_reload'];
  const browserOK=!!(browser&&browser.sourceHash===desc.sourceHash&&Array.isArray(browser.checks)&&browser.checks.every(x=>x.status==='passed')&&requiredBrowser.every(id=>browser.checks.some(x=>x.id===id&&x.status==='passed')));
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
  if(desc.kind==='skin'){
    if(liveConsent!==true)throw B.failure('LIVE_TEST_CONSENT_REQUIRED','AI 피부 이미지 분석 연동검증에 소액 API 사용료가 발생합니다. 실행을 승인하세요.',422);
    try{
      // Synthetic NON-FACE image verifies provider transport/schema only. It is never skin-accuracy evidence.
      live=await Skin.analyze(F.fixture().image);
      const success=!!(live.response_id&&live.result&&['not_face','unclear'].includes(live.result.image_status)&&live.result.ingredient_groups.length===0);
      checks.push({id:'live_skin_vision_api',status:success?'passed':'failed',evidence:'Actual Vision API call with synthetic non-person image; response schema and provider connectivity ONLY. No skin accuracy or phone validation.',responseId:live.response_id,model:live.model,latencyMs:live.latency_ms,usage:live.usage,cost:live.cost});
    }catch(error){
      checks.push({id:'live_skin_vision_api',status:'failed',evidence:'Live provider integration failed; no fake fallback',code:error.code,message:error.message});
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
