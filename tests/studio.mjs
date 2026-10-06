import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
process.env.STARTUP_OS_BUILD_KEY='studio-test-only';
const handler=require('../api/build');
const key='startupOS.sessions.v1',checks=[];
const seed={activeId:'vs_studio_a',sessions:[{_sessionId:'vs_studio_a',name:'OCR 세션 A',idea:'영수증 OCR 가계부',problem:'품목 기록',score:0,price:0,budget:100,costs:[],decisions:[],metrics:{},_phase:'brief'},{_sessionId:'vs_studio_b',name:'여행 세션 B',idea:'여행 ToDo',problem:'준비물 정리',score:0,price:0,budget:100,costs:[],decisions:[],metrics:{},_phase:'brief'}]};
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
 await test('legacy_build_navigation_preserves_session',async()=>{await page.goto(base+'/');await page.locator('button[data-view="build"]').click();await page.waitForURL('**/builder/?sessionId=vs_studio_a');await page.getByRole('heading',{name:'1. 기능 계약을 먼저 확정합니다'}).waitFor();assert.equal(new URL(page.url()).searchParams.get('sessionId'),'vs_studio_a');});
 await test('scope_must_be_approved_before_assembly',async()=>{await page.locator('#kind').selectOption('receipt');assert.equal(await page.locator('#assemble').isDisabled(),true);await page.locator('#scope').check();assert.equal(await page.locator('#assemble').isEnabled(),true);});
 await test('in_flight_result_stays_on_original_session',async()=>{await page.locator('#assemble').click();await page.locator('#session').selectOption('vs_studio_b');await page.waitForFunction(key=>{const p=JSON.parse(localStorage.getItem(key));return !!p.sessions.find(x=>x._sessionId==='vs_studio_a').functionalBuild;},key);const pack=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert.equal(pack.sessions.find(x=>x._sessionId==='vs_studio_a').functionalBuild.sid,'vs_studio_a');assert.equal(pack.sessions.find(x=>x._sessionId==='vs_studio_b').functionalBuild,undefined);await page.locator('#session').selectOption('vs_studio_a');assert.equal(await page.locator('#publish').isDisabled(),true);});
 await test('refresh_keeps_artifact_and_no_false_verified_status',async()=>{await page.reload();await page.locator('#session').selectOption('vs_studio_a');await page.getByRole('heading',{name:'2. 실행 산출물'}).waitFor();assert.equal(await page.locator('#publish').isDisabled(),true);assert.match(await page.locator('.state-label').innerText(),/검증 대기/);await page.screenshot({path:'test-results/build-studio-desktop.png',fullPage:true});});
}finally{
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/studio-report.json',JSON.stringify({suite:'functional-build-studio-v3',checkedAt:new Date().toISOString(),checks},null,2));await browser.close();server.close();if(checks.some(x=>x.status!=='passed'))process.exitCode=1;
}
