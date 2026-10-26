'use strict';
const {createHash}=require('node:crypto'),{gzipSync,gunzipSync}=require('node:zlib');
const {fail}=require('./access.cjs');
const ENDPOINTS=new Set(['runtime','idea-note','refine','build','publish']);
const LIMIT=850000,MAX_AGE=24*60*60*1000,MAX_RUN=10*60*1000;
function encode(value){const plain=Buffer.from(JSON.stringify(value));if(plain.length>4*1024*1024)throw fail('JOB_TOO_LARGE','첨부 파일을 줄여 다시 요청해 주세요.',413);const bytes=gzipSync(plain);if(bytes.length>LIMIT)throw fail('JOB_TOO_LARGE','첨부 파일을 줄여 다시 요청해 주세요.',413);return bytes;}
const decode=value=>JSON.parse(gunzipSync(Buffer.from(value),{maxOutputLength:4*1024*1024}).toString('utf8'));
function capture(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(body){this.body=body;return this},send(body){this.body=body;return this},end(){return this}};}
function createJobs({db,load,access,now=Date.now,deleteField}){
 async function submit(req,res){
  const {endpoint,body,key}=req.body||{};
  if(!ENDPOINTS.has(endpoint)||!body||typeof body!=='object'||Array.isArray(body)||!/^[-a-zA-Z0-9]{16,100}$/.test(key||''))throw fail('JOB_INVALID','작업 요청 형식이 올바르지 않습니다.',400);
  const identity=req.firebaseIdentity,request=encode(body),digest=createHash('sha256').update(endpoint).update(request).digest('hex');
  const id=createHash('sha256').update(identity.uid+'\0'+key).digest('hex');
  const ref=db.collection('startupJobs').doc(id);
  await db.runTransaction(async tx=>{
   const snapshot=await tx.get(ref);
   if(snapshot.exists){if(snapshot.data().digest!==digest)throw fail('JOB_KEY_CONFLICT','이 작업 ID에 다른 요청이 등록돼 있습니다.',409);return;}
   tx.create(ref,{ownerUid:identity.uid,email:identity.email,endpoint,request,digest,origin:req.headers.origin,state:'queued',createdAt:now(),updatedAt:now(),expiresAt:new Date(now()+MAX_AGE)});
  });
  return res.status(202).json({ok:true,job:{id,state:'queued'}});
 }
 async function read(req,res){
  const id=String(req.query?.id||'');if(!/^[a-f0-9]{64}$/.test(id))throw fail('JOB_NOT_FOUND','작업을 찾지 못했습니다.',404);
  const snapshot=await db.collection('startupJobs').doc(id).get(),data=snapshot.exists?snapshot.data():null;
  if(!data||data.ownerUid!==req.firebaseIdentity.uid)throw fail('JOB_NOT_FOUND','작업을 찾지 못했습니다.',404);
  if(now()-data.createdAt>MAX_AGE)throw fail('JOB_EXPIRED','작업 결과 보관 기간이 지났습니다. 새 작업으로 다시 요청해 주세요.',410);
  const interrupted=data.state==='running'&&now()-data.startedAt>MAX_RUN;
  return res.status(200).json({ok:true,job:{id,state:interrupted?'interrupted':data.state,createdAt:data.createdAt,updatedAt:data.updatedAt,...(data.result?{response:decode(data.result)}:{}),...(interrupted?{error:'작업 완료를 확인하지 못했습니다. 자동 재실행하지 않았습니다.'}:{})}});
 }
 async function run(id){
  if(!/^[a-f0-9]{64}$/.test(id))return;
  const ref=db.collection('startupJobs').doc(id);
  const job=await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists||snap.data().state!=='queued')return null;const data=snap.data();tx.update(ref,{state:'running',startedAt:now(),updatedAt:now()});return data;});
  if(!job)return;
  let response;
  try{
   if(now()-job.createdAt>MAX_AGE)throw fail('JOB_EXPIRED','작업 실행 기한이 지났습니다.',410);
   const identity=await access.recheck({uid:job.ownerUid,email:job.email});
   const url=new URL(job.origin),req={method:'POST',url:'/api/'+job.endpoint,originalUrl:'/api/'+job.endpoint,query:{},body:decode(job.request),firebaseIdentity:identity,headers:{origin:job.origin,host:url.host,'x-forwarded-proto':'https','sec-fetch-site':'same-origin','x-forwarded-for':'account:'+identity.uid}};
   const res=capture();await load(job.endpoint)(req,res);
   response={status:res.statusCode,body:res.body||{ok:false,error:'작업 응답이 비어 있습니다.'}};
  }catch(e){response={status:e.status||500,body:{ok:false,code:e.code||'JOB_FAILED',error:e.status?e.message:'작업 실행 중 오류가 발생했습니다.'}};}
  try{await ref.update({state:'finished',updatedAt:now(),request:deleteField(),result:encode(response)});}
  catch(e){if(e.code!=='JOB_TOO_LARGE')throw e;await ref.update({state:'finished',updatedAt:now(),request:deleteField(),result:encode({status:413,body:{ok:false,code:'JOB_RESULT_TOO_LARGE',error:'작업 결과가 저장 한도를 초과했습니다. 자동 재실행하지 않았습니다.'}})});}
 }
 async function handler(req,res){if(req.method==='POST')return submit(req,res);if(req.method==='GET')return read(req,res);return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});}
 return {handler,run};
}
module.exports={createJobs,encode,decode,capture,ENDPOINTS};
