'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.OPENAI_API_KEY='mock-refinement-key-only';
const Config=require('../lib/refinement-config'),B=require('../lib/build-contract');
const A=require('../lib/assemble'),Skin=require('../lib/skin-service');
const refineRoute=require('../api/refine'),buildHandler=require('../api/build');
const F=require('../lib/receipt-fixture');
function project(){return{_sessionId:'vs_refine_tests_01',name:'MySkin AI',idea:'피부 사진과 성분 추천'};}
const old=()=>B.descriptor(project(),'skin',true);
function response(){return {statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(d){return {status:this.statusCode,body:d}},end(){return{status:this.statusCode}}}}
function improved(){return Config.normalize('skin',{result_title:'내 피부 리포트',photo_guide:'그림자가 없는 곳에서 정면 촬영',analysis_button:'피부 상태 확인하기',analysis_focus:'texture',detail_level:'detailed',result_order:['ingredients','observations'],ingredient_limit:3,show_certainty:false,show_cautions:true})}
const textPlan=(config,status='config_patch')=>({status,response:'결과 화면의 순서와 설명 길이를 개선하겠습니다.',reason:'성분군부터 보고 싶다는 요청',config,manual_test:['사진 선택 후 성분 카드 3개 이하','상세 관찰 문장 확인'],unsupported_requests:[]});
test('safe refinement configuration merges defaults and blocks unsafe changes',()=>{
 const c=improved();assert.equal(c.result_title,'내 피부 리포트');assert.equal(c.analysis_focus,'texture');
 assert.throws(()=>Config.normalize('skin',{show_cautions:false}),/주의사항/);
 assert.throws(()=>Config.normalize('skin',{arbitrary_js:'alert(1)'}),/허용되지/);
 assert.throws(()=>Config.normalize('skin',{result_title:'<script>'}),/유효하지/);
 assert.equal(Config.diff(null,c).length>5,true);
});
test('artifact changes physically when a new supported refinement is approved',()=>{
 const prev=old(),config=improved(),next=B.descriptor({...project(),refinementConfig:config},'skin',true);
 assert.notEqual(B.artifactHash(prev),B.artifactHash(next));
 assert.equal(next.refinement.result_title,'내 피부 리포트');
 assert.ok(A.validateArtifacts(next).every(x=>x.status==='passed'));
 const html=A.html(next,true);
 assert.ok(html.includes('내 피부 리포트'));
 assert.ok(html.includes('ingredients'));
});
test('refine-and-assemble creates a real new Build with parent Build identity and config diff',async()=>{
 const prev=old(),config=improved();
 const res=await buildHandler({method:'POST',body:{action:'refine-and-assemble',approved:true,project:project(),priorBuild:prev,config}},response());
 assert.equal(res.status,200,JSON.stringify(res.body));
 const build=res.body.build;
 assert.equal(build.parentBuildId,prev.bid);
 assert.equal(build.refinementRevision,1);
 assert.notEqual(build.bid,prev.bid);
 assert.ok(build.refinementChanges.some(x=>x.key==='result_order'));
 assert.ok(res.body.repairTrace.some(x=>x.step==='chat_refinement'));
 assert.ok(A.pack(build).find(x=>x.file==='index.html').data.includes('내 피부 리포트'));
});
test('refine-and-assemble rejects unapproved and unchanged proposals',async()=>{
 const prev=old();
 const rejected=await buildHandler({method:'POST',body:{action:'refine-and-assemble',approved:false,project:project(),priorBuild:prev,config:improved()}},response());
 assert.equal(rejected.status,422);
 const noChange=await buildHandler({method:'POST',body:{action:'refine-and-assemble',approved:true,project:project(),priorBuild:prev,config:Config.normalize('skin',null)}},response());
 assert.equal(noChange.status,422);assert.equal(noChange.body.code,'NO_EXECUTABLE_CHANGE');
});
test('repeated refinement increments revision and changes target safely',async()=>{
 const p=old();
 const first=await buildHandler({method:'POST',body:{action:'refine-and-assemble',approved:true,project:project(),priorBuild:p,config:improved()}},response());
 const secondConfig={...improved(),ingredient_limit:2,result_title:'리포트 2차 수정'};
 const second=await buildHandler({method:'POST',body:{action:'refine-and-assemble',approved:true,project:project(),priorBuild:first.body.build,config:secondConfig}},response());
 assert.equal(second.status,200);
 assert.equal(second.body.build.refinementRevision,2);
 assert.equal(second.body.build.parentBuildId,first.body.build.bid);
 assert.equal(second.body.build.refinement.ingredient_limit,2);
});
test('real analysis API receives chosen skin focus and enforces ingredient limit',async()=>{
 let sent;
 const positive={image_status:'face_visible',summary:'시각적 관찰',observations:[{property:'visible_texture',description:'일부 표면 질감이 보입니다.',certainty:'low'}],
 ingredient_groups:[1,2,3,4].map((x,i)=>({ingredient:['niacinamide','ceramides','glycerin','panthenol'][i],reason:'일반적인 성분',caution:'자극 주의'})),limitations:[]};
 const result=await Skin.analyze(F.fixture().image,{analysis_focus:'texture',detail_level:'detailed',ingredient_limit:2,fetchImpl:async(url,options)=>{
   sent=JSON.parse(options.body);return Response.json({status:'completed',id:'resp_texture',model:'gpt-4.1-mini',
   output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(positive)}]}],usage:{input_tokens:210,output_tokens:155}});
 }});
 assert.equal(result.result.ingredient_groups.length,2);
 assert.match(sent.input[1].content[0].text,/visible surface texture/);
 assert.match(sent.input[1].content[0].text,/2개 성분군/);
});
test('screenshot and text are sent together to LLM, with no source execution',async()=>{
 const oldFetch=global.fetch;let sent;
 const safeImage='data:image/jpeg;base64,'+Buffer.concat([Buffer.from([255,216]),Buffer.alloc(650,17)]).toString('base64');
 global.fetch=async(url,options)=>{
  sent=JSON.parse(options.body);
  return Response.json({status:'completed',id:'resp_refine',model:'gpt-4.1-mini',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(textPlan(improved()))}]}],
   usage:{input_tokens:950,output_tokens:450}});
 };
 try{
  const res=await refineRoute.propose({kind:'skin',sessionId:'vs_refine_tests_01',buildId:old().bid,message:'결과 화면에서 성분을 먼저 보여주고 설명을 늘려줘.',currentConfig:null,history:[],screenshot:safeImage});
  assert.equal(res.ok,true);assert.equal(res.status,'config_patch');assert.ok(res.changes.length>0);
  assert.equal(sent.input[1].content[1].type,'input_image');
  assert.equal(sent.store,false);assert.equal(res.screenshot_used,true);
 }finally{global.fetch=oldFetch}
});
test('unsupported structural features cannot silently become a functional Build',async()=>{
 const oldFetch=global.fetch;
 global.fetch=async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({...textPlan(Config.normalize('skin',null),'requires_code'),response:'새 쇼핑몰 API 연동은 코드 개발이 필요합니다.',unsupported_requests:['쇼핑몰 API 연동']})}]}]});
 try{const result=await refineRoute.propose({kind:'skin',sessionId:'vs_refine_tests_01',buildId:old().bid,message:'새 쇼핑몰 API 추가해줘'});assert.equal(result.status,'requires_code');assert.equal(result.changes.length,0);}finally{global.fetch=oldFetch}
});
