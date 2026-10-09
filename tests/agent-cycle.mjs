import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const KEY='startupOS.sessions.v1';
const now=new Date().toISOString();
const seed={activeId:'vs_ocr_agent_2026',sessions:[
 { _sessionId:'vs_ocr_agent_2026',_phase:'blueprint',_createdAt:now,_updatedAt:now,
   name:'ReceiptLens OCR',idea:'영수증 촬영/품목 인식',customer:'가족',
   problem:'품목별 비용 관리가 어렵다',desiredOutcome:'OCR 가계부',
   model:'무료',price:2.99,budget:100,score:50,
   mvpFeatures:['영수증 촬영','품목 인식','저장'],serviceFlow:[{title:'촬영',user_action:'사진 선택',system_action:'OCR'}],
   techStack:[],costs:[],decisions:[],agentNotes:{ceo:'SEED_ONLY_DO_NOT_SHOW'},_events:[],
   prototype:{index_html:'SENSITIVE_GENERATED_HTML_'.repeat(5000)},
   metrics:{visitors:40000,activation:10,paid:15,mrr:8000},metricsSource:'not_connected'
 },
 { _sessionId:'vs_trip_agent_2026',_phase:'brief',_createdAt:now,_updatedAt:now,
   name:'TripToDo',idea:'여행 ToDo',customer:'여행자',problem:'준비물 누락',
   mvpFeatures:[],serviceFlow:[],techStack:[],costs:[],decisions:[],metricsSource:'not_connected' }
]};
const cycle={bottleneck:'OCR 실기기 검증 없음',evidence:'폰 테스트 증거 미확보',evidence_level:'missing',
 decision:'refine',rationale:'출시 전 핵심 기능 확인',experiment:'영수증 5장을 실제 촬영해 비교',
 next_action:'OCR Build를 실기기에서 촬영·인식·저장 검증',success_metric:'OCR 결과 성공',
 success_threshold:'5장 중 5장 저장',estimated_external_cost_usd:0.1,
 human_approval_required:false,missing_evidence:['실기기 결과'],
 role_notes:{ceo:'검증 우선',market:'테스터 모집',product:'수정 UX 확인',tech:'Vision API 성공 확인',finance:'OCR 장당 비용 측정',legal:'이미지 전송 동의 검토',growth:'첫 가치 측정'}};
const allowed=new Set(['index.html','config.js']);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),file=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(!allowed.has(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html;charset=utf-8');
 res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.addInitScript(({KEY,seed})=>{if(!localStorage.getItem(KEY))localStorage.setItem(KEY,JSON.stringify(seed));},{KEY,seed});
const page=await context.newPage();
page.setDefaultTimeout(10000);
const tests=[],pageErrors=[];let seenPayload=null,callCount=0;
page.on('pageerror',e=>pageErrors.push(e.message));
await page.route('**/api/runtime',async route=>{
 if(route.request().method()!=='POST')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,model:'test'})});
 seenPayload=route.request().postDataJSON();callCount++;
 await new Promise(r=>setTimeout(r,250));
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,mode:'cycle',model:'mock-model',response_id:'resp_mock_agent_cycle',latency_ms:250,usage:{input_tokens:250,output_tokens:380},cost:{provider_usd:0.00012},cycle})});
});
async function test(id,fn){try{await fn();tests.push({id,status:'passed'});console.log('PASS',id);}catch(e){tests.push({id,status:'failed',message:e.message});console.error('FAIL',id,e.message);}}
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await test('template_notes_do_not_masquerade_as_executed_cycle',async()=>{
  await page.locator('#moreMobile').click();
  await page.locator('[data-more-view=agents]').click();
  await page.getByText('아직 실행된 Agent cycle이 없습니다.').waitFor();
  assert.equal(await page.getByText('SEED_ONLY_DO_NOT_SHOW').count(),0);
 });
 await test('running_cycle_uses_small_session_payload',async()=>{
  await page.locator('#runCycle').click();
  await page.getByText('Latest decision').waitFor();
  assert.equal(callCount,1);
  assert.equal(seenPayload.mode,'cycle');
  assert.equal(JSON.stringify(seenPayload).includes('SENSITIVE_GENERATED_HTML'),false);
  assert.ok(JSON.stringify(seenPayload).length<12000);
  assert.equal(seenPayload.project._sessionId,'vs_ocr_agent_2026');
 });
 await test('decision_and_roles_are_visible_without_fake_execution',async()=>{
  await page.getByText('OCR 실기기 검증 없음').waitFor();
  assert.equal(await page.getByText('Action pending').count(),1);
  assert.equal(await page.locator('.agentReview').count(),7);
  const data=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
  const p=data.sessions.find(x=>x._sessionId==='vs_ocr_agent_2026');
  assert.equal(p.agentCycle.action_status,'pending');
  assert.equal(p.agentCycle.role_notes.finance,'OCR 장당 비용 측정');
  assert.deepEqual(p.mvpFeatures,['영수증 촬영','품목 인식','저장']);
  assert.equal(p._phase,'blueprint');
  assert.equal(p.costs.length,1);
 });
 await test('action_completion_requires_real_note',async()=>{
  await page.locator('#completeAgentAction').click();
  assert.equal(await page.getByText('Action pending').count(),1);
  await page.locator('#agentActionEvidence').fill('실기기에서 영수증 5장 인식 및 저장 확인');
  await page.locator('#completeAgentAction').click();
  assert.equal(await page.getByText('Recorded').count(),1);
  const data=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
  assert.equal(data.sessions[0].agentCycle.action_status,'completed');
  assert.equal(data.sessions[0].agentCycleHistory[0].action_status,'completed');
 });
 await test('history_is_per_session_not_shared',async()=>{
  await page.locator('#sessionSelect').selectOption('vs_trip_agent_2026');
  await page.locator('#moreMobile').click();
  await page.locator('[data-more-view=agents]').click();
  await page.getByText('아직 실행된 Agent cycle이 없습니다.').waitFor();
  const data=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
  assert.equal(data.sessions[1].agentCycle,undefined);
 });
 assert.deepEqual(pageErrors,[]);
}finally{
 fs.mkdirSync('test-results',{recursive:true});
 fs.writeFileSync('test-results/agent-cycle-browser.json',JSON.stringify({tests,pageErrors},null,2));
 await browser.close();server.close();
 console.log('Agent UI:',tests.filter(t=>t.status==='passed').length,'passed');
 if(tests.some(t=>t.status==='failed')||pageErrors.length)process.exitCode=1;
}
