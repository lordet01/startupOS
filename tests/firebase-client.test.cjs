'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function client(direct,store=new Map()){
 const cloud={fetch:direct,status:()=>({user:'alpha'})},localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
 const window={fetch:direct,StartupOSCloud:cloud,dispatchEvent(){}};
 vm.runInNewContext(fs.readFileSync('firebase/client.js','utf8'),{window,location:{href:'https://startupos-6b8d4.web.app/',origin:'https://startupos-6b8d4.web.app'},navigator:{},localStorage,URL,Response,TextEncoder,crypto:require('node:crypto').webcrypto,DOMException,CustomEvent:class{constructor(name,value){this.detail=value.detail}},setInterval:()=>0,clearInterval(){},setTimeout:fn=>{queueMicrotask(fn);return 0;},clearTimeout(){}});
 return {cloud,store};
}
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const options={method:'POST',body:JSON.stringify({action:'code',message:'아이콘 변경'})};
test('Client preserves an idempotency key across a lost submission response and reload',async()=>{
 const seen=[],store=new Map();let lost=true;
 const direct=async(url,opts)=>{
  if(url==='/api/session')return response({ok:true});
  if(url==='/api/jobs'){seen.push(JSON.parse(opts.body).key);if(lost){lost=false;throw Error('connection lost after submission');}return response({ok:true,job:{id:'same-job'}});}
  return response({ok:true,job:{state:'finished',response:{status:200,body:{ok:true,result:'completed'}}}});
 };
 await assert.rejects(()=>client(direct,store).cloud.fetch('/api/refine',options),/connection lost/);assert.equal(store.size,1);
 const result=await client(direct,store).cloud.fetch('/api/refine',options);assert.equal((await result.json()).result,'completed');assert.equal(seen.length,2);assert.equal(seen[0],seen[1]);assert.equal(store.size,0);
});
test('Aborting result polling retains the existing job ID and resumes without another submission',async()=>{
 const controller=new AbortController(),store=new Map();let submitted=0,waiting=true;
 const direct=async(url)=>{
  if(url==='/api/session')return response({ok:true});
  if(url==='/api/jobs'){submitted++;return response({ok:true,job:{id:'accepted-job'}});}
  if(waiting){waiting=false;controller.abort();return response({ok:true,job:{state:'running'}});}
  return response({ok:true,job:{state:'finished',response:{status:200,body:{ok:true}}}});
 };
 await assert.rejects(()=>client(direct,store).cloud.fetch('/api/refine',{...options,signal:controller.signal}),{name:'AbortError'});
 assert.equal(JSON.parse([...store.values()][0]).id,'accepted-job');
 assert.equal((await client(direct,store).cloud.fetch('/api/refine',options)).status,200);assert.equal(submitted,1);assert.equal(store.size,0);
});
test('An interrupted job is never automatically submitted again; manual retry gets a new key',async()=>{
 const store=new Map(),keys=[];let interrupted=true;
 const direct=async(url,opts)=>{
  if(url==='/api/session')return response({ok:true});
  if(url==='/api/jobs'){keys.push(JSON.parse(opts.body).key);return response({ok:true,job:{id:'job'}});}
  if(interrupted){interrupted=false;return response({ok:true,job:{state:'interrupted',error:'서버 작업 중단'}});}
  return response({ok:true,job:{state:'finished',response:{status:422,body:{ok:false,error:'실제 검증 실패'}}}});
 };
 const first=client(direct,store);await assert.rejects(()=>first.cloud.fetch('/api/refine',options),{code:'JOB_INTERRUPTED'});assert.equal(keys.length,1);assert.equal(store.size,0);
 const result=await first.cloud.fetch('/api/refine',options);assert.equal(result.status,422);assert.equal((await result.json()).error,'실제 검증 실패');assert.notEqual(keys[0],keys[1]);
});
