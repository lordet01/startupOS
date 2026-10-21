'use strict';
// Firebase Web config is public by design. Never expose service account private keys.
module.exports=(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({enabled:false,error:'Method not allowed'});
 const firebase={
  apiKey:process.env.FIREBASE_API_KEY||'',
  authDomain:process.env.FIREBASE_AUTH_DOMAIN||'',
  projectId:process.env.FIREBASE_PROJECT_ID||'',
  appId:process.env.FIREBASE_APP_ID||''
 };
 const enabled=Object.values(firebase).every(Boolean);
 const authRequired=require('../lib/account-auth').required();
 return res.status(200).json({enabled,firebase:enabled?firebase:undefined,provider:'firebase',configured:enabled,authRequired,
  missing:Object.entries(firebase).filter(([,value])=>!value).map(([key])=>({apiKey:'FIREBASE_API_KEY',authDomain:'FIREBASE_AUTH_DOMAIN',projectId:'FIREBASE_PROJECT_ID',appId:'FIREBASE_APP_ID'})[key]),
  accessMode:authRequired?'account':'internal_pilot',sessionMaxDays:30});
};
