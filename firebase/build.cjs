'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.firebase-build');
for(const part of ['public','functions/app','functions/web'])fs.rmSync(path.join(out,part),{recursive:true,force:true});
for(const dir of ['public','functions/app','functions/web'])fs.mkdirSync(path.join(out,dir),{recursive:true});
const copy=(source,dest)=>fs.cpSync(path.join(root,source),path.join(out,dest),{recursive:true});
for(const name of ['index.html','tool-ui.css','config.js','workspace-core.js','workspace-store.js','workspace-ui.js','workspace.css','cloud-sync.js','receipt-core.js','vendor','builder','capabilities'])copy(name,'functions/web/'+name);
for(const name of ['api','lib','capabilities','fixtures'])copy(name,'functions/app/'+name);
for(const name of ['index.cjs','router.cjs','config.cjs','web-config.json','access.cjs','jobs.cjs','web.cjs','apps.cjs'])copy('firebase/runtime/'+name,'functions/'+name);
fs.writeFileSync(path.join(out,'functions/app/package.json'),'{"type":"commonjs"}\n');
fs.writeFileSync(path.join(out,'functions/package.json'),JSON.stringify({name:'startupos-firebase-api',private:true,main:'index.cjs',engines:{node:'22'},dependencies:{'firebase-functions':'^7.0.0','firebase-admin':'^13.0.0',jose:'^6.2.3'}},null,2)+'\n');
if(fs.existsSync(path.join(root,'firebase/functions.package-lock.json')))copy('firebase/functions.package-lock.json','functions/package-lock.json');
// The separate Sites-only checklist laboratory stays in Sites; keep the original Studio AutoBuild.
for(const name of ['workspace-ui.js','builder/autobuild.js']){
 const file=path.join(out,'functions/web',name);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/<a class="btn" href="\/control">[^<]*<\/a>/g,''));
}
const config=path.join(out,'functions/web/config.js');fs.writeFileSync(config,fs.readFileSync(config,'utf8').replace('Vercel + OpenAI Responses API','Firebase + OpenAI Responses API'));
const cloud=path.join(out,'functions/web/cloud-sync.js');
fs.writeFileSync(cloud,fs.readFileSync(cloud,'utf8').replaceAll('auth.signOut()','window.StartupOSFirebase.signOut(auth)')+'\n'+fs.readFileSync(path.join(root,'firebase/client.js'),'utf8'));
const studio=path.join(out,'functions/web/builder/studio.js');
fs.writeFileSync(studio,fs.readFileSync(studio,'utf8').replace('setTimeout(()=>controller.abort(),timeout)','setTimeout(()=>controller.abort(),Math.max(timeout,660000))').replaceAll('Vercel Deployment','Firebase 배포'));
const account=path.join(out,'functions/app/lib/account-auth.js');
fs.writeFileSync(account,fs.readFileSync(account,'utf8').replace('async function requireAccount(req){','async function requireAccount(req){\n if(req.firebaseIdentity)return req.firebaseIdentity;'));
const buildApi=path.join(out,'functions/app/api/build.js');
fs.writeFileSync(buildApi,fs.readFileSync(buildApi,'utf8').replace('publisher:!!process.env.VERCEL_PUBLISH_TOKEN','publisher:true'));
const login=fs.readFileSync(path.join(root,'firebase/login.html'),'utf8').replace('__FIREBASE_CONFIG__',JSON.stringify(require('./runtime/web-config.json')).replace(/</g,'\\u003c'));
fs.writeFileSync(path.join(out,'public/login.html'),login);
console.log('Prepared Firebase source for startupos-6b8d4. No deployment performed.');
