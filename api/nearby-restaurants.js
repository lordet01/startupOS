'use strict';
const auth=require('../lib/account-auth');
const MAX=50;
async function search({lat,lng,radius},fetchImpl=fetch){
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Number.isInteger(radius)||radius<100||radius>2000)throw Object.assign(Error('위치 또는 검색 반경을 확인하세요.'),{status:400,code:'LOCATION_INVALID'});
 const query='[out:json][timeout:15];(nwr["amenity"="restaurant"](around:'+radius+','+lat+','+lng+');nwr["amenity"="fast_food"](around:'+radius+','+lat+','+lng+'););out center tags '+MAX+';';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{
  const response=await fetchImpl('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'StartupOS-FoodDemo/1.0 (https://github.com/lordet01/startupOS)'},body:new URLSearchParams({data:query}).toString(),signal:controller.signal});
  if(!response.ok)throw Object.assign(Error('식당 데이터 서비스에 연결하지 못했습니다.'),{status:502,code:'RESTAURANT_PROVIDER_ERROR'});
  const payload=await response.json();if(!Array.isArray(payload.elements))throw Object.assign(Error('식당 데이터 응답이 올바르지 않습니다.'),{status:502,code:'RESTAURANT_PROVIDER_FORMAT'});
  return payload.elements.slice(0,MAX).flatMap(e=>{const la=e.lat??e.center?.lat,ln=e.lon??e.center?.lon,t=e.tags||{};if(!Number.isFinite(la)||!Number.isFinite(ln)||!['node','way','relation'].includes(e.type)||!Number.isSafeInteger(e.id)||!t.name)return [];return [{name:String(t.name).slice(0,120),lat:la,lng:ln,types:String(t.cuisine||'').split(';').map(x=>x.trim()).filter(Boolean).slice(0,8),address:[t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' ').slice(0,200),mapUrl:'https://www.openstreetmap.org/'+e.type+'/'+e.id}];});
 }catch(e){if(e.name==='AbortError')throw Object.assign(Error('식당 검색 시간이 초과됐습니다.'),{status:504,code:'RESTAURANT_TIMEOUT'});throw e}finally{clearTimeout(timer)}
}
const throttle=new Map();
module.exports=async function handler(req,res){res.setHeader('Cache-Control','no-store');try{if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST only'});const identity=await auth.requireAccount(req);if(req.headers?.['sec-fetch-site']==='cross-site')throw Object.assign(Error('다른 사이트에서 검색할 수 없습니다.'),{status:403,code:'ORIGIN_NOT_ALLOWED'});const key=String(identity?.uid||req.headers?.['x-forwarded-for']||'local').slice(0,120),now=Date.now();let record=throttle.get(key);if(!record||record.reset<now)record={count:0,reset:now+3600000};if(++record.count>30)throw Object.assign(Error('검색 한도에 도달했습니다. 잠시 후 다시 시도하세요.'),{status:429,code:'RATE_LIMIT'});throttle.set(key,record);const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};const places=await search({lat:b.lat,lng:b.lng,radius:b.radius});return res.status(200).json({ok:true,places,source:'OpenStreetMap',limitations:['실시간 영업 여부','리뷰','메뉴 가격','화제성','대기시간']});}catch(e){return res.status(e.status||500).json({ok:false,code:e.code||'RESTAURANT_ERROR',error:e.status?e.message:'식당 검색을 완료하지 못했습니다.'})}};
module.exports.search=search;
