'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const {createAccess}=require('../firebase/runtime/access.cjs'),{createJobs,capture}=require('../firebase/runtime/jobs.cjs'),{createWeb}=require('../firebase/runtime/web.cjs'),{createApps}=require('../firebase/runtime/apps.cjs'),{createRouter}=require('../firebase/runtime/router.cjs');
const ORIGIN='https://startupos-6b8d4.web.app',identity={uid:'alpha',email:'owner@example.com',emailVerified:true},DELETED='__test_deleted_field__';
function database(){
 const docs=new Map();let lock=Promise.resolve();
 const doc=key=>({key,async get(){const value=docs.get(key);return{exists:docs.has(key),data:()=>structuredClone(value)};},async create(value){if(docs.has(key))throw Error('exists');docs.set(key,structuredClone(value));},async set(value){docs.set(key,structuredClone(value));},async update(values){const value=docs.get(key);if(!value)throw Error('missing');for(const [k,v]of Object.entries(values)){if(v===DELETED)delete value[k];else value[k]=structuredClone(v);}}});
 return {docs,collection:name=>({doc:id=>doc(name+'/'+id)}),async runTransaction(fn){const previous=lock;let release;lock=new Promise(r=>release=r);await previous;try{return await fn({get:ref=>ref.get(),create:(ref,value)=>{assert.ok(!docs.has(ref.key));docs.set(ref.key,structuredClone(value));},update:(ref,value)=>ref.update(value)})}finally{release();}}};
}
function fixture(){const db=database();db.docs.set('startuposAccess/owner@example.com',{enabled:true});const token={uid:identity.uid,email:identity.email,email_verified:true};const auth={verifyIdToken:async value=>{if(value!=='valid')throw Error('signature');return token;},verifySessionCookie:async value=>{if(value!=='session')throw Error('expired');return token;},createSessionCookie:async()=> 'session',getUser:async()=>({uid:identity.uid,email:identity.email,emailVerified:true})};return {db,auth,token,access:createAccess({auth,db})};}
const request=(extra={})=>({method:'GET',url:'/',headers:{origin:ORIGIN},query:{},firebaseIdentity:identity,...extra});
test('Private authentication validates revocation, verified email and operator grant on every request',async()=>{
 const f=fixture();let checked=false;f.auth.verifyIdToken=async(token,revoked)=>{checked=revoked;return f.token;};
 assert.deepEqual(await f.access.authenticate(request({headers:{authorization:'Bearer valid'}})),identity);assert.equal(checked,true);
 f.db.docs.clear();await assert.rejects(()=>f.access.authenticate(request({headers:{authorization:'Bearer valid'}})),{code:'PRIVATE_ACCESS_REQUIRED'});
 f.db.docs.set('startuposAccess/owner@example.com',{enabled:true});f.token.email_verified=false;
 await assert.rejects(()=>f.access.authenticate(request({headers:{authorization:'Bearer valid'}})),{code:'PRIVATE_ACCESS_REQUIRED'});
});
test('Session cookie uses HttpOnly, Secure and same-site checks; logout expires it',async()=>{
 const f=fixture(),res=capture();await f.access.session(request({method:'POST',body:{idToken:'valid'}}),res);
 assert.match(res.headers['Set-Cookie'],/^__session=session;.*HttpOnly; Secure; SameSite=Lax/);
 assert.deepEqual(await f.access.authenticate(request({headers:{cookie:'a=1; __session=session'}})),identity);
 await assert.rejects(()=>f.access.session(request({method:'DELETE',headers:{origin:'https://evil.test'}}),capture()),{code:'ORIGIN_NOT_ALLOWED'});
 const out=capture();await f.access.session(request({method:'DELETE'}),out);assert.match(out.headers['Set-Cookie'],/Max-Age=0/);
});
test('Router fails closed, rejects unauthenticated preview and never trusts body identity',async()=>{
 const f=fixture(),load=()=>()=>{throw Error('must not run')};
 let res=capture();await createRouter(load)(request({url:'/api/build'}),res);assert.equal(res.statusCode,503);
 res=capture();await createRouter(load,{access:f.access})(request({url:'/api/build-preview',body:{firebaseIdentity:identity}}),res);assert.equal(res.statusCode,401);
});
test('Private web assets require a session; traversal cannot expose function source',async()=>{
 const f=fixture(),root=path.resolve('.firebase-build/functions/web'),web=createWeb({access:f.access,root,apps:{}});
 let res=capture();await web(request({url:'/builder/',headers:{}}),res);assert.equal(res.statusCode,302);assert.match(res.headers.Location,/^\/login\?next=/);
 res=capture();await web(request({url:'/builder/',headers:{cookie:'__session=session'}}),res);assert.equal(res.statusCode,200);assert.match(res.body.toString(),/StartupOS/);assert.equal(res.headers['Cache-Control'],'private, no-store');
 for(const url of ['/../index.cjs','/%2e%2e/index.cjs','/.env','/%ZZ']){res=capture();await web(request({url,headers:{cookie:'__session=session'}}),res);assert.notEqual(res.statusCode,200);}
});
test('Job submission and duplicate trigger delivery execute the handler once; credentials are never stored',async()=>{
 const f=fixture();let calls=0;
 const jobs=createJobs({...f,load:name=>async(req,res)=>{calls++;assert.equal(name,'build');assert.deepEqual(req.firebaseIdentity,identity);assert.equal(req.headers.authorization,undefined);return res.status(200).json({ok:true,artifact:'real result'});},deleteField:()=>DELETED});
 const req=request({method:'POST',headers:{origin:ORIGIN,authorization:'Bearer must-not-persist'},body:{endpoint:'build',body:{action:'assemble'},key:'a1234567890123456'}}),a=capture(),b=capture();
 await Promise.all([jobs.handler(req,a),jobs.handler(req,b)]);assert.equal(a.body.job.id,b.body.job.id);assert.equal(f.db.docs.size,2);
 assert.ok(!JSON.stringify([...f.db.docs.values()]).includes('must-not-persist'));
 await Promise.all([jobs.run(a.body.job.id),jobs.run(a.body.job.id)]);assert.equal(calls,1);
 const out=capture();await jobs.handler(request({query:{id:a.body.job.id}}),out);assert.deepEqual(out.body.job.response,{status:200,body:{ok:true,artifact:'real result'}});
 assert.equal(f.db.docs.get('startupJobs/'+a.body.job.id).request,undefined);
});
test('Different account and mismatched idempotency payload cannot reuse a job',async()=>{
 const f=fixture(),jobs=createJobs({...f,load:()=>null,deleteField:()=>DELETED}),res=capture();
 const data={endpoint:'refine',body:{message:'first'},key:'b1234567890123456'};await jobs.handler(request({method:'POST',body:data}),res);
 await assert.rejects(()=>jobs.handler(request({method:'POST',body:{...data,body:{message:'changed'}}}),capture()),{code:'JOB_KEY_CONFLICT'});
 await assert.rejects(()=>jobs.handler(request({query:{id:res.body.job.id},firebaseIdentity:{uid:'beta'}}),capture()),{code:'JOB_NOT_FOUND'});
});
test('Worker crash is reported as interrupted without silently repeating model work',async()=>{
 const f=fixture();let time=1000000,calls=0;const jobs=createJobs({...f,now:()=>time,load:()=>()=>calls++,deleteField:()=>DELETED}),res=capture();
 await jobs.handler(request({method:'POST',body:{endpoint:'build',body:{action:'verify'},key:'c1234567890123456'}}),res);
 const id=res.body.job.id;Object.assign(f.db.docs.get('startupJobs/'+id),{state:'running',startedAt:time});time+=600001;
 await jobs.run(id);assert.equal(calls,0);const out=capture();await jobs.handler(request({query:{id}}),out);assert.equal(out.body.job.state,'interrupted');
});
test('Revoked operator cannot execute previously queued work',async()=>{
 const f=fixture();let calls=0;const jobs=createJobs({...f,load:()=>()=>calls++,deleteField:()=>DELETED}),res=capture();
 await jobs.handler(request({method:'POST',body:{endpoint:'runtime',body:{action:'blueprint'},key:'d1234567890123456'}}),res);f.db.docs.delete('startuposAccess/owner@example.com');
 await jobs.run(res.body.job.id);assert.equal(calls,0);
 const result=capture();await jobs.handler(request({query:{id:res.body.job.id}}),result);assert.equal(result.body.job.response.status,403);
});
test('Approved travel build is verified, privately published and served without server sources',async()=>{
 const f=fixture(),B=require('../lib/build-contract'),A=require('../lib/assemble'),V=require('../lib/verify'),branding=require('../lib/branding');
 const apps=createApps({db:f.db,B,A,V,branding}),descriptor=B.descriptor({_sessionId:'vs_firebase_runtime',name:'여행 준비'},'travel',true);
 await assert.rejects(()=>apps.handler(request({method:'POST',body:{descriptor,sessionId:descriptor.sid}}),capture()),{code:'APPROVAL_REQUIRED'});
 const res=capture();await apps.handler(request({method:'POST',body:{approved:true,descriptor,sessionId:descriptor.sid}}),res);assert.equal(res.statusCode,200);assert.equal(res.body.deployment.mode,'private');
 const base='/apps/'+res.body.deployment.id;
 let out=capture();await apps.serve(request(),out,identity,base+'/');assert.match(out.body,/여행 준비/);
 out=capture();await apps.serve(request(),out,{uid:'beta'},base+'/');assert.equal(out.statusCode,404);
 out=capture();await apps.serve(request(),out,identity,base+'/lib/skin-service.js');assert.equal(out.statusCode,404);
 out=capture();await apps.serve(request(),out,identity,base+'/sw.js');assert.equal(out.body,A.pack(descriptor).find(x=>x.file==='sw.js').data);
});
test('Packaged browser scripts compile with Firebase job recovery and existing workspace retained',()=>{
 for(const name of ['cloud-sync.js','builder/studio.js','builder/autobuild.js'])new vm.Script(fs.readFileSync(path.resolve('.firebase-build/functions/web',name),'utf8'));
 const login=fs.readFileSync('.firebase-build/public/login.html','utf8');assert.ok(!login.includes('__FIREBASE_CONFIG__'));
 for(const match of login.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});
