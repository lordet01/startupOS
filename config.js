window.STARTUP_OS_CONFIG = {
  runtimeUrl: '/api/runtime',
  runtimeProvider: 'Vercel + OpenAI Responses API',
  functionalBuildVersion: '3.0.0'
};
// Preserve the existing session workspace while replacing legacy Build/Deploy.
(function(){
  function destination(){
    try {
      const pack=JSON.parse(localStorage.getItem('startupOS.sessions.v1')||'null');
      return '/builder/'+(pack&&pack.activeId?'?sessionId='+encodeURIComponent(pack.activeId):'');
    } catch { return '/builder/'; }
  }
  document.addEventListener('click',function(event){
    const button=event.target.closest('button');
    if(!button)return;
    if(['build','deploy','phone'].includes(button.dataset.view)||['generateMvp','publishMvp','openPrototype','testPublishAuth'].includes(button.id)){
      event.preventDefault();event.stopImmediatePropagation();location.assign(destination());
    }
  },true);
  function update(){
    document.querySelectorAll('.side .small').forEach(el=>{if(el.textContent.includes('Pilot'))el.textContent='Build v3 · Functional gates';});
    document.querySelectorAll('button[data-view="build"]').forEach(el=>{el.textContent='Build · 기능 검증';});
  }
  window.addEventListener('DOMContentLoaded',()=>{
    update();
    const app=document.getElementById('app');
    if(app)new MutationObserver(()=>{if(!document.querySelector('button[data-view="build"]')?.textContent.includes('기능 검증'))update();}).observe(app,{childList:true,subtree:true});
  });
})();
