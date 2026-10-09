'use strict';
const B=require('../lib/build-contract'),A=require('../lib/assemble'),V=require('../lib/verify');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET')return res.status(200).json({
      ok:true,version:B.VERSION,mode:'keyless-stateless-functional-build',contracts:B.contracts,sourceHash:B.sourceHash(),
      configured:{ocr:!!process.env.OPENAI_API_KEY,publisher:!!process.env.VERCEL_PUBLISH_TOKEN},
      trustModel:'server reassembles and re-verifies current source on every privileged action'
    });
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST only'});
    const data=B.body(req);
    if(data.action==='assemble'){
      const desc=B.descriptor(data.project,data.kind,data.acceptedScope);
      const checks=A.validateArtifacts(desc);
      if(checks.some(x=>x.status!=='passed'))return res.status(422).json({ok:false,code:'ASSEMBLY_FAILED',error:'실행 파일 검증 실패',checks});
      const encoded=B.encodeDescriptor(desc);
      return res.status(200).json({
        ok:true,
        build:{...desc,descriptor:desc,artifactHash:B.artifactHash(desc),status:'IMPLEMENTED',contract:B.contracts[desc.kind],checks,verification:null,previewUrl:'/api/build-preview?d='+encodeURIComponent(encoded)},
        cost:{provider_usd:0,platform_fee_usd:0,kind:'deterministic_assembly'}
      });
    }
    if(data.action==='verify'){
      const desc=B.assertCurrent({...data.descriptor});
      if(data.sessionId&&data.sessionId!==desc.sid)throw B.failure('SESSION_MISMATCH','다른 세션의 Build를 검증할 수 없습니다.',409);
      const verification=await V.verify(desc,{liveConsent:data.liveConsent===true});
      console.log(JSON.stringify({event:'functional_build_verification',sessionId:desc.sid,buildId:desc.bid,passed:verification.status==='INTEGRATION_VERIFIED',failed:verification.checks.filter(x=>x.status!=='passed').map(x=>x.id)}));
      return res.status(200).json({ok:true,verification,cost:verification.cost});
    }
    throw B.failure('LEGACY_BUILDER_DISABLED','기존 generic shell Builder는 중단되었습니다. /builder/에서 기능 계약을 확인하고 Build하세요.',422);
  }catch(error){return B.sendError(res,error);}
};
