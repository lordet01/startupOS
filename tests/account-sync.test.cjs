'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const file=x=>fs.readFileSync(path.join(ROOT,x),'utf8');
const handler=require('../api/cloud-config');
async function request(method='GET'){
 let status=200,body=null,headers={};
 const res={setHeader:(k,v)=>headers[k]=v,status(n){status=n;return this},json(v){body=v;return this}};
 await handler({method},res);
 return {status,body,headers};
}
test('cloud config is disabled when no Firebase web app is configured',async()=>{
 const old=['FIREBASE_API_KEY','FIREBASE_AUTH_DOMAIN','FIREBASE_PROJECT_ID','FIREBASE_APP_ID'].map(k=>[k,process.env[k]]);
 try{
  for(const [k] of old)delete process.env[k];
  const r=await request();
  assert.equal(r.status,200);assert.equal(r.body.enabled,false);
  assert.equal(r.body.firebase,undefined);
  assert.equal(r.headers['Cache-Control'],'no-store');
 }finally{for(const [k,v] of old){if(v===undefined)delete process.env[k];else process.env[k]=v}}
});
test('cloud config exposes only public Firebase Web App settings',async()=>{
 const pairs={FIREBASE_API_KEY:'public-key',FIREBASE_AUTH_DOMAIN:'project.firebaseapp.com',FIREBASE_PROJECT_ID:'project',FIREBASE_APP_ID:'1:42:web:public'};
 const old=Object.fromEntries(Object.keys(pairs).map(k=>[k,process.env[k]]));
 try{
  Object.assign(process.env,pairs);
  const r=await request();
  assert.equal(r.body.enabled,true);
  assert.deepEqual(Object.keys(r.body.firebase).sort(),['apiKey','appId','authDomain','projectId'].sort());
  assert.ok(!JSON.stringify(r.body).includes('VERCEL_PUBLISH_TOKEN'));
  assert.equal((await request('POST')).status,405);
 }finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
});
test('cloud, dashboard and studio JavaScript parse and mount cloud account client',()=>{
 const cloud=file('cloud-sync.js');
 new vm.Script(cloud,{filename:'cloud-sync.js'});
 new vm.Script(file('builder/studio.js'),{filename:'builder/studio.js'});
 const index=file('index.html'),inline=index.split('<script>')[1]?.split('</script>')[0];
 new vm.Script(inline,{filename:'index.html:inline-script'});
 assert.match(index,/cloud-sync\.js/);
 assert.match(index,/StartupOSCloud\.connect/);
 assert.match(index,/My Apps/);
 assert.match(file('builder/index.html'),/cloud-sync\.js/);
 assert.match(file('builder/studio.js'),/StartupOSCloud\.connect/);
 assert.match(cloud,/signInWithPopup/);
 assert.match(cloud,/createUserWithEmailAndPassword/);
 assert.match(cloud,/sendPasswordResetEmail/);
 assert.match(cloud,/importLocal/);
 assert.match(cloud,/exportLocal/);
 assert.match(cloud,/runTransaction/);
});
test('owner-only Firestore rules are included',()=>{
 const rules=file('firebase/firestore.rules');
 assert.match(rules,/request\.auth\.uid == userId/);
 assert.match(rules,/request\.resource\.data\.payload\._sessionId == sessionId/);
 assert.match(rules,/allow get, list: if owner\(\)/);
});
