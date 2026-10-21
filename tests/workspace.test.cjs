'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const W=require('../workspace-core'),Auth=require('../lib/account-auth');
const session=(name='Skin',sid='vs_skin_account')=>({_sessionId:sid,name,idea:'피부 분석',budget:100,costs:[],_updatedAt:'2026-10-21T00:00:00Z'});
function memory(){const data=new Map();return{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
test('Mac browser sessions remain in guest storage and are never attached to a different account',()=>{
 const m=memory(),legacy={activeId:'vs_skin_account',sessions:[session()]};m.setItem(W.KEY,JSON.stringify(legacy));
 const store=W.storage(m);assert.deepEqual(store.read(),legacy);
 assert.equal(store.activate('alpha').sessions.length,0);
 const alpha={activeId:'vs_alpha_app',sessions:[session('Alpha private','vs_alpha_app')]};store.write(alpha);
 assert.equal(store.activate('beta').sessions.length,0);
 assert.equal(store.guest().sessions[0].name,'Skin');
 assert.deepEqual(store.activate('alpha'),alpha);
 assert.deepEqual(store.activate(null),legacy);
});
test('refresh parks private cache before rendering and restores the correct account without overwriting it',()=>{
 const m=memory(),first=W.storage(m);first.activate('alpha');first.write({activeId:'vs_private_1',sessions:[session('Private','vs_private_1')]});
 const reload=W.storage(m);assert.equal(reload.owner(),'guest');assert.equal(reload.read().sessions.length,0);
 assert.equal(reload.activate('alpha').sessions[0].name,'Private');
 const twice=W.storage(m);assert.equal(twice.read().sessions.length,0);assert.equal(twice.activate('alpha').sessions[0].name,'Private');
});
test('two open tabs write only to their own account namespace',()=>{
 const m=memory(),tabA=W.storage(m),tabB=W.storage(m);
 tabA.activate('alpha');tabA.write({sessions:[session('A','vs_account_a')]});
 tabB.activate('beta');tabB.write({sessions:[session('B','vs_account_b')]});
 assert.equal(tabA.read().sessions[0].name,'A');assert.equal(tabB.read().sessions[0].name,'B');
 tabA.write({sessions:[session('A update','vs_account_a')]});
 assert.equal(tabB.read().sessions[0].name,'B');
});
test('offline edit and remote edit are compared against the last acknowledged revision, never timestamps',()=>{
 const base=session(),local={...base,name:'offline'},remote={...base,name:'other device',_updatedAt:'2000-01-01'};
 assert.equal(W.merge(local,remote,base).action,'conflict');
 assert.equal(W.merge(local,base,base).action,'keep');
 assert.equal(W.merge(base,remote,base).action,'accept');
 assert.equal(W.merge(local,remote,null).action,'conflict');
 assert.equal(W.merge(remote,remote,base).action,'accept');
});
test('duplicating a venture does not duplicate billed costs, verified builds or deployment ownership',()=>{
 const source={...session(),functionalBuild:{sid:'vs_skin_account',deployment:{id:'dpl_old'}},functionalChat:[{text:'private old build'}],approvals:[{}],ledger:[{usd:50}],experiments:[{}],metricsSource:'connected',prototype:{},deployment:{}};
 const copy=W.duplicate(source);assert.notEqual(copy._sessionId,source._sessionId);assert.equal(copy.functionalBuild,undefined);assert.equal(copy.deployment,undefined);
 assert.equal(copy.functionalChat,undefined);assert.equal(copy.ledger,undefined);assert.deepEqual(copy.costs,[]);assert.equal(copy.metricsSource,'not_connected');
 assert.ok(source.functionalBuild);
});
test('approval transitions reserve budget, prevent double processing and require real completion evidence',()=>{
 const p=session();p.costs=[['Analysis','OpenAI','Estimated tokens',20]];
 const a=W.approval(p,{title:'배포 검증',type:'deploy',estimatedUsd:30});W.transition(p,a.id,'approved');
 assert.equal(W.totals(p).reserved,30);assert.equal(W.totals(p).left,49);
 assert.throws(()=>W.transition(p,a.id,'approved'),/이미/);
 assert.throws(()=>W.transition(p,a.id,'completed',''),/8자/);
 W.transition(p,a.id,'completed','배포 URL을 실기기에서 확인함');assert.equal(W.totals(p).reserved,0);
 const b=W.approval(p,{title:'광고 집행',estimatedUsd:1000});assert.throws(()=>W.transition(p,b.id,'approved'),/예산/);assert.equal(b.status,'pending');
});
test('actual external expenses and test data are kept separate from fee-bearing token estimates',()=>{
 const p=session();p.costs=[['Manual test','Fake','fixture',9000],['Real model','OpenAI','estimate',2]];p.ledger=[{usd:8,feeEligible:false}];
 const t=W.totals(p);assert.equal(t.external,10);assert.equal(t.fee,.1);assert.equal(t.total,10.1);
});
test('experiment outcome is derived from a recorded measurement and source, not an AI assertion',()=>{
 const p=session(),e=W.experiment(p,{title:'가입 전환',hypothesis:'입력 단계를 줄이면 가입 전환율이 높아진다.',metric:'전환율 (%)',threshold:15});
 assert.throws(()=>W.result(p,e.id,20,''),/근거/);assert.throws(()=>W.result(p,e.id,'','분석 도구 리포트 확인'),/측정/);
 W.result(p,e.id,12,'10월 21일 분석 리포트: 100명 중 12명 가입');assert.equal(e.met,false);assert.equal(e.source,'manual');
 assert.throws(()=>W.result(p,e.id,22,'후속 결과를 이전 결과에 덮어쓰기'),/측정/);
});
test('Firebase token verification checks real RSA signature, issuer, audience, expiry and auth age',async()=>{
 const {generateKeyPair,SignJWT}=await import('jose'),{privateKey,publicKey}=await generateKeyPair('RS256');
 const currentDate=new Date('2026-10-21T12:00:00Z'),now=Math.floor(currentDate.getTime()/1000),projectId='startup-test';
 async function sign(values={}){return new SignJWT({auth_time:now-100,email:'alpha@example.com',...values}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(values.iss||'https://securetoken.google.com/'+projectId).setAudience(values.aud||projectId).setSubject('alpha').setIssuedAt(now-10).setExpirationTime(values.exp||now+3000).sign(privateKey);}
 const options={projectId,key:publicKey,currentDate};
 assert.equal((await Auth.verify(await sign(),options)).uid,'alpha');
 await assert.rejects(Auth.verify(await sign({aud:'another-project'}),options),/로그인 세션/);
 await assert.rejects(Auth.verify(await sign({iss:'https://attacker.invalid'}),options),/로그인 세션/);
 await assert.rejects(Auth.verify(await sign({exp:now-10}),options),/로그인 세션/);
 await assert.rejects(Auth.verify(await sign({auth_time:now+20}),options),/세션/);
 await assert.rejects(Auth.verify(await sign({auth_time:now-31*86400}),options),/세션/);
 const wrong=(await generateKeyPair('RS256')).publicKey;
 await assert.rejects(Auth.verify(await sign(),{...options,key:wrong}),/로그인 세션/);
});
test('all workspace mutation APIs reject unsigned users before any provider request once Firebase is configured',async()=>{
 const previous=process.env.FIREBASE_PROJECT_ID,fetchBefore=global.fetch;process.env.FIREBASE_PROJECT_ID='startup-test';
 let upstream=0;global.fetch=async()=>{upstream++;throw Error('Paid work must not be called');};
 try{
  for(const name of ['build','runtime','refine','idea-note','publish','receipt-ocr','skin-analysis']){
   let status,body;const res={setHeader(){},status(n){status=n;return this;},json(v){body=v;return this;}};
   await require('../api/'+name)({method:'POST',headers:{},body:{action:'assemble'}},res);
   assert.equal(status,401,name);assert.equal(body.code,'AUTH_REQUIRED',name);
  }
  assert.equal(upstream,0);
 }finally{global.fetch=fetchBefore;if(previous===undefined)delete process.env.FIREBASE_PROJECT_ID;else process.env.FIREBASE_PROJECT_ID=previous;}
});

test('Growth measurements reach Agent Cycle with an explicit manual source and bounded evidence',()=>{
 const {projectContext}=require('../lib/venture-context');
 const p={...session(),metricsSource:'manual',metricsEvidence:'10월 21일 분석 도구에서 내보낸 결과',metricsPeriod:'10/21',metrics:{visitors:100,activation:12,paid:3,revenue:25},experiments:[{title:'첫 실험',metric:'가입률',threshold:10,result:12,evidence:'리포트에서 100명 중 12명 확인'}]};
 const data=projectContext(p,'cycle');assert.equal(data.metrics.source,'manual');assert.equal(data.metrics.visitors,100);assert.equal(data.completed_experiments.length,1);assert.match(data.metrics.note,/not independently verified/);
 const missing=projectContext({...p,metricsEvidence:''},'cycle');assert.equal(missing.metrics.source,'not_connected');
});
