const MODEL = process.env.OPENAI_OCR_MODEL || process.env.OPENAI_MODEL || "gpt-6-luna";
const INPUT_USD_PER_M = Number(process.env.OPENAI_INPUT_USD_PER_M || "0.10");
const OUTPUT_USD_PER_M = Number(process.env.OPENAI_OUTPUT_USD_PER_M || "0.50");

function setCors(req,res){
  const origin=req.headers.origin||"";
  const allowed=origin==="https://startup-os-beige.vercel.app" || /^https:\/\/[-a-z0-9]+\.vercel\.app$/i.test(origin);
  if(allowed)res.setHeader("Access-Control-Allow-Origin",origin);
  res.setHeader("Vary","Origin");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
}
function extractText(data){
  if(typeof data.output_text==="string")return data.output_text;
  const out=[];for(const item of data.output||[]){if(item.type!=="message")continue;for(const c of item.content||[]){if((c.type==="output_text"||c.type==="text")&&typeof c.text==="string")out.push(c.text)}}return out.join("\n");
}
function schema(){return {
  type:"object",
  properties:{
    merchant:{type:"string"},
    purchase_date:{type:"string"},
    total_amount:{type:"number",minimum:0},
    currency:{type:"string"},
    items:{type:"array",items:{type:"object",properties:{
      name:{type:"string"},quantity:{type:"number",minimum:0},unit_price:{type:"number",minimum:0},line_total:{type:"number",minimum:0},category:{type:"string"}
    },required:["name","quantity","unit_price","line_total","category"],additionalProperties:false},maxItems:80},
    warnings:{type:"array",items:{type:"string"},maxItems:10}
  },
  required:["merchant","purchase_date","total_amount","currency","items","warnings"],
  additionalProperties:false
}}
module.exports=async function handler(req,res){
  setCors(req,res);
  res.setHeader("Cache-Control","no-store");
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"OPENAI_API_KEY is not configured"});
  let body=req.body;if(typeof body==="string"){try{body=JSON.parse(body)}catch{return res.status(400).json({error:"Invalid JSON"})}}
  const image=body&&body.image;
  if(typeof image!=="string"||!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image))return res.status(400).json({error:"A base64 receipt image is required"});
  if(image.length>7_000_000)return res.status(413).json({error:"Receipt image is too large. Please retake or crop the image."});
  const started=Date.now();
  try{
    const upstream=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:MODEL,
        input:[{role:"user",content:[
          {type:"input_text",text:"이 이미지는 구매 영수증이다. 보이는 내용만 사용해 상호, 구매일, 총액, 그리고 각 품목의 이름/수량/단가/라인합계를 추출하라. 읽을 수 없는 값은 추측하지 말고 0 또는 빈 문자열로 두고 warnings에 이유를 적어라. category는 식료품, 외식, 생활용품, 육아, 교통, 의료, 기타 중 가장 가까운 값으로 분류하라."},
          {type:"input_image",image_url:image,detail:"high"}
        ]}],
        max_output_tokens:1800,
        text:{format:{type:"json_schema",name:"receipt_ocr_result",strict:true,schema:schema()}}
      })
    });
    const data=await upstream.json();
    if(!upstream.ok)return res.status(upstream.status).json({error:data.error?.message||"OpenAI OCR error",stage:"vision"});
    let result;try{result=JSON.parse(extractText(data))}catch{return res.status(502).json({error:"OCR result was not valid structured JSON",stage:"parse"})}
    const inputTokens=Number(data.usage?.input_tokens||0),outputTokens=Number(data.usage?.output_tokens||0);
    const providerCost=(inputTokens/1e6)*INPUT_USD_PER_M+(outputTokens/1e6)*OUTPUT_USD_PER_M;
    console.log(JSON.stringify({event:"receipt_ocr_success",model:data.model||MODEL,latency_ms:Date.now()-started,input_tokens:inputTokens,output_tokens:outputTokens,item_count:result.items.length}));
    return res.status(200).json({ok:true,result,model:data.model||MODEL,latency_ms:Date.now()-started,usage:{input_tokens:inputTokens,output_tokens:outputTokens},cost:{provider_usd:Number(providerCost.toFixed(8))}});
  }catch(e){
    console.error(JSON.stringify({event:"receipt_ocr_error",error:e.message,latency_ms:Date.now()-started}));
    return res.status(500).json({error:e.message||"OCR runtime failed",stage:"runtime"});
  }
};
