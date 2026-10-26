'use strict';
const fs=require('node:fs'),path=require('node:path');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
function createWeb({access,root,apps}){return async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(!['GET','HEAD'].includes(req.method))return res.status(405).end();
 try{
  const identity=await access.authenticate(req);
  const raw=String(req.originalUrl||req.url).split('?')[0],decoded=decodeURIComponent(raw);
  if(decoded.includes('\0')||decoded.includes('\\')||decoded.split('/').some(x=>x==='..'||x.startsWith('.')))return res.status(404).end();
  if(decoded.startsWith('/apps/'))return apps.serve(req,res,identity,decoded);
  let local=path.resolve(root,'.'+decoded);
  if(local!==root&&!local.startsWith(root+path.sep))return res.status(404).end();
  if(fs.existsSync(local)&&fs.statSync(local).isDirectory())local=path.join(local,'index.html');
  if(!MIME[path.extname(local)]||!fs.existsSync(local))return res.status(404).end();
  res.setHeader('Content-Type',MIME[path.extname(local)]);return res.status(200).send(req.method==='HEAD'?'':fs.readFileSync(local));
 }catch(e){if(e.status===401||e.status===403){res.setHeader('Location','/login?next='+encodeURIComponent(String(req.originalUrl||req.url).slice(0,2000)));return res.status(302).end();}return res.status(503).send('접근 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');}
};}
module.exports={createWeb,MIME};
