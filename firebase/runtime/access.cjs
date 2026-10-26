'use strict';
const fail=(code,message,status=403)=>Object.assign(new Error(message),{code,status});
function sameOrigin(req){
 const origin=req.headers?.origin;
 const allowed=['https://startupos-6b8d4.web.app','https://startupos-6b8d4.firebaseapp.com'];
 if(req.headers?.['sec-fetch-site']==='cross-site'||!allowed.includes(origin))throw fail('ORIGIN_NOT_ALLOWED','동일 StartupOS 화면에서 요청해 주세요.');
 return origin;
}
function createAccess({auth,db}){
 async function allowed(identity){
  const email=String(identity.email||'').toLowerCase();
  if(!identity.uid||identity.email_verified!==true||!email||email.includes('/'))throw fail('PRIVATE_ACCESS_REQUIRED','허용된 계정으로 로그인하고 이메일 인증을 완료해 주세요.');
  const access=await db.collection('startuposAccess').doc(email).get();
  if(!access.exists||access.data().enabled!==true)throw fail('PRIVATE_ACCESS_REQUIRED','이 계정은 StartupOS 접근 권한이 없습니다.');
  return {uid:identity.uid,email,emailVerified:true};
 }
 async function authenticate(req){
  try{
   const bearer=/^Bearer (\S+)$/.exec(req.headers?.authorization||'');
   if(bearer)return await allowed(await auth.verifyIdToken(bearer[1],true));
   const cookie=/(?:^|;\s*)__session=([^;]+)/.exec(req.headers?.cookie||'');
   if(cookie)return await allowed(await auth.verifySessionCookie(cookie[1],true));
  }catch(e){if(e.status)throw e;throw fail('AUTH_REQUIRED','로그인을 다시 확인해 주세요.',401);}
  throw fail('AUTH_REQUIRED','로그인 후 계속해 주세요.',401);
 }
 async function session(req,res){
  sameOrigin(req);
  if(req.method==='DELETE'){
   res.setHeader('Set-Cookie','__session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
   return res.status(200).json({ok:true});
  }
  if(req.method!=='POST')return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});
  const token=req.body?.idToken;
  if(typeof token!=='string'||token.length>12000)throw fail('AUTH_REQUIRED','로그인 토큰이 필요합니다.',401);
  let decoded;try{decoded=await auth.verifyIdToken(token,true);}catch{throw fail('AUTH_REQUIRED','로그인을 다시 확인해 주세요.',401);}
  await allowed(decoded);
  const expiresIn=5*24*60*60*1000;
  const cookie=await auth.createSessionCookie(token,{expiresIn});
  res.setHeader('Set-Cookie','__session='+cookie+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+expiresIn/1000);
  return res.status(200).json({ok:true});
 }
 async function recheck(identity){
  const user=await auth.getUser(identity.uid);
  if(user.disabled)throw fail('PRIVATE_ACCESS_REQUIRED','접근 권한이 중지됐습니다.');
  return allowed({uid:user.uid,email:user.email,email_verified:user.emailVerified});
 }
 return {authenticate,session,recheck};
}
module.exports={createAccess,sameOrigin,fail};
