'use strict';
const B=require('./build-contract');
const photoRepair={
  id:'skin-photo-flow-v2',
  kind:'skin',
  title:'사진 촬영 후 분석 단계로 넘어가지 않음',
  targets:['capabilities/skin.js','capabilities/skin-photo-repair.js'],
  before:'사진 선택 뒤 다음 단계가 보이지 않거나, 카메라 촬영 완료 후 분석 버튼으로 이동하기 어렵습니다.',
  after:'사진 선택 감지 → 다음 단계 CTA 생성 → 전송 동의로 포커스 이동 → 분석 버튼 상태 확인 → 결과 자동 이동',
  regression:['skin_photo_ready_displays_next_action_and_report_path','skin_repair_next_step_visible','skin_repair_consent_to_analysis','skin_real_api_boundary_and_ingredient_result','skin_save_reload_and_delete'],
  codes:['PHOTO_FLOW_STUCK','INTERACTIVE_FLOW_FAILED','PHOTO_PREVIEW_STUCK','IMAGE_INPUT_MISSING','PHOTO_CAPTURE_FAILED'],
  version:'2.0.0'
};
const packagingRepair={
  id:'vercel-function-assets-v1',kind:'skin',
  title:'Vercel 함수의 Build 소스 파일 누락',
  targets:['lib/source-assets.js','lib/build-contract.js','lib/assemble.js','vercel.json'],
  before:'서버 /var/task/capabilities/data.js가 누락되어 Build/Verify/사진 분석 전 단계에서 ENOENT 발생',
  after:'필요한 JS/CSS/이미지 파일을 명시적으로 추적하고 소스 해시·Build 파일을 정상 조립한 뒤 새 artifact로 재검증',
  regression:['packaged_asset_registry_complete','skin_web_face_fixture_full_journey','skin_real_api_boundary_and_ingredient_result','skin_save_reload_and_delete'],
  codes:['RUNTIME_OR_UX_FAILURE','ENOENT','BUILD_ASSET_MISSING','SOURCE_FILES_MISSING'],
  version:'1.0.0'
};
const RECIPES=[photoRepair,packagingRepair];
function normalizeIssue(issue){
 if(!issue||typeof issue!=='object')throw B.failure('REPAIR_ISSUE_REQUIRED','실패한 Build의 검증 기록이 필요합니다.',422);
 const kind=String(issue.kind||'').slice(0,30),code=String(issue.code||'').slice(0,100),stage=String(issue.stage||'').slice(0,90),message=String(issue.message||'').slice(0,480);
 if(!kind||!code||!issue.buildId)throw B.failure('REPAIR_ISSUE_INVALID','실패 항목·대상 Build ID가 누락됐습니다.',400);
 return {kind,code,stage,message,buildId:String(issue.buildId).slice(0,110),sourceHash:String(issue.sourceHash||'').slice(0,100),source:String(issue.source||'user_report').slice(0,40)};
}
function planRepair(input,priorBuild){
 const issue=normalizeIssue(input);
 if(!priorBuild||issue.buildId!==priorBuild.bid||issue.kind!==priorBuild.kind||issue.sourceHash!==priorBuild.sourceHash)throw B.failure('REPAIR_BUILD_MISMATCH','오류 기록과 원래 Build가 일치하지 않습니다.',409);
 const missingAssets=/ENOENT|no such file|\/var\/task\/capabilities\/|\/var\/task\/fixtures\//i.test(issue.message);
 const matched=missingAssets?packagingRepair:RECIPES.find(r=>r.kind===issue.kind&&(r.codes.includes(issue.code)||(issue.code==='USER_REPORT'&&/촬영|사진|camera|photo/i.test(issue.message))));
 const base={issue,prior:{buildId:priorBuild.bid,sourceHash:priorBuild.sourceHash},currentSourceHash:B.sourceHash(),sourceUpdated:priorBuild.sourceHash!==B.sourceHash(),checkedAt:new Date().toISOString()};
 if(!matched)return {...base,status:'NEEDS_CODE_CHANGE',title:'자동 수정 레시피 없음',target:issue.kind==='skin'?'capabilities/skin.js':'capabilities/'+issue.kind+'.js',reason:issue.message||issue.code,
  requiredAction:'이 오류는 등록된 안전한 자동 수정 레시피가 없습니다. 코드 수정과 해당 동작의 신규 회귀 테스트가 필요합니다. 변경되지 않은 New Build를 성공 처리하지 않습니다.',
  tests:[]};
 return {...base,status:'PATCH_AVAILABLE',repairId:matched.id,title:matched.title,target:matched.targets.join(' + '),before:matched.before,after:matched.after,tests:matched.regression,version:matched.version,
  newCodeEffect:'새 artifact에는 동작 검증된 사진 단계 전환 보정 모듈이 추가됩니다.'};
}
function selectRepair(desc,recipeId){
 if(!recipeId)return desc;
 const recipe=RECIPES.find(r=>r.id===recipeId&&r.kind===desc.kind);
 if(!recipe)throw B.failure('REPAIR_UNSUPPORTED','등록되지 않은 자동 수정 레시피입니다.',422);
 return {...desc,repairId:recipe.id,repairVersion:recipe.version,repairTarget:recipe.targets.join(', ')};
}
function validateRepair(desc){
 if(!desc.repairId)return true;
 const recipe=RECIPES.find(r=>r.id===desc.repairId&&r.kind===desc.kind&&r.version===desc.repairVersion);
 if(!recipe)throw B.failure('REPAIR_STALE','Build의 자동 수정 코드 버전이 변경됐습니다. 다시 Build하세요.',409);
 return true;
}
module.exports={RECIPES,normalizeIssue,planRepair,selectRepair,validateRepair};
