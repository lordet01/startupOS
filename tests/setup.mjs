import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const checks=[];
const seed={activeId:'vs_setup_test',sessions:[{_sessionId:'vs_setup_test',name:'OCR setup test',idea:'영수증 OCR',problem:'품목 기록',costs:[]}]};
const server=http.createServer((req,res)=>{
  if(req.url==='/api/build'){
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ok:true,version:'functional-build-3.1.0',mode:'keyless-stateless-functional-build',configured:{ocr:true,publisher:true},contracts:{receipt:{acceptance:['사진 촬영'],exclusions:['금융 연결'],storage:'브라우저 저장'}}}));
    return;
  }
  const name=req.url==='/'?'builder/index.html':req.url.slice(1);
  if(!['builder/index.html','builder/studio.js','capabilities/app.css'].includes(name)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(name));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage();page.setDefaultTimeout(10000);
await page.addInitScript(seed=>localStorage.setItem('startupOS.sessions.v1',JSON.stringify(seed)),seed);
let posts=0;page.on('request',req=>{if(req.method()==='POST')posts++;});
async function check(id,fn){try{await fn();checks.push({id,status:'passed'});console.log('PASS',id);}catch(e){checks.push({id,status:'failed',message:e.message});console.error('FAIL',id,e.message);}}
try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await check('no_custom_signing_setup_required',async()=>{
    await page.getByRole('heading',{name:'Build',exact:true}).waitFor();
    assert.equal(await page.locator('#operator-setup').count(),0);
    assert.equal(await page.getByText('STARTUP_OS_BUILD_KEY',{exact:false}).count(),0);
  });
  await check('build_is_enabled_after_auto_mapping_and_scope_approval',async()=>{
    assert.equal(await page.locator('#kind').count(),0);
    await page.getByText('카메라 OCR 가계부',{exact:true}).waitFor();
    assert.equal(await page.locator('#assemble').isDisabled(),true);
    await page.locator('#scope').check();
    assert.equal(await page.locator('#assemble').isEnabled(),true);
    assert.equal(posts,0);
  });
}finally{
  fs.mkdirSync('test-results',{recursive:true});
  fs.writeFileSync('test-results/setup-report.json',JSON.stringify({suite:'keyless-operator-setup',checks},null,2));
  await browser.close();server.close();
  if(checks.some(x=>x.status!=='passed'))process.exitCode=1;
}
