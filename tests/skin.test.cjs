'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.OPENAI_API_KEY='skin-test-key';
const B=require('../lib/build-contract'),A=require('../lib/assemble'),Skin=require('../lib/skin-service'),F=require('../lib/receipt-fixture');
const descriptor=()=>B.descriptor({_sessionId:'vs_skin_test',name:'MySkin AI'},'skin',true);
function valid(){return{image_status:'face_visible',summary:'표면 광택이 사진에서 관찰됩니다.',observations:[{property:'surface_shine',description:'이마의 광택',certainty:'low'}],ingredient_groups:[{ingredient:'niacinamide',reason:'일반적인 성분군 안내',caution:'자극 확인'}],limitations:[]}}
test('skin contract maps to reviewed capability and accepted scope',()=>{assert.ok(B.contracts.skin);assert.ok(B.contracts.skin.required.includes('live_skin_observation'));assert.throws(()=>B.descriptor({_sessionId:'vs_skin_test'},'skin',false),/범위/);});
test('skin build packages actual same-origin Vision handler',()=>{const d=descriptor(),files=A.pack(d);for(const path of ['api/skin-analysis.js','lib/skin-service.js','lib/build-contract.js','capabilities/skin.js','manifest.webmanifest'])assert.ok(files.some(f=>f.file===path),path);const server=files.find(f=>f.file==='api/skin-analysis.js').data;assert.ok(server.includes(d.sourceHash));assert.ok(A.validateArtifacts(d).every(t=>t.status==='passed'));});
test('unknown/unsupported skin camera photo formats rejected',()=>assert.throws(()=>Skin.validImage('data:image/jpeg;base64,'+Buffer.alloc(100).toString('base64')),/사진 파일/));
test('image format and size validated',()=>{const image=F.fixture().image;assert.equal(Skin.validImage(image),image);assert.throws(()=>Skin.validImage('x'.repeat(3500001)),/2.5MB/);});
test('nonface result does not get cosmetic ingredient suggestions',()=>{const r=Skin.validateResult({...valid(),image_status:'not_face'});assert.equal(r.ingredient_groups.length,0);assert.equal(r.observations.length,0);assert.match(r.summary,/얼굴 이미지를 확인하기 어렵습니다/);});
test('invalid ingredient categories never accepted as verified',()=>assert.throws(()=>Skin.validateResult({...valid(),ingredient_groups:[{ingredient:'prescription_steroid',reason:'',caution:''}]}),/성분 추천 항목 오류/));
test('actual vision request has image input and store false, mocked provider',async()=>{
 let sent;const result=await Skin.analyze(F.fixture().image,{fetchImpl:async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  sent=JSON.parse(opts.body);
  return Response.json({status:'completed',id:'resp_fixture',model:'gpt-4.1-mini',usage:{input_tokens:700,output_tokens:200},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({...valid(),image_status:'not_face'})}]}]});
 }});
 assert.equal(sent.store,false);assert.equal(sent.input[1].content[1].type,'input_image');assert.ok(sent.input[1].content[1].image_url.startsWith('data:image/png;base64,'));
 assert.equal(result.result.ingredient_groups.length,0);assert.ok(result.cost.provider_usd>0);
});
test('provider incomplete response is error, never a fake result',async()=>{await assert.rejects(Skin.analyze(F.fixture().image,{fetchImpl:async()=>Response.json({status:'incomplete'})}),/완료되지/);});
test('skin API requires consent before calling provider',async()=>{const r={setHeader(){},status(n){this.statusCode=n;return this},json(d){this.data=d;return this}};await Skin.handler({method:'POST',body:{consent:false}},r);assert.equal(r.statusCode,422);assert.equal(r.data.code,'CONSENT_REQUIRED');});
test('cross-site browser request is rejected before paid work',()=>{
 const desc=descriptor(),data={sessionId:desc.sid,buildId:desc.bid,sourceHash:desc.sourceHash};
 const req={headers:{host:'app.example','x-forwarded-proto':'https',origin:'https://evil.example','sec-fetch-site':'cross-site'}};
 assert.throws(()=>Skin.allowRequest(req,data),/동일 배포/);
});
test('source hash mismatch rejects stale deployment',()=>{
 const desc=descriptor(),req={headers:{host:'app.example','x-forwarded-proto':'https',origin:'https://app.example','sec-fetch-site':'same-origin'}};
 assert.throws(()=>Skin.allowRequest(req,{sessionId:desc.sid,buildId:desc.bid,sourceHash:'stale'}),/일치하지/);
});
