'use strict';
// Reviewed per-venture executable configuration. No arbitrary user/LLM JS enters the artifact.
const DEFAULT_SKIN=Object.freeze({
  result_title:'피부 관찰 결과',
  photo_guide:'밝고 균일한 조명에서 정면 사진을 촬영하세요.',
  analysis_button:'사진 분석하기',
  analysis_focus:'balanced',
  detail_level:'concise',
  result_order:['observations','ingredients'],
  ingredient_limit:4,
  show_certainty:true,
  show_cautions:true
});
const FOCUS=['balanced','tone','texture','shine','redness'];
const DETAIL=['concise','detailed'];
const RESULT=['observations','ingredients'];
const STRINGS=['result_title','photo_guide','analysis_button'];
const MAX={result_title:55,photo_guide:160,analysis_button:45};
function fail(message){const e=new Error(message);e.code='INVALID_REFINEMENT_CONFIG';e.status=422;return e;}
function normalize(kind,value){
 if(kind!=='skin'){
   if(value!=null&&Object.keys(value).length)throw fail('해당 앱의 채팅형 기능 패치는 아직 구현되지 않았습니다.');
   return null;
 }
 if(value==null)return {...DEFAULT_SKIN,result_order:[...DEFAULT_SKIN.result_order]};
 if(typeof value!=='object'||Array.isArray(value))throw fail('피부 앱 설정 형식이 올바르지 않습니다.');
 const allowed=[...STRINGS,'analysis_focus','detail_level','result_order','ingredient_limit','show_certainty','show_cautions'];
 if(Object.keys(value).some(key=>!allowed.includes(key)))throw fail('허용되지 않은 개선 옵션을 포함합니다.');
 const x={...DEFAULT_SKIN,...value};
 for(const k of STRINGS){
  if(typeof x[k]!=='string'||!x[k].trim()||x[k].length>MAX[k]||/[<>\u0000-\u001f]/.test(x[k]))throw fail(k+' 문구 길이 또는 문자가 유효하지 않습니다.');
  x[k]=x[k].trim();
 }
 if(!FOCUS.includes(x.analysis_focus)||!DETAIL.includes(x.detail_level))throw fail('분석 초점 또는 설명 길이 옵션 오류');
 if(!Array.isArray(x.result_order)||x.result_order.length!==2||new Set(x.result_order).size!==2||x.result_order.some(y=>!RESULT.includes(y)))throw fail('관찰·성분군 결과는 모두 표시해야 합니다.');
 if(!Number.isInteger(x.ingredient_limit)||x.ingredient_limit<1||x.ingredient_limit>6)throw fail('성분군 표시 개수는 1~6개입니다.');
 if(typeof x.show_certainty!=='boolean'||x.show_cautions!==true)throw fail('성분 주의사항 표시는 필수이며 끌 수 없습니다.');
 return {...x,result_order:[...x.result_order]};
}
function equal(a,b){return JSON.stringify(normalize('skin',a))===JSON.stringify(normalize('skin',b));}
function diff(a,b){
 const prev=normalize('skin',a),next=normalize('skin',b);
 const titles={result_title:'결과 제목',photo_guide:'촬영 안내',analysis_button:'분석 버튼',analysis_focus:'분석 중점',detail_level:'결과 설명 길이',result_order:'결과 섹션 순서',ingredient_limit:'성분군 표시 개수',show_certainty:'관찰 신뢰도 표시',show_cautions:'주의사항'};
 return Object.keys(next).filter(k=>JSON.stringify(prev[k])!==JSON.stringify(next[k])).map(k=>({
  key:k,label:titles[k],from:Array.isArray(prev[k])?prev[k].join(' → '):String(prev[k]),to:Array.isArray(next[k])?next[k].join(' → '):String(next[k])
 }));
}
const schema=()=>({
 type:'object',additionalProperties:false,
 properties:{
  result_title:{type:'string'},photo_guide:{type:'string'},analysis_button:{type:'string'},
  analysis_focus:{type:'string',enum:FOCUS},detail_level:{type:'string',enum:DETAIL},
  result_order:{type:'array',items:{type:'string',enum:RESULT}},
  ingredient_limit:{type:'integer',minimum:1,maximum:6},
  show_certainty:{type:'boolean'},show_cautions:{type:'boolean'}
 },
 required:['result_title','photo_guide','analysis_button','analysis_focus','detail_level','result_order','ingredient_limit','show_certainty','show_cautions']
});
module.exports={DEFAULT_SKIN,FOCUS,DETAIL,RESULT,normalize,equal,diff,schema};
