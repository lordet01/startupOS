'use strict';
const fs=require('node:fs'),path=require('node:path');
const B=require('./build-contract'),A=require('./assemble'),D=require('../capabilities/data');
const OCR=require('./receipt-service'),Skin=require('./skin-service'),F=require('./receipt-fixture');
const Fixtures=require('./smoke-fixtures'),Repair=require('./repair');
const REQUIRED={
 skin:['skin_module_mobile_camera_and_consent','skin_web_face_fixture_full_journey','skin_save_reload_and_delete','skin_api_failure_never_masquerades_as_success'],
 receipt:['camera_permission_and_capture_ui','ocr_transport_to_editable_line_items','corrected_receipt_save_and_reload'],
 travel:['travel_trip_dates_and_creation','travel_task_completion_and_reload','packaged_pwa_offline_reload']
};
const REPAIR_REQUIRED={'skin-photo-flow-v2':['skin_repair_next_step_visible','skin_repair_consent_to_analysis']};
function smokeCheck(id,status,evidence,extra={}){return{id,status,evidence,...extra};}
async function verify(desc,{liveConsent=false,fetchSkin,fetchOcr}={}){
 desc=B.assertCurrent({...desc});Repair.validateRepair(desc);
 const checks=[...A.validateArtifacts(desc),...D.selfTests().map(t=>({...t,evidence:'executed domain rule test'}))];
 let browser=null;
 try{browser=JSON.parse(fs.readFileSync(path.join(B.ROOT,'lib/browser-evidence.json'),'utf8'));}catch{}
 const required=[...(REQUIRED[desc.kind]||[]),...(REPAIR_REQUIRED[desc.repairId]||[])];
 const browserOK=!!(browser&&browser.sourceHash===desc.sourceHash&&Array.isArray(browser.checks)&&browser.checks.every(x=>x.status==='passed')&&required.every(id=>browser.checks.some(x=>x.id===id&&x.status==='passed')));
 checks.push(smokeCheck('browser_e2e_scenarios',browserOK?'passed':'failed',
   browserOK?'Mobile Chromium executed all required input→consent→result→save flows using cached web fixtures and a TEST API response; live provider separately verified.':'Browser evidence missing, stale or scenario incomplete.',
   {required_scenarios:required,verified_source_hash:browser?.sourceHash||null,transport:'mocked_provider_http'}));
 let costs=[],fixtures=[];
 if(desc.kind==='skin'){
   if(!liveConsent)throw B.failure('LIVE_TEST_CONSENT_REQUIRED','공개 테스트 사진을 이용한 실제 Vision API 검증에 소액 사용료가 발생합니다. 실행을 승인하세요.',422);
   const face=Fixtures.fixture('skin_face'),negative=Fixtures.fixture('skin_negative');
   fixtures=Fixtures.auditDescriptor(desc);
   const settled=await Promise.allSettled([
     Skin.analyze(face.dataUrl,fetchSkin?{fetchImpl:fetchSkin}:{}),
     Skin.analyze(negative.dataUrl,fetchSkin?{fetchImpl:fetchSkin}:{})
   ]);
   const [a,b]=settled;
   if(a.status==='fulfilled'){
     const out=a.value.result,good=!!(a.value.response_id&&out?.image_status==='face_visible'&&Array.isArray(out.observations)&&out.observations.length>0&&Array.isArray(out.ingredient_groups)&&out.ingredient_groups.length>0);
     checks.push(smokeCheck('live_face_vision_and_ingredients',good?'passed':'failed',
       'Actual OpenAI Vision response to cached CC0 face photo; checks face detection, observations and ingredient groups, not clinical accuracy.',
       {fixture:'skin_face',image_sha256:face.sha256,responseId:a.value.response_id,model:a.value.model,latencyMs:a.value.latency_ms,cost:a.value.cost,reason:good?undefined:'Real face image did not produce a usable cosmetic observation'}));
     costs.push(a.value.cost?.provider_usd);
   }else checks.push(smokeCheck('live_face_vision_and_ingredients','failed','Actual CC0 face photo API failed; no mock substituted.',{code:a.reason.code,message:a.reason.message}));
   if(b.status==='fulfilled'){
     const out=b.value.result,good=!!(b.value.response_id&&out&&out.image_status!=='face_visible'&&out.observations.length===0&&out.ingredient_groups.length===0);
     checks.push(smokeCheck('live_nonface_rejection',good?'passed':'failed','Real Vision response to synthetic receipt used as negative skin image.',{fixture:'skin_negative',image_sha256:negative.sha256,responseId:b.value.response_id,model:b.value.model,cost:b.value.cost,reason:good?undefined:'Non-face image incorrectly accepted as a face'}));
     costs.push(b.value.cost?.provider_usd);
   }else checks.push(smokeCheck('live_nonface_rejection','failed','Negative-image provider check failed.',{code:b.reason.code,message:b.reason.message}));
 }else if(desc.kind==='receipt'){
   if(!liveConsent)throw B.failure('LIVE_TEST_CONSENT_REQUIRED','실제 영수증 OCR API 검증에 소액 사용료가 발생합니다.',422);
   const receipt=Fixtures.fixture('receipt');fixtures=Fixtures.auditDescriptor(desc);
   try{
     const run=await OCR.recognize(receipt.dataUrl,fetchOcr?{fetchImpl:fetchOcr}:{});
     const good=F.assertResult(run);
     checks.push(smokeCheck('live_receipt_ocr',good?'passed':'failed','Actual OCR provider check on synthetic receipt with known item totals.',{fixture:'receipt',responseId:run.response_id,model:run.model,image_sha256:receipt.sha256,cost:run.cost}));
     costs.push(run.cost?.provider_usd);
   }catch(e){checks.push(smokeCheck('live_receipt_ocr','failed','Actual receipt OCR failed.',{code:e.code,message:e.message}));}
 }
 const passed=checks.every(x=>x.status==='passed');
 const providerCost=costs.length&&costs.every(x=>typeof x==='number')?costs.reduce((a,b)=>a+b,0):desc.kind==='travel'?0:null;
 const totalCost={provider_usd:providerCost,platform_fee_usd:providerCost==null?null:Number((providerCost*.05).toFixed(8)),kind:'measured_or_estimated_provider_tokens'};
 return {status:passed?'INTEGRATION_VERIFIED':'FAILED',checkedAt:new Date().toISOString(),checks,artifactHash:B.artifactHash(desc),
   smoke:{status:passed?'PASSED':'FAILED',mode:'browser_mock_transport_plus_live_fixture_provider',fixtures,required_scenarios:required,sourceHash:desc.sourceHash,repairId:desc.repairId||null,actual_phone:'NOT_TESTED'},
   deviceStatus:'PENDING_PHYSICAL_PHONE',cost:totalCost};
}
module.exports={verify,REQUIRED,REPAIR_REQUIRED};
