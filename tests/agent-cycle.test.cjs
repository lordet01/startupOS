'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {projectContext}=require('../lib/venture-context');
const runtime=require('../api/runtime');
function project(){
 return {
  _sessionId:'vs_agent_test_2026',name:'ReceiptLens OCR',idea:'영수증 OCR 가계부',
  problem:'품목별 소비 파악 어려움',customer:'가족',price:2.99,budget:100,
  mvpFeatures:['촬영','OCR','저장'],serviceFlow:[{step:1,title:'촬영',user_action:'촬영',system_action:'인식'}],
  techStack:[{area:'OCR',service:'OpenAI',monthly_cost_usd:3}],
  costs:Array.from({length:100},(_,i)=>['Runtime','Provider','Cycle',.02]),
  agentCycleHistory:Array.from({length:200},(_,i)=>({bottleneck:'X'.repeat(200),role_notes:{ceo:'X'.repeat(1000)}})),
  _events:Array.from({length:100},()=>({message:'X'.repeat(1000)})),
  prototype:{index_html:'<html>'+('VERY_LARGE_HTML'.repeat(10000))+'</html>'},
  functionalBuild:{bid:'b_12345',checks:Array.from({length:70},()=>({message:'M'.repeat(1000)}))},
  metrics:{visitors:100000,activation:25,paid:20,mrr:10000}, // seeded, not connected
  metricsSource:'not_connected'
 };
}
function res(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(d){return {status:this.code,body:d};},end(){return {status:this.code};}};}
test('cycle strips generated code, long histories, seeded metrics and tokens',()=>{
 const p=project(),ctx=projectContext(p,'cycle'),raw=JSON.stringify(ctx);
 assert.ok(raw.length<7000,raw.length);
 for(const field of ['prototype','index_html','agentCycleHistory','_events','checks','tokens','costs'])assert.ok(!raw.includes(field),field);
 assert.equal(ctx.session_id,p._sessionId);assert.equal(ctx.metrics.source,'not_connected');
 assert.match(ctx.metrics.note,/No verified/);
});
test('analyze payload stays small and preserves brief fields',()=>{
 const ctx=projectContext({...project(),idea:'Idea'.repeat(300)},'analyze');
 assert.ok(JSON.stringify(ctx).length<12000);
 assert.equal(ctx.idea.length,700);
});
test('GET runtime status does not reference nonexistent variables',async()=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test';
 try{
  const output=await runtime({method:'GET',headers:{}},res());
  assert.equal(output.status,200);assert.equal(output.body.ok,true);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('real cycle handler sends sanitized context and uses separate schema',async()=>{
 const oldKey=process.env.OPENAI_API_KEY,oldFetch=global.fetch;process.env.OPENAI_API_KEY='test-token';
 const cycle={
  bottleneck:'기능 검증 미완료',evidence:'검증 상태 없음',evidence_level:'missing',
  decision:'refine',rationale:'첫 사용자 검증 전',experiment:'테스트 영수증 5장 수집',
  next_action:'Build Studio에서 OCR 연동 검증 실행',success_metric:'OCR 성공률',
  success_threshold:'5장 중 5장 구조화',estimated_external_cost_usd:.05,
  human_approval_required:false,missing_evidence:['실측 정확도'],
  role_notes:{ceo:'검증 우선',market:'사용자 5명 확보',product:'수정 UX 검사',tech:'OCR API 검증',finance:'원가 기록',legal:'사진 동의',growth:'활성화 측정'}
 };
 let received;
 global.fetch=async(url,opts)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');received=JSON.parse(opts.body);
  return Response.json({status:'completed',id:'resp_agent_test',model:'test-model',usage:{input_tokens:350,output_tokens:300},
    output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(cycle)}]}]});
 };
 try{
  const output=await runtime({method:'POST',headers:{},body:{mode:'cycle',project:project()}},res());
  assert.equal(output.status,200);
  assert.equal(output.body.mode,'cycle');
  assert.equal(output.body.cycle.next_action,cycle.next_action);
  assert.equal(output.body.analysis,undefined);
  assert.equal(received.text.format.name,'startup_os_cycle_decision');
  assert.ok(JSON.stringify(received).length<10000);
  assert.ok(!JSON.stringify(received).includes('VERY_LARGE_HTML'));
  assert.equal(received.input[1].content.includes('No verified'),true);
 }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
