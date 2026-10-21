'use strict';
const B=require('../lib/build-contract'),A=require('../lib/assemble');
module.exports=function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Permissions-Policy','camera=(self), microphone=()');
  try{
    if(req.method!=='GET')return res.status(405).end();
    const desc=B.decodeDescriptor(req.query&&req.query.d);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy',"frame-ancestors 'self'; object-src 'none'; base-uri 'none'");
    // Preview APIs use the signed-in workspace account; tokens never enter the generated artifact.
    const authBridge='<script>(function(){const native=window.fetch.bind(window);window.StartupOSPreviewNativeFetch=native;let client;function load(src){return new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=src;s.onload=resolve;s.onerror=()=>reject(Error("로그인 연결 실패"));document.head.appendChild(s);});}async function account(){if(window.StartupOSCloud)return window.StartupOSCloud;if(!client)client=(async()=>{for(const src of ["/workspace-core.js","/workspace-store.js","/cloud-sync.js"])await load(src);return window.StartupOSCloud;})();return client;}window.fetch=async function(url,options){const target=new URL(url,location.href);if(target.origin!==location.origin||!target.pathname.startsWith("/api/")||target.pathname==="/api/cloud-config")return native(url,options);try{if(parent!==window&&parent.location.origin===location.origin&&parent.StartupOSCloud)return parent.StartupOSCloud.fetch(url,options);}catch(e){}return(await account()).fetch(url,options);};})();</script>';
    return res.status(200).send(A.html(desc,true).replace('<head>','<head>'+authBridge));
  }catch(error){return B.sendError(res,error);}
};
