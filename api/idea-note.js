'use strict';
const MODEL=process.env.OPENAI_IDEA_MODEL||'gpt-4.1-mini';
const TRANSCRIBE_MODEL=process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe';
function jsonBody(req){let b=req.body;if(typeof b==='string'){try{b=JSON.parse(b)}catch{throw Object.assign(new Error('Invalid JSON'),{status:400})}}if(!b||typeof b!=='object'||Array.isArray(b))throw Object.assign(new Error('Request body missing'),{status:400});return b;}
function extractText(data){if(typeof data.output_text==='string')return data.output_text;return (data.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');}
function noteSchema(){const fields={name:{type:'string'},idea:{type:'string'},customer:{type:'string'},problem:{type:'string'},desiredOutcome:{type:'string'},model:{type:'string'},priceUsd:{type:['number','null']},budgetUsd:{type:['number','null']},constraints:{type:'string'}};return {type:'object',properties:fields,required:Object.keys(fields),additionalProperties:false};}
function validateDraft(x){
 if(!x||typeof x!=='object')throw Error('Idea Note response is invalid');
 const result={};
 for(const k of ['name','idea','customer','problem','desiredOutcome','model','constraints'])result[k]=String(x[k]||'').trim().slice(0,k==='idea'?2500:1200);
 for(const k of ['priceUsd','budgetUsd'])result[k]=x[k]==null?null:Number.isFinite(Number(x[k]))&&Number(x[k])>=0?Number(x[k]):null;
 if(!result.idea||!result.problem||!result.customer)throw Error('LLM did not produce the required session fields');
 return result;
}
async function structure(note){
 const system="You transform a founder's free-form Korean voice memo or typed Idea Note into an editable Venture brief. Output informative natural Korean paragraphs. Preserve technical constraints, exact requirements, external services, UX behavior and business assumptions. name = short service name; idea = precise service behavior and user flow (max ~900 Korean characters); customer = likely user; problem = pain point; desiredOutcome = user value; model = monetization, or 'AI가 추천' if unknown; constraints = technical, hardware, UX and exclusions. priceUsd/budgetUsd only when explicitly in USD, otherwise null. Never confuse Korean won with dollars. Do not invent validated evidence. For missing customer/problem infer a practical editable hypothesis and mark it '가정:'. Everything remains editable, not a proven fact. No markdown or extra fields.";
 const resp=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,store:false,max_output_tokens:2600,text:{format:{type:'json_schema',name:'startup_os_idea_note_v1',strict:true,schema:noteSchema()}},input:[{role:'system',content:system},{role:'user',content:String(note).slice(0,15000)}]}),signal:AbortSignal.timeout(42000)});
 const data=await resp.json().catch(()=>null);
 if(!data)throw Object.assign(new Error('LLM non-JSON response'),{status:502});
 if(!resp.ok)throw Object.assign(new Error(data.error?.message||'Idea Note analysis failed'),{status:resp.status});
 if(data.status&&data.status!=='completed')throw Object.assign(new Error('Idea Note output incomplete. Please retry.'),{status:502,code:data.incomplete_details?.reason||'incomplete'});
 let result;try{result=validateDraft(JSON.parse(extractText(data)))}catch(e){throw Object.assign(e,{status:502})}
 return {draft:result,model:data.model||MODEL,usage:data.usage||{}};
}
async function transcribe(value){
 if(typeof value!=='string'||value.length>2500000)throw Object.assign(new Error('녹음 파일이 너무 큽니다. 60초 이내로 녹음해 주세요.'),{status:413});
 const m=/^data:audio\/(webm|mp4|mpeg|ogg|wav|x-m4a|aac)(?:;codecs=[^;,]+)?;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!m)throw Object.assign(new Error('지원하지 않는 오디오 파일 형식입니다.'),{status:400});
 const bytes=Buffer.from(m[2],'base64');
 if(bytes.length<100||bytes.length>1800000)throw Object.assign(new Error('오디오 크기가 지원 범위를 벗어났습니다.'),{status:413});
 const extension=m[1]==='x-m4a'?'m4a':m[1]==='mpeg'?'mp3':m[1];
 const form=new FormData();form.append('model',TRANSCRIBE_MODEL);form.append('language','ko');form.append('file',new Blob([bytes],{type:'audio/'+m[1]}),'idea-note.'+extension);
 const resp=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY},body:form,signal:AbortSignal.timeout(45000)});
 const data=await resp.json().catch(()=>null);
 if(!data)throw Object.assign(new Error('음성 인식 응답 오류'),{status:502});
 if(!resp.ok)throw Object.assign(new Error(data.error?.message||'음성 인식에 실패했습니다.'),{status:resp.status});
 const text=String(data.text||'').trim();if(!text)throw Object.assign(new Error('인식된 음성이 없습니다. 다시 녹음해 주세요.'),{status:422});
 return {text:text.slice(0,15000),model:TRANSCRIBE_MODEL};
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.method==='GET')return res.status(200).json({ok:true,service:'Idea Note',voice:true,structure:true});
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST only'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({ok:false,error:'OPENAI_API_KEY is not configured'});
  const b=jsonBody(req);const start=Date.now(),action=String(b.action||'');
  if(action==='structure'){
    const note=String(b.note||'').trim();if(note.length<20||note.length>15000)return res.status(400).json({ok:false,error:'Idea Note must be between 20 and 15,000 characters.'});
    const data=await structure(note);
    console.log(JSON.stringify({event:'idea_note_structured',length:note.length,latency_ms:Date.now()-start,model:data.model}));
    return res.status(200).json({ok:true,...data,latency_ms:Date.now()-start});
  }
  if(action==='transcribe'){
    const data=await transcribe(b.audio);
    console.log(JSON.stringify({event:'idea_note_transcribed',length:data.text.length,latency_ms:Date.now()-start}));
    return res.status(200).json({ok:true,...data,latency_ms:Date.now()-start});
  }
  return res.status(400).json({ok:false,error:'Unknown Idea Note action'});
 }catch(e){console.error(JSON.stringify({event:'idea_note_error',error:e.message,status:e.status||500}));return res.status(e.status||500).json({ok:false,error:e.message||'Idea Note failed',code:e.code||'REQUEST_FAILED'});}
};
