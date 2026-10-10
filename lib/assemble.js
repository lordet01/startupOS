'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),vm=require('node:vm');
const B=require('./build-contract'),R=require('./repair');
const read=file=>require('./source-assets').text(file);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=x=>JSON.stringify(x).replace(/</g,'\\u003c');
function png(size){
  const raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++){const start=y*(size*4+1);raw[start]=0;for(let x=0;x<size;x++){const i=start+1+x*4,inside=x>size*.27&&x<size*.73&&y>size*.2&&y<size*.8,line=inside&&x>size*.35&&x<size*.65&&((y>size*.35&&y<size*.4)||(y>size*.48&&y<size*.53)||(y>size*.61&&y<size*.66));raw[i]=inside&&!line?255:21;raw[i+1]=inside&&!line?255:94;raw[i+2]=inside&&!line?255:89;raw[i+3]=255;}}
  const crc=b=>{let n=-1;for(const byte of b){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^-1)>>>0;};
  const chunk=(name,buffer)=>{const type=Buffer.from(name),length=Buffer.alloc(4),tail=Buffer.alloc(4);length.writeUInt32BE(buffer.length);tail.writeUInt32BE(crc(Buffer.concat([type,buffer])));return Buffer.concat([length,type,buffer,tail]);};
  const head=Buffer.alloc(13);head.writeUInt32BE(size,0);head.writeUInt32BE(size,4);head[8]=8;head[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
function config(desc,preview=false){B.assertCurrent(desc);return {name:desc.name,kind:desc.kind,sessionId:desc.sid,buildId:desc.bid,sourceHash:desc.sourceHash,preview,repairId:desc.repairId||null,ocrEndpoint:'/api/receipt-ocr'};}
function html(desc,preview=false){
  const cfg={...config(desc,preview),...(desc.kind==='skin'?{skinEndpoint:'/api/skin-analysis'}:{})},head='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#155e59"><title>'+escape(desc.name)+'</title>';
  const boot='<script>window.APP_CONFIG='+json(cfg)+';</script>';
  const repairScript=desc.repairId==='skin-photo-flow-v2'?(preview?'<script>'+read('capabilities/skin-photo-repair.js')+'</script>':'<script src="./capabilities/skin-photo-repair.js"></script>'):'';
  return '<!doctype html><html lang="ko"><head>'+head+(preview?'<style>'+read('capabilities/app.css')+'</style>':'<link rel="manifest" href="./manifest.webmanifest"><link rel="apple-touch-icon" href="./icon-192.png"><link rel="stylesheet" href="./capabilities/app.css">')+'</head><body><main id="app"></main>'+boot+(preview?'<script>'+read('capabilities/data.js')+'</script><script>'+read('capabilities/'+desc.kind+'.js')+'</script>':'<script src="./capabilities/data.js"></script><script src="./capabilities/'+desc.kind+'.js"></script>')+repairScript+'</body></html>';
}
function serviceWorker(desc){return 'const PREFIX='+json('so-v3-'+desc.sid+'-')+',CACHE=PREFIX+'+json(desc.bid)+';const FILES='+json(['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./capabilities/data.js','./capabilities/app.css','./capabilities/'+desc.kind+'.js'].concat(desc.repairId==='skin-photo-flow-v2'?['./capabilities/skin-photo-repair.js']:[]))+';self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener("fetch",e=>{const u=new URL(e.request.url);if(e.request.method!=="GET"||u.origin!==self.location.origin||u.pathname.startsWith("/api/"))return;if(e.request.mode==="navigate"){e.respondWith(fetch(e.request).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put("./index.html",r.clone()));return r}).catch(()=>caches.match("./index.html")));return;}e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});';}
function pack(desc){
  B.assertCurrent(desc);R.validateRepair(desc);
  const files=[{file:'index.html',data:html(desc)},
    {file:'manifest.webmanifest',data:JSON.stringify({id:'/?venture='+desc.sid,name:desc.name,short_name:desc.name.slice(0,20),start_url:'./',scope:'./',display:'standalone',theme_color:'#155e59',background_color:'#f3f5f9',icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]})},
    {file:'sw.js',data:serviceWorker(desc)},
    {file:'icon-192.png',data:png(192).toString('base64'),encoding:'base64'},
    {file:'icon-512.png',data:png(512).toString('base64'),encoding:'base64'},
    {file:'build-info.json',data:JSON.stringify({version:B.VERSION,sessionId:desc.sid,buildId:desc.bid,artifactHash:B.artifactHash(desc),repairId:desc.repairId||null,deviceVerified:false})}];
  for(const file of ['capabilities/data.js','capabilities/app.css','capabilities/'+desc.kind+'.js'])files.push({file,data:read(file)});
  if(desc.repairId==='skin-photo-flow-v2')files.push({file:'capabilities/skin-photo-repair.js',data:read('capabilities/skin-photo-repair.js')});
  if(desc.kind==='receipt'){
    for(const file of ['lib/receipt-service.js','lib/build-contract.js'])files.push({file,data:read(file)});
    files.push({file:'api/receipt-ocr.js',data:"process.env.STARTUP_OS_DEPLOY_SOURCE_HASH="+JSON.stringify(desc.sourceHash)+";\nmodule.exports = require('../lib/receipt-service').handler;\n"});
  }
  if(desc.kind==='skin'){
    for(const file of ['lib/skin-service.js','lib/build-contract.js'])files.push({file,data:read(file)});
    files.push({file:'api/skin-analysis.js',data:"process.env.STARTUP_OS_DEPLOY_SOURCE_HASH="+JSON.stringify(desc.sourceHash)+";\nmodule.exports=require('../lib/skin-service').handler;\n"});
  }
  files.push({file:'vercel.json',data:JSON.stringify({fluid:true,...(desc.kind==='receipt'?{functions:{'api/receipt-ocr.js':{maxDuration:60}}}:desc.kind==='skin'?{functions:{'api/skin-analysis.js':{maxDuration:60}}}:{}),headers:[{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'},{key:'Permissions-Policy',value:'camera=(self), microphone=()'}]},{source:'/sw.js',headers:[{key:'Cache-Control',value:'no-cache'}]}]})});
  return files;
}
function validateArtifacts(desc){const files=pack(desc),checks=[];for(const file of files.filter(x=>x.file.endsWith('.js'))){try{new vm.Script(file.data,{filename:file.file});checks.push({id:'syntax:'+file.file,status:'passed',evidence:'node:vm compile only'});}catch(e){checks.push({id:'syntax:'+file.file,status:'failed',message:e.message});}}const manifest=JSON.parse(files.find(x=>x.file==='manifest.webmanifest').data);checks.push({id:'pwa_manifest',status:manifest.display==='standalone'&&manifest.icons.length===2?'passed':'failed',evidence:'manifest schema / packaged PNG icons'});if(desc.repairId)checks.push({id:'repair_recipe',status:desc.repairId==='skin-photo-flow-v2'?files.some(x=>x.file==='capabilities/skin-photo-repair.js')?'passed':'failed':desc.repairId==='vercel-function-assets-v1'?'passed':'failed',evidence:desc.repairId==='vercel-function-assets-v1'?'Build source asset registry repaired and validated':'Reviewed repair overlay included in generated PWA'});checks.push({id:'server_dependency',status:desc.kind==='receipt'?files.some(x=>x.file==='api/receipt-ocr.js')?'passed':'failed':desc.kind==='skin'?files.some(x=>x.file==='api/skin-analysis.js')?'passed':'failed':'passed',evidence:'same-origin backend packaged with app'});return checks;}
module.exports={config,html,pack,png,validateArtifacts};
