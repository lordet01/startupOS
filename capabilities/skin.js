(function(){
'use strict';
const C=window.APP_CONFIG,root=document.getElementById('app'),key='startup-os:app:v3:'+C.sessionId+':skin';
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let records=[],file=null,preview='',busy=false,error='',result=null,consent=false,view='scan',status='',cameraStream=null,aborter=null,photoStage='waiting',lastFailure=null;
try{records=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(records))records=[]}catch{records=[]}
function persist(){localStorage.setItem(key,JSON.stringify(records))}
function stopCamera(){if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}}
function releasePhoto(){if(preview){URL.revokeObjectURL(preview);preview=''}file=null}
function navbar(){return '<nav class="tabs"><div>'+[['scan','촬영'],['history','내 기록']].map(x=>'<button data-view="'+x[0]+'" class="'+(view===x[0]?'active':'')+'">'+x[1]+'</button>').join('')+'</div></nav>'}
function header(){return '<header class="header"><div><div class="eyebrow">MY SKIN / '+esc(C.buildId.slice(-6))+'</div><h1>'+esc(C.name)+'</h1><div class="muted">피부 사진 관찰 · 성분군 참고</div></div><span class="badge">Photo vision</span></header>'}
const ingredientNames={niacinamide:'나이아신아마이드',ceramides:'세라마이드',glycerin:'글리세린',hyaluronic_acid:'히알루론산',panthenol:'판테놀',salicylic_acid:'살리실산',azelaic_acid:'아젤라익산',vitamin_c:'비타민 C',sunscreen:'자외선 차단',retinoid:'레티노이드',none:'없음'};
function form(){
 return '<section class="card"><div class="step">01 / 얼굴 사진</div><p class="hint">정면 사진을 밝고 균일한 조명에서 찍으세요. 외장 UVC 카메라 연결 가능 여부는 기기·브라우저에 따라 다르며 별도 확인이 필요합니다.</p>'+
 '<div class="row"><button class="btn primary" id="capture">📷 카메라</button><button class="btn" id="album">앨범</button></div>'+
 '<input id="cameraInput" type="file" accept="image/jpeg,image/png,image/webp" capture="user" hidden><input id="albumInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>'+
 (cameraStream?'<video id="video" class="photo" style="background:#000" autoplay muted playsinline></video><button class="btn primary full" id="snap" style="margin-top:8px">촬영</button>':'')+
 (preview?'<div id="previewPhase" class="card" style="margin-top:14px;border-color:#347ca0"><div class="step">02 / 사진 확인 · 분석 실행</div><img class="photo" alt="선택한 피부 사진 미리보기" src="'+preview+'"><label class="check"><input type="checkbox" id="consent" '+(consent?'checked':'')+'>사진을 OpenAI API로 전송하는 데 동의합니다. 원본 이미지는 앱에 저장하지 않습니다.</label><button class="btn primary full" id="analyze" '+(busy||!consent?'disabled':'')+'>'+(busy?'분석 중…':'✨ 이 사진 분석하기')+'</button><p class="hint">'+(consent?'분석 버튼을 눌러주세요.':'사진 전송에 동의하면 분석 버튼이 활성화됩니다.')+'</p></div>':'')+
 (busy?'<div class="busyline"></div><div class="muted" role="status">실제 AI 이미지 요청 중… <button class="btn" id="cancel">중지</button></div>':'')+
 (error?'<div role="alert" class="errorbox"><strong>분석 단계 오류</strong><p>'+esc(error)+'</p><button class="btn danger" id="reportIssue">⚠ Verify에 오류 보내기</button></div>':'')+
 (status?'<div class="notice">'+esc(status)+'</div>':'')+
 (preview&&!busy&&!error&&!result?'<button class="btn" id="stuckReport" style="margin-top:10px">촬영 후 진행되지 않나요? Verify에 보고</button>':'')+'</section>';
}
function findings(r){
 if(!r)return '';
 if(r.image_status!=='face_visible')return '<section class="card" id="analysisResult"><h2>분석 불가</h2><p>'+esc(r.summary)+'</p></section>';
 return '<section class="card" id="analysisResult"><div class="step">03 / 관찰 결과</div><h2>'+esc(r.summary)+'</h2>'+
 '<div class="featureList">'+r.observations.map(x=>'<div class="item"><b>'+esc(x.property.replaceAll('_',' '))+' · '+(x.certainty==='low'?'낮은 확신':'제한적 관찰')+'</b><p class="muted">'+esc(x.description)+'</p></div>').join('')+'</div>'+
 '<h2 style="margin-top:15px">추천 성분군</h2>'+
 r.ingredient_groups.map(x=>'<div class="item"><b>'+esc(ingredientNames[x.ingredient]||x.ingredient)+'</b><p class="muted">'+esc(x.reason)+'</p><p class="hint">'+esc(x.caution)+'</p></div>').join('')+
 '<div class="notice warn">'+r.limitations.map(x=>esc(x)).join('<br>')+'</div>'+
 '<button id="saveResult" class="btn primary full">결과 저장</button></section>';
}
function history(){return '<section class="card"><div class="row between"><h2>분석 기록</h2><button class="btn" id="export">JSON 내보내기</button></div>'+(records.length?records.slice().reverse().map(x=>'<div class="record"><div class="row between"><strong>'+esc(new Date(x.at).toLocaleString())+'</strong><button class="btn danger" data-delete="'+esc(x.id)+'">삭제</button></div><p class="muted">'+esc(x.result.summary)+'</p><div class="hint">'+esc(x.result.ingredient_groups.map(v=>ingredientNames[v.ingredient]||v.ingredient).join(', '))+'</div></div>').join(''):'<div class="empty">아직 저장한 분석 결과가 없습니다.</div>')+'</section>'}
function render(){
 root.className='app';root.innerHTML=header()+(view==='scan'?form()+findings(result):history())+navbar();
 document.querySelectorAll('[data-view]').forEach(el=>el.onclick=()=>{stopCamera();view=el.dataset.view;error='';render()});
 const cap=document.getElementById('capture');if(cap)cap.onclick=openCamera;
 const album=document.getElementById('album');if(album)album.onclick=()=>document.getElementById('albumInput').click();
 for(const input of ['cameraInput','albumInput']){const el=document.getElementById(input);if(el)el.onchange=()=>selectPhoto(el.files&&el.files[0]);}
 const consentEl=document.getElementById('consent');if(consentEl)consentEl.onchange=()=>{consent=consentEl.checked;const b=document.getElementById('analyze');if(b)b.disabled=!consent};
 const analyzeBtn=document.getElementById('analyze');if(analyzeBtn)analyzeBtn.onclick=analyzePhoto;
 const saveBtn=document.getElementById('saveResult');if(saveBtn)saveBtn.onclick=()=>{records.push({id:crypto.randomUUID(),at:new Date().toISOString(),result});try{persist();view='history';result=null;releasePhoto();render()}catch(e){error='저장 실패: '+e.message;render()}};
 const exp=document.getElementById('export');if(exp)exp.onclick=()=>{const u=URL.createObjectURL(new Blob([JSON.stringify(records,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='myskin-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};
 document.querySelectorAll('[data-delete]').forEach(el=>el.onclick=()=>{if(!confirm('이 분석 결과를 삭제할까요?'))return;records=records.filter(x=>x.id!==el.dataset.delete);persist();render()});
 const snap=document.getElementById('snap');if(snap)snap.onclick=takePhoto;
 const cancel=document.getElementById('cancel');if(cancel)cancel.onclick=()=>aborter?.abort();
 const report=document.getElementById('reportIssue');if(report)report.onclick=reportFailure;
 const stuck=document.getElementById('stuckReport');if(stuck)stuck.onclick=()=>{lastFailure={stage:photoStage,code:'PHOTO_FLOW_STUCK',message:'촬영 후 분석 단계로 진행하지 못함',at:new Date().toISOString()};reportFailure()};
 if(cameraStream){const video=document.getElementById('video');if(video){video.srcObject=cameraStream;video.play().catch(()=>{})}}
}
async function openCamera(){
 error='';if(!navigator.mediaDevices?.getUserMedia){document.getElementById('cameraInput').click();return}
 try{cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'user'},width:{ideal:1280}},audio:false});render()}
 catch(e){cameraStream=null;error='카메라를 열 수 없습니다. 브라우저 권한 또는 기기를 확인하고 사진 선택으로 시도하세요.';render();document.getElementById('cameraInput')?.click()}
}
function takePhoto(){
 const video=document.getElementById('video');if(!video||!video.videoWidth){error='카메라 영상 준비가 되지 않았습니다. 다시 촬영하거나 앨범에서 사진을 선택하세요.';render();return;}
 const c=document.createElement('canvas');c.width=video.videoWidth;c.height=video.videoHeight;c.getContext('2d').drawImage(video,0,0);
 c.toBlob(b=>{if(b)selectPhoto(new File([b],'skin.jpg',{type:'image/jpeg'}));else{error='촬영 이미지를 만들지 못했습니다. 사진 선택으로 다시 시도하세요.';render()}},'image/jpeg',0.88);
}
function selectPhoto(next){
 if(!next)return;stopCamera();releasePhoto();result=null;status='';consent=false;error='';
 if(!/^image\/(jpeg|png|webp)$/.test(next.type)||next.size>18000000){error='JPG, PNG, WebP 사진(18MB 이하)을 선택하세요.';render();return}
 file=next;preview=URL.createObjectURL(next);photoStage='photo_ready';status='촬영 완료 · 사진 확인 후 전송 동의하고 분석 버튼을 누르세요.';render();
 requestAnimationFrame(()=>document.getElementById('previewPhase')?.scrollIntoView({behavior:'smooth',block:'start'}));
}
async function preparePhoto(blob){
 const url=URL.createObjectURL(blob);
 try{
  const image=await new Promise((yes,no)=>{const im=new Image();im.onload=()=>yes(im);im.onerror=()=>no(Error('사진을 읽을 수 없습니다.'));im.src=url});
  const scale=Math.min(1,1800/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL('image/jpeg',.82);
  if(data.length>3400000)throw Error('사진이 너무 큽니다. 얼굴 부분만 잘라 다시 선택하세요.');
  return data;
 }finally{URL.revokeObjectURL(url)}
}
async function analyzePhoto(){
 if(!file||!consent||busy)return;
 busy=true;photoStage='analyzing';error='';status='';result=null;render();aborter=new AbortController();
 const timeout=setTimeout(()=>aborter.abort(),55000);
 try{
  const image=await preparePhoto(file);
  const resp=await fetch(C.skinEndpoint||'/api/skin-analysis',{method:'POST',signal:aborter.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:C.sessionId,buildId:C.buildId,sourceHash:C.sourceHash,consent:true,image})});
  const data=await resp.json().catch(()=>({error:'서버 응답을 읽을 수 없습니다.'}));
  if(!resp.ok||!data.ok)throw Error(data.error||'분석 실패 · HTTP '+resp.status);
  result=data.result;photoStage='done';status='AI 분석 완료 · '+Number(data.latency_ms/1000).toFixed(1)+'초';
 }catch(e){photoStage='error';error=e.name==='AbortError'?'분석이 중단되거나 시간 초과됐습니다.':e.message;lastFailure={stage:'image_analysis',code:e.code||'RUNTIME_OR_UX_FAILURE',message:error,at:new Date().toISOString()}}
 finally{clearTimeout(timeout);busy=false;aborter=null;render();if(result)requestAnimationFrame(()=>document.getElementById('analysisResult')?.scrollIntoView({behavior:'smooth',block:'start'}));}
}
function reportFailure(){
 const issue=lastFailure||{stage:photoStage,message:error||'사진 촬영→분석이 진행되지 않음',code:'PHOTO_FLOW_FAILED',at:new Date().toISOString()};
 const report={source:'user_report',kind:'skin',sessionId:C.sessionId,buildId:C.buildId,stage:issue.stage,code:issue.code,message:issue.message,at:issue.at,sourceHash:C.sourceHash};
 const url='https://startup-os-beige.vercel.app/builder/?sessionId='+encodeURIComponent(C.sessionId)+'&verifyIssue='+encodeURIComponent(JSON.stringify(report))+'#verify-stage';
 const opened=window.open(url,'_blank','noopener');if(!opened)window.location.assign(url);
}
window.addEventListener('error',event=>{if(view==='scan'&&!busy){lastFailure={stage:photoStage,code:'CLIENT_JS_ERROR',message:String(event.message||'JavaScript error').slice(0,260),at:new Date().toISOString()};}});
window.addEventListener('pagehide',()=>{stopCamera();aborter?.abort();releasePhoto()});
if(!C.preview&&'serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
})();