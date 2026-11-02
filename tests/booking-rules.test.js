const test=require('node:test');const assert=require('node:assert/strict');const rules=require('../js/booking-rules');
test('manual Messenger contact schedules a new date without any automation',()=>{assert.deepEqual(rules.outcome('messenger_sent',0,'','2026-11-02'),{status:'awaiting_reply',attempt_count:1,next_contact_date:'2026-11-05'});});
test('retry dates follow the latest recorded contact and escalate to review',()=>{assert.equal(rules.outcome('no_answer',1,'','2026-11-05').next_contact_date,'2026-11-10');assert.equal(rules.outcome('sms_sent',2,'','2026-11-05').next_contact_date,'2026-11-19');});
test('customer requested date wins; skipping does not schedule unwanted contact',()=>{assert.equal(rules.outcome('call_on_date',3,'2026-12-10','2026-11-02').next_contact_date,'2026-12-10');assert.equal(rules.outcome('skipped',3,'','2026-11-02').next_contact_date,null);assert.throws(()=>rules.outcome('call_on_date',0,'','2026-11-02'));});
test('a date on calendar never implies confirmation',()=>{assert.equal(rules.queue({status:'needs_booking',calendar_event_id:'event',occurrence_date:'2026-11-02',due_month:'2026-11-01'},'2026-11-02'),'due');});
test('overdue service with a future contact date belongs in upcoming',()=>{assert.equal(rules.queue({status:'awaiting_reply',due_month:'2026-10-01',next_contact_date:'2026-11-05'},'2026-11-02'),'upcoming');});
test('priority overrides ordinary timing; suppression prevents unwanted contact',()=>{assert.equal(rules.queue({status:'needs_booking',high_priority:true,due_month:'2026-12-01',next_contact_date:'2026-12-01'},'2026-11-02'),'immediate');assert.equal(rules.queue({status:'stopped',high_priority:true},'2026-11-02'),'hold');});
test('recurring work sorts before ordinary work, but manual priority wins',()=>{let rows=[{id:'a',work_type:'new'},{id:'b',work_type:'recurring'},{id:'c',work_type:'new',high_priority:true}];assert.deepEqual(rows.sort(rules.sort).map(x=>x.id),['c','b','a']);});
test('confirmation is scoped to one visit',()=>{const first={status:'confirmed',due_month:'2026-10-01',confirmed_date:'2026-10-15'},next={status:'needs_booking',due_month:'2027-04-01'};assert.equal(rules.queue(first,'2026-11-02'),'confirmed');assert.equal(rules.queue(next,'2026-11-02'),'upcoming');});
test('on-hold visits stay in their own category regardless of service month',()=>{
 const v={status:'waiting',due_month:'2026-10-01'};
 assert.equal(rules.inView(v,'hold','2026-11','needs','2026-11-02'),true);
 assert.equal(rules.inView(v,'hold','2026-12','needs','2026-11-02'),true);
 assert.equal(rules.inView(v,'month','overdue','needs','2026-11-02'),false);
});
test('undated work belongs to Not scheduled, including manually prioritised work',()=>{
 const v={status:'needs_booking',high_priority:true};
 assert.equal(rules.category(v,'2026-11-02'),'unscheduled');
 assert.equal(rules.inView(v,'month','2026-11','needs','2026-11-02'),false);
});
test('month filters remain strict even for high priority work',()=>{
 const v={status:'needs_booking',high_priority:true,due_month:'2026-12-01'};
 assert.equal(rules.inView(v,'month','2026-11','needs','2026-11-02'),false);
 assert.equal(rules.inView(v,'month','2026-12','needs','2026-11-02'),true);
});
test('needs booking and confirmed are disjoint within the selected month',()=>{
 const v={status:'confirmed',due_month:'2026-11-01'};
 assert.equal(rules.inView(v,'month','2026-11','needs','2026-11-02'),false);
 assert.equal(rules.inView(v,'month','2026-11','confirmed','2026-11-02'),true);
});
test('a deferred visit returns to its month queue when its follow-up becomes due',()=>{
 const v={status:'deferred',due_month:'2026-10-01',next_contact_date:'2026-11-05'};
 assert.equal(rules.category(v,'2026-11-02'),'hold');
 assert.equal(rules.inView(v,'month','overdue','needs','2026-11-05'),true);
});
