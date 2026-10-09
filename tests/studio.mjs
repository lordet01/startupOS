import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const handler=require('../api/build');
const key='startupOS.sessions.v1',checks=[];
const seed={activeId:'vs_studio_a',sessions:[{_sessionId:'vs_studio_a',name:'OCR 세션 A',idea:'영수증 OCR 가계부',problem:'품목 기록',score:0,price:0,budget:100,costs:[],decisions:[],metrics:{},_phase:'brief'},{_sessionId:'vs_studio_b',name:'여행 세션 B',idea:'여행 ToDo',problem:'준비물 정리',score:0,price:0,budget:100,costs:[],decisions:[],metrics:{},_phase:'brief'},{_sessionId:'vs_studio_skin',name:'MySkin AI 피부 분석',idea:'휴대폰 카메라 피부 관찰 및 화장품 성분군 추천',problem:'피부톤과 모공 상태를 비교하기 어렵다',mvpFeatures:['카메라 촬영','피부 시각적 관찰','성분군 안내'],score:0,price:0,budget:100,costs:[],decisions:[],metrics:{},_phase:'blueprint'}]};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/build'){
  let raw='';for await(const chunk of req)raw+=chunk;req.body=raw?JSON.parse(raw):{};
  if(req.body.action==='assemble')await new Promise(resolve=>setTimeout(resolve,1000));
  res.status=n=>{res.statusCode=n;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};await handler(req,res);return;
 }
 let file=url.pathname==='/'?'index.html':url.pathname==='/builder/'?'builder/index.html':url.pathname.slice(1);
 if(!['index.html','config.js','builder/index.html','builder/studio.js','capabilities/app.css'].includes(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),context=await browser.newContext({viewport:{width:1200,height:900}});
await context.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));},{key,seed});
const page=await context.newPage();page.setDefaultTimeout(10000);
async function test(id,fn){try{await fn();checks.push({id,status:'passed'});console.log('PASS',id);}catch(e){checks.push({id,status:'failed',message:e.message});console.error('FAIL',id,e.message);}}
try{
 await test('legacy_build_navigation_preserves_session',async()=>{await page.goto(base+'/');await page.locator('.side button[data-view="build"]').click();await page.waitForURL('**/builder/?sessionId=vs_studio_a#scope-stage');await page.getByRole('heading',{name:'Build',exact:true}).waitFor();assert.equal(new URL(page.url()).searchParams.get('sessionId'),'vs_studio_a');});
 await test('capability_is_derived_from_session_and_scope_requires_approval',async()=>{assert.equal(await page.locator('#kind').count(),0);await page.getByText('영수증 OCR 가계부',{exact:true}).waitFor();assert.equal(await page.locator('#assemble').isDisabled(),true);await page.locator('#scope').check();assert.equal(await page.locator('#assemble').isEnabled(),true);});
 await test('in_flight_result_stays_on_original_session',async()=>{await page.locator('#assemble').click();await page.locator('#session').selectOption('vs_studio_b');await page.waitForFunction(key=>{const p=JSON.parse(localStorage.getItem(key));return !!p.sessions.find(x=>x._sessionId==='vs_studio_a').functionalBuild;},key);const pack=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert.equal(pack.sessions.find(x=>x._sessionId==='vs_studio_a').functionalBuild.sid,'vs_studio_a');assert.equal(pack.sessions.find(x=>x._sessionId==='vs_studio_b').functionalBuild,undefined);await page.locator('#session').selectOption('vs_studio_a');assert.equal(await page.locator('#publish').isDisabled(),true);});
 await test('refresh_keeps_artifact_and_no_false_verified_status',async()=>{await page.reload();await page.locator('#session').selectOption('vs_studio_a');await page.getByRole('heading',{name:'Build artifact',exact:true}).waitFor();assert.equal(await page.locator('#publish').isDisabled(),true);await page.getByText('PENDING',{exact:true}).first().waitFor();await page.screenshot({path:'test-results/build-studio-desktop.png',fullPage:true});});
 await test('mobile_main_uses_bottom_icon_navigation_without_page_overflow',async()=>{await page.setViewportSize({width:390,height:844});await page.goto(base+'/');const pos=await page.locator('.side').evaluate(el=>getComputedStyle(el).position);assert.equal(pos,'fixed');assert.ok(await page.locator('.navIcon').count()>=8);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);});
 await test('mobile_build_uses_scrollable_icon_stepper',async()=>{await page.goto(base+'/builder/?sessionId=vs_studio_a');await page.getByRole('heading',{name:'Build',exact:true}).waitFor();assert.equal(await page.locator('.stagebox').count(),5);assert.equal(await page.locator('.stageIcon').count(),5);const scrollable=await page.locator('.stages').evaluate(el=>el.scrollWidth>el.clientWidth);assert.equal(scrollable,true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);});
 await test('MySkin_session_maps_to_supported_skin_build',async()=>{
  await page.goto(base+'/builder/?sessionId=vs_studio_skin');
  await page.getByText('MySkin AI · 피부 사진 관찰',{exact:true}).waitFor();
  assert.equal(await page.locator('#kind').count(),0);
  assert.equal(await page.locator('#assemble').isDisabled(),true);
  await page.locator('#scope').check();
  await page.locator('#assemble').click();
  await page.getByRole('heading',{name:'Build artifact'}).waitFor({timeout:8000});
  const record=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).sessions.find(s=>s._sessionId==='vs_studio_skin'),key);
  assert.equal(record.functionalBuild.kind,'skin');
  assert.equal(record.functionalBuild.status,'IMPLEMENTED');
  assert.equal(await page.locator('#publish').isDisabled(),true);
  assert.equal(await page.locator('#phone-stage').getByText('LOCKED').count(),1);
 });
 await test('build_button_shows_inline_working_state',async()=>{if(!(await page.locator('#scope').isChecked()))await page.locator('#scope').check();await page.locator('#assemble').click();await page.locator('.workBtn.running').waitFor({state:'visible'});assert.match(await page.locator('.btnRunText').innerText(),/Working/);await page.locator('.workBtn.running').waitFor({state:'detached',timeout:5000});await page.screenshot({path:'test-results/build-studio-mobile.png',fullPage:true});});
 await test('Verify requires automated full-workflow smoke evidence',async()=>{
  const sid='vs_studio_skin';
  await page.evaluate(({key,sid})=>{
   const pack=JSON.parse(localStorage.getItem(key)),p=pack.sessions.find(x=>x._sessionId===sid);
   p.functionalBuild.verification={status:'INTEGRATION_VERIFIED',artifactHash:p.functionalBuild.artifactHash,checks:[]};
   p.functionalRepair=null;localStorage.setItem(key,JSON.stringify(pack));
  },{key,sid});
  await page.reload();await page.locator('#verify').waitFor();
  assert.equal(await page.locator('#publish').isDisabled(),true);
  await page.evaluate(({key,sid})=>{
   const pack=JSON.parse(localStorage.getItem(key)),p=pack.sessions.find(x=>x._sessionId===sid);
   p.functionalBuild.verification.smoke={status:'PASSED',required_scenarios:['skin_web_face_fixture_full_journey']};
   localStorage.setItem(key,JSON.stringify(pack));
  },{key,sid});
  await page.reload();await page.locator('#publish').waitFor();
  assert.equal(await page.locator('#publish').isEnabled(),true);
  assert.equal(await page.locator('#journeyPass').count(),0);
 });
 await test('skin_user_failure_enters_verify_and_blocks_deploy',async()=>{
  const sid='vs_studio_skin';
  const desc=await page.evaluate(({sid,key})=>{
   const pack=JSON.parse(localStorage.getItem(key));
   const p=pack.sessions.find(x=>x._sessionId===sid);
   if(!p.functionalBuild)throw Error('skin build missing');
   p.functionalBuild.verification={status:'INTEGRATION_VERIFIED',checks:[]};
   localStorage.setItem(key,JSON.stringify(pack));return p.functionalBuild;
  },{sid,key});
  const issue={source:'user_report',kind:'skin',sessionId:sid,buildId:desc.bid,sourceHash:desc.sourceHash,stage:'image_analysis',code:'PHOTO_FLOW_STUCK',message:'촬영 후 분석으로 이동하지 않음'};
  await page.goto(base+'/builder/?sessionId='+sid+'&verifyIssue='+encodeURIComponent(JSON.stringify(issue))+'#verify-stage');
  await page.locator('#repair-stage').waitFor();
  assert.equal(await page.locator('#publish').isDisabled(),true);
  assert.match(await page.locator('#repair-stage').innerText(),/PHOTO_FLOW_STUCK/);
  const p=await page.evaluate(({sid,key})=>JSON.parse(localStorage.getItem(key)).sessions.find(x=>x._sessionId===sid),{sid,key});
  assert.equal(p.functionalRepair.status,'REPAIR_REQUIRED');
  assert.equal(p.functionalRepair.buildId,desc.bid);
  assert.equal(await page.locator('.stages .stagebox.pass').count(),2); // contract + built, but reported failure overrides any client 'verified' claim
  assert.ok(!new URL(page.url()).searchParams.has('verifyIssue')); // avoid repeating report on refresh
 });
 await test('fix_plan_explains_and_applies_real_photo_repair_before_rebuild',async()=>{
  await page.locator('#fixBuild').waitFor({state:'visible',timeout:15000});
  assert.equal(await page.locator('#assemble').count(),0);
  assert.match(await page.locator('#repair-stage').innerText(),/수정 내용/);
  assert.match(await page.locator('#repair-stage').innerText(),/skin-photo-repair.js/);
  const previous=await page.evaluate(key=>{
    const p=JSON.parse(localStorage.getItem(key)).sessions.find(s=>s._sessionId==='vs_studio_skin');
    return p.functionalBuild.bid;
  },key);
  await page.locator('#fixBuild').click();
  await page.waitForFunction(({key,previous})=>{
    const p=JSON.parse(localStorage.getItem(key)).sessions.find(s=>s._sessionId==='vs_studio_skin');
    return p.functionalBuild?.bid!==previous&&p.functionalBuild?.repairId==='skin-photo-flow-v2';
  },{key,previous},{timeout:12000});
  const p=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).sessions.find(s=>s._sessionId==='vs_studio_skin'),key);
  assert.notEqual(p.functionalBuild.bid,previous);
  assert.equal(p.functionalBuild.repairId,'skin-photo-flow-v2');
  assert.ok(p.functionalRepairTrace.some(x=>x.step==='code_patch'));
  assert.equal(p.functionalBuild.checks.every(x=>x.status==='passed'),true);
 });

}finally{
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/studio-report.json',JSON.stringify({suite:'functional-build-studio-v3',checkedAt:new Date().toISOString(),checks},null,2));await browser.close();server.close();if(checks.some(x=>x.status!=='passed'))process.exitCode=1;
}
