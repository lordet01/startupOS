import assert from 'node:assert/strict';
import fs from 'node:fs';
const host=process.env.FIRESTORE_EMULATOR_HOST;
if(!/^127\.0\.0\.1:\d+$/.test(host||''))throw Error('Set FIRESTORE_EMULATOR_HOST to the local rules-test emulator.');
const project='demo-startupos',database='projects/'+project+'/databases/(default)',base='http://'+host+'/v1/'+database+'/documents';
function token(uid){const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const now=Math.floor(Date.now()/1000);return encode({alg:'none',typ:'JWT'})+'.'+encode({iss:'https://securetoken.google.com/'+project,aud:project,sub:uid,user_id:uid,iat:now,exp:now+3600,auth_time:now,firebase:{identities:{},sign_in_provider:'custom'}})+'.';}
function field(v){if(v===null)return{nullValue:null};if(Array.isArray(v))return{arrayValue:{values:v.map(field)}};if(typeof v==='object')return{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,field(x)]))}};if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};if(typeof v==='boolean')return{booleanValue:v};return{stringValue:String(v)};}
async function request(path,uid,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(uid?{Authorization:'Bearer '+token(uid)}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json()};}
function write(path,value){return{update:{name:database+'/documents/'+path,fields:field(value).mapValue.fields}};}
const sid='vs_rules_2026',path='users/alpha/ventures/'+sid;
const envelope=rev=>({ownerUid:'alpha',name:'Skin',updatedAt:new Date().toISOString(),revision:rev,payload:{_sessionId:sid,name:'Skin',idea:'피부 사진 관찰'}});
const history=(rev)=>path+'/versions/r_'+String(rev).padStart(10,'0');
const checks=[];
async function check(id,fn){await fn();checks.push({id,status:'passed'});console.log('PASS',id);}
try{
 await check('anonymous_venture_access_denied',async()=>{assert.equal((await request('/'+path,null)).status,403);});
 await check('owner_creates_venture_and_matching_revision_atomically',async()=>{const e=envelope(1),r=await request(':commit','alpha',{writes:[write(path,e),write(history(1),e)]});assert.equal(r.status,200,JSON.stringify(r.data));});
 await check('owner_reads_and_lists_own_ventures',async()=>{assert.equal((await request('/'+path,'alpha')).status,200);assert.equal((await request('/users/alpha/ventures','alpha')).status,200);});
 await check('other_account_cannot_read_or_write_venture',async()=>{assert.equal((await request('/'+path,'beta')).status,403);assert.equal((await request(':commit','beta',{writes:[write(path,envelope(2))]})).status,403);});
 await check('revisions_must_increase_by_exactly_one',async()=>{assert.equal((await request(':commit','alpha',{writes:[write(path,envelope(1))]})).status,403);assert.equal((await request(':commit','alpha',{writes:[write(path,envelope(3))]})).status,403);});
 await check('owner_cannot_forge_different_payload_in_revision_history',async()=>{const e=envelope(2),bad={...e,name:'Wrong snapshot'};assert.equal((await request(':commit','alpha',{writes:[write(path,e),write(history(2),bad)]})).status,403);});
 await check('valid_update_and_immutable_history',async()=>{const e=envelope(2);assert.equal((await request(':commit','alpha',{writes:[write(path,e),write(history(2),e)]})).status,200);assert.equal((await request(':commit','alpha',{writes:[write(history(1),e)]})).status,403);});
 await check('revision_history_owner_only',async()=>{assert.equal((await request('/'+history(1),'alpha')).status,200);assert.equal((await request('/'+history(1),'beta')).status,403);assert.equal((await request('/'+path+'/versions',null)).status,403);});
 await check('owner_uid_and_session_id_cannot_be_spoofed',async()=>{const e=envelope(3);assert.equal((await request(':commit','alpha',{writes:[write(path,{...e,ownerUid:'beta'})]})).status,403);assert.equal((await request(':commit','alpha',{writes:[write(path,{...e,payload:{...e.payload,_sessionId:'vs_other_session'}})]})).status,403);});
}finally{
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/firestore-rules-report.json',JSON.stringify({testedAt:new Date().toISOString(),mode:'local_firestore_emulator',checks},null,2));
}
