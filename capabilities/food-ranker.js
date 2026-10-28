(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FoodRanker=factory();})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function distance(a,b){const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lng-a.lng)*rad;const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;return Math.round(12742000*Math.asin(Math.sqrt(Math.min(1,h))))}
function rank(places,options={}){
 const origin=options.origin||{},radius=finite(options.radius)?options.radius:1500,budget=finite(options.budget)?options.budget:0,pref=String(options.cuisine||'').trim().toLowerCase();
 return places.filter(p=>p&&p.openNow!==false&&p.businessStatus!=='CLOSED_PERMANENTLY'&&p.businessStatus!=='CLOSED_TEMPORARILY').map(p=>{
  const hasCoords=finite(origin.lat)&&finite(origin.lng)&&finite(p.lat)&&finite(p.lng),meters=hasCoords?distance(origin,p):null;
  const rating=finite(p.rating)&&p.rating>=1&&p.rating<=5?p.rating:null,count=Number.isInteger(p.reviewCount)&&p.reviewCount>=0?p.reviewCount:null;
  const lo=finite(p.priceMin)?p.priceMin:null,hi=finite(p.priceMax)?p.priceMax:null;
  const tags=Array.isArray(p.types)?p.types.map(x=>String(x).toLowerCase()):[],matched=!!pref&&tags.some(x=>x.includes(pref));
  const reasons=[],unknown=[],penalties=[];let score=0;
  if(meters!==null){score+=Math.max(0,30*(1-meters/Math.max(radius,1)));reasons.push('직선거리 약 '+meters+'m')}else unknown.push('거리');
  if(rating!==null){const confidence=count===null?0.35:count/(count+30);score+=20*((rating-1)/4)*confidence;reasons.push('평점 '+rating.toFixed(1)+(count!==null?' · 후기 '+count+'개':''));}else unknown.push('평점');
  if(p.openNow===true){score+=10;reasons.push('현재 영업 중')}else unknown.push('현재 영업 여부');
  if(pref){if(matched){score+=15;reasons.push('선호 음식 유형 일치')}else unknown.push('선호 음식 일치 여부')}
  if(budget>0){if(p.priceCurrency==='KRW'&&lo!==null&&lo>budget){score-=20;penalties.push('표시된 가격 하한이 예산 초과')}else if(p.priceCurrency==='KRW'&&hi!==null&&hi<=budget){score+=10;reasons.push('표시 가격대가 예산 이내')}else unknown.push('메뉴별 가격·예산 적합성')}
  unknown.push('실시간 대기시간','최근 화제성','메뉴별 가격','알레르기·식단 적합성');
  return {...p,meters,score:Math.round(score*10)/10,reasons,penalties,unknown:[...new Set(unknown)]};
 }).sort((a,b)=>b.score-a.score||String(a.name||'').localeCompare(String(b.name||''),'ko'));
}
return {distance,rank};
});
