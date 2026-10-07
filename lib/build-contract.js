'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const VERSION = 'functional-build-3.1.0';
const contracts = {
  receipt: {
    title: '영수증 OCR 가계부',
    required: ['camera_capture','photo_upload','live_receipt_ocr','editable_line_items','total_reconciliation','receipt_persistence','duplicate_prevention','monthly_summary','pwa_shell'],
    acceptance: ['카메라 권한 요청과 촬영 / 앨범 선택','이미지 확인 후 명시적으로 OCR 요청','실제 API 응답에서 품목·가격 추출','품목 수정과 총액 차이 확인','저장·재접속·수정·삭제·중복 방지','월별 / 카테고리별 합계'],
    exclusions: ['가족 계정 간 클라우드 동기화','은행·카드사 연결','결제 / 구독','OCR 정확도 보증'],
    storage: '이 기기의 브라우저에만 저장. 사진 원본은 앱이 저장하지 않음.'
  },
  travel: {
    title: '여행 ToDo',
    required: ['trip_dates','trip_tasks','packing_list','reservation_notes','completion_tracking','trip_persistence','pwa_shell'],
    acceptance: ['여행 목적지·출발일·귀국일 생성','할 일 / 준비물 추가·편집·완료·삭제','날짜별 정렬과 D-day 표시','예약 링크·메모 저장','새로고침 후 상태 복원'],
    exclusions: ['항공·호텔 예약 API','실시간 동행자 공동 편집','자동 푸시 알림','결제 / 구독'],
    storage: '이 기기의 브라우저에만 저장. 내보내기로 백업 가능.'
  }
};
function failure(code,message,status=400){return Object.assign(new Error(message),{code,status});}
function sha(value){return crypto.createHash('sha256').update(value).digest('hex');}
const sources=['capabilities/data.js','capabilities/app.css','capabilities/receipt.js','capabilities/travel.js','lib/receipt-service.js','lib/build-contract.js','lib/assemble.js','lib/verify.js'];
function sourceHash(){if(process.env.STARTUP_OS_DEPLOY_SOURCE_HASH)return String(process.env.STARTUP_OS_DEPLOY_SOURCE_HASH);return sha(sources.map(file=>file+'\n'+fs.readFileSync(path.join(ROOT,file),'utf8')).join('\n'));}
function descriptor(project,kind,acceptedScope){
  if(!contracts[kind])throw failure('CAPABILITY_UNSUPPORTED','아직 구현하지 않은 앱 유형입니다. 일반 입력폼으로 대체하지 않습니다.',422);
  if(acceptedScope!==true)throw failure('SCOPE_APPROVAL_REQUIRED','구현 범위와 제외 항목을 먼저 확인하세요.',422);
  const sid=String(project&&project._sessionId||'');
  if(!/^vs_[a-zA-Z0-9_-]{4,100}$/.test(sid))throw failure('SESSION_REQUIRED','유효한 Venture Session ID가 필요합니다.');
  const name=String(project.name||contracts[kind].title).trim().slice(0,100);
  return {version:VERSION,sid,bid:'b_'+crypto.randomUUID(),kind,name,sourceHash:sourceHash(),createdAt:new Date().toISOString()};
}
function assertCurrent(desc){
  if(!desc||typeof desc!=='object')throw failure('INVALID_BUILD','Build descriptor가 필요합니다.',400);
  if(desc.version!==VERSION)throw failure('BUILD_STALE','Build 버전이 변경되었습니다. 새 Build를 만드세요.',409);
  if(!contracts[desc.kind])throw failure('CAPABILITY_UNSUPPORTED','지원하지 않는 Build 유형입니다.',422);
  if(!/^vs_[a-zA-Z0-9_-]{4,100}$/.test(String(desc.sid||'')))throw failure('SESSION_REQUIRED','유효한 세션이 필요합니다.',400);
  if(!/^b_[a-f0-9-]{20,80}$/i.test(String(desc.bid||'')))throw failure('BUILD_ID_INVALID','유효한 Build ID가 필요합니다.',400);
  if(desc.sourceHash!==sourceHash())throw failure('BUILD_STALE','코드가 변경되었습니다. 기존 결과는 보존되지만 다시 Build해야 합니다.',409);
  desc.name=String(desc.name||contracts[desc.kind].title).trim().slice(0,100);
  return desc;
}
function artifactHash(desc){return sha(JSON.stringify(assertCurrent({...desc})));}
function encodeDescriptor(desc){return Buffer.from(JSON.stringify(assertCurrent({...desc})),'utf8').toString('base64url');}
function decodeDescriptor(value){
  if(typeof value!=='string'||value.length>12000)throw failure('INVALID_BUILD','Build descriptor 형식 오류',400);
  let parsed;try{parsed=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));}catch{throw failure('INVALID_BUILD','Build descriptor를 읽을 수 없습니다.',400);}
  return assertCurrent(parsed);
}
function body(req){
  let value=req.body;
  if(typeof value==='string'){try{value=JSON.parse(value);}catch{throw failure('INVALID_JSON','JSON 요청 오류');}}
  if(!value||typeof value!=='object'||Array.isArray(value))throw failure('INVALID_BODY','요청 본문이 필요합니다.');
  return value;
}
function sendError(res,error){return res.status(error.status||500).json({ok:false,error:error.message||'요청 실패',code:error.code||'INTERNAL_ERROR',stage:error.stage||'validation'});}
module.exports={ROOT,VERSION,contracts,failure,sha,sourceHash,descriptor,assertCurrent,artifactHash,encodeDescriptor,decodeDescriptor,body,sendError};
