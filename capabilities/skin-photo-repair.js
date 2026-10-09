(function(){
'use strict';
// Reviewed versioned repair recipe: skin-photo-flow-v2.
// Does not send photos or silently accept API consent. Only restores the next-step UX.
const REPAIR='skin-photo-flow-v2';
let queued=false,lastPhoto=null;
function enhance(){
 const preview=document.getElementById('previewPhase');
 if(!preview||preview.dataset.repairId===REPAIR)return;
 preview.dataset.repairId=REPAIR;
 const note=document.createElement('div');note.className='notice';note.id='photoRepairStatus';
 note.style.marginTop='10px';note.textContent='사진이 준비되었습니다. 아래 단계에서 전송 동의 후 분석을 진행하세요.';
 const button=document.createElement('button');button.type='button';button.id='photoRepairNext';
 button.className='btn primary full';button.style.marginTop='8px';
 button.textContent='다음 단계 · 사진 분석';
 button.addEventListener('click',()=>{
   const consent=document.getElementById('consent'),analyze=document.getElementById('analyze');
   if(!consent){note.textContent='분석 동의 UI가 누락됐습니다. Verify에서 수정이 필요합니다.';return;}
   preview.scrollIntoView({block:'start',behavior:'smooth'});
   if(!consent.checked){consent.focus();note.textContent='얼굴 사진 전송에 동의한 후 분석을 누르세요.';}
   else{analyze?.focus();note.textContent='분석 버튼을 누르면 실제 Vision 결과를 확인할 수 있습니다.';}
 });
 preview.appendChild(note);preview.appendChild(button);
 if(!queued){queued=true;requestAnimationFrame(()=>{preview.scrollIntoView({block:'start',behavior:'smooth'});queued=false;});}
}
let captureTimer=null;
document.addEventListener('click',event=>{
 const snap=event.target.closest('#snap');
 if(snap){
  if(captureTimer)clearTimeout(captureTimer);
  captureTimer=setTimeout(()=>{
   if(!document.getElementById('previewPhase')){
    const video=document.getElementById('video');
    if(video){const warning=document.createElement('div');warning.className='errorbox';warning.setAttribute('role','alert');
      warning.textContent='사진 촬영이 완료되지 않았습니다. 카메라를 다시 시도하거나 앨범 선택을 이용하세요.';
      video.insertAdjacentElement('afterend',warning);}
   }
  },1800);
 }
});
const observer=new MutationObserver(()=>enhance());
observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
enhance();
window.STARTUP_OS_REPAIR={id:REPAIR,version:'2.0.0'};
})();
