import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const B=require('../lib/build-contract'),A=require('../lib/assemble'),Build=require('../api/build'),Preview=require('../api/build-preview'),Config=require('../lib/refinement-config');
const KEY='startupOS.sessions.v1',sid='vs_skin_chat_demo',otherSid='vs_skin_chat_other';
function create(name,id){const descriptor=B.descriptor({_sessionId:id,name},'skin',true);return {
 _sessionId:id,name,idea:'피부 사진 관찰과 성분군 추천',mvpFeatures:['카메라','관찰 결과','성분군'],costs:[],decisions:[],_phase:'build',
 functionalScopeApproved:'skin',functionalBuild:{...descriptor,descriptor,status:'IMPLEMENTED',artifactHash:B.artifactHash(descriptor),previewUrl:'/api/build-preview?d='+encodeURIComponent(B.encodeDescriptor(descriptor)),checks:[],verification:null}
}}
const pack={activeId:sid,sessions:[create('MySkin Chat Demo',sid),create('Other Skin Demo',otherSid)]};
const browserReply=(name,limit)=>({ok:true,status:'config_patch',response:'요청에 맞춰 결과를 구성하겠습니다.',reason:'사진 화면에서 표시 방식을 개선합니다.',
 config:Config.normalize('skin',{result_title:name,analysis_focus:'texture',detail_level:'detailed',ingredient_limit:limit,result_order:['ingredients','observations'],show_certainty:false}),
 changes:[{key:'result_title',label:'결과 제목',from:'피부 관찰 결과',to:name},{key:'ingredient_limit',label:'성분군 표시 개수',from:'4',to:String(limit)}],
 manual_test:['결과 카드 수정 확인','성분군 순서 확인'],unsupported_requests:[],model:'mock',response_id:'resp_mock_refine',usage:{input_tokens:100,output_tokens:100},cost:{provider_usd:0.001}});
const realCameraSource='id="capture">📷 카메라</button>';
const realCameraEdited='id="capture"><svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#e52b3c" stroke-width="2"><path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3"/></svg> 카메라</button>';
const codeReply=()=>({ok:true,status:'code_patch',response:'촬영 버튼에 빨간 카메라 SVG 아이콘을 추가했습니다.',reason:'이미지에서 선택한 버튼의 실제 HTML 코드를 변경합니다.',
  codeEdits:[{file:'capabilities/skin.js',search:realCameraSource,replace:realCameraEdited}],
  newEdits:[{file:'capabilities/skin.js',search:realCameraSource,replace:realCameraEdited}],
  changes:[{key:'code:0',label:'capabilities/skin.js',file:'capabilities/skin.js',from:realCameraSource,to:realCameraEdited}],
  manual_test:['버튼이 빨간 카메라 아이콘을 표시','기존 촬영 동작 유지'],external_steps:[],model:'mock',response_id:'resp_mock_code',
  usage:{input_tokens:300,output_tokens:200},cost:{provider_usd:null}});
const checks=[],errors=[];let proposalCount=0,requests=[],fullCaptureSize=null,partialSize=null;
function send(res,status,data,contentType='application/json'){res.statusCode=status;res.setHeader('Content-Type',contentType);res.end(contentType.includes('json')?JSON.stringify(data):data)}
function handlerResult(res){return{setHeader:(k,v)=>res.setHeader(k,v),status(n){res.statusCode=n;return this},json(d){send(res,res.statusCode||200,d);return this},send(d){send(res,res.statusCode||200,d,'text/html; charset=utf-8');return this},end(){res.end();return this}}}
const files=new Set(['index.html','config.js','builder/index.html','builder/studio.js','builder/refinement.js','builder/refinement.css','capabilities/app.css','vendor/html2canvas.min.js']);
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/build-preview'){
   req.query=Object.fromEntries(url.searchParams);
   await Preview(req,handlerResult(res));return;
  }
  if(url.pathname==='/api/build'){
   if(req.method==='GET'){await Build({method:'GET'},handlerResult(res));return}
   let raw='';for await(const x of req)raw+=x;
   req.body=JSON.parse(raw);
   if(req.body.action==='verify'){
    const desc=B.assertCurrent(req.body.descriptor),verification={status:'INTEGRATION_VERIFIED',artifactHash:B.artifactHash(desc),checkedAt:new Date().toISOString(),checks:[{id:'browser_e2e_scenarios',status:'passed'}],smoke:{status:'PASSED',fixtures:[],required_scenarios:[]},cost:{provider_usd:0.00002}};
    send(res,200,{ok:true,verification,cost:verification.cost});return;
   }
   await Build(req,handlerResult(res));return;
  }
  if(url.pathname==='/api/refine'){
   let raw='';for await(const x of req)raw+=x;
   const data=JSON.parse(raw);requests.push(data);proposalCount++;
   const response=proposalCount===3?codeReply():browserReply(proposalCount===1?'MySkin 결과 리포트':'2차 간결 리포트',proposalCount===1?3:2);
   send(res,200,response);return;
  }
  if(url.pathname==='/api/skin-analysis'){send(res,200,{ok:true,result:{image_status:'not_face',summary:'촬영용 검증 응답',ingredient_groups:[],observations:[],limitations:['사진 한계']},latency_ms:10});return;}
  const file=url.pathname==='/'?'index.html':url.pathname==='/builder/'?'builder/index.html':url.pathname.replace(/^\//,'');
  if(!files.has(file)){send(res,404,'not found','text/plain');return}
  const type=file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8';
  send(res,200,fs.readFileSync(file),type);
 }catch(e){send(res,500,{ok:false,error:e.message})}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1230,height:960},hasTouch:true});
await context.addInitScript(({KEY,pack})=>{if(!localStorage.getItem(KEY))localStorage.setItem(KEY,JSON.stringify(pack));},{KEY,pack});
const page=await context.newPage();
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
async function check(id,fn){
 try{await fn();checks.push({id,status:'passed'});console.log('PASS',id)}
 catch(e){checks.push({id,status:'failed',message:e.message});console.error('FAIL',id,e.message);
 await page.screenshot({path:'test-results/'+id+'.png',fullPage:true}).catch(()=>{});}
}
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await check('overview_improve_action_routes_directly_to_session_chat',async()=>{
   const button=page.locator('.overviewActions [data-view="iterate"]');
   await button.waitFor();
   await button.click();
   await page.waitForURL('**/builder/?sessionId='+sid+'#refineHost');
   await page.locator('#refineHost #refineFrame').waitFor();
 });
 await check('refine_mobile_preview_is_real_interactive_iframe',async()=>{
   await page.locator('#refineFrame').waitFor();
   await page.frameLocator('#refineFrame').getByText('MySkin Chat Demo').first().waitFor();
   assert.equal(await page.locator('.refinePhone').count(),1);
   assert.equal(await page.locator('.refineChatPane').count(),1);
 });
 await check('capture_embedded_preview_to_local_editable_canvas',async()=>{
   await page.locator('#refineCapture').click();
   await page.locator('#refineCanvas').waitFor({state:'visible',timeout:25000});
   const meta=await page.locator('#refineCanvas').evaluate(el=>({width:el.width,height:el.height,src:el.toDataURL('image/jpeg',.72)}));
   assert.ok(meta.width>180&&meta.height>180);
   assert.ok(meta.src.startsWith('data:image/jpeg;base64,'));
   fullCaptureSize={width:meta.width,height:meta.height};
 });
 await check('mouse_and_touch_pointer_annotations_draw_over_capture',async()=>{
   const canvas=page.locator('#refineCanvas');
   const box=await canvas.boundingBox();
   await page.mouse.move(box.x+25,box.y+25);await page.mouse.down();await page.mouse.move(box.x+100,box.y+80,{steps:6});await page.mouse.up();
   await canvas.dispatchEvent('pointerdown',{pointerId:14,pointerType:'touch',clientX:box.x+45,clientY:box.y+45});
   await canvas.dispatchEvent('pointermove',{pointerId:14,pointerType:'touch',clientX:box.x+75,clientY:box.y+96});
   await canvas.dispatchEvent('pointerup',{pointerId:14,pointerType:'touch',clientX:box.x+80,clientY:box.y+100});
   assert.ok(await canvas.evaluate(el=>el.toDataURL('image/jpeg',.75).length)>1000);
   await page.locator('#refineUndo').click();
 });
 await check('screenshot_plus_chat_feedback_sent_as_one_multimodal_request',async()=>{
   await page.locator('#refineText').fill('결과는 성분군을 먼저 보여주고 텍스처 설명을 늘려줘');
   await page.locator('#refineSend').click();
   await page.locator('#refineApprove').waitFor({state:'visible'});
   assert.equal(requests.length,1);
   assert.equal(requests[0].kind,'skin');assert.equal(requests[0].sessionId,sid);
   assert.match(requests[0].message,/성분군/);
   assert.ok(requests[0].screenshot.startsWith('data:image/jpeg;base64,'));
   const p=await page.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)).sessions[0],KEY);
   assert.equal(p.functionalProposal.status,'config_patch');
   assert.ok(p.functionalChat.some(m=>m.screenshotAttached));
 });
 await check('approved_chat_changes_generate_actual_new_build_and_preview',async()=>{
   const before=await page.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)).sessions[0].functionalBuild.bid,KEY);
   await page.locator('#refineApprove').click();
   await page.waitForFunction(({KEY,old})=>{const b=JSON.parse(localStorage.getItem(KEY)).sessions[0].functionalBuild;return b.bid!==old&&b.verification?.status==='INTEGRATION_VERIFIED';},{KEY,old:before},{timeout:18000});
   const app=await page.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)).sessions[0],KEY);
   assert.equal(app.functionalBuild.refinement.result_title,'MySkin 결과 리포트');
   assert.equal(app.functionalBuild.refinement.analysis_focus,'texture');
   assert.equal(app.functionalBuild.refinementRevision,1);
   assert.equal(app.functionalBuild.parentBuildId,before);
   assert.equal(app.functionalBuild.verification.smoke.status,'PASSED');
   await page.waitForFunction(()=>document.getElementById('refineFrame')?.contentWindow?.APP_CONFIG?.refinement?.result_title==='MySkin 결과 리포트');
   assert.equal(await page.locator('#refineHost .refineVersion').innerText(),'Revision 1');
 });
 await check('partial_capture_is_adjacent_to_full_capture_and_has_rectangle_overlay',async()=>{
   const full=page.locator('#refineCapture'),crop=page.locator('#refineCrop');
   await crop.waitFor({state:'visible'});
   const a=await full.boundingBox(),b=await crop.boundingBox();
   assert.ok(a&&b&&Math.abs(a.y-b.y)<18&&b.x>a.x,'Crop button should be adjacent to full capture');
   await crop.click();
   const overlay=page.locator('#refineCropOverlay');
   await overlay.waitFor({state:'visible',timeout:25000});
   assert.equal(await page.locator('#refineCrop').getAttribute('aria-pressed'),'true');
   assert.equal(await overlay.evaluate(el=>getComputedStyle(el).touchAction),'none');
   assert.ok(await overlay.evaluate(el=>getComputedStyle(el).backgroundImage.includes('data:image/jpeg')));
 });
 await check('mouse_rectangle_crops_only_selected_preview_pixels',async()=>{
   const overlay=page.locator('#refineCropOverlay');
   await overlay.scrollIntoViewIfNeeded();
   const rect=await overlay.boundingBox();
   assert.ok(rect&&rect.width>200&&rect.height>300);
   const x=rect.x+50,y=rect.y+140;
   await page.mouse.move(x,y);
   await page.mouse.down();
   await page.mouse.move(x+160,y+115,{steps:8});
   const box=page.locator('#refineCropSelection');
   await box.waitFor({state:'visible'});
   assert.ok((await box.boundingBox()).width>100);
   await page.mouse.up();
   await overlay.waitFor({state:'detached'});
   await page.locator('#refineCanvas').waitFor({state:'visible'});
   const meta=await page.locator('#refineCanvas').evaluate(el=>({width:el.width,height:el.height}));
   partialSize=meta;
   assert.ok(meta.width>110&&meta.width<fullCaptureSize.width*.8,JSON.stringify(meta));
   assert.ok(meta.height>70&&meta.height<fullCaptureSize.height*.7,JSON.stringify(meta));
   assert.match(await page.locator('.refineAnnotationHead').innerText(),/부분 캡처 첨부됨/);
   assert.equal(await page.locator('#refineCrop').getAttribute('aria-pressed'),'false');
 });
 await check('cropped_screenshot_is_sent_with_next_chat_message_only',async()=>{
   assert.equal(requests.length,1,'Cropped selection must not auto-send any data');
   await page.locator('#refineText').fill('캡처한 이 영역의 결과 카드를 더 간결하게 만들고 성분군은 2개로 제한해줘');
   await page.locator('#refineSend').click();
   await page.locator('#refineApprove').waitFor({state:'visible'});
   assert.equal(requests.length,2);
   assert.ok(requests[1].screenshot.startsWith('data:image/jpeg;base64,'));
   const imageMeta=await page.evaluate(async url=>{
     const img=new Image();img.src=url;await img.decode();return{width:img.width,height:img.height};
   },requests[1].screenshot);
   assert.deepEqual(imageMeta,partialSize);
   assert.match(requests[1].message,/이 영역/);
 });
 await check('second_feedback_build_cycle_keeps_history_and_revision',async()=>{
   // The second feedback and cropped screenshot were sent together above.
   await page.locator('#refineApprove').click();
   await page.waitForFunction(KEY=>JSON.parse(localStorage.getItem(KEY)).sessions[0].functionalBuild.refinementRevision===2,KEY,{timeout:15000});
   const p=await page.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)).sessions[0],KEY);
   assert.equal(p.functionalBuild.refinement.ingredient_limit,2);
   assert.ok(p.functionalBuildHistory.length>=2);
   assert.ok(p.functionalChat.filter(x=>x.role==='assistant').length>=2);
   assert.equal(proposalCount,2);
 });
 await check('coder_edits_red_camera_svg_and_rebuilds_real_preview',async()=>{
   await page.locator('#refineText').fill('촬영 버튼의 카메라 아이콘을 실제 빨간색 SVG 촬영 아이콘으로 바꿔줘');
   await page.locator('#refineSend').click();
   await page.locator('#refineApprove').waitFor();
   assert.equal(requests.at(-1).action,'code');
   assert.ok(requests.at(-1).priorBuild);
   assert.equal(await page.locator('.refinePlanHead>strong').innerText(),'실제 코드 수정안');
   await page.locator('#refineApprove').click();
   await page.waitForFunction(KEY=>JSON.parse(localStorage.getItem(KEY)).sessions[0].functionalBuild.refinementRevision===3,KEY,{timeout:18000});
   await page.frameLocator('#refineFrame').locator('#capture svg').waitFor();
   const state=await page.frameLocator('#refineFrame').locator('#capture').evaluate(button=>({
    stroke:button.querySelector('svg')?.getAttribute('stroke'),
    clickable:typeof button.onclick==='function'
   }));
   assert.equal(state.stroke,'#e52b3c');
   assert.equal(state.clickable,true);
   const p=await page.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)).sessions[0],KEY);
   assert.equal(p.functionalBuild.codeEdits.length,1);
   assert.equal(p.functionalBuild.verification.status,'INTEGRATION_VERIFIED');
 });
 await check('feedback_and_builds_are_isolated_per_venture_session',async()=>{
   await page.locator('#session').selectOption(otherSid);
   await page.locator('#refineFrame').waitFor();
   assert.equal(await page.locator('.refineMessages .refineBubble').count(),0);
   const p=await page.evaluate(KEY=>JSON.parse(localStorage.getItem(KEY)).sessions[1],KEY);
   assert.equal(p.functionalBuild.refinementRevision||0,0);
 });
 await check('partial_capture_cancel_keyboard_and_touch_rectangle_work_on_mobile',async()=>{
   await page.setViewportSize({width:390,height:844});
   await page.locator('[data-refine-tab="preview"]').click();
   await page.locator('#refineCrop').click();
   let overlay=page.locator('#refineCropOverlay');
   await overlay.waitFor();
   await overlay.press('Escape');
   await overlay.waitFor({state:'detached'});
   assert.equal(await page.locator('#refineCrop').getAttribute('aria-pressed'),'false');
   await page.locator('#refineCrop').click();
   overlay=page.locator('#refineCropOverlay');
   await overlay.waitFor();
   const bounds=await overlay.boundingBox();
   await overlay.dispatchEvent('pointerdown',{pointerId:31,pointerType:'touch',isPrimary:true,clientX:bounds.x+45,clientY:bounds.y+112});
   await overlay.dispatchEvent('pointermove',{pointerId:31,pointerType:'touch',isPrimary:true,clientX:bounds.x+165,clientY:bounds.y+252});
   await overlay.dispatchEvent('pointerup',{pointerId:31,pointerType:'touch',isPrimary:true,clientX:bounds.x+165,clientY:bounds.y+252});
   await overlay.waitFor({state:'detached'});
   await page.locator('[data-refine-tab="chat"].on').waitFor();
   const canvas=page.locator('#refineCanvas');
   await canvas.waitFor({state:'visible'});
   assert.match(await page.locator('.refineAnnotationHead').innerText(),/부분 캡처/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
 });
 await check('scrolled_preview_crop_matches_visible_app_region',async()=>{
   await page.locator('[data-refine-tab="preview"]').click();
   const region=await page.locator('#refineFrame').evaluate(frame=>{
     const win=frame.contentWindow,doc=frame.contentDocument;
     const marker=doc.createElement('div');
     marker.id='scroll-crop-visual-fixture';
     marker.style.cssText='width:175px;height:155px;display:block;background:rgb(231, 24, 71);margin:20px auto 140px;';
     doc.querySelector('#app').appendChild(marker);
     marker.scrollIntoView({block:'center',behavior:'instant'});
     const rect=marker.getBoundingClientRect();
     return{left:rect.left,top:rect.top,width:rect.width,height:rect.height,scrollY:win.scrollY};
   });
   assert.ok(region.scrollY>100,'The iframe must actually be scrolled for this regression.');
   await page.locator('#refineCrop').click();
   const overlay=page.locator('#refineCropOverlay');
   await overlay.waitFor();
   const o=await overlay.boundingBox();
   const x=o.x+region.left+25,y=o.y+region.top+25;
   assert.ok(region.top>=0 && region.top+region.height<=o.height,'Marker must be within the current app viewport');
   await overlay.dispatchEvent('pointerdown',{pointerId:41,pointerType:'touch',isPrimary:true,clientX:x,clientY:y});
   await overlay.dispatchEvent('pointermove',{pointerId:41,pointerType:'touch',isPrimary:true,clientX:x+95,clientY:y+90});
   await overlay.dispatchEvent('pointerup',{pointerId:41,pointerType:'touch',isPrimary:true,clientX:x+95,clientY:y+90});
   await overlay.waitFor({state:'detached'});
   const color=await page.locator('#refineCanvas').evaluate(canvas=>{
     const pixels=canvas.getContext('2d').getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data;
     return Array.from(pixels.slice(0,3));
   });
   assert.ok(color[0]>165&&color[1]<95&&color[2]<140,'Crop should contain the visually selected red target, got '+JSON.stringify(color));
 });
 await check('old_unsupported_feedback_retries_as_actual_code_request',async()=>{
   await page.evaluate(KEY=>{
     const pack=JSON.parse(localStorage.getItem(KEY));
     const other=pack.sessions.find(x=>x._sessionId==='vs_skin_chat_other');
     const bid=other.functionalBuild.bid;
     other.functionalProposal={status:'clarify',baseBuildId:bid,response:'지원하지 않는 기존 설정 변경'};
     other.functionalChat=[{role:'user',text:'촬영 버튼의 카메라 아이콘을 빨간색으로 바꿔줘',buildId:bid,at:new Date().toISOString()}];
     localStorage.setItem(KEY,JSON.stringify(pack));
   },KEY);
   await page.reload();
   await page.locator('#refineRetryAsCode').waitFor({state:'visible'});
   await page.locator('#refineRetryAsCode').click();
   await page.locator('#refineApprove').waitFor({state:'visible'});
   assert.equal(requests.at(-1).action,'code');
   assert.match(requests.at(-1).message,/빨간색/);
 });
 await check('mobile_touch_view_has_preview_chat_tabs_and_no_overflow',async()=>{
   await page.setViewportSize({width:390,height:844});
   await page.locator('[data-refine-tab="preview"]').click();
   assert.equal(await page.locator('.refinePreviewPane').isVisible(),true);
   await page.locator('[data-refine-tab="chat"]').click();
   assert.equal(await page.locator('.refineChatPane').isVisible(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
   await page.screenshot({path:'test-results/refinement-mobile.png',fullPage:true});
 });
 assert.deepEqual(errors,[]);
}finally{
 fs.mkdirSync('test-results',{recursive:true});
 fs.writeFileSync('test-results/refinement-ui.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,pageErrors:errors,requests:requests.map(({screenshot,...rest})=>({...rest,attachment:!!screenshot}))},null,2));
 await browser.close();server.close();
 console.log('REFINEMENT UI:',checks.filter(x=>x.status==='passed').length,'passed,',checks.filter(x=>x.status==='failed').length,'failed');
 if(checks.some(x=>x.status==='failed')||errors.length)process.exitCode=1;
}
