(function(){
  const cfg=window.VENTURE_APP||{};
  const app=document.getElementById("app");
  const key="receipt:"+String(cfg.session||"demo");
  window.ReceiptApp={
    cfg,app,key,records:JSON.parse(localStorage.getItem(key)||"[]"),
    view:"home",ocr:null,busy:false,error:"",imageUrl:"",
    esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])},
    money(n){return new Intl.NumberFormat("ko-KR",{style:"currency",currency:"KRW",maximumFractionDigits:0}).format(Number(n||0))},
    save(){localStorage.setItem(this.key,JSON.stringify(this.records))},
    nav(){return '<div class="tabs">'+[["home","홈"],["scan","촬영"],["list","기록"]].map(x=>'<button data-v="'+x[0]+'" class="'+(this.view===x[0]?"on":"")+'">'+x[1]+'</button>').join("")+'</div>'},
    head(sub){return '<div class="pill">LIVE OCR</div><h1>'+this.esc(this.cfg.name||"OCR 가계부")+'</h1><div class="muted">'+this.esc(sub||"영수증 촬영 → OCR → 품목별 가계부")+'</div>'},
    recent(limit){const a=this.records.slice().reverse().slice(0,limit||999);if(!a.length)return '<div class="empty">아직 기록이 없습니다.</div>';return a.map(r=>'<div class="rec"><div class="row"><b>'+this.esc(r.merchant||"영수증")+'</b><b>'+this.money(r.total)+'</b></div><div class="muted">'+this.esc(r.date||"날짜 미상")+' · 품목 '+(r.items||[]).length+'개</div></div>').join("")},
    bindNav(){document.querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{this.view=b.dataset.v;this.render()})}
  };
  document.head.insertAdjacentHTML("beforeend",'<style>body{margin:0;background:#07111e;color:#f7f9fd;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.app{max-width:680px;margin:auto;padding:20px 16px 80px}.card{background:#102039;border:1px solid #29405e;border-radius:17px;padding:15px;margin:10px 0}.muted{color:#93a6bf;font-size:12px}.row{display:flex;justify-content:space-between;gap:10px;align-items:center}.pill{display:inline-block;border:1px solid #2f765e;border-radius:999px;padding:4px 8px;font-size:10px;color:#9ee7ce}.btn{border:0;border-radius:11px;padding:12px 14px;background:#1a3357;color:white;font-weight:750}.pri{background:linear-gradient(135deg,#638cff,#725fff)}.wide{width:100%}.tabs{position:fixed;bottom:0;left:0;right:0;background:#081422f2;border-top:1px solid #263d59;padding:8px;display:flex;justify-content:center;gap:8px}.tabs button{border:0;background:transparent;color:#7890ad;padding:8px 18px}.tabs .on{color:#fff;font-weight:800}.metric{font-size:27px;font-weight:850}.rec{padding:11px 0;border-bottom:1px solid #263c57}.empty{text-align:center;padding:40px 10px;color:#90a4bf}input,textarea{font:inherit}</style>');
})();