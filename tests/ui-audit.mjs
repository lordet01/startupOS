import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const buildHandler=require('../api/build');
const KEY='startupOS.sessions.v1';
const now=new Date().toISOString();
const sample={
  _sessionId:'vs_ui_audit_2026',_phase:'blueprint',_createdAt:now,_updatedAt:now,
  name:'ReceiptLens OCR 가계부',idea:'영수증을 사진으로 찍어서 품목별 지출을 정리',
  desiredOutcome:'사진 한 장으로 지출을 품목별로 확인',customer:'가족',problem:'수기 입력이 번거롭다',
  model:'무료 기본',price:2.99,budget:100,score:70,
  costs:[],decisions:[],metrics:{visitors:0,activation:0,trial:0,paid:0,mrr:0},
  mvpFeatures:['영수증 촬영','OCR 품목/가격 인식','사용자 수정','저장·조회'],
  serviceFlow:[{step:1,title:'영수증 촬영',user_action:'촬영',system_action:'OCR 인식'}],
  techStack:[{area:'OCR',service:'OpenAI',reason:'영수증 인식',monthly_cost_usd:0}],
  costBreakdown:[],buildPlan:[],risks:[],agentNotes:{}
};
const pack={activeId:sample._sessionId,sessions:[sample]};
const allowed=new Set(['index.html','config.js','builder/index.html','builder/studio.js','capabilities/app.css']);
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/api/build'){
  let raw='';for await(const chunk of req)raw+=chunk;
  req.body=raw?JSON.parse(raw):{};req.query=Object.fromEntries(url.searchParams.entries());
  res.status=n=>{res.statusCode=n;return res;};
  res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
  return buildHandler(req,res);
 }
 if(url.pathname==='/api/runtime'){
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,model:'test-model'}));return;
 }
 const file=url.pathname==='/'?'index.html':url.pathname==='/builder/'?'builder/index.html':url.pathname.slice(1);
 if(!allowed.has(file)){res.writeHead(404);res.end('Not found');return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');
 res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:1280,height:850}});
await ctx.addInitScript(({KEY,pack})=>{if(!localStorage.getItem(KEY))localStorage.setItem(KEY,JSON.stringify(pack));},{KEY,pack});
const page=await ctx.newPage();
page.setDefaultTimeout(10000);
const results=[];const errors=[];
page.on('pageerror',err=>errors.push(err.message));
async function check(id,fn){try{await fn();results.push({id,status:'passed'});console.log('PASS',id);}catch(e){results.push({id,status:'failed',message:e.message});console.error('FAIL',id,e.message);await page.screenshot({path:'test-results/ui-'+id+'.png',fullPage:true}).catch(()=>{});}}
const current=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
const hasNoDuplicates=()=>page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);return ids.filter((x,i)=>ids.indexOf(x)!==i);});
try{
 await page.goto(base+'/');
 await check('desktop_overview_has_single_primary_action',async()=>{
   await page.getByRole('heading',{name:/ReceiptLens/}).first().waitFor().catch(()=>{});
   assert.equal(await page.locator('.overviewCard .overviewActions button').count(),1);
   assert.equal(await page.locator('#newVenture').count(),1);
   assert.deepEqual(await hasNoDuplicates(),[]);
 });
 await check('sessions_new_venture_unique_and_clickable',async()=>{
   await page.locator('.side button[data-view=sessions]').click();
   assert.equal(await page.locator('#newVenture').count(),1);
   assert.equal(await page.locator('.sessionGrid .openSession').count(),1);
   await page.locator('#newVenture').click();
   await page.locator('#newIdea').waitFor();
   assert.equal(await page.locator('#createVenture').count(),1);
   await page.locator('#closeModal').click();
 });
 await check('session_card_opens_selected_project',async()=>{
   await page.locator('.sessionCard .openSession').click();
   assert.equal(await page.locator('#sessionSelect').inputValue(),'vs_ui_audit_2026');
   assert.equal(await page.locator('.overviewCard').count(),0);
 });
 await check('edit_brief_does_not_create_new_session',async()=>{
   await page.locator('#editBrief').click();
   await page.locator('#newProblem').fill('수기 입력과 품목 분류가 어렵다');
   await page.locator('#createVenture').click();
   const data=await current();
   assert.equal(data.sessions.length,1);
   assert.equal(data.sessions[0].problem,'수기 입력과 품목 분류가 어렵다');
   assert.equal(data.sessions[0]._briefStale,true);
   assert.equal(await page.locator('.modalWrap').count(),0);
 });
 await check('all_support_pages_have_no_demo_actions',async()=>{
   const routes=[['agents','#runCycle'],['cost','#addCost'],['growth','#simulate'],['settings','#testRuntime']];
   for(const [route,id] of routes){
     await page.locator('.side button[data-view='+route+']').click();
     assert.deepEqual(await hasNoDuplicates(),[],route+' duplicate IDs');
     if(route==='agents'||route==='settings')assert.equal(await page.locator(id).count(),1);
     else assert.equal(await page.locator(id).count(),0);
   }
 });
 await check('mobile_five_tabs_and_more_sheet',async()=>{
   await page.setViewportSize({width:390,height:844});
   await page.goto(base+'/');
   assert.equal(await page.locator('.nav button:visible').count(),5);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
   await page.locator('#moreMobile').click();
   await page.locator('#moreSheet.open').waitFor();
   await page.locator('[data-more-view=growth]').click();
   await page.getByRole('heading',{name:'Growth'}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
 });
 await check('mobile_new_venture_opens_once',async()=>{
   await page.locator('#newVenture').click();
   assert.equal(await page.locator('.modalWrap').count(),1);
   assert.equal(await page.locator('#createVenture').count(),1);
   await page.locator('#closeModal').click();
 });
 await check('mobile_build_routes_to_real_studio_stage',async()=>{
   await page.locator('.nav button[data-view=build]').click();
   await page.waitForURL(/\/builder\/\?sessionId=vs_ui_audit_2026#scope-stage/);
   await page.locator('#scope-stage').waitFor();
   assert.equal(await page.locator('#kind').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
   await page.screenshot({path:'test-results/ui-build-mobile.png',fullPage:true});
 });
 await check('deploy_and_phone_navigation_target_correct_stage',async()=>{
   await page.goto(base+'/');
   await page.locator('.nav button[data-view=deploy]').click();
   await page.waitForURL(/#deploy-stage$/);
   await page.goto(base+'/');
   await page.locator('.nav button[data-view=phone]').click();
   await page.waitForURL(/#phone-stage$/);
 });
 assert.deepEqual(errors,[]);
}finally{
 fs.mkdirSync('test-results',{recursive:true});
 fs.writeFileSync('test-results/ui-audit.json',JSON.stringify({testedAt:new Date().toISOString(),viewport:['1280x850','390x844'],results,pageErrors:errors},null,2));
 await browser.close();server.close();
 console.log('UI AUDIT:',results.filter(x=>x.status==='passed').length+' passed, '+results.filter(x=>x.status==='failed').length+' failed');
 if(results.some(x=>x.status==='failed')||errors.length)process.exitCode=1;
}
