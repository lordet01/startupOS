function slugify(v){
  return String(v||"venture").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,32)||"venture";
}
function iconSvg(letter){
  const safe=String(letter||"A").replace(/[<>&'"]/g,"").slice(0,1).toUpperCase()||"A";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#111827"/><text x="256" y="330" text-anchor="middle" font-family="Arial,sans-serif" font-size="250" font-weight="700" fill="white">${safe}</text></svg>`;
}
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const token=process.env.VERCEL_PUBLISH_TOKEN;
  const teamId=process.env.VERCEL_TEAM_ID;
  const hostProjectId=process.env.VERCEL_HOST_PROJECT_ID || "prj_lPHRFDHd3Ob6rkOuMTnpTqJqrxQh";
  const hostProjectName=process.env.VERCEL_HOST_PROJECT_NAME || "startup-os";
  if(!token) return res.status(503).json({
    error:"Publishing is not configured. Set VERCEL_PUBLISH_TOKEN in StartupOS Vercel environment variables.",
    code:"PUBLISH_NOT_CONFIGURED"
  });
  let body=req.body;
  if(typeof body==="string"){try{body=JSON.parse(body)}catch{return res.status(400).json({error:"Invalid JSON"})}}
  const build=body&&body.build;
  const sessionId=String(body&&body.sessionId||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,32);
  if(!build||!build.index_html||!build.manifest_json||!build.service_worker_js) return res.status(400).json({error:"Missing generated build"});
  if(build.index_html.length>180000) return res.status(413).json({error:"Generated app is too large"});
  let manifest;
  try{manifest=JSON.parse(build.manifest_json)}catch{return res.status(400).json({error:"Invalid manifest"})}
  manifest.icons=[{src:"./icon.svg",sizes:"any",type:"image/svg+xml",purpose:"any maskable"}];
  const projectName=("so-"+slugify(build.slug||build.app_name)+"-"+(sessionId.slice(-5).toLowerCase()||"pilot")).slice(0,52);
  const files=[
    {file:"index.html",data:Buffer.from(build.index_html,"utf8").toString("base64"),encoding:"base64"},
    {file:"manifest.webmanifest",data:Buffer.from(JSON.stringify(manifest),"utf8").toString("base64"),encoding:"base64"},
    {file:"sw.js",data:Buffer.from(build.service_worker_js,"utf8").toString("base64"),encoding:"base64"},
    {file:"icon.svg",data:Buffer.from(iconSvg(build.app_name),"utf8").toString("base64"),encoding:"base64"}
  ];
  try{
    const payload={
      name:hostProjectName,
      project:hostProjectId,
      files,
      meta:{startupOsSessionId:sessionId,startupOsGeneratedApp:"true"},
      projectSettings:{framework:null,skipGitConnectDuringLink:true}
    };

    async function attempt(url,label){
      const r=await fetch(url,{
        method:"POST",
        headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
        body:JSON.stringify(payload)
      });
      const data=await r.json().catch(()=>({}));
      return {ok:r.ok,status:r.status,data,label};
    }

    // First try project-scoped auth without a team query. This works with
    // tokens restricted to the existing StartupOS project.
    let result=await attempt("https://api.vercel.com/v13/deployments","existing-project");

    // Some account tokens require an explicit team scope.
    if(!result.ok && teamId){
      result=await attempt(`https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(teamId)}`,"existing-project-team");
    }

    if(!result.ok){
      const detail=result.data&&result.data.error?result.data.error:{};
      return res.status(result.status||403).json({
        error:detail.message||"Vercel publish authorization failed",
        code:detail.code||"VERCEL_AUTH_FAILED",
        stage:"create_preview_deployment",
        strategy:result.label,
        hint:"VERCEL_PUBLISH_TOKEN must be allowed to deploy the existing startup-os project. A project-scoped token for startup-os is sufficient; a token scoped to another project is not."
      });
    }

    const data=result.data;
    return res.status(200).json({
      ok:true,
      deployment:{
        id:data.id,
        url:data.url?`https://${data.url}`:null,
        readyState:data.readyState||data.state||"QUEUED",
        projectName:hostProjectName,
        mode:"preview"
      }
    });
  }catch(err){
    return res.status(500).json({error:err.message||"Publish failed"});
  }
};
