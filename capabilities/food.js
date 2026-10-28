(function(){
'use strict';
const C=window.APP_CONFIG,root=document.getElementById('app');
const key='startup-os:app:v3:'+C.sessionId+':food';
const menus=[
 {name:'비빔밥',type:'한식',price:10000,time:20,spicy:false,veg:true},{name:'김치찌개',type:'한식',price:9500,time:20,spicy:true,veg:false},
 {name:'된장찌개',type:'한식',price:9000,time:20,spicy:false,veg:false},{name:'불고기 덮밥',type:'한식',price:11000,time:20,spicy:false,veg:false},
 {name:'잔치국수',type:'한식',price:8000,time:15,spicy:false,veg:false},{name:'초밥',type:'일식',price:15000,time:25,spicy:false,veg:false},
 {name:'우동',type:'일식',price:9000,time:15,spicy:false,veg:false},{name:'돈가스',type:'일식',price:12000,time:25,spicy:false,veg:false},
 {name:'마라탕',type:'중식',price:12000,time:25,spicy:true,veg:false},{name:'짜장면',type:'중식',price:8000,time:20,spicy:false,veg:false},
 {name:'파스타',type:'양식',price:14000,time:25,spicy:false,veg:false},{name:'샐러드',type:'양식',price:12000,time:10,spicy:false,veg:true},
 {name:'샌드위치',type:'양식',price:9000,time:10,spicy:false,veg:false},{name:'두부 샐러드',type:'양식',price:10000,time:10,spicy:false,veg:true}
];
let previous='',result=null,message='';
try{previous=localStorage.getItem(key)||''}catch{}
const fmt=n=>n.toLocaleString('ko-KR');
root.innerHTML=`<style>.food{max-width:620px;margin:auto;padding:22px 18px 60px;color:#192b29;font-family:system-ui,sans-serif}.food h1{font-size:32px;letter-spacing:-.05em;margin:14px 0 8px}.food p{color:#64756f;line-height:1.6}.food .eyebrow{color:#167b5e;font-size:12px;font-weight:800;letter-spacing:.1em}.food .panel{background:white;border:1px solid #e0e9e2;border-radius:20px;padding:22px;margin-top:18px;box-shadow:0 8px 28px #1a4d2a0b}.food label{display:block;font-weight:700;margin:15px 0 6px}.food select,.food button{width:100%;box-sizing:border-box;border:1px solid #cbdad0;border-radius:11px;padding:12px;font:inherit;background:#fff;color:#192b29}.food button.primary{background:#13795b;color:white;border:0;font-weight:800;margin-top:18px;cursor:pointer}.food .option{display:flex;gap:10px;align-items:center;font-size:14px;font-weight:500}.food .option input{width:19px;height:19px}.food .result{background:#e9f6ef;border:1px solid #c7e9d3}.food .result h2{font-size:28px;margin:5px 0}.food .meta{font-size:14px;color:#486a58}.food .hint{font-size:12px}.food [hidden]{display:none!important}</style><section class="food"><span class="eyebrow">오늘의 한 끼</span><h1>지금 뭐 먹지?</h1><p>오늘의 상황을 골라 주세요. 조건에 맞는 메뉴를 추천해 드릴게요.</p><form id="foodForm" class="panel"><label for="foodType">어떤 음식이 당기나요?</label><select id="foodType"><option value="">상관없어요</option><option>한식</option><option>일식</option><option>중식</option><option>양식</option></select><label for="foodBudget">한 끼 예산</label><select id="foodBudget"><option value="0">상관없어요</option><option value="10000">1만 원 이하</option><option value="15000">1만 5천 원 이하</option></select><label for="foodTime">쓸 수 있는 시간</label><select id="foodTime"><option value="0">상관없어요</option><option value="15">15분 이내</option><option value="25">25분 이내</option></select><label class="option"><input id="foodNoSpicy" type="checkbox">매운 음식 제외</label><label class="option"><input id="foodVeg" type="checkbox">채소 중심 메뉴</label><button class="primary" type="submit">메뉴 추천받기</button><p class="hint">금액과 시간은 예시입니다. 식당과 상황에 따라 달라질 수 있어요. 알레르기·식단 제한은 직접 재료를 확인해 주세요.</p></form><section class="panel result" id="foodResult" aria-live="polite" hidden></section></section>`;
const form=document.getElementById('foodForm');
if(form)form.onsubmit=e=>{e.preventDefault();const type=document.getElementById('foodType').value,budget=Number(document.getElementById('foodBudget').value),time=Number(document.getElementById('foodTime').value),noSpicy=document.getElementById('foodNoSpicy').checked,veg=document.getElementById('foodVeg').checked;
 const candidates=menus.filter(x=>(!type||x.type===type)&&(!budget||x.price<=budget)&&(!time||x.time<=time)&&(!noSpicy||!x.spicy)&&(!veg||x.veg));
 const box=document.getElementById('foodResult');box.hidden=false;if(!candidates.length){result=null;message='조건에 맞는 메뉴가 없어요. 예산이나 시간을 늘리거나 조건을 바꿔 보세요.';box.textContent=message;return}
 const choices=candidates.length>1?candidates.filter(x=>x.name!==previous):candidates;result=choices[Math.floor(Math.random()*choices.length)];previous=result.name;try{localStorage.setItem(key,previous)}catch{}box.innerHTML='<span class="eyebrow">오늘의 추천</span><h2>'+result.name+'</h2><div class="meta">'+result.type+' · 약 '+fmt(result.price)+'원 · 약 '+result.time+'분</div><p>선택한 조건에 맞는 메뉴예요. 다시 추천받으면 다른 메뉴를 우선 보여드려요.</p>';};
})();
