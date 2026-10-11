(function(){
'use strict';
if(window.top!==window.self)return;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
if(standalone())return;
let deferred=null;
const panel=document.createElement('aside');panel.setAttribute('aria-label','앱 설치');
panel.style.cssText='position:fixed;bottom:max(16px,env(safe-area-inset-bottom));left:16px;right:16px;z-index:10000;background:#fff;color:#172033;border:1px solid #ddd;border-radius:20px;padding:16px;box-shadow:0 8px 40px #0002;font:14px system-ui;max-width:460px;margin:auto';
const row=document.createElement('div'),icon=document.createElement('img'),title=document.createElement('strong'),button=document.createElement('button'),close=document.createElement('button'),help=document.createElement('p');
icon.src='./icon-192.png';icon.width=48;icon.height=48;icon.style.cssText='border-radius:12px;vertical-align:middle;margin-right:12px';
title.textContent=window.APP_CONFIG.name;row.append(icon,title);button.textContent='홈 화면에 설치';button.style.cssText='padding:12px 18px;border:0;border-radius:12px;background:#172033;color:white;margin-top:12px';
close.textContent='닫기';close.style.cssText='float:right;border:0;background:none;padding:12px';close.onclick=()=>panel.remove();
help.hidden=true;help.setAttribute('role','status');panel.append(close,row,button,help);document.body.append(panel);
const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function instructions(){help.hidden=false;help.textContent=ios?'Safari에서 이 앱을 열고 공유 버튼 → 홈 화면에 추가 → 추가를 누르세요. 설치 후 홈 화면의 아이콘으로 실행하세요.':'Chrome 또는 Samsung Internet에서 이 앱을 열고 브라우저 메뉴 → 앱 설치 또는 홈 화면에 추가를 선택하세요. 설치 버튼이 준비되면 여기서 바로 설치할 수 있습니다.';}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;button.textContent='앱 설치';});
window.addEventListener('appinstalled',()=>{deferred=null;panel.remove();});
button.onclick=async()=>{if(!deferred){instructions();return;}const event=deferred;deferred=null;try{await event.prompt();const result=await event.userChoice;if(result.outcome==='accepted'){help.hidden=false;help.textContent='설치 요청을 수락했습니다. 홈 화면에서 앱을 확인하세요.';}else instructions();}catch{instructions();}};
if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').catch(()=>{help.hidden=false;help.textContent='설치 준비에 실패했습니다. 온라인 상태에서 새로고침해주세요.';});
})();
