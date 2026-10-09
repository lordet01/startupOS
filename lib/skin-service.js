'use strict';
const B=require('./build-contract');
const {failure,body,sendError}=B;
const INGREDIENTS=['niacinamide','ceramides','glycerin','hyaluronic_acid','panthenol','salicylic_acid','azelaic_acid','vitamin_c','sunscreen','retinoid','none'];
const OBSERVATIONS=['tone_variation','visible_redness','surface_shine','visible_texture','visible_dryness','not_assessable'];
const schema={type:'object',additionalProperties:false,properties:{
 image_status:{type:'string',enum:['face_visible','not_face','unclear']},
 summary:{type:'string'},
 observations:{type:'array',items:{type:'object',additionalProperties:false,properties:{
  property:{type:'string',enum:OBSERVATIONS},description:{type:'string'},
  certainty:{type:'string',enum:['low','medium']}
 },required:['property','description','certainty']}},
 ingredient_groups:{type:'array',items:{type:'object',additionalProperties:false,properties:{
  ingredient:{type:'string',enum:INGREDIENTS},reason:{type:'string'},caution:{type:'string'}
 },required:['ingredient','reason','caution']}},
 limitations:{type:'array',items:{type:'string'}}
},required:['image_status','summary','observations','ingredient_groups','limitations']};
function validImage(raw){
 if(typeof raw!=='string'||raw.length>3500000)throw failure('IMAGE_SIZE','사진을 압축해 다시 시도하세요. (약 2.5MB 이하)',413);
 const m=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
 if(!m)throw failure('IMAGE_FORMAT','JPG/PNG/WebP 사진만 지원합니다.',400);
 const buf=Buffer.from(m[2],'base64');
 const valid=m[1]==='jpeg'?(buf[0]===255&&buf[1]===216):m[1]==='png'?buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP';
 if(!valid||buf.length<50)throw failure('IMAGE_INVALID','사진 파일을 확인해 주세요.',400);
 return raw;
}
function validateResult(value){
 if(!value||!['face_visible','not_face','unclear'].includes(value.image_status)||!Array.isArray(value.observations)||!Array.isArray(value.ingredient_groups)||!Array.isArray(value.limitations))throw failure('VISION_SCHEMA','피부 관찰 응답 구조 오류',502);
 if(value.observations.length>8||value.ingredient_groups.length>8)throw failure('VISION_SCHEMA','응답 크기 초과',502);
 for(const x of value.observations)if(!OBSERVATIONS.includes(x.property))throw failure('VISION_SCHEMA','관찰 항목 오류',502);
 for(const x of value.ingredient_groups)if(!INGREDIENTS.includes(x.ingredient))throw failure('VISION_SCHEMA','성분 추천 항목 오류',502);
 if(value.image_status!=='face_visible'){
  value.observations=[];value.ingredient_groups=[];
  value.summary='얼굴 이미지를 확인하기 어렵습니다. 조명이 균일한 정면 사진으로 다시 시도하세요.';
 }
 value.limitations=[...new Set([...value.limitations,'사진만으로 피부 질환이나 실제 피부 수분·모공 크기를 확정할 수 없습니다.'])].slice(0,8);
 return value;
}
function extractText(data){if(typeof data.output_text==='string')return data.output_text;return (data.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');}
async function analyze(image,{fetchImpl=fetch,model=process.env.OPENAI_SKIN_MODEL||'gpt-4.1-mini'}={}){
 if(!process.env.OPENAI_API_KEY)throw failure('SKIN_KEY_MISSING','OpenAI 서버 키 설정이 필요합니다.',503);
 validImage(image);const started=Date.now();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),50000);
 try{
  const request={model,store:false,max_output_tokens:2500,
   input:[{role:'system',content:'You are a conservative cosmetic photo observation assistant, NOT a dermatologist or a diagnostic tool. First decide if a human face is visible; if not face or unclear, return no ingredient suggestions. For face images only, note cautious visible cosmetic surface properties (tone variations, shine, visible texture, superficial redness) but never disease diagnosis, skin moisture measurement, quantitative pore size or medical condition. Photo lighting, cosmetics and camera properties limit findings. Suggest general ingredient CATEGORIES with reasons and cautions only; no brands or purchases. Do not identify anyone or infer sensitive personal traits. Korean text, concise.'},{role:'user',content:[{type:'input_text',text:'이 이미지에서 육안으로 관찰 가능한 비의료적 피부 표면 특징과 화장품 성분군만 조심스럽게 안내하세요.'},{type:'input_image',image_url:image,detail:'high'}]}],
   text:{format:{type:'json_schema',name:'skin_visual_observation_v1',strict:true,schema}}
  };
  const resp=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify(request)});
  const result=await resp.json().catch(()=>null);
  if(!result)throw failure('PROVIDER_FORMAT','AI 응답이 JSON이 아닙니다.',502);
  if(!resp.ok)throw failure('PROVIDER_ERROR',result.error?.message||'사진 분석 API 오류',resp.status);
  if(result.status&&result.status!=='completed')throw failure('OUTPUT_INCOMPLETE','분석 응답이 완료되지 않았습니다. 다시 시도하세요.',502);
  let parsed;try{parsed=validateResult(JSON.parse(extractText(result)))}catch(e){if(e.status)throw e;throw failure('VISION_PARSE','결과 해석 실패',502)}
  const usage=result.usage||{},input=Number(usage.input_tokens||0),output=Number(usage.output_tokens||0);
  const cost=/^gpt-4\.1-mini/.test(result.model||model)?(input*.40+output*1.60)/1e6:null;
  return {ok:true,result:parsed,model:result.model||model,response_id:result.id,latency_ms:Date.now()-started,usage:{input_tokens:input,output_tokens:output},cost:{provider_usd:cost,kind:'estimated_tokens'}};
 }catch(e){if(e.name==='AbortError')throw failure('VISION_TIMEOUT','이미지 분석에 50초 이상 걸렸습니다.',504);throw e}finally{clearTimeout(timer)}
}
const buckets=new Map();
function allowRequest(req,data){
 if(!/^vs_[a-zA-Z0-9_-]{4,100}$/.test(String(data.sessionId||''))||!/^b_[a-f0-9-]{20,80}$/i.test(String(data.buildId||''))||String(data.sourceHash||'')!==B.sourceHash())throw failure('APP_SCOPE','현재 세션 Build와 일치하지 않습니다.',403);
 const host=String(req.headers['x-forwarded-host']||req.headers.host||''),proto=String(req.headers['x-forwarded-proto']||'https'),origin=String(req.headers.origin||'');
 if(req.headers['sec-fetch-site']!=='same-origin'||!host||origin!==proto+'://'+host)throw failure('APP_ORIGIN','동일 배포 웹앱에서 요청해야 합니다.',403);
 const key=data.sessionId+':'+String(req.headers['x-forwarded-for']||'').slice(0,64),now=Date.now(),r=buckets.get(key)||{count:0,until:now+3600000};
 if(r.until<now){r.count=0;r.until=now+3600000}r.count++;buckets.set(key,r);
 if(r.count>15)throw failure('RATE_LIMIT','한 시간 내 이미지 분석 횟수가 초과됐습니다.',429);
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.method==='GET')return res.status(200).json({ok:true,service:'Skin visual analysis',configured:!!process.env.OPENAI_API_KEY});
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST only'});
  const data=body(req);if(data.consent!==true)throw failure('CONSENT_REQUIRED','얼굴 사진 외부 전송 동의가 필요합니다.',422);
  allowRequest(req,data);const result=await analyze(data.image);
  console.log(JSON.stringify({event:'skin_analysis',session:data.sessionId,build:data.buildId,response_id:result.response_id,latency_ms:result.latency_ms,model:result.model}));
  return res.status(200).json(result);
 }catch(e){return sendError(res,e)}
}
module.exports={schema,validImage,validateResult,analyze,handler,allowRequest};
