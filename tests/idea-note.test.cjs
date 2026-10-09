'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const runtime=require('../api/runtime');
const ideaNote=require('../api/idea-note');
const {projectContext}=require('../lib/venture-context');
const {normalizeBlueprint}=require('../lib/blueprint');
function response(){return {code:200,setHeader(){},status(n){this.code=n;return this;},json(data){return {status:this.code,body:data};},end(){return {status:this.code}}};}
const skinMemo='초고화질 UVC 카메라로 모공과 피부톤을 관찰하고 분석 결과에 맞는 성분 기반 화장품 추천을 모바일 웹에서 제공한다. 광고는 제외하고 B2B도 고려하지 않는다. 사용자는 가족과 나.';
const draft={name:'MySkin AI',idea:skinMemo,customer:'피부 특성 확인을 원하는 개인 사용자',problem:'자신의 모공과 피부톤을 직접 비교하기 어렵다',desiredOutcome:'사진을 촬영하고 피부 속성을 보고 제품군을 선택한다',model:'무료 기본',priceUsd:null,budgetUsd:100,constraints:'UVC 카메라 지원 확인, 모바일 웹, 의료 진단 아님'};
const bp={
 venture_name:'MySkin AI',value_proposition:'카메라 관찰과 사용 목적에 맞춰 피부 속성과 제품군 선택 지원',
 monetization:'무료 기본',recommended_price_usd:2.99,
 mvp_features:['스마트폰/카메라 촬영','이미지 기반 모공/톤 관찰','성분 기반 제품군 추천'],
 tech_stack:[{area:'Web',service:'Vercel',reason:'PWA 정적 배포',monthly_cost_usd:0},{area:'Vision',service:'OpenAI API',reason:'관찰 결과 보조',monthly_cost_usd:3}],
 service_flow:[{title:'사진 촬영',user_action:'사진을 준비',system_action:'파일 선택/권한 확인'},{title:'피부 관찰',user_action:'이미지 분석 요청',system_action:'톤과 시각적 상태 요약'},{title:'추천 보기',user_action:'결과 확인',system_action:'성분 중심 제품군 정리'}],
 build_plan:[{title:'PWA',deliverable:'사진 선택 화면과 동의 UX',estimated_external_cost_usd:0},{title:'Vision 연결',deliverable:'실제 API 분석 화면',estimated_external_cost_usd:2}],
 risks:['촬영 환경 영향','의료 진단으로 오인할 위험'],next_experiment:'안드로이드 UVC 지원 검증',next_action:'테스트폰에서 실제 UVC 인식 확인'
};
const makeProject=()=>({_sessionId:'vs_myskin_2026',name:'MySkin AI',idea:skinMemo,customer:draft.customer,problem:draft.problem,desiredOutcome:draft.desiredOutcome,constraints:draft.constraints,model:'무료 기본',_ideaNote:skinMemo,price:0,budget:100,metricsSource:'not_connected'});
async function withMockFetch(mock,fn){const old=global.fetch,oldKey=process.env.OPENAI_API_KEY;global.fetch=mock;process.env.OPENAI_API_KEY='test-only-token';try{return await fn()}finally{global.fetch=old;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}}
test('rich founder Idea Note is preserved only for blueprint mode',()=>{
 const p=makeProject();p._ideaNote='자유로운 상세 아이디어 '.repeat(120);
 const a=projectContext({...p,ideaNote:p._ideaNote},'analyze'),c=projectContext({...p,ideaNote:p._ideaNote},'cycle');
 assert.ok(a.idea_note.length>1000);assert.equal(c.idea_note,undefined);
 assert.equal(a.name,'MySkin AI');
});
test('Blueprint normalizer produces required legacy UI structure without fake example',()=>{
 const value=normalizeBlueprint(bp,makeProject());
 assert.equal(value.venture_name,'MySkin AI');assert.equal(value.service_flow.length,3);
 assert.equal(value.build_plan.length,2);assert.equal(value.estimated_mvp_external_cost_usd,2);
 assert.ok(!JSON.stringify(value).includes('여행 ToDo'));
});
test('Idea Note structured extraction maps natural Korean memo to editable fields',async()=>{
 await withMockFetch(async(url,opts)=>{
  assert.ok(url.endsWith('/v1/responses'));const req=JSON.parse(opts.body);
  assert.equal(req.text.format.name,'startup_os_idea_note_v1');
  assert.match(req.input[1].content,/UVC 카메라/);
  return Response.json({status:'completed',model:'gpt-4.1-mini',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(draft)}]}]});
 },async()=>{
  const result=await ideaNote({method:'POST',body:{action:'structure',note:skinMemo}},response());
  assert.equal(result.status,200);assert.equal(result.body.draft.idea,skinMemo);
  assert.equal(result.body.draft.priceUsd,null);
 });
});
test('Idea Note microphone transcribes without storing audio',async()=>{
 await withMockFetch(async(url,opts)=>{
  assert.ok(url.endsWith('/v1/audio/transcriptions'));assert.ok(opts.body instanceof FormData);
  assert.equal(opts.body.get('model'),'gpt-4o-mini-transcribe');
  return Response.json({text:'안녕하세요 피부 분석용 모바일 앱을 만들고 싶습니다.'});
 },async()=>{
  const voice='data:audio/webm;base64,'+Buffer.alloc(512,7).toString('base64');
  const result=await ideaNote({method:'POST',body:{action:'transcribe',audio:voice}},response());
  assert.equal(result.status,200);assert.match(result.body.text,/피부 분석/);
 });
});
test('Blueprint runtime retries one incomplete output then returns completed compact Blueprint',async()=>{
 let calls=0;
 await withMockFetch(async(url,opts)=>{
  calls++;const req=JSON.parse(opts.body);
  assert.equal(req.text.format.name,'startup_os_compact_blueprint');
  assert.equal(req.model,'gpt-4.1-mini');
  if(calls===1)return Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:300,output_tokens:600,output_tokens_details:{reasoning_tokens:60}}});
  return Response.json({status:'completed',id:'resp_skin',model:req.model,usage:{input_tokens:300,output_tokens:700},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(bp)}]}]});
 },async()=>{
  const result=await runtime({method:'POST',headers:{},body:{mode:'analyze',project:makeProject()}},response());
  assert.equal(calls,2);assert.equal(result.status,200);
  assert.equal(result.body.usage.attempts,2);assert.equal(result.body.analysis.venture_name,'MySkin AI');
  assert.ok(result.body.cost.provider_usd>0);
 });
});
test('Incomplete after retry returns actionable failure, not fake success',async()=>{
 let calls=0;
 await withMockFetch(async()=>{calls++;return Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:100,output_tokens:200}})},async()=>{
  const result=await runtime({method:'POST',headers:{},body:{mode:'analyze',project:makeProject()}},response());
  assert.equal(calls,2);assert.equal(result.status,502);assert.equal(result.body.code,'MODEL_INCOMPLETE');assert.equal(result.body.attempts,2);
 });
});
test('Invalid short note is rejected without contacting the provider',async()=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test-key';
 try{const result=await ideaNote({method:'POST',body:{action:'structure',note:'hello'}},response());assert.equal(result.status,400);}
 finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
