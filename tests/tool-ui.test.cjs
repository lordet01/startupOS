'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('builder/studio.js','utf8');
const setup=source.slice(source.indexOf('function setupWorkspace(){'),source.indexOf('function focusHash(){'));
function workspace(hash,withBuild=true){
 const ids=['scope-stage','repair-stage','autobuildHost','diagnostics-stage',...(withBuild?['artifact-stage','refineHost','verify-stage','deploy-stage']:[]),'phone-stage'];
 const elements=new Map(ids.map(id=>[id,{id,hidden:false,remove(){elements.delete(id);}}]));
 const links=['scope-stage','autobuildHost','refineHost','verify-stage','deploy-stage'].map(id=>({hash:'#'+id,attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}}));
 const root={querySelectorAll:s=>s==='.studioTabs a'?links:[],appendChild:e=>elements.set(e.id,e)};
 const context={root,location:{hash},document:{getElementById:id=>elements.get(id),createElement:()=>({})}};
 vm.runInNewContext(setup+';setupWorkspace();',context);
 return {elements,links,context};
}
test('Studio deep links isolate the requested work area without removing other stateful panels',()=>{
 const {elements,links,context}=workspace('#refineHost');
 assert.equal(elements.get('refineHost').hidden,false);assert.equal(elements.get('artifact-stage').hidden,false);
 assert.equal(elements.get('autobuildHost').hidden,true);assert.equal(elements.get('scope-stage').hidden,true);
 assert.equal(links[2].attrs['aria-current'],'page');
 context.location.hash='#autobuildHost';vm.runInNewContext('setupWorkspace()',context);
 assert.equal(elements.get('refineHost').hidden,true);assert.equal(elements.get('autobuildHost').hidden,false);
 assert.ok(elements.has('refineHost'),'switching tabs must retain chat, uploads and preview nodes');
});
test('Phone deep links expose deployment and device evidence together; missing builds give an actionable prerequisite',()=>{
 const {elements,links}=workspace('#phone-stage');
 assert.equal(elements.get('deploy-stage').hidden,false);assert.equal(elements.get('phone-stage').hidden,false);assert.equal(links[4].attrs['aria-current'],'page');
 const missing=workspace('#refineHost',false);assert.match(missing.elements.get('studioEmptyPanel').innerHTML,/#scope-stage/);
});
test('Firebase serves the same shared design system behind the existing authentication gate',()=>{
 assert.equal(fs.readFileSync('.firebase-build/functions/web/tool-ui.css','utf8'),fs.readFileSync('tool-ui.css','utf8'));
 for(const file of ['index.html','builder/index.html'])assert.match(fs.readFileSync('.firebase-build/functions/web/'+file,'utf8'),/href="\/tool-ui.css/);
 assert.equal(fs.existsSync('.firebase-build/public/index.html'),false);
 assert.match(fs.readFileSync('firebase/runtime/web.cjs','utf8'),/await access.authenticate\(req\)/);
});

test('Verification failures show their recovery action in the verification tab',()=>{
 const {elements}=workspace('#verify-stage');
 assert.equal(elements.get('verify-stage').hidden,false);
 assert.equal(elements.get('repair-stage').hidden,false);
});
test('UI deployment discovers only the web function and leaves the API unpinned',()=>{
 require('node:child_process').execFileSync(process.execPath,['firebase/build-ui.cjs']);
 const config=JSON.parse(fs.readFileSync('firebase.ui.json','utf8'));
 const entry=fs.readFileSync('.firebase-ui-build/functions/index.cjs','utf8');
 assert.deepEqual([...entry.matchAll(/exports\.(\w+)=/g)].map(m=>m[1]),['startupWeb']);
 assert.doesNotMatch(entry,/onDocumentCreated|OPENAI_API_KEY/);
 assert.equal(config.firestore,undefined);
 assert.equal(config.hosting.rewrites.find(r=>r.source==='/api/**').function.pinTag,undefined);
 assert.equal(config.hosting.rewrites.find(r=>r.source==='**').function.pinTag,true);
 assert.equal(fs.existsSync('.firebase-ui-build/public/index.html'),false);
 assert.equal(fs.readFileSync('.firebase-ui-build/functions/web/tool-ui.css','utf8'),fs.readFileSync('tool-ui.css','utf8'));
});
