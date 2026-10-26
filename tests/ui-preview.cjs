/* Local UI review only. No remote writes, authentication, or paid model calls. */
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),B=require('../lib/build-contract'),A=require('../lib/assemble');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 if(u.pathname==='/api/cloud-config')return json(200,{enabled:false,authRequired:false});
 if(u.pathname==='/api/runtime')return json(200,{ok:true,model:'UI preview — no AI calls'});
 if(u.pathname==='/api/build'&&req.method==='GET')return json(200,{ok:true,version:B.VERSION,sourceHash:B.sourceHash(),configured:{ocr:false,publisher:false},contracts:B.contracts});
 if(u.pathname==='/api/build-preview'){
  try{const d=B.decodeDescriptor(u.searchParams.get('d'));res.setHeader('Content-Type','text/html');return res.end(A.html(d,true));}catch{return json(400,{ok:false,error:'Preview descriptor required'});}
 }
 if(u.pathname.startsWith('/api/'))return json(503,{ok:false,error:'화면 검토용 환경입니다. AI 실행과 배포는 운영 환경에서 진행하세요.'});
 let file=path.resolve(root,'.'+u.pathname);if(file!==root&&!file.startsWith(root+path.sep))return json(404,{});
 try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');}catch{return json(404,{});}
 if(!/\.(html|js|css|png|jpg|svg)$/.test(file))return json(404,{});
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html;charset=utf-8':'image/png');
 let content=fs.readFileSync(file);
 if(file===path.join(root,'index.html')&&u.searchParams.get('fixture')==='travel'){
  const p={_sessionId:'vs_ui_review',name:'여행 준비 앱',idea:'여행 일정과 준비물을 한곳에서 관리',customer:'여행자',problem:'준비물을 빠뜨림',budget:100,mvpFeatures:['준비물 관리','일정 관리'],serviceFlow:[{step:1,title:'여행 만들기',user_action:'여행 기간 입력',system_action:'준비 목록 생성'}],_updatedAt:new Date().toISOString(),costs:[]};
  const d=B.descriptor(p,'travel',true);p.functionalScopeApproved='travel';p.functionalBuild={...d,descriptor:d,artifactHash:B.artifactHash(d),status:"IMPLEMENTED",checks:A.validateArtifacts(d),verification:null};p.functionalBuild.previewUrl='/api/build-preview?d='+encodeURIComponent(B.encodeDescriptor(d));
  content=content.toString().replace('<script src="/workspace-core.js">','<script>localStorage.setItem("startupOS.sessions.v1",'+JSON.stringify(JSON.stringify({activeId:p._sessionId,sessions:[p]}))+');</script><script src="/workspace-core.js">');
 }
 res.end(content);
});
server.listen(Number(process.env.PORT||process.argv[process.argv.indexOf('--port')+1]||3000),'0.0.0.0',()=>console.log('StartupOS UI preview ready; API writes disabled'));
