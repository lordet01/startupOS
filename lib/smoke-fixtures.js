'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const F=require('./receipt-fixture');
const FACE_PATH=path.join(__dirname,'..','fixtures','skin-face.jpg');
const CATALOG={
  skin_face:{
    scenario:'사진 선택/촬영 → 동의 → Vision 얼굴 관찰 → 성분군 → 결과 저장',
    file:'fixtures/skin-face.jpg',mime:'image/jpeg',
    source:'https://commons.wikimedia.org/wiki/File:Close-up_portrait_of_an_old_woman.jpg',
    license:'CC0 1.0 (Wikimedia Commons / public domain dedication)',
    expected:'face_visible'
  },
  skin_negative:{
    scenario:'영수증을 피부 사진에 잘못 넣었을 때 피부 관찰 결과가 생성되지 않음',
    file:'synthetic receipt fixture',mime:'image/png',
    source:'generated in lib/receipt-fixture.js',license:'StartupOS generated',expected:'not_face_or_unclear'
  },
  receipt:{
    scenario:'영수증 촬영 → OCR 품목/수량/가격 → 수정 → 총액 검산 → 저장',
    file:'synthetic receipt fixture',mime:'image/png',
    source:'generated in lib/receipt-fixture.js',license:'StartupOS generated',expected:{merchant:'VERIFY MART',total:5500,items:2}
  }
};
function fixture(id){
  const meta=CATALOG[id];if(!meta)throw Error('Unknown smoke fixture '+id);
  if(id==='skin_face'){
    const bytes=require('./source-assets').asset('fixtures/skin-face.jpg');
    if(bytes.length<5000||bytes.length>2500000||bytes[0]!==255||bytes[1]!==216)throw Error('WEB_FIXTURE_INVALID');
    return {id,meta,dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64'),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
  }
  const item=F.fixture();
  return {id,meta,dataUrl:item.image,bytes:item.png.length,sha256:crypto.createHash('sha256').update(item.png).digest('hex')};
}
function auditDescriptor(d){
  const keys=d.kind==='skin'?['skin_face','skin_negative']:d.kind==='receipt'?['receipt']:[];
  return keys.map(id=>{const {meta,bytes,sha256}=fixture(id);return{id,scenario:meta.scenario,source:meta.source,license:meta.license,sha256,bytes};});
}
module.exports={CATALOG,FACE_PATH,fixture,auditDescriptor};
