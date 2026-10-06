(function(){
'use strict';
// This panel never sends or stores a generated signing key. The operator copies
// it directly into Vercel's Sensitive environment variable editor.
let configured=null,checking=false,secret='';
const root=document.getElementById('studio');
function refreshPanel(){
 if(!root)return;
 if(configured&&configured.signing===false){
  const assemble=document.getElementById('assemble');if(assemble){assemble.disabled=true;assemble.title='내부 서명 키 설정 후 사용할 수 있습니다.';}
  if(!document.getElementById('operator-setup')){
   const box=document.createElement('section');box.id='operator-setup';box.className='card scope';
   box.innerHTML='<h2>운영자 내부 설정 1회 필요</h2><p class="muted">서명 키가 아직 등록되지 않아 Build 실행을 잠갔습니다. 서명은 세션·Build·검증 결과를 묶어 미검증 앱의 배포를 막습니다. 고객에게 요구하는 설정이 아닙니다.</p><p><strong>STARTUP_OS_BUILD_KEY</strong>를 Vercel 프로젝트의 Environment Variables에 Sensitive로 등록하고 <strong>Production + Preview</strong>에 적용한 뒤 Redeploy하세요.</p><div class="toolbar"><button class="btn" id="generate-signing-key">내 브라우저에서 키 생성</button><button class="btn" id="copy-signing-key" disabled>키 복사</button><a class="btn" href="https://vercel.com/kmjeon-5238s-projects/startup-os/settings/environment-variables" target="_blank" rel="noopener noreferrer">Vercel 내부 설정 ↗</a></div><label class="field"><span>브라우저에서만 생성한 값 · 채팅/저장소에 붙여넣지 마세요</span><input id="signing-key-output" type="password" readonly autocomplete="off"></label><p id="signing-key-message" class="hint">이 페이지는 키를 서버로 전송하거나 브라우저 저장소에 기록하지 않습니다. 페이지를 닫으면 사라집니다.</p><button class="btn primary" id="check-operator-setup">설정 상태 다시 확인</button>';
   const first=root.querySelector('.stages');if(first)first.after(box);else root.prepend(box);
   document.getElementById('generate-signing-key').onclick=()=>{const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);secret=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');document.getElementById('signing-key-output').value=secret;document.getElementById('copy-signing-key').disabled=false;};
   document.getElementById('copy-signing-key').onclick=async()=>{try{await navigator.clipboard.writeText(secret);document.getElementById('signing-key-message').textContent='키를 복사했습니다. Vercel의 STARTUP_OS_BUILD_KEY 값에 직접 붙여넣으세요.';}catch{document.getElementById('signing-key-output').type='text';document.getElementById('signing-key-output').select();document.getElementById('signing-key-message').textContent='직접 복사한 뒤 Vercel에 등록하세요.';}};
   document.getElementById('check-operator-setup').onclick=check;
  }
 }else if(configured&&configured.signing){const panel=document.getElementById('operator-setup');if(panel)location.reload();}
}
async function check(){if(checking)return;checking=true;try{const r=await fetch('/api/build',{cache:'no-store'}),d=await r.json();if(r.ok&&d.ok)configured=d.configured;}catch{}finally{checking=false;refreshPanel();}}
if(root)new MutationObserver(refreshPanel).observe(root,{childList:true,subtree:true});
window.addEventListener('pagehide',()=>{secret='';});check();
})();
