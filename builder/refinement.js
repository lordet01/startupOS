(function(){
'use strict';
// Session-scoped feedback. Screenshots stay in memory until the founder explicitly sends them.
const Bridge=()=>window.StartupOSBuildBridge;
const drafts=new Map(),activities=new Map();
const escape=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const now=()=>new Date().toISOString(),limit=x=>String(x||'').slice(0,2500);
function local(sid){if(!drafts.has(sid))drafts.set(sid,{text:'',tab:'preview',screenshot:null,strokes:[],activeStroke:null,busy:false,error:'',captureBusy:false,cropMode:null});return drafts.get(sid)}
const getSession=()=>Bridge()?.getSession();
function saveMessage(sid,msg){
 const bridge=Bridge();if(!bridge)return;
 bridge.patch(sid,p=>{p.functionalChat=[...(p.functionalChat||[]),{...msg,at:now()}].slice(-40)});
}
function hostMarkup(p,stale){
 const build=p.functionalBuild,kind=build.kind;
 const id=escape(build.bid.slice(-10));
 return '<div class="refineHeader"><div><span class="refineEyebrow">ITERATE / '+id+'</span><h2>Preview & Improve</h2><p>앱을 써보면서 캡처하고, 채팅으로 수정하세요.</p></div><span class="refineVersion">Revision '+(build.refinementRevision||0)+'</span></div>'+
 (stale?'<div class="refineStale" role="status"><strong>이 Build는 이전 엔진 버전입니다.</strong><span>현재 소스로 New Build를 만든 후 미리보기와 채팅 수정을 진행하세요. 기존 대화·설정은 보존됩니다.</span><button id="refineRebase" type="button">↻ 현재 버전으로 New Build</button></div>':'')+'<div class="refineTabs"><button data-refine-tab="preview" class="on">📱 미리보기</button><button data-refine-tab="chat">💬 수정 채팅</button></div>'+
 '<div class="refineColumns"><div class="refinePreviewPane">'+
 '<div class="refinePreviewActions"><span>Mobile · 390px</span><div><button id="refineReload" class="refineSmall" type="button">↻</button><a class="refineSmall" target="_blank" rel="noopener noreferrer" href="'+escape(build.previewUrl)+'" title="별도 창으로 실행">↗</a></div></div>'+
 (stale?'<div class="refinePhone refinePhoneStale"><div>New Build가 필요합니다.</div></div>':'<div class="refinePhone"><iframe id="refineFrame" title="현재 Build의 모바일 앱 화면" allow="camera" src="'+escape(build.previewUrl)+'"></iframe></div>')+
 (stale?'':'<div class="refinePhotoTools"><button id="refineCapture" class="refinePrimary" type="button">📸 전체 캡처</button><button id="refineCrop" class="refinePrimary refineCropButton" type="button" aria-pressed="false">✂ 부분 캡처</button><label for="refineScreenshotFile" class="refineUpload">이미지 첨부</label><input id="refineScreenshotFile" type="file" accept="image/png,image/jpeg,image/webp" hidden></div>')+
 '<div class="refineMiniNote">앱을 조작한 뒤 부분 캡처를 누르고 필요한 부분을 드래그하세요. 손가락·마우스 모두 지원합니다.</div></div>'+
 '<div class="refineChatPane"><div id="refineMessages" class="refineMessages"></div>'+
 '<div id="refineProposal" class="refineProposal"></div>'+
 '<div id="refineAnnotation" class="refineAnnotation"></div>'+
 '<div class="refineComposer"><label for="refineText">수정 요청</label><textarea id="refineText" rows="3" maxlength="2500" placeholder="예: 결과 카드가 너무 길어요. 관찰 항목을 먼저 보여주고 추천 성분은 3개만 표시해줘."></textarea>'+
 '<div class="refineSendRow"><span>캡처가 있으면 표시 영역과 설명을 함께 분석합니다.</span><button id="refineSend" class="refinePrimary" type="button">↗ AI에 수정 요청</button></div></div></div></div>';
}
function messagesHtml(p){
 const msgs=(p.functionalChat||[]).slice(-24);
 if(!msgs.length)return '<div class="refineEmpty">결과에 아쉬운 부분이 있나요? 앱 화면을 캡처하거나 아래에 바로 적어주세요.</div>';
 return msgs.map(m=>'<div class="refineBubble '+(m.role==='user'?'refineUser':m.role==='system'?'refineSystem':'refineAssistant')+'">'+
 '<div class="refineMsgMeta">'+(m.role==='user'?'You':m.role==='system'?'Build':'AI')+' · '+escape((m.at||'').slice(11,16))+(m.screenshotAttached?' · 📸':'')+'</div><div class="refineMsgBody">'+escape(m.text||'')+'</div></div>').join('');
}
function proposalHtml(p,state){
 const proposal=p.functionalProposal;
 if(state.error)return '<div class="refineError" role="alert">'+escape(state.error)+'</div>'+(proposal?proposalHtml(p,{error:''}):'');
 if(!proposal)return '<div class="refineHint">현재 앱의 실제 JS/CSS 파일을 수정합니다. 화면 캡처 또는 설명을 입력하면 AI가 코드 변경안을 만들고 새 Build에 반영합니다.</div>';
 const stale=proposal.baseBuildId!==p.functionalBuild?.bid;
 const supported=proposal.status==='config_patch'||proposal.status==='code_patch';
 const unsupported=!supported;
 const built=proposal.status==='BUILT';
 return '<div class="refinePlan"><div class="refinePlanHead"><strong>'+escape(built?'반영된 코드 변경':unsupported?'추가 확인 필요':proposal.status==='code_patch'?'실제 코드 수정안':'AI 설정 변경안')+'</strong><span>'+escape(proposal.status)+'</span></div>'+
 '<p>'+escape(proposal.response||proposal.reason||'')+'</p>'+
 (proposal.changes&&proposal.changes.length?'<div class="refineDiff">'+proposal.changes.map(x=>'<div><b>'+escape(x.label)+'</b>'+(proposal.status==='code_patch'?'<details class="refineCodeDiff"><summary>변경 코드 확인</summary><div class="refineCodeCompare"><div><span>Before</span><pre>'+escape(x.from)+'</pre></div><div><span>After</span><pre>'+escape(x.to)+'</pre></div></div></details>':'<span>'+escape(x.from)+' → <strong>'+escape(x.to)+'</strong></span>')+'</div>').join('')+'</div>':'')+
 (proposal.external_steps?.length?'<div class="refineHint">외부 연동에 필요한 설정: '+escape(proposal.external_steps.join(' · '))+'</div>':'')+
 (proposal.unsupported_requests?.length?'<div class="refineHint">추가 검토: '+escape(proposal.unsupported_requests.join(' · '))+'</div>':'')+
 (proposal.manual_test?.length?'<details><summary>다음 검증 항목 ('+proposal.manual_test.length+')</summary><ul>'+proposal.manual_test.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul></details>':'')+
 (!unsupported&&!stale&&!built?'<button id="refineApprove" class="refinePrimary" type="button">✓ 코드 적용 · New Build</button>':built?'<div class="refineHint">✓ 새 Build '+escape(proposal.resultBuildId?.slice(-8)||'')+'에 반영됐습니다. 위 화면에서 다시 확인하고 추가 수정을 채팅하세요.</div>':stale?'<div class="refineHint">다른 Build로 전환됐습니다. 현재 화면 기준으로 다시 개선안을 요청하세요.</div>':'<button id="refineRetryAsCode" class="refinePrimary" type="button">🛠 이 요청을 코드 수정으로 다시 실행</button>')+'</div>';
}
function getImageBuffer(sid){
 const d=local(sid);
 if(!d.screenshot)return null;
 const canvas=document.getElementById('refineCanvas');
 if(!canvas)return d.screenshot.dataUrl;
 return canvas.toDataURL('image/jpeg',.76);
}
function annotationMarkup(state){
 if(!state.screenshot)return '';
 return '<div class="refineAnnotationHead"><strong>'+(state.screenshot.captureType==='partial'?'✂ 부분 캡처 첨부됨':'📸 전체 화면 첨부됨')+'</strong><span>'+escape(state.screenshot.width+' × '+state.screenshot.height)+' · 손가락/마우스로 표시</span></div>'+
 '<canvas id="refineCanvas" aria-label="캡처된 화면 위에 자유롭게 표시" role="img"></canvas>'+
 '<div class="refineAnnotationTools"><button id="refineUndo" type="button">↶ 실행 취소</button><button id="refineClear" type="button">지우기</button><button id="refineRemoveShot" type="button">사진 제거</button></div>';
}
function redrawCanvas(sid){
 const state=local(sid),canvas=document.getElementById('refineCanvas');if(!canvas||!state.screenshot)return;
 const image=state.screenshot.image;
 canvas.width=state.screenshot.width;canvas.height=state.screenshot.height;
 const ctx=canvas.getContext('2d');
 ctx.drawImage(image,0,0,canvas.width,canvas.height);
 ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=Math.max(4,Math.round(canvas.width/95));ctx.strokeStyle='#ff3b48';
 for(const stroke of [...state.strokes,...(state.activeStroke?[state.activeStroke]:[])]){
  if(!stroke.length)continue;
  ctx.beginPath();stroke.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  if(stroke.length===1)ctx.lineTo(stroke[0].x+.1,stroke[0].y+.1);ctx.stroke();
 }
}
function bindAnnotation(sid){
 const state=local(sid),canvas=document.getElementById('refineCanvas');if(!canvas)return;
 canvas.style.touchAction='none';
 const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}};
 canvas.addEventListener('pointerdown',e=>{e.preventDefault();try{canvas.setPointerCapture(e.pointerId)}catch{}state.activeStroke=[point(e)];redrawCanvas(sid)});
 canvas.addEventListener('pointermove',e=>{if(!state.activeStroke)return;e.preventDefault();state.activeStroke.push(point(e));redrawCanvas(sid)});
 const end=e=>{if(!state.activeStroke)return;state.activeStroke.push(point(e));state.strokes.push(state.activeStroke);state.activeStroke=null;redrawCanvas(sid)};
 canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
 const undo=document.getElementById('refineUndo'),clear=document.getElementById('refineClear'),remove=document.getElementById('refineRemoveShot');
 if(undo)undo.onclick=()=>{state.strokes.pop();redrawCanvas(sid)};
 if(clear)clear.onclick=()=>{state.strokes=[];redrawCanvas(sid)};
 if(remove)remove.onclick=()=>{state.screenshot=null;state.strokes=[];updateChat(sid)};
 redrawCanvas(sid);
}
function updateChat(sid){
 const p=Bridge()?.getSessionById(sid);if(!p||!document.getElementById('refineHost'))return;
 const d=local(sid),ms=document.getElementById('refineMessages'),proposal=document.getElementById('refineProposal'),annotation=document.getElementById('refineAnnotation'),text=document.getElementById('refineText');
 if(ms){ms.innerHTML=messagesHtml(p);ms.scrollTop=ms.scrollHeight}
 if(proposal)proposal.innerHTML=proposalHtml(p,d);
 if(annotation){annotation.innerHTML=annotationMarkup(d);bindAnnotation(sid)}
 if(text){text.value=d.text;text.oninput=()=>{d.text=text.value}}
 const send=document.getElementById('refineSend');
 const info=Bridge()?.getInfo(),stale=!!(info&&p.functionalBuild&&(p.functionalBuild.sourceHash!==info.sourceHash||p.functionalBuild.version!==info.version));
 if(send){send.disabled=d.busy||stale||p.functionalBuild?.kind!=='skin';send.innerText=d.busy?'⏳ GPT 검토 중…':'↗ AI에 수정 요청';send.onclick=()=>sendRequest(sid)}
 const approve=document.getElementById('refineApprove');
 if(approve){approve.disabled=d.busy;approve.onclick=()=>approveBuild(sid)}
 const retry=document.getElementById('refineRetryAsCode');
 if(retry){retry.disabled=d.busy;retry.onclick=()=>{
   const message=[...(p.functionalChat||[])].reverse().find(x=>x.role==='user'&&(!x.buildId||x.buildId===p.functionalBuild?.bid));
   const previous=message?.text||p.functionalProposal?.reason||'';
   if(previous.trim().length<3){d.error='이전 수정 요청을 찾지 못했습니다. 아래 입력란에 다시 작성해 주세요.';updateChat(sid);return}
   d.text=previous;
   updateChat(sid);
   sendRequest(sid);
 };}
}
function switchTab(sid,tab){
 const host=document.getElementById('refineHost');if(!host)return;
 const d=local(sid);d.tab=tab;
 host.classList.toggle('showRefineChat',tab==='chat');
 host.querySelectorAll('[data-refine-tab]').forEach(x=>x.classList.toggle('on',x.dataset.refineTab===tab));
}
function mount(){
 const b=Bridge(),p=b?.getSession(),host=document.getElementById('refineHost');if(!p||!p.functionalBuild||!host)return;
 const sid=p._sessionId,bid=p.functionalBuild.bid,d=local(sid);
 const info=b.getInfo(),stale=!!(info&&((p.functionalBuild.sourceHash!==info.sourceHash)||(p.functionalBuild.version!==info.version)));
 const fresh=host.dataset.sessionId!==sid||host.dataset.buildId!==bid||host.dataset.stale!==String(stale)||!(host.querySelector('#refineFrame')||host.querySelector('.refinePhoneStale'));
 if(fresh){
  cancelPartialCapture(sid);
  host.innerHTML=hostMarkup(p,stale);host.dataset.sessionId=sid;host.dataset.buildId=bid;host.dataset.stale=String(stale);
  const frame=host.querySelector('#refineFrame');
  if(frame)frame.addEventListener('load',()=>{const note=host.querySelector('.refineMiniNote');if(note)note.textContent='터치/마우스로 앱을 조작하고, 캡처 버튼으로 현재 화면을 첨부하세요.'});
  const capture=host.querySelector('#refineCapture');if(capture)capture.onclick=()=>captureScreen(sid);
  const crop=host.querySelector('#refineCrop');if(crop)crop.onclick=()=>{if(local(sid).cropMode)cancelPartialCapture(sid);else startPartialCapture(sid)};
  const reload=host.querySelector('#refineReload');if(reload)reload.onclick=()=>{if(frame)frame.src=p.functionalBuild.previewUrl;};
  const rebase=host.querySelector('#refineRebase');if(rebase)rebase.onclick=()=>{const el=document.getElementById('assemble');if(el&&!el.disabled)el.click();else document.getElementById('scope-stage')?.scrollIntoView({behavior:'smooth'});};
  const file=host.querySelector('#refineScreenshotFile');if(file)file.onchange=()=>{const f=file.files?.[0];if(f)loadUploadedScreenshot(sid,f);file.value=''};
  host.querySelectorAll('[data-refine-tab]').forEach(button=>button.onclick=()=>switchTab(sid,button.dataset.refineTab));
 }
 updateChat(sid);switchTab(sid,d.tab);
}
async function setScreenshot(sid,dataUrl,meta={}){
 const d=local(sid),img=new Image();
 await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=dataUrl});
 const scale=Math.min(1,900/img.width);
 const width=Math.max(1,Math.round(img.width*scale)),height=Math.max(1,Math.round(img.height*scale));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 canvas.getContext('2d').drawImage(img,0,0,width,height);
 const safeUrl=canvas.toDataURL('image/jpeg',.81);
 const safe=new Image();await new Promise((resolve,reject)=>{safe.onload=resolve;safe.onerror=reject;safe.src=safeUrl});
 d.screenshot={image:safe,dataUrl:safeUrl,width,height,captureType:meta.captureType||'full',crop:meta.crop||null};d.strokes=[];d.error='';d.tab='chat';updateChat(sid);switchTab(sid,'chat');
}
async function loadUploadedScreenshot(sid,file){
 const d=local(sid);if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>6000000){d.error='이미지는 JPG/PNG/WebP 6MB 이하만 첨부할 수 있습니다.';updateChat(sid);return}
 const reader=new FileReader();
 reader.onload=()=>setScreenshot(sid,reader.result).catch(e=>{d.error=e.message;updateChat(sid)});
 reader.readAsDataURL(file);
}
async function ensureCaptureEngine(frame){
 const win=frame.contentWindow,doc=frame.contentDocument;
 if(!win||!doc||!doc.body)throw Error('앱 화면을 아직 불러오지 못했습니다.');
 if(win.html2canvas)return win.html2canvas;
 await new Promise((resolve,reject)=>{
  const script=doc.createElement('script');script.src='/vendor/html2canvas.min.js';
  script.onload=resolve;script.onerror=()=>reject(Error('캡처 엔진을 불러오지 못했습니다.'));
  doc.head.appendChild(script);
 });
 if(!win.html2canvas)throw Error('캡처 엔진 초기화 실패');return win.html2canvas;
}
async function renderPreviewCanvas(frame){
 const engine=await ensureCaptureEngine(frame),win=frame.contentWindow;
 if(!win||!frame.contentDocument?.body)throw Error('미리보기 앱을 불러오지 못했습니다.');
 const width=Math.round(win.innerWidth),height=Math.round(win.innerHeight);
 if(width<100||height<100)throw Error('캡처할 앱 화면이 아직 준비되지 않았습니다.');
 // Capture the currently visible viewport, including its scroll offset.
 const rendered=await engine(frame.contentDocument.body,{
  backgroundColor:'#f3f5f9',logging:false,useCORS:true,
  windowWidth:width,windowHeight:height,
  scrollX:-win.scrollX,scrollY:-win.scrollY,
  width,height,scale:1.4
 });
 if(!rendered||rendered.width<100||rendered.height<100)throw Error('현재 앱 화면 캡처에 실패했습니다.');
 return rendered;
}
function cancelPartialCapture(sid){
 const d=local(sid),mode=d.cropMode;
 if(!mode)return;
 mode.overlay?.remove();
 d.cropMode=null;
 const button=document.getElementById('refineCrop');
 if(button){button.textContent='✂ 부분 캡처';button.setAttribute('aria-pressed','false');button.classList.remove('active');button.disabled=false}
}
function cropPoint(event,rect){
 return{x:Math.max(0,Math.min(rect.width,event.clientX-rect.left)),
  y:Math.max(0,Math.min(rect.height,event.clientY-rect.top))};
}
function beginCropSelection(sid,sourceCanvas,frame){
 const d=local(sid),phone=frame.closest('.refinePhone');
 if(!phone)throw Error('앱 미리보기 화면을 찾을 수 없습니다.');
 cancelPartialCapture(sid);
 const overlay=document.createElement('div');
 overlay.id='refineCropOverlay';
 overlay.className='refineCropOverlay';
 overlay.setAttribute('role','region');
 overlay.setAttribute('aria-label','부분 캡처 영역 선택: 손가락이나 마우스로 직사각형을 드래그하세요.');
 overlay.tabIndex=0;
 overlay.style.backgroundImage='url("'+sourceCanvas.toDataURL('image/jpeg',.85)+'")';
 overlay.innerHTML='<div class="refineCropShade"></div>'+
  '<div class="refineCropHint" id="refineCropHint">✂ 필요한 부분을 드래그해서 선택하세요</div>'+
  '<button type="button" id="refineCropCancel" class="refineCropCancel" aria-label="부분 캡처 취소">✕</button>'+
  '<div id="refineCropSelection" class="refineCropSelection" hidden></div>';
 phone.appendChild(overlay);
 const button=document.getElementById('refineCrop');
 if(button){button.textContent='✕ 선택 취소';button.setAttribute('aria-pressed','true');button.classList.add('active')}
 const state={overlay,sourceCanvas,pointerId:null,start:null,selection:null};
 d.cropMode=state;
 const selection=overlay.querySelector('#refineCropSelection'),hint=overlay.querySelector('#refineCropHint');
 const draw=end=>{
  const x=Math.min(state.start.x,end.x),y=Math.min(state.start.y,end.y),w=Math.abs(end.x-state.start.x),h=Math.abs(end.y-state.start.y);
  selection.hidden=false;selection.style.left=x+'px';selection.style.top=y+'px';
  selection.style.width=w+'px';selection.style.height=h+'px';
  state.selection={x,y,w,h};
 };
 overlay.querySelector('#refineCropCancel').onclick=e=>{e.preventDefault();e.stopPropagation();cancelPartialCapture(sid)};
 overlay.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();cancelPartialCapture(sid)}};
 overlay.addEventListener('pointerdown',e=>{
  if(e.target.closest('button')||state.pointerId!==null)return;
  e.preventDefault();state.pointerId=e.pointerId;state.start=cropPoint(e,overlay.getBoundingClientRect());
  try{overlay.setPointerCapture(e.pointerId)}catch{}
  draw(state.start);
 });
 overlay.addEventListener('pointermove',e=>{
  if(state.pointerId!==e.pointerId||!state.start)return;
  e.preventDefault();draw(cropPoint(e,overlay.getBoundingClientRect()));
 });
 const finish=e=>{
  if(state.pointerId!==e.pointerId||!state.start)return;
  e.preventDefault();draw(cropPoint(e,overlay.getBoundingClientRect()));
  try{overlay.releasePointerCapture(e.pointerId)}catch{}
  state.pointerId=null;state.start=null;
  const region=state.selection;
  if(!region||region.w<18||region.h<18){
   selection.hidden=true;hint.textContent='범위가 너무 작습니다. 18px 이상 드래그하세요.';return;
  }
  const area=overlay.getBoundingClientRect();
  const sx=Math.max(0,Math.floor(region.x/area.width*sourceCanvas.width));
  const sy=Math.max(0,Math.floor(region.y/area.height*sourceCanvas.height));
  const sw=Math.max(1,Math.min(sourceCanvas.width-sx,Math.round(region.w/area.width*sourceCanvas.width)));
  const sh=Math.max(1,Math.min(sourceCanvas.height-sy,Math.round(region.h/area.height*sourceCanvas.height)));
  const cropped=document.createElement('canvas');cropped.width=sw;cropped.height=sh;
  cropped.getContext('2d').drawImage(sourceCanvas,sx,sy,sw,sh,0,0,sw,sh);
  const rectInfo={x:sx,y:sy,width:sw,height:sh};
  cancelPartialCapture(sid);
  setScreenshot(sid,cropped.toDataURL('image/jpeg',.86),{captureType:'partial',crop:rectInfo})
   .catch(error=>{d.error='선택한 부분을 첨부하지 못했습니다: '+error.message;updateChat(sid)});
 };
 overlay.addEventListener('pointerup',finish);
 overlay.addEventListener('pointercancel',e=>{
  if(state.pointerId!==e.pointerId)return;
  state.pointerId=null;state.start=null;state.selection=null;selection.hidden=true;
  hint.textContent='다시 드래그해서 범위를 선택하세요.';
 });
 overlay.focus({preventScroll:true});
}
async function startPartialCapture(sid){
 const d=local(sid),button=document.getElementById('refineCrop'),frame=document.getElementById('refineFrame');
 if(d.captureBusy||!frame||d.cropMode)return;
 d.captureBusy=true;d.error='';
 if(button){button.disabled=true;button.textContent='⏳ 캡처 준비 중…'}
 try{
  const rendered=await renderPreviewCanvas(frame);
  if(Bridge()?.getActiveId()!==sid||!frame.isConnected)return;
  beginCropSelection(sid,rendered,frame);
 }catch(e){
  d.error='부분 캡처 실패: '+e.message+' · 이미지 첨부로 대체할 수 있습니다.';
  d.tab='chat';updateChat(sid);switchTab(sid,'chat');
 }finally{
  d.captureBusy=false;
  if(button&&!d.cropMode){button.disabled=false;button.textContent='✂ 부분 캡처'}
 }
}
async function captureScreen(sid){
 const d=local(sid),button=document.getElementById('refineCapture'),frame=document.getElementById('refineFrame');
 if(d.captureBusy||!frame)return;
 cancelPartialCapture(sid);
 d.captureBusy=true;d.error='';if(button){button.disabled=true;button.textContent='⏳ 전체 캡처 중…'}
 try{
  const rendered=await renderPreviewCanvas(frame);
  if(Bridge()?.getActiveId()!==sid||!frame.isConnected)return;
  await setScreenshot(sid,rendered.toDataURL('image/jpeg',.84),{captureType:'full'});
 }catch(e){d.error='전체 캡처 실패: '+e.message+' · 이미지 첨부를 이용할 수 있습니다.';d.tab='chat';updateChat(sid);switchTab(sid,'chat')}
 finally{d.captureBusy=false;if(button){button.disabled=false;button.textContent='📸 전체 캡처'}}
}

async function sendRequest(sid){
 const d=local(sid),b=Bridge(),p=b?.getSessionById(sid),current=p?.functionalBuild;
 if(d.busy||!p||!current)return;
 const text=limit(d.text.trim()),screenshot=getImageBuffer(sid);
 if(text.length<3){d.error='어떤 부분을 바꾸고 싶은지 3자 이상 설명해 주세요.';updateChat(sid);return}
 d.busy=true;d.error='';d.text='';const before=current.bid;
 saveMessage(sid,{role:'user',text,screenshotAttached:!!screenshot,buildId:before});updateChat(sid);
 try{
  const history=(p.functionalChat||[]).slice(-8).map(x=>({role:x.role==='assistant'?'assistant':'user',text:x.text}));
  const res=await b.request('/api/refine',{action:'code',kind:current.kind,sessionId:sid,buildId:before,priorBuild:current.descriptor||current,currentConfig:current.refinement||null,message:text,history,screenshot},65000);
  b.patch(sid,x=>{
    x.functionalProposal={...res,baseBuildId:before,status:res.status,createdAt:now()};
    x.functionalChat=[...(x.functionalChat||[]),{role:'assistant',text:res.response+(res.changes?.length?' · '+res.changes.map(y=>y.label).join(', '):''),buildId:before,at:now()}].slice(-40);
    x.costs=x.costs||[];if(typeof res.cost?.provider_usd==='number')x.costs.push(['Chat refinement','OpenAI / '+res.model,'AI proposal',res.cost.provider_usd,res.response_id]);
  });
  d.screenshot=null;d.strokes=[];
 }catch(e){d.error=e.message||'AI 개선 요청 실패';d.text=text}
 finally{d.busy=false;updateChat(sid)}
}
async function approveBuild(sid){
 const d=local(sid),b=Bridge(),p=b?.getSessionById(sid),proposal=p?.functionalProposal;
 if(d.busy||!proposal||!['config_patch','code_patch'].includes(proposal.status)||proposal.baseBuildId!==p.functionalBuild.bid)return;
 d.busy=true;d.error='';updateChat(sid);
 try{
  const changes=proposal.status==='code_patch'?{codeEdits:proposal.codeEdits,config:proposal.config}:{config:proposal.config};
  const output=await b.applyRefinement(sid,changes,proposal.response);
  if(!output?.ok)throw Error(output?.error||'Build 또는 Verify 실패');
  d.tab='preview';
  b.refresh();
 }catch(e){d.error=e.message;updateChat(sid)}
 finally{d.busy=false;updateChat(sid)}
}
window.StartupOSRefinement={mount,captureScreen};
if(Bridge())mount();
})();