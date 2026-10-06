'use strict';
const B=require('../lib/build-contract'),A=require('../lib/assemble');
module.exports=function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Permissions-Policy','camera=(self), microphone=()');
 try{if(req.method!=='GET')return res.status(405).end();const ticket=req.query&&req.query.ticket;const desc=B.verifyBuild(ticket);res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"frame-ancestors 'self'; object-src 'none'; base-uri 'none'");return res.status(200).send(A.html(desc,true));}catch(error){return B.sendError(res,error);}
};
