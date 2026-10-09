import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const allowed=new Set(['index.html','config.js']);
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname.replace(/^\//,'')||'index.html';
 if(!allowed.has(path)){res.writeHead(404);res.end('not found');return;}
 res.setHeader('Content-Type',path.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');
 res.end(fs.readFileSync(path));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone']});
const page=await ctx.newPage();page.setDefaultTimeout(10000);
const results=[],errs=[];page.on('pageerror',e=>errs.push(e.message));
let voiceCalls=0,noteCalls=0;
const skinDraft={name:'MySkin AI',idea:'초고화질 UVC 카메라를 연결하여 모공과 피부톤을 분석한 뒤 성분 기반 화장품군을 추천한다.',customer:'피부 상태에 관심이 많은 사용자',problem:'기존 사진으로는 모공 변화와 피부톤을 쉽게 추적하기 어렵다',desiredOutcome:'촬영 후 피부 속성과 관련 제품군을 명확히 보여준다',model:'무료 기본',priceUsd:null,budgetUsd:100,constraints:'안드로이드 UVC 카메라, 모바일 웹, 의료 진단 아님'};
await page.route('**/api/idea-note',async route=>{
 const request=route.request().postDataJSON();
 if(request.action==='transcribe'){voiceCalls++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,text:'나는 피부 분석 모바일 웹앱을 만들고 싶어. 모공과 피부톤 분석이 중심이야.'})});}
 if(request.action==='structure'){noteCalls++;assert.ok(request.note.length>20);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,draft:skinDraft})});}
 return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({ok:false,error:'Bad action'})});
});
await page.route('**/api/runtime',async route=>{
 if(route.request().method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,model:'test'})});
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
  ok:true,mode:'analyze',model:'mock-test',latency_ms:50,
  usage:{input_tokens:150,output_tokens:300},cost:{provider_usd:.001},
  analysis:{venture_name:'MySkin AI',mvp_features:['사진','상태 요약','제품군'],service_flow:[{step:1,title:'촬영',user_action:'사진',system_action:'파일 읽기'}]}
 })});
});
async function check(id,fn){try{await fn();results.push({id,status:'passed'});console.log('PASS',id);}catch(e){results.push({id,status:'failed',message:e.message});console.error('FAIL',id,e.message);await page.screenshot({path:'test-results/idea-'+id+'.png',fullPage:true}).catch(()=>{});}}
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await check('new_venture_has_idea_note_button',async()=>{
  await page.locator('#newVenture').click();
  await page.locator('#ideaNoteToggle').waitFor();
  assert.equal(await page.locator('#ideaNotePanel').isHidden(),true);
  await page.locator('#ideaNoteToggle').click();
  assert.equal(await page.locator('#ideaNotePanel').isVisible(),true);
 });
 await check('all_descriptive_fields_show_multiple_lines_and_scroll',async()=>{
  for(const id of ['newIdea','newCustomer','newProblem','newOutcome','newModel','newConstraints']){
   const t=page.locator('#'+id);
   assert.equal(await t.evaluate(el=>el.tagName),'TEXTAREA');
   assert.ok(await t.evaluate(el=>el.getBoundingClientRect().height)>60,id);
   assert.equal(await t.evaluate(el=>getComputedStyle(el).overflowY),'auto');
  }
 });
 await check('idea_note_structures_into_editable_fields',async()=>{
  await page.locator('#ideaNoteText').fill('나랑 가족이 사용할 피부 분석 앱을 만들려고 해. 높은 해상도의 UVC 카메라로 얼굴 피부의 모공과 톤을 본다. 결과에 따라 화장품을 추천하고 앱의 비용은 최소화해야 한다.');
  await page.locator('#ideaNoteStructure').click();
  await page.getByText('항목을 채웠습니다.',{exact:false}).waitFor();
  assert.equal(noteCalls,1);
  assert.equal(await page.locator('#newName').inputValue(),'MySkin AI');
  assert.equal(await page.locator('#newCustomer').inputValue(),skinDraft.customer);
  assert.match(await page.locator('#newConstraints').inputValue(),/UVC/);
  await page.locator('#newProblem').fill('원하는 카메라를 스마트폰에 연결하는 UX가 어렵다');
 });
 await check('microphone_records_audio_and_appends_transcript',async()=>{
  await page.locator('#ideaNoteMic').click();
  await page.getByText('■ 녹음 종료').waitFor();
  await page.waitForTimeout(900);
  await page.locator('#ideaNoteMic').click();
  await page.getByText('음성 인식 완료',{exact:false}).waitFor({timeout:13000});
  assert.equal(voiceCalls,1);
  assert.match(await page.locator('#ideaNoteText').inputValue(),/모공과 피부톤 분석/);
 });
 await check('session_creation_retains_idea_note_and_edited_fields',async()=>{
  await page.locator('#createVenture').click();
  await page.locator('.modalWrap').waitFor({state:'detached'});
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('startupOS.sessions.v1')));
  const p=saved.sessions.find(x=>x.name==='MySkin AI');
  assert.ok(p);
  assert.match(p._ideaNote,/UVC 카메라/);
  assert.equal(p.problem,'원하는 카메라를 스마트폰에 연결하는 UX가 어렵다');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
 });
 assert.deepEqual(errs,[]);
}finally{
 fs.mkdirSync('test-results',{recursive:true});
 fs.writeFileSync('test-results/idea-note-ui.json',JSON.stringify({checkedAt:new Date().toISOString(),results,pageErrors:errs,voiceCalls,noteCalls},null,2));
 await browser.close();server.close();
 if(results.some(x=>x.status==='failed')||errs.length)process.exitCode=1;
}
