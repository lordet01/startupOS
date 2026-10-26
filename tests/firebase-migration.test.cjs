'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRouter}=require('../firebase/runtime/router.cjs');
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(data){this.data=data;return this},send(data){this.data=data;return this}}}
test('Packaged Firebase runtime config enables the real cloud-config endpoint and rejects another project',()=>{
 const {configure}=require(path.resolve('.firebase-build/functions/config.cjs'));
 const keys=['FIREBASE_API_KEY','FIREBASE_AUTH_DOMAIN','FIREBASE_PROJECT_ID','FIREBASE_APP_ID','STARTUPOS_AUTH_REQUIRED','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT'];
 const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  for(const key of keys)delete process.env[key];
  process.env.GCLOUD_PROJECT='startupos-6b8d4';
  const config=configure();
  const res=response();
  require(path.resolve('.firebase-build/functions/app/api/cloud-config.js'))({method:'GET'},res);
  assert.equal(res.data.enabled,true);
  assert.equal(res.data.authRequired,true);
  assert.deepEqual(res.data.missing,[]);
  assert.deepEqual(res.data.firebase,{apiKey:config.apiKey,authDomain:config.authDomain,projectId:config.projectId,appId:config.appId});
  const wrong={GCLOUD_PROJECT:'another-project'};
  assert.throws(()=>configure(wrong),/does not match/);
  assert.deepEqual(wrong,{GCLOUD_PROJECT:'another-project'});
 }finally{for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key]}}
});
test('Firebase router rejects unknown paths, methods and unexpected origins before loading handlers',async()=>{
 const route=createRouter(()=>{throw Error('Unexpected handler')});
 for(const [url,method,headers,status] of [['/api/unknown','GET',{},404],['/api/build','DELETE',{},405],['/api/build','POST',{origin:'https://evil.test'},403]]){const res=response();await route({url,method,headers},res);assert.equal(res.statusCode,status)}
});
test('Firebase runtime never falls back to the Vercel publisher',async()=>{const before=process.env.FIREBASE_PROJECT_ID;process.env.FIREBASE_PROJECT_ID='startupos-6b8d4';try{const res=response();await createRouter(()=>{throw Error('Unexpected network')},{access:{authenticate:async()=>({uid:'alpha'})}})({url:'/api/publish',method:'POST',headers:{origin:'https://startupos-6b8d4.web.app'}},res);assert.equal(res.statusCode,409);assert.equal(res.data.code,'JOB_REQUIRED');}finally{if(before===undefined)delete process.env.FIREBASE_PROJECT_ID;else process.env.FIREBASE_PROJECT_ID=before;}});
test('Firebase preserves path, query, body and authorization for the existing server',async()=>{
 const before=process.env.ALLOWED_ORIGIN;process.env.ALLOWED_ORIGIN='https://startupos-6b8d4.web.app';let seen;
 try{const req={url:'/api/jobs?d=abc',method:'POST',query:{d:'abc'},body:{endpoint:'build',body:{action:'assemble'},key:'1234567890123456'},headers:{origin:'https://startupos-6b8d4.web.app',authorization:'Bearer test'}},res=response();await createRouter(()=>{throw Error('Unexpected direct handler')},{access:{authenticate:async()=>({uid:'alpha'})},jobs:{handler:(r,s)=>{seen={name:'jobs',req:r};s.status(200).json({ok:true})}}})(req,res);assert.equal(seen.name,'jobs');assert.equal(seen.req,req);assert.equal(res.data.ok,true)}finally{if(before===undefined)delete process.env.ALLOWED_ORIGIN;else process.env.ALLOWED_ORIGIN=before}
});
test('Firebase artifact includes real Build assets and metadata but never server code in Hosting',async()=>{
 const base=path.resolve('.firebase-build'),B=require(path.join(base,'functions/app/lib/build-contract.js')),A=require(path.join(base,'functions/app/lib/assemble.js'));
 const descriptor=B.descriptor({_sessionId:'vs_firebase_test',name:'Firebase 여행 준비'},'travel',true);
 assert.ok(A.validateArtifacts(descriptor).every(c=>c.status==='passed'));
 for(const item of ['api','lib','fixtures','.env'])assert.equal(fs.existsSync(path.join(base,'public',item)),false);
 assert.equal(fs.readFileSync(path.join(base,'functions/app/lib/browser-evidence.json'),'utf8'),fs.readFileSync('lib/browser-evidence.json','utf8'));
 assert.deepEqual(fs.readdirSync(path.join(base,'public')),['login.html']);
 assert.ok(!fs.readFileSync(path.join(base,'functions/web/workspace-ui.js'),'utf8').includes('href="/control"'));
 assert.ok(fs.existsSync(path.join(base,'functions/web/vendor/html2canvas.min.js')));
 assert.equal(JSON.parse(fs.readFileSync('.firebaserc')).projects.default,'startupos-6b8d4');
});
