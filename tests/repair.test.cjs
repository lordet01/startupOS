'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const B=require('../lib/build-contract'),R=require('../lib/repair'),A=require('../lib/assemble');
const Build=require('../api/build'),Fixtures=require('../lib/smoke-fixtures');
const project={_sessionId:'vs_repair_backend_a',name:'MySkin AI'};
function prev(){return B.descriptor(project,'skin',true);}
function issue(desc,code='PHOTO_FLOW_STUCK'){return{kind:'skin',source:'user_report',code,stage:'photo_ready',message:'사진 촬영 후 분석으로 넘어가지 않음',buildId:desc.bid,sourceHash:desc.sourceHash};}
async function invoke(body){const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(v){return{status:this.code,body:v}}};return Build({method:'POST',body},res);}
test('cached web face image has pinned provenance and real JPEG content',()=>{
 const face=Fixtures.fixture('skin_face');
 assert.ok(face.dataUrl.startsWith('data:image/jpeg;base64,'));
 assert.ok(face.bytes>5000);assert.match(face.sha256,/^[a-f0-9]{64}$/);
 assert.equal(Fixtures.CATALOG.skin_face.expected,'face_visible');
});
test('repair plan names the root issue, target and checks',()=>{
 const before=prev(),plan=R.planRepair(issue(before),before);
 assert.equal(plan.status,'PATCH_AVAILABLE');assert.equal(plan.repairId,'skin-photo-flow-v2');
 assert.ok(plan.targets===undefined||plan.target.includes('capabilities/skin-photo-repair.js'));
 assert.ok(plan.tests.includes('skin_repair_next_step_visible'));
});
test('unmatched fix must never claim automatically repaired',()=>{
 const before=prev(),plan=R.planRepair(issue(before,'live_face_vision_and_ingredients'),before);
 assert.equal(plan.status,'NEEDS_CODE_CHANGE');
});
test('repair-and-assemble creates a truly different artifact and contains patch code',async()=>{
 const prior=prev(),i=issue(prior),base=A.pack(prior);
 const rsp=await invoke({action:'repair-and-assemble',project,priorBuild:prior,issue:i,approved:true,acceptedScope:true});
 assert.equal(rsp.status,200,JSON.stringify(rsp.body));
 const build=rsp.body.build;
 assert.ok(build.bid!==prior.bid);assert.equal(build.repairId,'skin-photo-flow-v2');
 const files=A.pack(build.descriptor);
 assert.equal(base.some(x=>x.file==='capabilities/skin-photo-repair.js'),false);
 assert.equal(files.some(x=>x.file==='capabilities/skin-photo-repair.js'),true);
 assert.ok(files.find(x=>x.file==='index.html').data.includes('skin-photo-repair.js'));
 assert.ok(files.find(x=>x.file==='sw.js').data.includes('skin-photo-repair.js'));
 assert.equal(rsp.body.repairTrace.some(x=>x.step==='code_patch'&&x.status==='passed'),true);
 assert.equal(A.validateArtifacts(build.descriptor).every(x=>x.status==='passed'),true);
});
test('repair requires explicit approval',async()=>{
 const old=prev(),rsp=await invoke({action:'repair-and-assemble',project,priorBuild:old,issue:issue(old),approved:false,acceptedScope:true});
 assert.equal(rsp.status,422);assert.equal(rsp.body.code,'REPAIR_APPROVAL_REQUIRED');
});
test('repair refuses unreviewed patches, preserving old Build',async()=>{
 const old=prev(),rsp=await invoke({action:'repair-and-assemble',project,priorBuild:old,issue:issue(old,'UNKNOWN_BUG'),approved:true,acceptedScope:true});
 assert.equal(rsp.status,422);assert.equal(rsp.body.code,'REPAIR_NEEDS_CODE_CHANGE');
});
test('the issue must bind to the original session build',async()=>{
 const old=prev(),rsp=await invoke({action:'repair-and-assemble',project,priorBuild:old,issue:{...issue(old),buildId:'b_wrong_build'},approved:true,acceptedScope:true});
 assert.equal(rsp.status,409);assert.equal(rsp.body.code,'REPAIR_BUILD_MISMATCH');
});
