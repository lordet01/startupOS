'use strict';
const Auth=require('../lib/account-auth');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET only'});
 try{
  const user=await Auth.requireAccount(req);
  return res.status(200).json({ok:true,authenticated:!!user,accessMode:Auth.required()?'account':'internal_pilot',user});
 }catch(e){return Auth.reject(res,e);}
};
