'use strict';
const {randomBytes}=require('node:crypto');
const {fail}=require('./access.cjs'),{MIME}=require('./web.cjs');
const ID=/^dpl_[a-f0-9]{24}$/;
function createApps({db,B,A,V,branding}){
 async function handler(req,res){
  if(req.method==='GET'){
   const id=String(req.query?.id||'');if(!id)return res.status(200).json({ok:true,configured:true,mode:'private-firebase'});
   if(!ID.test(id))throw fail('DEPLOYMENT_ID_INVALID','배포 ID를 확인해 주세요.',400);
   const doc=await db.collection('startupApps').doc(id).get();
   if(!doc.exists||doc.data().ownerUid!==req.firebaseIdentity.uid)throw fail('DEPLOYMENT_NOT_FOUND','배포를 찾지 못했습니다.',404);
   return res.status(200).json({ok:true,deployment:doc.data().deployment});
  }
  if(req.method!=='POST')return res.status(405).json({ok:false});
  const data=B.body(req),desc=B.assertCurrent({...data.descriptor});
  if(data.sessionId!==desc.sid)throw fail('SESSION_MISMATCH','다른 프로젝트의 Build를 배포할 수 없습니다.',409);
  if(data.approved!==true)throw fail('APPROVAL_REQUIRED','배포를 승인해 주세요.',422);
  const verification=await V.verify(desc,{liveConsent:data.liveConsent===true});
  if(verification.status!=='INTEGRATION_VERIFIED')return res.status(422).json({ok:false,code:'BUILD_NOT_VERIFIED',error:'배포 직전 검증을 통과하지 못했습니다.',verification,cost:verification.cost});
  const packaged={...desc,branding:branding.normalize(desc.kind,data.branding,desc.name)};
  if(A.validateArtifacts(packaged).some(x=>x.status!=='passed'))throw fail('ARTIFACT_INVALID','배포 파일 검증에 실패했습니다.',422);
  const id='dpl_'+randomBytes(12).toString('hex'),deployment={id,url:'https://startupos-6b8d4.web.app/apps/'+id+'/',readyState:'READY',mode:'private',deviceStatus:'PENDING_PHYSICAL_PHONE',sessionId:desc.sid,buildId:desc.bid,artifactHash:B.artifactHash(desc),branding:packaged.branding};
  await db.collection('startupApps').doc(id).create({ownerUid:req.firebaseIdentity.uid,descriptor:packaged,deployment,createdAt:new Date()});
  return res.status(200).json({ok:true,deployment,verification,cost:verification.cost,message:'승인된 Build를 Firebase에 비공개로 배포했습니다.'});
 }
 async function serve(req,res,identity,pathname){
  const match=/^\/apps\/(dpl_[a-f0-9]{24})(\/.*)?$/.exec(pathname);if(!match)return res.status(404).end();
  const doc=await db.collection('startupApps').doc(match[1]).get();if(!doc.exists||doc.data().ownerUid!==identity.uid)return res.status(404).end();
  if(!match[2]){res.setHeader('Location',pathname+'/');return res.status(302).end();}
  const desc=doc.data().descriptor,file=match[2]==='/'?'index.html':match[2].slice(1);
  if(file.startsWith('api/')||file.startsWith('lib/')||file==='vercel.json')return res.status(404).end();
  const entry=A.pack(desc).find(x=>x.file===file);if(!entry)return res.status(404).end();
  let content=entry.encoding==='base64'?Buffer.from(entry.data,'base64'):entry.data;
  if(file==='index.html'){
   // Session cookie authenticates same-origin generated-app API calls; no token in artifacts.
   res.setHeader('Content-Security-Policy',"frame-ancestors 'self'; object-src 'none'");
  }
  res.setHeader('Content-Type',MIME[require('node:path').extname(file)]||'application/octet-stream');
  return res.status(200).send(req.method==='HEAD'?'':content);
 }
 return {handler,serve};
}
module.exports={createApps};
