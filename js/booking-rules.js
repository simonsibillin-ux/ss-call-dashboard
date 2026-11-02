/* Shared deterministic queue rules. No note interpretation or model calls. */
(function(root) {
  const attempts = new Set(['no_answer','voicemail_left','sms_sent','email_sent','messenger_sent']);
  const labels = {needs_booking:'Needs booking',awaiting_reply:'Awaiting reply',ready_to_book:'Ready to book',waiting:'Waiting for customer',owner:'Simon handling',deferred:'Deferred',skipped:'Skipped',stopped:'Do not contact',confirmed:'Confirmed'};
  function today(now = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
  function addDays(day,n) { const d=new Date(day+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
  const holidays=new Set(['2026-11-03','2026-12-25','2026-12-28','2027-01-01','2027-01-26','2027-03-08','2027-03-26','2027-03-29','2027-06-14','2027-11-02','2027-12-27','2027-12-28']);
  function businessDate(day,n) { while(n>0) { day=addDays(day,1); const w=new Date(day+'T12:00:00Z').getUTCDay(); if(w!==0&&w!==6&&!holidays.has(day)) n--; } return day; }
  function outcome(code,count=0,chosen='',day=today()) {
    if(attempts.has(code)) { const attempt=count+1; return {status:'awaiting_reply',attempt_count:attempt,next_contact_date:businessDate(day,attempt===1?2:attempt===2?3:10)}; }
    if(['call_on_date','deferred'].includes(code)) { if(!chosen||chosen<day) throw Error('Choose a future contact date.'); return {status:code==='deferred'?'deferred':'needs_booking',attempt_count:0,next_contact_date:chosen}; }
    const status={ready_to_book:'ready_to_book',customer_will_contact:'waiting',owner_handling:'owner',declined:'stopped',do_not_contact:'stopped',skipped:'skipped'}[code];
    if(!status) throw Error('Choose an outcome.');
    return {status,attempt_count:0,next_contact_date:null};
  }
  function queue(v,day=today()) {
    if(v.status==='confirmed') return 'confirmed';
    if(['waiting','owner','deferred','skipped','stopped'].includes(v.status) && (!v.next_contact_date||v.next_contact_date>day)) return 'hold';
    if(v.high_priority||v.status==='ready_to_book') return 'immediate';
    if(!v.due_month||v.work_type==='legacy') return 'setup';
    if(v.next_contact_date && v.next_contact_date>day) return 'upcoming';
    if(v.due_month>day.slice(0,7)+'-01'&&!v.next_contact_date) return 'upcoming';
    return 'due';
  }
  function sort(a,b) { return Number(Boolean(b.high_priority))-Number(Boolean(a.high_priority))||Number(b.work_type==='recurring')-Number(a.work_type==='recurring')||String(a.next_contact_date||a.due_month||'9999').localeCompare(String(b.next_contact_date||b.due_month||'9999'))||String(a.id).localeCompare(String(b.id)); }
  const api={attempts,labels,today,addDays,businessDate,outcome,queue,sort};
  if(typeof module!=='undefined') module.exports=api; else root.BookingRules=api;
})(typeof window==='undefined'?globalThis:window);
