'use strict';
const vm=require('node:vm');
const B=require('./build-contract');
const AS=require('./source-assets');
const FILES={
 skin:['capabilities/skin.js','capabilities/app.css'],
 receipt:['capabilities/receipt.js','capabilities/app.css'],
 travel:['capabilities/travel.js','capabilities/app.css']
};
const MAX_EDITS=16,MAX_BYTES=16500,MAX_REPLACE=3400,MAX_SEARCH=1600;
function fail(code,message,status=422){throw B.failure(code,message,status);}
function available(kind){return FILES[kind]||[];}
function validatePatchList(kind,edits){
 if(!available(kind).length)fail('CODE_CAPABILITY_INVALID','현재 세션의 앱 소스가 없습니다.');
 if(!Array.isArray(edits)||edits.length>MAX_EDITS)fail('CODE_PATCH_LIMIT','변경 파일 조각은 최대 '+MAX_EDITS+'개입니다.');
 if(Buffer.byteLength(JSON.stringify(edits),'utf8')>MAX_BYTES)fail('CODE_PATCH_TOO_LARGE','코드 변경이 너무 큽니다. 요청을 두 단계로 나눠 처리하세요.');
 for(const [i,edit] of edits.entries()){
  if(!edit||typeof edit!=='object'||!available(kind).includes(edit.file))fail('CODE_PATH_INVALID','허용되지 않은 코드 파일: '+String(edit&&edit.file));
  if(typeof edit.search!=='string'||typeof edit.replace!=='string'||edit.search.length<3||edit.search.length>MAX_SEARCH||edit.replace.length>MAX_REPLACE)fail('CODE_EDIT_INVALID','수정 조각 '+(i+1)+'의 원본/변경 코드 범위가 유효하지 않습니다.');
  if(edit.search===edit.replace)fail('CODE_NO_CHANGE','실제 수정 내용이 없습니다.');
  if(/<\/script\b|<script\b|\b(?:eval|Function)\s*\(|\bimport\s*\(|\bdocument\.cookie\b|\b(?:window\.)?(?:top|parent)\s*\.|\bnavigator\.sendBeacon\b|\b(?:XMLHttpRequest|WebSocket|EventSource)\b|\bpostMessage\s*\(|\bfetch\s*\(\s*['"]https?:|https?:\/\/[^\s"'<>]+/i.test(edit.replace))
   fail('CODE_REVIEW_REQUIRED','보안 검토 없이 외부 통신·스크립트 주입·상위 창 접근 코드를 추가할 수 없습니다.');
  if(/(?:localStorage|sessionStorage)\.clear\s*\(|\bprocess\.|\brequire\s*\(/.test(edit.replace))
   fail('CODE_REVIEW_REQUIRED','저장소 전체 삭제·Node 권한 코드를 추가할 수 없습니다.');
 }
 return edits;
}
function apply(kind,edits){
 validatePatchList(kind,edits);
 const code=Object.fromEntries(available(kind).map(path=>[path,AS.text(path)]));
 for(const [i,edit] of edits.entries()){
  const content=code[edit.file];const at=content.indexOf(edit.search);
  if(at<0)fail('CODE_CONTEXT_STALE','변경 '+(i+1)+'의 대상 코드가 현재 버전에 없습니다: '+edit.file,409);
  if(content.indexOf(edit.search,at+edit.search.length)>=0)fail('CODE_CONTEXT_AMBIGUOUS','변경 '+(i+1)+'의 대상 코드가 여러 곳에 있어 정확하게 지정해야 합니다: '+edit.file);
  code[edit.file]=content.slice(0,at)+edit.replace+content.slice(at+edit.search.length);
 }
 for(const [file,source] of Object.entries(code)){
  if(file.endsWith('.js')){
   try{new vm.Script(source,{filename:file});}
   catch(e){fail('CODE_SYNTAX_FAILED',file+' 구문 오류: '+e.message);}
  }
 }
 return code;
}
function smoke(kind,files){
 const file='capabilities/'+kind+'.js';
 const code=files[file];
 if(typeof code!=='string')fail('APP_ENTRY_MISSING','앱 실행 코드를 찾지 못했습니다.');
 const critical=kind==='skin'?['getUserMedia','id="analyze"','consent','analyzePhoto','saveResult','APP_CONFIG']:
  kind==='receipt'?['getUserMedia','consent','ocr','APP_CONFIG']:['localStorage','APP_CONFIG'];
 // Critical checks protect the current functional workflow from accidental deletion.
 const missing=critical.filter(x=>!code.includes(x));
 if(missing.length)fail('CORE_WORKFLOW_REMOVED','기존 주요 기능이 제거되었습니다: '+missing.join(', '));
 // Execute boot-only smoke in an isolated Node VM. External API calls are intentionally unavailable.
 const root={className:'',innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
 const store=new Map();
 const noop=()=>{};
 const media=()=>({matches:false,media:'',addListener:noop,removeListener:noop,addEventListener:noop,removeEventListener:noop});
 const win={APP_CONFIG:{kind,name:'Smoke app',sessionId:'vs_generated_smoke',buildId:'b_12345678-1234-4234-9234-123456789012',sourceHash:'test',preview:true},addEventListener:noop,location:{origin:'http://localhost'},URL,matchMedia:media};
 win.parent=win;
 const sandbox={
  window:win,matchMedia:media,location:win.location,
  document:{getElementById:id=>id==='app'?root:null,querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>({}),body:{}},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  navigator:{},console:{log:noop,warn:noop,error:noop},
  crypto:{randomUUID:()=> '12345678-1234-4234-9234-123456789012'},
  URL,URLSearchParams,AbortController,
  setTimeout:noop,clearTimeout:noop,
  fetch:()=>{throw Error('No external APIs during smoke test')},
  alert:noop,confirm:()=>false,
  Image:class{},File:class{},Blob:class{},
  requestAnimationFrame:noop
 };
 try{
  vm.runInNewContext(AS.text('capabilities/data.js'),sandbox,{timeout:250,filename:'capabilities/data.js'});
  sandbox.window.VentureData=sandbox.VentureData;
  vm.runInNewContext(code,sandbox,{timeout:250,filename:file});
 }
 catch(e){fail('BOOT_SMOKE_FAILED','생성 앱의 초기 화면 실행 오류: '+e.message);}
 if(!root.innerHTML||root.innerHTML.length<70)fail('BOOT_EMPTY','생성 앱이 초기 화면을 표시하지 않습니다.');
 return {status:'passed',id:'generated_app_boot',evidence:'Node vm isolated initial-screen render; no network or permissions',renderedChars:root.innerHTML.length};
}
function verify(kind,edits){const files=apply(kind,edits);return{files,smoke:smoke(kind,files)};}
function publicDiff(edits){return(edits||[]).map((e,i)=>({key:'code:'+i,label:e.file,file:e.file,from:e.search.slice(0,420),to:e.replace.slice(0,650)}));}
module.exports={FILES,available,validatePatchList,apply,smoke,verify,publicDiff,MAX_BYTES};
