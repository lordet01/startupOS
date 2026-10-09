import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
process.env.STARTUP_OS_BUILD_KEY='local-browser-tests-not-a-deployment-secret';
const B=require('../lib/build-contract'),A=require('../lib/assemble'),F=require('../lib/receipt-fixture');
const root=path.resolve('.');fs.mkdirSync('test-results',{recursive:true});
const receipt=B.descriptor({_sessionId:'vs_browser_receipt_a',name:'ReceiptLens · 기능 검증'},'receipt',true);
const other=B.descriptor({_sessionId:'vs_browser_receipt_b',name:'Other Session'},'receipt',true);
const travel=B.descriptor({_sessionId:'vs_browser_travel_a',name:'TripTodo · 여행 준비'},'travel',true);
const skin=B.descriptor({_sessionId:'vs_browser_skin_a',name:'MySkin AI · 사진 관찰'},'skin',true);
const Repair=require('../lib/repair'),Fixtures=require('../lib/smoke-fixtures');
const repairedSkin=Repair.selectRepair(B.descriptor({_sessionId:'vs_browser_skin_repair',name:'MySkin AI · Repaired'},'skin',true),'skin-photo-flow-v2');
const webFace=Fixtures.fixture('skin_face');
const webFaceInput={name:'public-cc0-face.jpg',mimeType:'image/jpeg',buffer:Buffer.from(webFace.dataUrl.split(',')[1],'base64')};
let skinCalls=0,skinMode='success';
const skinResult={ok:true,response_id:'resp_mock_skin_browser',model:'mock-browser-transport',latency_ms:18,result:{
 image_status:'face_visible',summary:'사진상 표면 광택 및 일부 피부톤 차이가 관찰됩니다.',
 observations:[{property:'surface_shine',description:'이마의 가시적인 광택',certainty:'medium'}],
 ingredient_groups:[{ingredient:'niacinamide',reason:'피부톤 관리에 흔히 쓰이는 성분군입니다.',caution:'자극 여부를 확인하세요.'}],
 limitations:['단일 사진으로 피부 질환을 진단하지 않습니다.']
}};

const deployed=A.pack(travel);
const fixture=F.fixture();fs.writeFileSync('test-results/synthetic-receipt.png',fixture.png);
let ocrCalls=0,mode='success';
const ocrResult={ok:true,response_id:'resp_mock_browser_transport',model:'mock-browser-transport',latency_ms:12,image_digest:'test-image-digest',usage:{input_tokens:0,output_tokens:0},cost:{provider_usd:0,kind:'test_mock_no_charge'},result:{merchant:'VERIFY MART',purchase_date:'2026-10-06',currency:'KRW',total_amount:5500,items:[{name:'APPLE',quantity:2,unit_price:2000,line_total:4000,category:'식료품'},{name:'WATER',quantity:1,unit_price:1500,line_total:1500,category:'식료품'}],warnings:[]}};
const contentType=file=>file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/html; charset=utf-8';
const server=http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/skin-analysis'){
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw);
  assert.ok([skin.sid,repairedSkin.sid].includes(body.sessionId));
  assert.equal(body.buildId,body.sessionId===skin.sid?skin.bid:repairedSkin.bid);
  assert.equal(body.sourceHash,skin.sourceHash);assert.equal(body.consent,true);
  assert.ok(body.image.startsWith('data:image/jpeg;base64,'));
  skinCalls++;
  res.writeHead(skinMode==='failure'?503:200,{'Content-Type':'application/json'});
  res.end(JSON.stringify(skinMode==='failure'?{ok:false,error:'TEST skin API unavailable'}:skinResult));return;
 }
 if(url.pathname==='/api/receipt-ocr'){
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw);assert.equal(body.consent,true);assert.equal(body.sessionId,receipt.sid);assert.equal(body.buildId,receipt.bid);assert.equal(body.sourceHash,receipt.sourceHash);assert.ok(body.image.startsWith('data:image/jpeg;base64,'));ocrCalls++;
  if(mode==='failure'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'TEST provider unavailable'}));return;}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(ocrResult));return;
 }
 const doc={'/receipt/':receipt,'/receipt-b/':other,'/travel/':travel,'/skin/':skin,'/skin-repair/':repairedSkin}[url.pathname];
 if(doc){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(A.html(doc,true));return;}
 if(url.pathname.startsWith('/installed/')){
  const name=url.pathname.slice('/installed/'.length)||'index.html';
  const file=deployed.find(x=>x.file===name);
  if(file){res.writeHead(200,{'Content-Type':contentType(name),'Cache-Control':'no-cache'});res.end(file.encoding==='base64'?Buffer.from(file.data,'base64'):file.data);return;}
 }
 if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 res.writeHead(404);res.end('Not found');
 }catch(error){res.writeHead(500,{'Content-Type':'text/plain'});res.end(error.stack);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,permissions:['camera']});
const page=await context.newPage();page.setDefaultTimeout(10000);let errors=[];page.on('pageerror',error=>errors.push(error.message));
const checks=[];
async function check(id,fn){try{await fn();checks.push({id,status:'passed'});console.log('PASS',id);}catch(error){checks.push({id,status:'failed',message:error.message});console.error('FAIL',id,error.message);await page.screenshot({path:'test-results/'+id+'.png',fullPage:true}).catch(()=>{});}}
async function visible(locator){await locator.waitFor({state:'visible',timeout:10000});}
const file={name:'receipt.png',mimeType:'image/png',buffer:fixture.png};
try{
 await check('mobile_receipt_app_renders_without_script_errors',async()=>{await page.goto(base+'/receipt/');await visible(page.getByRole('button',{name:'영수증 촬영하기',exact:true}));assert.deepEqual(errors,[]);});
 await check('camera_permission_and_capture_ui',async()=>{await page.getByRole('button',{name:'영수증 촬영하기',exact:true}).click();await page.getByRole('button',{name:'카메라 열기',exact:true}).click();await page.waitForFunction(()=>document.getElementById('camera-video')?.videoWidth>0);await page.getByRole('button',{name:'촬영',exact:true}).click();await visible(page.getByAltText('선택한 영수증 미리보기'));assert.equal(ocrCalls,0);});
 await check('album_image_preview_and_explicit_consent_gate',async()=>{await page.locator('#album-file').setInputFiles(file);await visible(page.getByAltText('선택한 영수증 미리보기'));assert.equal(await page.getByRole('button',{name:'사진 분석하기',exact:true}).isDisabled(),true);assert.equal(ocrCalls,0);});
 await check('ocr_transport_to_editable_line_items',async()=>{await page.locator('#consent').check();await page.getByRole('button',{name:'사진 분석하기',exact:true}).click();await visible(page.getByLabel('품목명 1',{exact:true}));assert.equal(await page.getByLabel('품목명 1',{exact:true}).inputValue(),'APPLE');assert.equal(await page.locator('[data-field="total_amount"]').inputValue(),'5500');assert.equal(ocrCalls,1);await page.screenshot({path:'test-results/receipt-review-mobile.png',fullPage:true});});
 await check('mismatch_blocks_save_and_preserves_draft',async()=>{await page.getByLabel('품목 금액 1',{exact:true}).fill('4500');await page.getByRole('button',{name:'확인한 영수증 저장',exact:true}).click();await visible(page.getByRole('alert'));assert.match(await page.getByRole('alert').innerText(),/차이/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('startup-os:app:v3:vs_browser_receipt_a:receipt')||'[]').length),0);});
 await check('corrected_receipt_save_and_reload',async()=>{await page.getByLabel('품목 금액 1',{exact:true}).fill('4000');await page.getByLabel('품목명 1',{exact:true}).fill('APPLE corrected');await page.getByRole('button',{name:'확인한 영수증 저장',exact:true}).click();await visible(page.getByRole('button',{name:'확인 / 수정',exact:true}));await page.reload();await page.getByRole('button',{name:'기록',exact:true}).click();await visible(page.getByText('APPLE corrected',{exact:false}).first());assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('startup-os:app:v3:vs_browser_receipt_a:receipt')).length),1);});
 await check('receipt_monthly_and_category_summary',async()=>{await page.getByRole('button',{name:'소비 요약',exact:true}).click();await page.locator('#month').fill('2026-10');await page.locator('#month').dispatchEvent('change');await visible(page.getByText('식료품',{exact:true}));assert.match(await page.locator('#app').innerText(),/5,500/);});
 await check('same_receipt_duplicate_prevention',async()=>{await page.getByRole('button',{name:'영수증 촬영',exact:true}).click();await page.locator('#album-file').setInputFiles(file);await page.locator('#consent').check();await page.getByRole('button',{name:'사진 분석하기',exact:true}).click();await visible(page.getByRole('alert'));assert.match(await page.getByRole('alert').innerText(),/이미 저장/);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('startup-os:app:v3:vs_browser_receipt_a:receipt')).length),1);});
 await check('external_api_error_is_not_a_success',async()=>{mode='failure';await page.locator('#album-file').setInputFiles(file);await page.locator('#consent').check();await page.getByRole('button',{name:'사진 분석하기',exact:true}).click();await visible(page.getByRole('alert'));assert.match(await page.getByRole('alert').innerText(),/provider unavailable/);assert.equal(await page.locator('#receipt-form').count(),0);mode='success';});
 await check('session_isolation_same_origin',async()=>{await page.goto(base+'/receipt-b/');await page.getByRole('button',{name:'기록',exact:true}).click();await visible(page.getByText('저장한 영수증이 없습니다.',{exact:false}));assert.equal(await page.getByRole('button',{name:'확인 / 수정',exact:true}).count(),0);});
 await check('receipt_edit_and_delete_are_persistent',async()=>{await page.goto(base+'/receipt/');await page.getByRole('button',{name:'기록',exact:true}).click();await page.getByRole('button',{name:'확인 / 수정',exact:true}).click();await page.locator('[data-field="merchant"]').fill('Edited Merchant');await page.getByRole('button',{name:'확인한 영수증 저장',exact:true}).click();await visible(page.getByText('Edited Merchant',{exact:true}));page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'삭제',exact:true}).click();await page.reload();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('startup-os:app:v3:vs_browser_receipt_a:receipt')).length),0);});
 await check('skin_module_mobile_camera_and_consent',async()=>{
  await page.goto(base+'/skin/');
  await visible(page.getByRole('heading',{name:'MySkin AI · 사진 관찰'}));
  await page.locator('#capture').click();
  await page.waitForFunction(()=>document.getElementById('video')?.videoWidth>0);
  await page.locator('#snap').click();
  await visible(page.getByAltText('선택한 피부 사진 미리보기'));
  assert.equal(await page.locator('#analyze').isDisabled(),true);assert.equal(skinCalls,0);
 });
 await check('skin_photo_ready_displays_next_action_and_report_path',async()=>{
  await visible(page.locator('#previewPhase'));
  await visible(page.locator('#stuckReport'));
  assert.equal(await page.locator('#analyze').isDisabled(),true);
  assert.match(await page.locator('#app').innerText(),/촬영 완료/);
 });
 await check('skin_real_api_boundary_and_ingredient_result',async()=>{
  await page.locator('#consent').check();
  await page.locator('#analyze').click();
  await visible(page.getByText('나이아신아마이드'));
  assert.equal(skinCalls,1);
  assert.match(await page.locator('#app').innerText(),/사진상 표면 광택/);
  assert.match(await page.locator('#app').innerText(),/단일 사진/);
  await page.screenshot({path:'test-results/myskin-mobile.png',fullPage:true});
 });
 await check('skin_success_scrolls_to_real_result_step',async()=>{
  await visible(page.locator('#analysisResult'));
  await page.waitForFunction(()=>{const x=document.getElementById('analysisResult');return !!x&&x.getBoundingClientRect().top<window.innerHeight;});
 });
 await check('skin_save_reload_and_delete',async()=>{
  await page.locator('#saveResult').click();
  await visible(page.getByText('사진상 표면 광택 및 일부 피부톤 차이가 관찰됩니다.'));
  await page.reload();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('startup-os:app:v3:vs_browser_skin_a:skin')).length),1);
  await page.locator('[data-view="history"]').click();
  await visible(page.locator('[data-delete]'));
  page.once('dialog',d=>d.accept());
  await page.locator('[data-delete]').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('startup-os:app:v3:vs_browser_skin_a:skin')).length),0);
 });
 await check('skin_api_failure_never_masquerades_as_success',async()=>{
  skinMode='failure';
  await page.locator('[data-view="scan"]').click();
  await page.locator('#albumInput').setInputFiles(file);
  await page.locator('#consent').check();
  await page.locator('#analyze').click();
  await visible(page.getByRole('alert'));
  assert.match(await page.getByRole('alert').innerText(),/TEST skin API unavailable/);
  assert.equal(await page.locator('#saveResult').count(),0);skinMode='success';
 });
 await check('skin_failure_exposes_verify_report_action',async()=>{
  assert.equal(await page.locator('#reportIssue').count(),1);
  assert.match(await page.getByRole('alert').innerText(),/분석 단계 오류/);
 });
 await check('skin_web_face_fixture_full_journey',async()=>{
  skinMode='success';
  await page.goto(base+'/skin/');
  await page.locator('#album').click();
  await page.locator('#albumInput').setInputFiles(webFaceInput);
  await visible(page.locator('#previewPhase'));
  assert.equal(await page.locator('#consent').isChecked(),false);
  await page.locator('#consent').check();
  await page.locator('#analyze').click();
  await visible(page.getByText('나이아신아마이드'));
  await visible(page.locator('#analysisResult'));
  await page.locator('#saveResult').click();
  await visible(page.getByText('사진상 표면 광택 및 일부 피부톤 차이가 관찰됩니다.'));
  await page.reload();await page.locator('[data-view="history"]').click();
  await visible(page.getByText('사진상 표면 광택 및 일부 피부톤 차이가 관찰됩니다.'));
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('startup-os:app:v3:vs_browser_skin_a:skin')));
  assert.equal(saved.length,1);
  assert.ok(skinCalls>=3);
 });
 await check('skin_repair_next_step_visible',async()=>{
  await page.goto(base+'/skin-repair/');
  await page.locator('#albumInput').setInputFiles(webFaceInput);
  await visible(page.locator('#photoRepairNext'));
  assert.equal(await page.evaluate(()=>window.STARTUP_OS_REPAIR?.id),'skin-photo-flow-v2');
  await page.locator('#photoRepairNext').click();
  await visible(page.locator('#photoRepairStatus'));
  assert.match(await page.locator('#photoRepairStatus').innerText(),/동의/);
  assert.equal(await page.locator('#analyze').isDisabled(),true);
 });
 await check('skin_repair_consent_to_analysis',async()=>{
  await page.locator('#consent').check();
  await page.locator('#photoRepairNext').click();
  assert.match(await page.locator('#photoRepairStatus').innerText(),/분석 버튼/);
  await page.locator('#analyze').click();
  await visible(page.locator('#analysisResult'));
  await visible(page.getByText('나이아신아마이드'));
  await page.locator('#saveResult').click();
  await visible(page.getByText('사진상 표면 광택 및 일부 피부톤 차이가 관찰됩니다.'));
 });
 await check('travel_trip_dates_and_creation',async()=>{await page.goto(base+'/travel/');await page.getByRole('button',{name:'첫 여행 만들기',exact:true}).click();await page.locator('[name="destination"]').fill('부산');await page.locator('[name="start"]').fill('2026-10-20');await page.locator('[name="end"]').fill('2026-10-22');await page.getByRole('button',{name:'여행 저장',exact:true}).click();await visible(page.getByRole('heading',{name:'부산',exact:true}));});
 await check('travel_task_completion_and_reload',async()=>{await page.getByRole('button',{name:'+ 항목',exact:true}).click();await page.locator('[name="title"]').fill('기차표 예약');await page.locator('[name="due"]').fill('2026-10-18');await page.getByRole('button',{name:'항목 저장',exact:true}).click();await page.getByLabel('기차표 예약 완료',{exact:true}).check();await page.reload();assert.equal(await page.getByLabel('기차표 예약 완료',{exact:true}).isChecked(),true);assert.match(await page.locator('#app').innerText(),/1 \/ 1 완료/);});
 await check('packing_template_is_idempotent',async()=>{await page.getByRole('button',{name:'기본 준비물 추가',exact:true}).click();await page.getByRole('button',{name:'기본 준비물 추가',exact:true}).click();assert.equal(await page.locator('.task').count(),4);});
 await check('reservation_link_notes_and_edit',async()=>{await page.getByRole('button',{name:'+ 항목',exact:true}).click();await page.locator('[name="kind"]').selectOption('reservation');await page.locator('[name="title"]').fill('호텔 예약');await page.locator('[name="url"]').fill('https://example.com/reservation');await page.locator('#item-form [name="note"]').fill('15시 체크인');await page.getByRole('button',{name:'항목 저장',exact:true}).click();await visible(page.getByRole('link',{name:'예약 링크 열기 ↗'}));assert.equal(await page.getByRole('link',{name:'예약 링크 열기 ↗'}).getAttribute('href'),'https://example.com/reservation');});
 await check('mobile_layout_and_no_uncaught_errors',async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);assert.deepEqual(errors,[]);await page.screenshot({path:'test-results/travel-mobile.png',fullPage:true});});
 await check('packaged_pwa_offline_reload',async()=>{await page.goto(base+'/installed/');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);await page.getByRole('button',{name:'+ 여행',exact:true}).click();await page.locator('[name="destination"]').fill('Offline Trip');await page.locator('[name="start"]').fill('2026-11-01');await page.locator('[name="end"]').fill('2026-11-02');await page.getByRole('button',{name:'여행 저장',exact:true}).click();await context.setOffline(true);await page.reload();await page.selectOption('#trip-select',{label:'Offline Trip · 2026-11-01'});await visible(page.getByRole('heading',{name:'Offline Trip',exact:true}));await context.setOffline(false);});
 const denied=await browser.newContext({viewport:{width:390,height:844}});await denied.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:()=>Promise.reject(new DOMException('Denied','NotAllowedError'))});});const deniedPage=await denied.newPage();
 await check('camera_permission_failure_has_file_fallback',async()=>{await deniedPage.goto(base+'/receipt/');await deniedPage.getByRole('button',{name:'영수증 촬영하기',exact:true}).click();await deniedPage.getByRole('button',{name:'카메라 열기',exact:true}).click();await visible(deniedPage.getByRole('alert'));assert.equal(await deniedPage.locator('#camera-file').isVisible(),true);});await denied.close();
}finally{
 const report={suite:'functional-build-browser-v3',sourceHash:B.sourceHash(),checkedAt:new Date().toISOString(),browser:await browser.version(),viewport:{width:390,height:844},ocrTransport:'mocked OCR and skin Vision browser transports; separate live provider verification is required',camera:'Chromium synthetic media device and simulated permission denial; not a physical phone',physicalPhone:false,checks};
 fs.writeFileSync('test-results/browser-report.json',JSON.stringify(report,null,2));
 if(checks.length>=8&&checks.every(x=>x.status==='passed'))fs.writeFileSync('lib/browser-evidence.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();server.close();
 console.log(JSON.stringify({passed:checks.filter(x=>x.status==='passed').length,failed:checks.filter(x=>x.status!=='passed').length,sourceHash:report.sourceHash}));
 if(checks.some(x=>x.status!=='passed'))process.exitCode=1;
}
