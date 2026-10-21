import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),W=require('../workspace-core'),Preview=require('../api/build-preview'),Build=require('../lib/build-contract');
const previewDescriptor=Build.encodeDescriptor(Build.descriptor({_sessionId:'vs_preview_account',name:'Skin preview'},'skin',true));
const docs=new Map(),checks=[],errors=[];
let failCommits=0,commitDelayMs=0,runtimeDelayMs=0;
const fixture={_sessionId:'vs_mac_skin_2026',name:'Mac 피부 분석',idea:'피부 사진 관찰',customer:'일반 사용자',problem:'피부 관찰 기록',budget:100,_updatedAt:new Date().toISOString(),costs:[],mvpFeatures:['카메라','피부 관찰'],serviceFlow:[{title:'촬영'}]};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 if(url.pathname==='/__cloud'){
  let raw='';for await(const bytes of req)raw+=bytes;const data=JSON.parse(raw||'{}'),path=(data.path||[]).join('/');
  if(!data.uid||data.path?.[1]&&data.path[1]!==data.uid)return json(403,{error:'permission-denied'});
  if(data.action==='commit'){
   if(failCommits-->0)return json(503,{error:'temporary failure'});
   if(commitDelayMs)await new Promise(r=>setTimeout(r,commitDelayMs));
   for(const write of data.body){if(write.path[1]!==data.uid)return json(403,{error:'permission-denied'});}
   for(const write of data.body)docs.set(write.path.join('/'),write.value);
   return json(200,{ok:true});
  }
  const rows=[...docs].filter(([key])=>key.startsWith(path+'/')&&key.split('/').length===data.path.length+1).map(([key,value])=>({id:key.split('/').at(-1),value})).sort((a,b)=>(b.value.revision||0)-(a.value.revision||0));
  return json(200,{value:docs.get(path)||null,rows});
 }
 if(url.pathname==='/api/build-preview'){req.query=Object.fromEntries(url.searchParams);res.status=n=>{res.statusCode=n;return res;};res.send=value=>res.end(value);res.json=value=>json(res.statusCode||200,value);return Preview(req,res);}
 if(url.pathname==='/api/session-check')return json(200,{authorization:req.headers.authorization||''});
 if(url.pathname==='/api/deny')return json(401,{ok:false,code:'SESSION_EXPIRED'});
 if(url.pathname==='/api/cloud-config')return json(200,{enabled:true,authRequired:true,firebase:{apiKey:'test-public',projectId:'test-project',authDomain:'test.firebaseapp.com',appId:'test'}});
 if(url.pathname==='/api/build')return json(200,{ok:true,configured:{ocr:false,publisher:false},contracts:{}});
 if(url.pathname==='/api/runtime'){if(req.method==='POST'&&runtimeDelayMs)await new Promise(r=>setTimeout(r,runtimeDelayMs));return json(200,{ok:true,model:'test',analysis:{executive_summary:'진행 중 생성한 분석 결과'}});}
 const file=url.pathname==='/'?'index.html':url.pathname==='/builder/'?'builder/index.html':url.pathname.slice(1);
 if(!/^(index.html|config.js|cloud-sync.js|workspace[-a-z.]+|builder\/(?:index.html|studio.js|refinement.js|refinement.css))$/.test(file)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html;charset=utf-8');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
async function context(seed=false){
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({status:200,contentType:'application/javascript',body:route.request().url().includes('firebase-app-compat')?fs.readFileSync('tests/helpers/firebase-stub.js','utf8'):''}));
 if(seed)await ctx.addInitScript(fixture=>{if(!localStorage.getItem('startupOS.sessions.v1'))localStorage.setItem('startupOS.sessions.v1',JSON.stringify({activeId:fixture._sessionId,sessions:[fixture]}));},fixture);
 const page=await ctx.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));return{ctx,page};
}
const a=await context(true),b=await context();
async function login(page,name){
 await page.locator('.top [data-cloud-button]').click();await page.locator('#cloudEmail').fill(name+'@example.com');await page.locator('#cloudPassword').fill('secret123');await page.locator('#cloudForm button[type=submit]').click();
 await page.waitForFunction(name=>window.StartupOSCloud.status().user===name,name);
 await page.waitForFunction(()=>!['starting','loading'].includes(window.StartupOSCloud.status().phase));
}
async function closeAccount(page){const el=page.locator('[data-cloud-command=close]');if(await el.count())await el.click();}
async function rename(page,name){page.once('dialog',d=>d.accept(name));await page.locator('.sessionCard [data-work=rename]').first().click();}
async function synced(page){await page.waitForFunction(()=>window.StartupOSCloud.status().phase==='synced');}
async function check(id,fn){try{await fn();checks.push({id,status:'passed'});console.log('PASS',id);}catch(e){checks.push({id,status:'failed',message:e.message});console.error('FAIL',id,e.message);throw e;}}
try{
 await a.page.goto(base+'/');await a.page.waitForFunction(()=>window.StartupOSCloud.status().configured);
 await check('login_does_not_silently_upload_mac_projects',async()=>{
  await login(a.page,'alpha');assert.equal(await a.page.locator('.sessionCard').count(),0);assert.equal(docs.size,0);
 });
 await check('explicit_import_and_cloud_restore_on_second_device',async()=>{
  await a.page.locator('[data-cloud-command=import]').click();await synced(a.page);await closeAccount(a.page);
  await a.page.getByRole('heading',{name:'Mac 피부 분석',exact:true}).waitFor();
  await b.page.goto(base+'/');await b.page.waitForFunction(()=>window.StartupOSCloud.status().configured);await login(b.page,'alpha');await closeAccount(b.page);
  await b.page.getByRole('heading',{name:'Mac 피부 분석',exact:true}).waitFor();
 });
 await check('two_devices_receive_real_session_changes',async()=>{
  await rename(a.page,'기기 간 동기화 확인');await synced(a.page);await b.page.getByRole('heading',{name:'기기 간 동기화 확인',exact:true}).waitFor();
 });
 await check('remote_edits_during_ai_work_are_preserved_as_conflicts',async()=>{
  runtimeDelayMs=4500;await b.page.locator('.nav [data-view=venture]').click();await b.page.locator('#analyzeNow').click();
  await b.page.waitForFunction(()=>window.StartupOSDashboard.getView()==='venture'&&!!document.querySelector('#analyzeNow:disabled'));
  await synced(b.page);const timestamp=await b.page.evaluate(()=>window.StartupOSDashboard.getSession()._updatedAt);await a.page.waitForFunction(t=>window.StartupOSDashboard.getSession()._updatedAt===t,timestamp);
  await rename(a.page,'분석 중 다른 기기 변경');await synced(a.page);await b.page.waitForFunction(()=>window.StartupOSCloud.status().conflicts===1);
  await b.page.waitForFunction(()=>!document.querySelector('#analyzeNow:disabled'));runtimeDelayMs=0;
  await b.page.locator('.top [data-cloud-button]').click();await b.page.getByRole('button',{name:'두 수정본 보존'}).click();await closeAccount(b.page);await synced(b.page);
  await b.page.locator('#moreMobile').click();await b.page.locator('[data-more-view=sessions]').click();
  const values=await b.page.evaluate(()=>window.StartupOSDashboard.getPack().sessions);assert.ok(values.some(p=>p.name==='분석 중 다른 기기 변경'));assert.ok(values.some(p=>p.name.includes('충돌 복구본')&&p.summary==='진행 중 생성한 분석 결과'));
  await a.page.waitForFunction(()=>window.StartupOSDashboard.getPack().sessions.length===2);
 });
 await check('edits_during_a_write_do_not_conflict_with_the_clients_own_commit',async()=>{
  commitDelayMs=300;await rename(a.page,'저장 처리 중 첫 수정');await a.page.waitForFunction(()=>window.StartupOSCloud.status().phase==='saving');await rename(a.page,'저장 처리 중 추가 수정');await synced(a.page);commitDelayMs=0;assert.equal(await a.page.evaluate(()=>window.StartupOSCloud.status().conflicts),0);await b.page.getByRole('heading',{name:'저장 처리 중 추가 수정',exact:true}).waitFor();
 });
 await check('offline_edits_survive_conflict_without_overwriting_either_version',async()=>{
  await a.ctx.setOffline(true);await rename(a.page,'오프라인 수정본');
  assert.ok(await a.page.evaluate(()=>window.StartupOSCloud.status().pending>0));
  await rename(b.page,'다른 기기 수정본');await synced(b.page);
  await a.ctx.setOffline(false);await a.page.waitForFunction(()=>window.StartupOSCloud.status().conflicts===1);
  await a.page.locator('.top [data-cloud-button]').click();await a.page.getByRole('button',{name:'두 수정본 보존'}).click();await closeAccount(a.page);await synced(a.page);
  const names=await a.page.locator('.sessionCard h3').allTextContents();assert.ok(names.includes('다른 기기 수정본'));assert.ok(names.some(x=>x.includes('오프라인 수정본 (충돌 복구본)')));
 });
 await check('transient_write_failure_retries_and_refresh_preserves_account_cache',async()=>{
  failCommits=100;await rename(a.page,'재시도 저장 완료');await a.page.waitForFunction(()=>window.StartupOSCloud.status().phase==='error');
  await a.page.reload();failCommits=0;await a.page.waitForFunction(()=>window.StartupOSCloud.status().user==='alpha');await synced(a.page);
  await a.page.getByRole('heading',{name:'재시도 저장 완료',exact:true}).waitFor();
 });
 await check('signout_and_second_account_do_not_show_private_projects',async()=>{
  await a.page.locator('.top [data-cloud-button]').click();await a.page.locator('[data-cloud-command=signout]').click();
  await a.page.waitForFunction(()=>!window.StartupOSCloud.status().user);await closeAccount(a.page);
  assert.equal(await a.page.locator('.sessionCard h3').textContent(),'Mac 피부 분석');
  await login(a.page,'beta');await closeAccount(a.page);assert.equal(await a.page.locator('.sessionCard').count(),0);
 });
 await check('project_search_archive_trash_restore_and_history_are_reversible',async()=>{
  const page=b.page;await synced(page);const originalCount=await page.locator('.sessionCard').count();
  await page.locator('[data-work=archive]').first().click();assert.equal(await page.locator('.sessionCard').count(),originalCount-1);
  await page.locator('#appsFilter').selectOption('archived');assert.equal(await page.locator('.sessionCard').count(),1);
  await page.locator('[data-work=archive]').click();await page.locator('#appsFilter').selectOption('active');
  await page.locator('[data-work=trash]').first().click();await page.locator('#appsFilter').selectOption('trash');await page.locator('[data-work=restore-app]').click();
  await page.locator('#appsFilter').selectOption('active');await synced(page);
  await page.locator('[data-work=history]').first().click();await page.locator('#workspaceVersions [data-work=restore-version]').first().waitFor();
  await page.locator('#workspaceVersions [data-work=restore-version]').first().click();await page.locator('#workspaceHistory').waitFor({state:'detached'});assert.equal(await page.locator('.sessionCard').count(),originalCount+1);
  await page.locator('#appsSearch').fill('해당없음');assert.equal(await page.locator('.sessionCard').count(),0);await page.locator('#appsSearch').fill('');
 });
 await check('cost_approval_and_growth_results_persist_in_the_selected_venture',async()=>{
  const page=b.page;await page.locator('[data-work=resume]').first().click();
  await page.locator('#moreMobile').click();await page.locator('[data-more-view=cost]').click();
  await page.locator('#approvalForm [name=title]').fill('실기기 배포 검증');await page.locator('#approvalForm [name=estimatedUsd]').fill('5');await page.locator('#approvalForm button').click();
  await page.locator('[data-work=approve]').click();await page.getByText('승인됨 · 예산 예약',{exact:true}).waitFor();
  await page.locator('#moreMobile').click();await page.locator('[data-more-view=growth]').click();
  await page.locator('#experimentForm [name=title]').fill('가입 화면 테스트');await page.locator('#experimentForm [name=hypothesis]').fill('입력 필드를 줄여 가입률을 높인다.');await page.locator('#experimentForm [name=metric]').fill('가입률');await page.locator('#experimentForm [name=threshold]').fill('10');await page.locator('#experimentForm button').click();
  await page.locator('[data-work=start-experiment]').click();await page.getByText('진행 중',{exact:true}).waitFor();
  const dialogs=['12','분석 리포트: 100명 중 12명 가입'];page.on('dialog',function handle(d){d.accept(dialogs.shift());if(!dialogs.length)page.off('dialog',handle);});
  await page.locator('[data-work=experiment-result]').click();await page.getByText('목표 달성',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.workspace-form input,.workspace-form select,.workspace-form textarea')].every(el=>el.getBoundingClientRect().right<=window.innerWidth-10)),true);
  await synced(page);const data=await page.evaluate(()=>window.StartupOSDashboard.getSession());assert.equal(data.approvals[0].status,'approved');assert.equal(data.experiments[0].met,true);
  await page.screenshot({path:'test-results/workspace-growth-mobile.png',fullPage:true});
 });
 await check('standalone_preview_restores_auth_before_calling_workspace_apis',async()=>{
  const preview=await b.ctx.newPage();preview.on('pageerror',e=>errors.push(e.message));await preview.goto(base+'/api/build-preview?d='+encodeURIComponent(previewDescriptor));
  const result=await preview.evaluate(async()=>{const response=await fetch('/api/session-check',{method:'POST'});return response.json();});assert.equal(result.authorization,'Bearer test.token.alpha');await preview.close();
 });
 await check('credentials_are_not_forwarded_to_external_runtime_urls',async()=>{
  let headers;await b.page.route('https://external.invalid/runtime',async route=>{headers=route.request().headers();await route.fulfill({status:200,contentType:'application/json',body:'{}'});});
  await b.page.evaluate(()=>window.StartupOSCloud.fetch('https://external.invalid/runtime',{method:'POST'}));assert.equal(headers.authorization,undefined);
 });
 await check('server_401_clears_the_authenticated_workspace',async()=>{
  await b.page.evaluate(()=>window.StartupOSCloud.fetch('/api/deny',{method:'POST'}));
  await b.page.waitForFunction(()=>!window.StartupOSCloud.status().user);
  assert.equal(await b.page.evaluate(()=>window.StartupOSStore.owner()),'guest');assert.equal(await b.page.locator('.sessionCard').count(),0);
 });
 assert.deepEqual(errors,[]);
}finally{
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/workspace-browser-report.json',JSON.stringify({testedAt:new Date().toISOString(),transport:'mocked_firebase_auth_and_firestore',checks,pageErrors:errors},null,2));
 await browser.close();server.close();if(checks.some(c=>c.status==='failed')||errors.length)process.exitCode=1;
}
