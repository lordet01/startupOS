 'use strict';
const catalog={food:[['오늘의 한 끼','#13795b'],['뭐 먹지','#2563eb'],['한 끼 추천','#ea580c']],skin:[['GlowNote','#7c3aed'],['피부로그','#0f766e'],['SkinBloom','#db2777']],receipt:[['PocketLedger','#2563eb'],['한눈가계부','#0f766e'],['ReceiptFlow','#ea580c']],travel:[['TripNest','#2563eb'],['여행주머니','#7c3aed'],['ReadyGo','#0f766e']]};
function normalize(kind,input={},fallback){const options=catalog[kind]||catalog.travel;const index=Number.isInteger(input.variant)&&input.variant>=0&&input.variant<3?input.variant:0;return {name:String(input.name||fallback||options[index][0]).trim().slice(0,40)||options[index][0],variant:index,color:options[index][1]};}
module.exports={catalog,normalize};
