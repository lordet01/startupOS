'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
process.env.OPENAI_API_KEY='mock-code-agent';
const Editor=require('../lib/code-editor'),Agent=require('../lib/code-agent'),B=require('../lib/build-contract');
const A=require('../lib/assemble'),API=require('../api/build'),Refine=require('../api/refine');
const original=()=>B.descriptor({_sessionId:'vs_code_agent_test',name:'MySkin'},'skin',true);
const source=Editor.apply('skin',[]);
const fragment='id="capture">📷 카메라</button>';
assert.ok(source['capabilities/skin.js'].includes(fragment));
const styleBase='.primary{background:var(--accent);color:white;border-color:var(--accent)}';
assert.ok(source['capabilities/app.css'].includes(styleBase));
const edits=[
 {file:'capabilities/skin.js',search:fragment,replace:'id="capture"><span class="camera-red-icon">📷</span> 카메라</button>'},
 {file:'capabilities/app.css',search:styleBase,replace:styleBase+'.camera-red-icon{color:#ff283a;background:#fff;border-radius:6px;padding:3px}'}
];
function res(){return{code:200,setHeader(){},status(n){this.code=n;return this},json(x){return{status:this.code,body:x}},end(){return{status:this.code}}};}
function mockResponse(){return{status:'completed',model:'gpt-4.1',id:'resp_red_icon',usage:{input_tokens:1600,output_tokens:200},
 output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'촬영 버튼의 카메라 아이콘을 빨간색으로 수정합니다.',reason:'기존 이모지 대신 스타일을 지정합니다.',
 edits:edits.map(x=>({...x,explanation:'앱 렌더링 코드 수정'})),
 manual_tests:['버튼을 눌러 실제 카메라가 열리는지 확인'],external_steps:[]})}]}]};}
test('real markup and CSS edits instead of unsupported-settings refusal',()=>{
 const result=Editor.verify('skin',edits);
 assert.equal(result.smoke.status,'passed');
 assert.match(result.files['capabilities/skin.js'],/camera-red-icon/);
 assert.match(result.files['capabilities/app.css'],/color:#ff283a/);
});
test('unsafe code or wrong file is blocked',()=>{
 assert.throws(()=>Editor.apply('skin',[{file:'../../secrets.txt',search:'hello',replace:'goodbye'}]),/허용되지/);
 assert.throws(()=>Editor.apply('skin',[{file:'capabilities/skin.js',search:fragment,replace:'fetch("https://leak.example")'}]),/보안 검토/);
 assert.throws(()=>Editor.apply('skin',[{file:'capabilities/skin.js',search:fragment,replace:'<script>alert(1)</script>'}]),/보안 검토/);
});
test('syntax breaking edits fail before preview',()=>{
 assert.throws(()=>Editor.verify('skin',[{file:'capabilities/skin.js',search:fragment,replace:"');\n((((INVALID JS"}]),/구문 오류/);
});
test('unmatched and ambiguous source regions rejected',()=>{
 assert.throws(()=>Editor.apply('skin',[{file:'capabilities/skin.js',search:'XYZ_NOT_IN_SOURCE',replace:'something'}]),/현재 버전/);
 assert.throws(()=>Editor.apply('skin',[{file:'capabilities/skin.js',search:'function',replace:'somefunction'}]),/여러 곳/);
});
test('LLM receives live source/screenshot and returns tested code patch',async()=>{
 let request;
 const image='data:image/jpeg;base64,'+Buffer.concat([Buffer.from([255,216]),Buffer.alloc(600,28)]).toString('base64');
 const build=original();
 const output=await Agent.proposeCode({kind:'skin',buildId:build.bid,sessionId:build.sid,message:'촬영 버튼 카메라 아이콘 빨간색으로 변경',priorBuild:build,screenshot:image,
  fetchImpl:async(url,options)=>{request=JSON.parse(options.body);return Response.json(mockResponse())}});
 assert.equal(output.status,'code_patch');assert.equal(output.newEdits.length,2);
 assert.equal(output.generated_checks[1].status,'passed');
 assert.equal(request.input[1].content[1].type,'input_image');
 assert.match(request.input[1].content[0].text,/getUserMedia/);
 assert.equal(request.store,false);
});
test('chat API code action no longer uses preset menu',async()=>{
 const oldFetch=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return Response.json(mockResponse())};
 try{
  const build=original();
  const result=await Refine({method:'POST',headers:{'sec-fetch-site':'same-origin'},body:{action:'code',kind:'skin',sessionId:build.sid,buildId:build.bid,priorBuild:build,message:'카메라 아이콘 빨간색으로 변경'}},res());
  assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.status,'code_patch');assert.equal(calls,1);
 }finally{global.fetch=oldFetch}
});
test('approved source patch changes packaged JS and CSS and parent Build',async()=>{
 const prior=original();
 const response=await API({method:'POST',body:{action:'refine-and-assemble',approved:true,project:{_sessionId:prior.sid,name:prior.name},priorBuild:prior,codeEdits:edits}},res());
 assert.equal(response.status,200,JSON.stringify(response.body));
 const build=response.body.build,packed=A.pack(build);
 assert.equal(build.codeEdits.length,2);assert.notEqual(build.bid,prior.bid);assert.equal(build.parentBuildId,prior.bid);
 assert.ok(build.refinementChanges.some(x=>x.file==='capabilities/skin.js'));
 assert.match(A.html(build,true),/camera-red-icon/);
 assert.match(packed.find(x=>x.file==='capabilities/skin.js').data,/camera-red-icon/);
 assert.match(packed.find(x=>x.file==='capabilities/app.css').data,/color:#ff283a/);
 assert.ok(A.validateArtifacts(build).every(x=>x.status==='passed'));
 assert.equal(B.decodeDescriptor(B.encodeDescriptor(build)).bid,build.bid);
});
test('two revisions preserve earlier changes, cannot discard code history',async()=>{
 const first=await API({method:'POST',body:{action:'refine-and-assemble',approved:true,project:{_sessionId:'vs_code_agent_test',name:'MySkin'},priorBuild:original(),codeEdits:edits}},res());
 const prev=first.body.build;
 const nextEdit={file:'capabilities/skin.js',search:'camera-red-icon',replace:'camera-red-icon camera-larger'};
 const second=await API({method:'POST',body:{action:'refine-and-assemble',approved:true,project:{_sessionId:prev.sid,name:prev.name},priorBuild:prev,codeEdits:[...edits,nextEdit]}},res());
 assert.equal(second.status,200,JSON.stringify(second.body));assert.equal(second.body.build.refinementRevision,2);
 assert.match(A.html(second.body.build,true),/camera-red-icon camera-larger/);
 assert.equal(second.body.build.codeEdits.length,3);
 const truncated=await API({method:'POST',body:{action:'refine-and-assemble',approved:true,project:{_sessionId:prev.sid,name:prev.name},priorBuild:prev,codeEdits:[nextEdit]}},res());
 assert.equal(truncated.status,409);assert.equal(truncated.body.code,'CODE_HISTORY_MISMATCH');
});
test('without approval source cannot be changed',async()=>{
 const build=original();
 const no=await API({method:'POST',body:{action:'refine-and-assemble',approved:false,project:{_sessionId:build.sid},priorBuild:build,codeEdits:edits}},res());
 assert.equal(no.status,422);
});
