(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VentureData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  function round(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
  function number(v) { if (v === '' || v == null || typeof v === 'boolean') return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
  function dateValid(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value; }
  function reconcile(receipt) {
    const items = Array.isArray(receipt.items) ? receipt.items : [];
    const missing = items.some(x => number(x.line_total) == null);
    const sum = round(items.reduce((s,x) => s + (number(x.line_total) || 0),0));
    const total = number(receipt.total_amount);
    return { sum, total, difference: total == null || missing ? null : round(total-sum), requiresReview: missing || total == null || Math.abs(round(total-sum)) > 0.01 };
  }
  function validateReceipt(r) {
    if (!r || !String(r.merchant || '').trim()) throw new Error('상호를 확인하세요.');
    if (!dateValid(r.purchase_date)) throw new Error('구매일을 확인하세요.');
    if (!/^[A-Z]{3}$/.test(r.currency || '')) throw new Error('통화를 확인하세요.');
    if (number(r.total_amount) == null || Number(r.total_amount) < 0) throw new Error('총액을 확인하세요.');
    if (!Array.isArray(r.items) || !r.items.length) throw new Error('추출 품목을 확인하거나 직접 추가하세요.');
    for (const item of r.items) {
      if (!String(item.name || '').trim() || number(item.quantity) == null || Number(item.quantity) <= 0 || number(item.line_total) == null || Number(item.line_total) < 0) throw new Error('품목명·수량·금액을 확인하세요.');
    }
    if (reconcile(r).requiresReview && !r.differenceAcknowledged) throw new Error('품목 합계와 영수증 총액 차이를 확인하세요.');
    return r;
  }
  function receiptSave(records, r) {
    validateReceipt(r);
    if (r.imageDigest && records.some(x => x.imageDigest === r.imageDigest && x.id !== r.id)) throw new Error('이미 저장한 영수증입니다. 기존 기록을 수정하세요.');
    const next = records.filter(x => x.id !== r.id);
    next.push(JSON.parse(JSON.stringify(r)));
    return next;
  }
  function summary(records, month) {
    const totals = {}, categories = {};
    for (const r of records.filter(x => !month || String(x.purchase_date).startsWith(month))) {
      const c = r.currency || 'KRW'; totals[c] = round((totals[c] || 0) + Number(r.total_amount || 0));
      categories[c] ||= {};
      for (const item of r.items || []) { const k = item.category || '기타'; categories[c][k] = round((categories[c][k] || 0) + Number(item.line_total || 0)); }
    }
    return { totals, categories };
  }
  function validateTrip(trip) {
    if (!String(trip.destination || '').trim()) throw new Error('여행지를 입력하세요.');
    if (!dateValid(trip.start) || !dateValid(trip.end) || trip.end < trip.start) throw new Error('여행 날짜를 확인하세요.');
    return trip;
  }
  function daysUntil(date, now = new Date()) {
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((Date.parse(date + 'T00:00:00Z') - today) / 86400000);
  }
  function progress(tasks) { const total=tasks.length, done=tasks.filter(x=>x.done).length; return {total,done,percent:total?Math.round(done/total*100):0}; }
  function safeLink(url) { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } }
  function storage(storage, sid, kind) {
    const key='startup-os:app:v3:'+sid+':'+kind;
    return {
      key,
      read() { const raw = storage.getItem(key); if (!raw) return []; const list=JSON.parse(raw); if (!Array.isArray(list)) throw new Error('저장 데이터 형식 오류. 먼저 데이터를 백업하세요.'); return list; },
      write(list) { if (!Array.isArray(list)) throw new Error('Invalid data'); storage.setItem(key, JSON.stringify(list)); },
      remove() { storage.removeItem(key); }
    };
  }
  function selfTests() {
    const tests=[];
    const test=(id,fn)=>{try{fn();tests.push({id,status:'passed'});}catch(e){tests.push({id,status:'failed',message:e.message});}};
    const assert=(condition,message)=>{if(!condition)throw new Error(message);};
    const receipt={id:'r1',merchant:'Fixture',purchase_date:'2026-01-02',currency:'KRW',total_amount:6000,items:[{name:'Apple',quantity:2,line_total:4000,category:'식료품'},{name:'Water',quantity:1,line_total:2000,category:'식료품'}],imageDigest:'fixture-only'};
    test('receipt_reconciliation',()=>assert(reconcile(receipt).difference===0,'sum mismatch'));
    test('unknown_is_not_zero',()=>assert(number(null)===null && number('')===null,'unknown became zero'));
    test('receipt_validation',()=>validateReceipt(receipt));
    test('total_difference_blocks_save',()=>{let rejected=false;try{validateReceipt({...receipt,total_amount:7000});}catch{rejected=true;}assert(rejected,'mismatch accepted');});
    test('duplicate_prevention',()=>{let rejected=false;try{receiptSave([receipt],{...receipt,id:'r2'});}catch{rejected=true;}assert(rejected,'duplicate accepted');});
    test('receipt_edit_not_duplicate',()=>assert(receiptSave([receipt],{...receipt,merchant:'Edited'}).length===1,'edit duplicated'));
    test('monthly_currency_totals',()=>assert(summary([receipt],'2026-01').totals.KRW===6000,'wrong month total'));
    test('month_filter',()=>assert(!summary([receipt],'2025-12').totals.KRW,'filter leaked'));
    test('trip_dates',()=>validateTrip({destination:'Seoul',start:'2026-05-01',end:'2026-05-03'}));
    test('trip_bad_dates',()=>{let rejected=false;try{validateTrip({destination:'x',start:'2026-05-03',end:'2026-05-01'});}catch{rejected=true;}assert(rejected,'bad dates accepted');});
    test('task_progress',()=>assert(progress([{done:true},{done:false}]).percent===50,'wrong completion'));
    test('unsafe_link_blocked',()=>assert(safeLink('javascript:alert(1)')==='','unsafe URL'));
    test('session_isolation_reload',()=>{const m=new Map(),mem={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};storage(mem,'A','receipt').write([receipt]);assert(storage(mem,'A','receipt').read().length===1 && storage(mem,'B','receipt').read().length===0,'session leak');});
    return tests;
  }
  return { round, number, dateValid, reconcile, validateReceipt, receiptSave, summary, validateTrip, daysUntil, progress, safeLink, storage, selfTests };
});
