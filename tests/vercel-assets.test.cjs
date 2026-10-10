'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Asset=require('../lib/source-assets'),B=require('../lib/build-contract'),R=require('../lib/repair'),A=require('../lib/assemble');
const d=()=>B.descriptor({_sessionId:'vs_asset_test_01',name:'MySkin Smoke'},'skin',true);
const dummy={...d()};
const issue={kind:'skin',code:'RUNTIME_OR_UX_FAILURE',stage:'image_analysis',message:"ENOENT: no such file or directory, open '/var/task/capabilities/data.js'",buildId:dummy.bid,sourceHash:dummy.sourceHash,source:'user_report'};
test('statically traced files exist and have nonempty payloads',()=>{
 const health=Asset.diagnose();
 for(const p of ['capabilities/data.js','capabilities/skin.js','lib/assemble.js','lib/repair.js','lib/source-assets.js','fixtures/skin-face.jpg']){
  assert.ok(health.paths[p]>100,p);
 }
});
test('source hash uses static asset registry instead of reading untraced paths dynamically',()=>{
 assert.match(B.sourceHash(),/^[0-9a-f]{64}$/);
 assert.equal(B.sourceHash(),B.sourceHash());
});
test('Vercel ENOENT maps to reviewed packaging repair, not photo workflow',()=>{
 const plan=R.planRepair(issue,dummy);
 assert.equal(plan.status,'PATCH_AVAILABLE');assert.equal(plan.repairId,'vercel-function-assets-v1');
 assert.match(plan.after,/명시적으로 추적/);
});
test('ENOENT repair creates distinct new build with package integrity checked',()=>{
 const plan=R.planRepair(issue,dummy),next=R.selectRepair(d(),plan.repairId);
 assert.equal(next.repairId,'vercel-function-assets-v1');
 const files=A.pack(next);
 assert.ok(files.some(x=>x.file==='capabilities/skin.js'));
 assert.ok(files.some(x=>x.file==='api/skin-analysis.js'));
 assert.ok(A.validateArtifacts(next).every(x=>x.status==='passed'));
 assert.notEqual(B.artifactHash(dummy),B.artifactHash(next));
});
