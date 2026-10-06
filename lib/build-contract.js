'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const VERSION = 'functional-build-3.0.0';
const contracts = {
  receipt: {
    title: '영수증 OCR 가계부',
    required: ['camera_capture', 'photo_upload', 'live_receipt_ocr', 'editable_line_items', 'total_reconciliation', 'receipt_persistence', 'duplicate_prevention', 'monthly_summary', 'pwa_shell'],
    acceptance: ['카메라 권한 요청과 촬영 / 앨범 선택', '이미지 확인 후 명시적으로 OCR 요청', '실제 API 응답에서 품목·가격 추출', '품목 수정과 총액 차이 확인', '저장·재접속·수정·삭제·중복 방지', '월별 / 카테고리별 합계'],
    exclusions: ['가족 계정 간 클라우드 동기화', '은행·카드사 연결', '결제 / 구독', 'OCR 정확도 보증'],
    storage: '이 기기의 브라우저에만 저장. 사진 원본은 앱이 저장하지 않음.'
  },
  travel: {
    title: '여행 ToDo',
    required: ['trip_dates', 'trip_tasks', 'packing_list', 'reservation_notes', 'completion_tracking', 'trip_persistence', 'pwa_shell'],
    acceptance: ['여행 목적지·출발일·귀국일 생성', '할 일 / 준비물 추가·편집·완료·삭제', '날짜별 정렬과 D-day 표시', '예약 링크·메모 저장', '새로고침 후 상태 복원'],
    exclusions: ['항공·호텔 예약 API', '실시간 동행자 공동 편집', '자동 푸시 알림', '결제 / 구독'],
    storage: '이 기기의 브라우저에만 저장. 내보내기로 백업 가능.'
  }
};
function failure(code, message, status = 400) { return Object.assign(new Error(message), { code, status }); }
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function key() {
  if (!process.env.STARTUP_OS_BUILD_KEY) throw failure('SIGNING_KEY_MISSING', '운영자 설정 STARTUP_OS_BUILD_KEY가 필요합니다.', 503);
  return process.env.STARTUP_OS_BUILD_KEY;
}
function sign(purpose, payload, seconds = 604800) {
  const data = Buffer.from(JSON.stringify({ purpose, ...payload, exp: Math.floor(Date.now()/1000) + seconds })).toString('base64url');
  return data + '.' + crypto.createHmac('sha256', key()).update(data).digest('base64url');
}
function readToken(token, purpose) {
  if (typeof token !== 'string' || token.length > 16000) throw failure('INVALID_PROOF', '유효한 검증 증명이 없습니다.', 403);
  const [data, signature, extra] = token.split('.');
  const expected = crypto.createHmac('sha256', key()).update(data || '').digest();
  const got = Buffer.from(signature || '', 'base64url');
  if (extra || got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) throw failure('INVALID_PROOF', '서명 검증 실패. 다시 Build하세요.', 403);
  let payload; try { payload = JSON.parse(Buffer.from(data, 'base64url').toString()); } catch { throw failure('INVALID_PROOF', '증명 형식 오류', 403); }
  if (payload.purpose !== purpose || !Number.isFinite(payload.exp) || payload.exp < Date.now()/1000) throw failure('EXPIRED_PROOF', '이 검증은 만료되었습니다. 같은 세션에서 재검증하세요.', 403);
  return payload;
}
const sources = ['capabilities/data.js', 'capabilities/app.css', 'capabilities/receipt.js', 'capabilities/travel.js', 'lib/receipt-service.js', 'lib/build-contract.js', 'lib/assemble.js'];
function sourceHash() { return sha(sources.map(file => file + '\n' + fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n')); }
function descriptor(project, kind, acceptedScope) {
  if (!contracts[kind]) throw failure('CAPABILITY_UNSUPPORTED', '아직 구현하지 않은 앱 유형입니다. 일반 입력폼으로 대체하지 않습니다.', 422);
  if (acceptedScope !== true) throw failure('SCOPE_APPROVAL_REQUIRED', '구현 범위와 제외 항목을 먼저 확인하세요.', 422);
  const sid = String(project && project._sessionId || '');
  if (!/^vs_[a-zA-Z0-9_-]{4,100}$/.test(sid)) throw failure('SESSION_REQUIRED', '유효한 Venture Session ID가 필요합니다.');
  const name = String(project.name || contracts[kind].title).trim().slice(0,100);
  return { version: VERSION, sid, bid: 'b_' + crypto.randomUUID(), kind, name, sourceHash: sourceHash(), createdAt: new Date().toISOString() };
}
function assertCurrent(desc) {
  if (!desc || desc.version !== VERSION || !contracts[desc.kind] || desc.sourceHash !== sourceHash()) throw failure('BUILD_STALE', '코드가 변경되었습니다. 기존 결과를 보존하고 새 Build를 만드세요.', 409);
  return desc;
}
function verifyBuild(token) { return assertCurrent(readToken(token, 'build').descriptor); }
function artifactHash(desc) { return sha(JSON.stringify(desc)); }
function verifyGate(token, desc) {
  const proof = readToken(token, 'verified');
  if (proof.artifactHash !== artifactHash(desc) || proof.sid !== desc.sid || proof.sourceHash !== desc.sourceHash || proof.status !== 'INTEGRATION_VERIFIED') throw failure('BUILD_NOT_VERIFIED', '같은 Build의 실제 기능 검증이 필요합니다.', 422);
  return proof;
}
function body(req) {
  let value = req.body;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { throw failure('INVALID_JSON', 'JSON 요청 오류'); } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('INVALID_BODY', '요청 본문이 필요합니다.');
  return value;
}
function sendError(res, error) {
  return res.status(error.status || 500).json({ ok:false, error:error.message || '요청 실패', code:error.code || 'INTERNAL_ERROR', stage:error.stage || 'validation' });
}
module.exports = { ROOT, VERSION, contracts, failure, sha, sign, readToken, sourceHash, descriptor, assertCurrent, artifactHash, verifyBuild, verifyGate, body, sendError };
