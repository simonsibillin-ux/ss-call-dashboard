/* Booking operations use the same authenticated staff session as the dashboard. */
let bookingData={visits:[],recurring:[],jobs:[],clients:[],events:[],notes:[]};
let bookingView='recurring', bookingQueue='needs', bookingMonth=BookingRules.today().slice(0,7), bookingSelected=null, bookingLoading=0, bookingBusy=false;
const bookingEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bookingArg=value=>bookingEscape(JSON.stringify(String(value)));
async function bookingRest(path,method='GET',body) {
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${supabaseBearerToken()}`,'Content-Type':'application/json',Prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json().catch(()=>null);
  if(!response.ok) throw Error(data?.message||`Could not save (${response.status}).`);
  return data;
}
async function bookingAll(path) {
  let rows=[],offset=0;
  for(;;) { const page=await bookingRest(path+`&limit=500&offset=${offset}`); rows.push(...page); if(page.length<500)return rows; offset+=500; }
}
function bookingMonthLabel(value) { return value?new Date(value.slice(0,7)+'-01T12:00:00').toLocaleDateString('en-AU',{month:'long',year:'numeric'}):'Month not set'; }
function bookingRecord(v) { return v.recurring_job_id?bookingData.recurring.find(r=>r.id===v.recurring_job_id):bookingData.jobs.find(j=>j.id===v.job_id); }
function bookingClient(v) { const r=bookingRecord(v); const id=v.client_id||r?.client_id; if(id)return bookingData.clients.find(c=>c.id===id); const matches=bookingData.clients.filter(c=>c.name?.trim().toLowerCase()===r?.client?.trim().toLowerCase()); return matches.length===1?matches[0]:null; }
function bookingEvent(v) { return bookingData.events.find(e=>e.id===v.calendar_event_id); }
function bookingTitle(v) { return bookingClient(v)?.name||bookingRecord(v)?.client||bookingEvent(v)?.summary||'Calendar record'; }
function bookingService(v) { return bookingRecord(v)?.service||bookingEvent(v)?.summary||'Service needs review'; }
function bookingSourceNotes(v) {
  const record=bookingRecord(v), event=bookingEvent(v);
  const notes=bookingData.notes.filter(n=>(n.record_type==='job'&&n.record_id===v.job_id)||(n.record_type==='calendar_event'&&n.record_id===v.calendar_event_id));
  return [record?.notes,record?.description,event?.description,...notes.map(n=>`${priorityCandidateDate(n.created_at)} \u2014 ${n.author_name}\n${n.body}`)].filter(Boolean);
}
async function bookingCalendarRange(start,end) {
  let result=[],page='';
  do {
    const query=new URLSearchParams({timeMin:start,timeMax:end,singleEvents:'true',maxResults:'2500',...(page?{pageToken:page}:{})});
    const response=await googleCalendarFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?'+query);
    const data=await response.json(); if(!response.ok)throw Error(data.error?.message||'Calendar unavailable');
    result.push(...(data.items||[])); page=data.nextPageToken||'';
  } while(page);
  return result.filter(e=>e.status!=='cancelled');
}
async function loadBookingWorkspace() {
  const root=document.getElementById('page-unscheduled'); if(!root)return;
  const request=++bookingLoading;
  root.innerHTML='<div class="page-title">Bookings</div><div class="empty-state">Loading bookings\u2026</div>';
  try {
    await bookingRest('rpc/sync_booking_visits','POST',{});
    const [visits,recurring,jobs,clients,notes]=await Promise.all([
      bookingAll('booking_visits?select=*&order=created_at.asc'),bookingAll('recurring_jobs?select=*&order=id.asc'),bookingAll('jobs?select=*&order=id.asc'),bookingAll('clients?select=*&order=id.asc'),bookingAll('record_notes?select=*&record_type=in.(job,calendar_event)&deleted_at=is.null&order=created_at.desc')
    ]);
    const from=BookingRules.today().slice(0,7)+'-01', end=BookingRules.addDays(from,420);
    let events=[],warning='';
    try { const sets=await Promise.all([bookingCalendarRange('2026-01-01T00:00:00Z',end+'T00:00:00Z'),bookingCalendarRange('2099-01-01T00:00:00Z','2099-01-03T00:00:00Z')]); events=[...new Map(sets.flat().map(e=>[e.id,e])).values()]; }
    catch(error) { warning=error.message; }
    if(request!==bookingLoading)return;
    bookingData={visits,recurring,jobs,clients,notes,events,warning};
    bookingSelected=null; renderBookingWorkspace();
  } catch(error) { if(request===bookingLoading) root.innerHTML=`<div class="page-title">Bookings</div><div class="alert alert-danger">${bookingEscape(error.message)}</div><button class="btn-secondary" onclick="loadBookingWorkspace()">Retry</button>`; }
}
function bookingLegacyEvents() {
  const linked=new Set(bookingData.visits.map(v=>v.calendar_event_id).filter(Boolean));
  const jobEvents=new Set(bookingData.jobs.map(j=>j.google_calendar_event_id).filter(Boolean));
  const linkedSeries=new Set(bookingData.recurring.filter(r=>r.active).map(r=>r.source_calendar_series_id).filter(Boolean));
  const legacy=bookingData.events.filter(e=>(e.start?.date||e.start?.dateTime||'').startsWith('2099')&&!linked.has(e.id)&&!jobEvents.has(e.id));
  const unresolvedSeries=new Set(legacy.map(e=>e.recurringEventId).filter(Boolean));
  const future=new Map();
  for(const e of bookingData.events){
    const date=(e.start?.date||e.start?.dateTime||'').slice(0,10);
    if(!e.recurringEventId||date<BookingRules.today().slice(0,7)+'-01'||date>='2099'||linked.has(e.id)||linkedSeries.has(e.recurringEventId)||unresolvedSeries.has(e.recurringEventId))continue;
    if(!future.has(e.recurringEventId)||date<(future.get(e.recurringEventId).start?.date||future.get(e.recurringEventId).start?.dateTime||'').slice(0,10))future.set(e.recurringEventId,e);
  }
  return legacy.concat([...future.values()]);
}
function bookingRelevant(v) {
  const r=bookingRecord(v);
  if(v.recurring_job_id && (!r||!r.active))return false;
  if(v.job_id && (!r||String(r.status).toLowerCase()!=='active'))return false;
  if(v.job_id && r.completion_date && v.status!=='confirmed')return false;
  return true;
}
function renderBookingWorkspace() {
  const root=document.getElementById('page-unscheduled');
  const all=bookingData.visits.filter(bookingRelevant), legacy=bookingLegacyEvents(), day=BookingRules.today();
  const records=all.filter(v=>bookingView==='new'?v.work_type==='new':bookingView==='recurring'?v.work_type==='recurring':true);
  const inMonth=v=>bookingMonth==='overdue'?v.due_month&&v.due_month<day.slice(0,7)+'-01'&&v.status!=='confirmed':!v.due_month||v.due_month.slice(0,7)===bookingMonth;
  const monthRecords=records.filter(inMonth), confirmed=monthRecords.filter(v=>v.status==='confirmed').length;
  const legacyMonth=legacy.filter(e=>(e.start?.date||e.start?.dateTime||'').slice(0,7)===bookingMonth);
  const needs=monthRecords.filter(v=>!['confirmed','skipped','stopped'].includes(v.status)).length;
  const tab=(value,label,count)=>`<button class="priority-page-tab ${bookingView===value?'active':''}" onclick="bookingView='${value}';bookingQueue='needs';renderBookingWorkspace()">${label}${count===undefined?'':` <span>${count}</span>`}</button>`;
  root.innerHTML=`<div class="booking-heading"><div class="page-title">Bookings</div><button class="btn-secondary" onclick="loadBookingWorkspace()">Refresh</button></div>
    <div class="priority-page-tabs">${tab('recurring','Recurring bookings')}${tab('new','Unscheduled jobs')}${tab('legacy','Calendar review',legacy.length)}</div>
    ${bookingData.warning?`<div class="alert alert-danger">Calendar unavailable: ${bookingEscape(bookingData.warning)}. CRM records are still available.</div>`:''}
    <div id="booking-content"></div><div id="booking-detail"></div>`;
  const content=document.getElementById('booking-content');
  if(bookingView==='legacy') {
    content.innerHTML=`<div class="booking-summary">${legacy.length} calendar records to review</div><div class="booking-cards">${legacy.map(e=>`<article class="booking-card"><strong>${bookingEscape(e.summary)}</strong><span class="booking-pill warning">NOT CONFIRMED \u2014 CRM link needed</span><div class="booking-month">${(e.start?.date||e.start?.dateTime||'').startsWith('2099')?'Service month needs review':'Service due: '+bookingMonthLabel((e.start?.date||e.start?.dateTime||'').slice(0,7))}</div><p class="booking-source">${bookingEscape((e.description||'').slice(0,250))}</p><button class="btn-secondary" onclick="bookingOpenImport(${bookingArg(e.id)})">Review CRM match</button></article>`).join('')||'<div class="empty-state">No calendar records waiting for review.</div>'}</div>`;return;
  }
  const current=day.slice(0,7), next=BookingRules.addDays(current+'-01',32).slice(0,7);
  content.innerHTML=`<div class="booking-toolbar"><button class="btn-secondary ${bookingMonth===current?'selected':''}" onclick="bookingMonth='${current}';renderBookingWorkspace()">This month</button><button class="btn-secondary ${bookingMonth===next?'selected':''}" onclick="bookingMonth='${next}';renderBookingWorkspace()">Next month</button><button class="btn-secondary ${bookingMonth==='overdue'?'selected':''}" onclick="bookingMonth='overdue';renderBookingWorkspace()">Overdue <span>${records.filter(v=>v.due_month&&v.due_month<current+'-01'&&!['confirmed','skipped','stopped'].includes(v.status)).length}</span></button><input type="month" aria-label="Service month" class="form-input" value="${bookingMonth==='overdue'?'':bookingMonth}" onchange="bookingMonth=this.value;renderBookingWorkspace()"><input type="search" id="booking-search" aria-label="Search bookings" class="form-input" placeholder="Search customer, service or suburb" oninput="bookingRenderCards()"></div>
    <div class="booking-summary">${bookingMonth==='overdue'?'Overdue':bookingMonthLabel(bookingMonth)} <span>${needs} need booking \u00b7 ${confirmed} confirmed</span></div>
    <div class="priority-sub-tabs">${[['needs','Needs booking'],['confirmed','Confirmed'],['hold','On hold'],['setup','Needs setup']].map(([key,label])=>`<button class="priority-sub-tab ${bookingQueue===key?'active':''}" onclick="bookingQueue='${key}';renderBookingWorkspace()">${label}</button>`).join('')}</div>${bookingView==='recurring'&&legacyMonth.length?`<div class="booking-review-notice"><strong>${legacyMonth.length} more calendar series need CRM review for ${bookingMonthLabel(bookingMonth)}.</strong><span class="booking-pill warning">NOT CONFIRMED</span><button class="btn-secondary" onclick="bookingView='legacy';renderBookingWorkspace()">Review calendar records</button></div>`:''}<div id="booking-cards"></div>`;
  bookingRenderCards();
}
function bookingRenderCards() {
  const holder=document.getElementById('booking-cards');if(!holder)return;
  const query=(document.getElementById('booking-search')?.value||'').toLowerCase(),day=BookingRules.today();
  let records=bookingData.visits.filter(bookingRelevant).filter(v=>bookingView==='new'?v.work_type==='new':v.work_type==='recurring');
  records=records.filter(v=>[bookingTitle(v),bookingService(v),bookingClient(v)?.suburb].join(' ').toLowerCase().includes(query));
  // Urgent work and missing setup remain visible across month filters.
  records=records.filter(v=>{
    const q=BookingRules.queue(v,day);
    if(bookingQueue==='setup')return q==='setup';
    if(bookingQueue==='hold')return q==='hold';
    if(bookingQueue==='confirmed')return v.status==='confirmed'&&(bookingMonth==='overdue'?v.due_month<day.slice(0,7)+'-01':v.due_month?.slice(0,7)===bookingMonth);
    return !['hold','setup','confirmed'].includes(q)&&(q==='immediate'||(bookingMonth==='overdue'?v.due_month<day.slice(0,7)+'-01':v.due_month?.slice(0,7)===bookingMonth));
  }).sort(BookingRules.sort);
  const sections=bookingQueue==='needs'?[['immediate','Immediate action'],['due','Due / overdue'],['upcoming','Upcoming']]:[[bookingQueue,bookingQueue==='confirmed'?'Confirmed':bookingQueue==='hold'?'On hold':'Needs setup']];
  holder.innerHTML=sections.map(([key,label])=>{
    const rows=bookingQueue==='needs'?records.filter(v=>BookingRules.queue(v,day)===key):records;
    if(!rows.length)return '';
    return `<section class="priority-group"><div class="priority-group-header"><div class="priority-group-title">${label}</div><span class="priority-group-count">${rows.length}</span></div><div class="booking-cards">${rows.map(bookingCard).join('')}</div></section>`;
  }).join('')||'<div class="empty-state">No bookings in this view.</div>';
}
function bookingCard(v) {
 const c=bookingClient(v), confirmed=v.status==='confirmed';
 return `<article class="booking-card ${v.high_priority?'is-priority':''}"><div class="booking-card-top"><strong>${bookingEscape(bookingTitle(v))}</strong><button class="booking-star ${v.high_priority?'selected':''}" aria-label="${v.high_priority?'Remove':'Mark'} high priority" onclick="bookingTogglePriority(${bookingArg(v.id)})">${v.high_priority?'\u2605 High priority':'\u2606 Priority'}</button></div><div class="booking-service">${bookingEscape(bookingService(v))}</div>${c?.suburb?`<div class="booking-muted">${bookingEscape(c.suburb)}</div>`:''}<div class="booking-month">Service due: <strong>${bookingMonthLabel(v.due_month)}</strong></div><div class="booking-pill ${confirmed?'confirmed':'warning'}">${confirmed?'CONFIRMED \u2014 '+priorityCandidateDate(v.confirmed_date):'NOT CONFIRMED'}</div>${!confirmed&&v.status!=='needs_booking'?`<div class="booking-status">${BookingRules.labels[v.status]||v.status}</div>`:''}${v.last_contact_at?`<div class="booking-muted">Last contact: ${bookingEscape((v.last_outcome||'').replaceAll('_',' '))} \u00b7 ${priorityCandidateDate(v.last_contact_at)}</div>`:''}${!confirmed?`<div class="booking-next">${v.next_contact_date?'Next follow-up: '+priorityCandidateDate(v.next_contact_date):['waiting','owner','stopped','skipped'].includes(v.status)?BookingRules.labels[v.status]:'Next follow-up not set'}</div>`:''}<div class="booking-actions"><button class="btn-secondary" onclick="bookingOpenDetail(${bookingArg(v.id)})">${confirmed?'View booking':'Record contact'}</button>${!confirmed?`<button class="btn-primary" onclick="bookingOpenDetail(${bookingArg(v.id)},true)">Confirm booking</button>`:''}</div></article>`;
}
function bookingOpenDetail(id,confirm=false) {
 const v=bookingData.visits.find(v=>v.id===id);if(!v)return; bookingSelected=v;
 const c=bookingClient(v),r=bookingRecord(v), el=document.getElementById('booking-detail');
 document.getElementById('booking-content').hidden=true;
 el.innerHTML=`<button class="btn-secondary" onclick="bookingCloseDetail()">\u2190 Back</button><div class="booking-detail-card"><h2>${bookingEscape(bookingTitle(v))}</h2><div>${bookingEscape(bookingService(v))}</div><div class="booking-month">Service due: <strong>${bookingMonthLabel(v.due_month)}</strong></div><span class="booking-pill ${v.status==='confirmed'?'confirmed':'warning'}">${v.status==='confirmed'?'CONFIRMED \u2014 '+priorityCandidateDate(v.confirmed_date):'NOT CONFIRMED'}</span><div class="booking-contact">${c?.phone?`<a href="tel:${bookingEscape(c.phone.replace(/[^+0-9]/g,''))}">${bookingEscape(c.phone)}</a>`:''}${c?.email?`<a href="mailto:${bookingEscape(c.email)}">${bookingEscape(c.email)}</a>`:''}<span>${bookingEscape([c?.address,c?.suburb].filter(Boolean).join(', '))}</span>${!c?.phone&&!c?.email?'<span class="booking-warning">Collect a phone number or email.</span>':''}</div>
 ${v.status!=='confirmed'?`<div class="booking-form"><h3>Record contact</h3><label>Channel<select class="form-input" id="booking-channel">${['Phone','SMS','Email','Messenger','Other'].map(x=>`<option ${v.contact_channel===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Outcome<select class="form-input" id="booking-outcome" onchange="bookingOutcomePreview()"><option value="">Select outcome\u2026</option>${Object.entries({no_answer:'No answer',voicemail_left:'Voicemail left',sms_sent:'SMS sent',email_sent:'Email sent',messenger_sent:'Messenger sent',call_on_date:'Contact on a specific date',ready_to_book:'Ready to book',customer_will_contact:'Customer will contact us',owner_handling:'Simon handling',deferred:'Defer visit',skipped:'Skip this visit',declined:'Declined',do_not_contact:'Do not contact'}).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label id="booking-date-field" hidden>Next contact date<input id="booking-next-date" type="date" min="${BookingRules.today()}" class="form-input" onchange="bookingOutcomePreview()"></label><div id="booking-next-preview" class="booking-next"></div><label>Note<textarea class="form-input" id="booking-note" rows="3"></textarea></label><button class="btn-primary" onclick="bookingSaveOutcome()">Save contact</button></div>`:''}
 <div class="booking-form" id="booking-confirm-form"><h3>${v.status==='confirmed'?'Change confirmed date':'Confirm booking'}</h3><label>Agreed date<input type="date" id="booking-confirm-date" class="form-input" min="${BookingRules.today()}" value="${v.confirmed_date||''}"></label><label class="booking-check"><input type="checkbox" id="booking-agreed"> The customer agreed to this date</label><button class="btn-primary" onclick="bookingConfirm()">Save confirmed booking</button><div id="booking-save-status" role="status"></div></div>
 <details class="booking-form"><summary>Service month &amp; follow-up date</summary><label>Service due month<input id="booking-due-month" class="form-input" type="month" value="${v.due_month?.slice(0,7)||''}"></label><label>Next follow-up<input id="booking-edit-next" class="form-input" type="date" value="${v.next_contact_date||''}"></label><button class="btn-secondary" onclick="bookingSaveDates()">Save dates</button></details>
 <details class="booking-form"><summary>Internal notes &amp; history</summary>${v.setup_note?`<p>${bookingEscape(v.setup_note)}</p>`:''}${bookingSourceNotes(v).map(n=>`<p class="booking-source">${bookingEscape(n)}</p>`).join('')}${[...(v.history||[])].reverse().map(h=>`<div class="booking-history"><strong>${bookingEscape(h.by)} \u00b7 ${priorityCandidateDateTime(h.at)}</strong><p>${bookingEscape(h.note)}</p></div>`).join('')}<small>CRM: ${bookingEscape(r?.id||v.source_key)}</small></details></div>`;
 if(confirm)document.getElementById('booking-confirm-form').scrollIntoView({block:'center'});
}
function bookingCloseDetail(){bookingSelected=null;renderBookingWorkspace();}
function bookingOutcomePreview(){
 const code=document.getElementById('booking-outcome')?.value;
 document.getElementById('booking-date-field').hidden=!['call_on_date','deferred'].includes(code);
 try{const next=BookingRules.outcome(code,bookingSelected.attempt_count,document.getElementById('booking-next-date').value);document.getElementById('booking-next-preview').textContent=next.next_contact_date?'Next follow-up: '+priorityCandidateDate(next.next_contact_date):BookingRules.labels[next.status];}catch(e){document.getElementById('booking-next-preview').textContent=code?e.message:'';}
}
async function bookingSave(v,changes,note){
 const updated=await bookingRest('rpc/save_booking_visit','POST',{p_id:v.id,p_changes:changes,p_note:note,p_expected_at:v.updated_at});
 const row=Array.isArray(updated)?updated[0]:updated;bookingData.visits=bookingData.visits.map(x=>x.id===row.id?row:x);return row;
}
async function bookingTogglePriority(id){if(bookingBusy)return;bookingBusy=true;try{const v=bookingData.visits.find(v=>v.id===id);await bookingSave(v,{high_priority:!v.high_priority},v.high_priority?'High priority removed':'Marked high priority');bookingRenderCards();}catch(e){showToast(e.message,'error');}finally{bookingBusy=false;}}
async function bookingSaveOutcome(){
 if(bookingBusy)return;bookingBusy=true;
 try{const v=bookingSelected,code=document.getElementById('booking-outcome').value,note=document.getElementById('booking-note').value.trim(),channel=document.getElementById('booking-channel').value;
 if(['deferred','skipped','declined','do_not_contact'].includes(code)&&!note)throw Error('Add a reason for this outcome.');
 const change=BookingRules.outcome(code,v.attempt_count,document.getElementById('booking-next-date').value);
 await bookingSave(v,{...change,last_outcome:code,contact_channel:channel},`${channel}: ${code.replaceAll('_',' ')}${change.next_contact_date?' \u00b7 Next follow-up '+change.next_contact_date:''}${note?'\n'+note:''}`);
 showToast('Contact saved');bookingCloseDetail();
 }catch(e){showToast(e.message,'error');}finally{bookingBusy=false;}
}
async function bookingSaveDates(){if(bookingBusy)return;bookingBusy=true;try{const month=document.getElementById('booking-due-month').value,next=document.getElementById('booking-edit-next').value; if(!month)throw Error('Choose a service month.');await bookingSave(bookingSelected,{due_month:month+'-01',next_contact_date:next||null,...(['stopped','skipped'].includes(bookingSelected.status)&&next?{status:'needs_booking'}:{})},'Service month / follow-up date updated');showToast('Dates saved');bookingCloseDetail();}catch(e){showToast(e.message,'error');}finally{bookingBusy=false;}}
function bookingMatchingEvents(v){
 if(v.calendar_event_id)return bookingData.events.filter(e=>e.id===v.calendar_event_id);
 const r=bookingRecord(v);if(!r)return [];
 const linked=new Set(bookingData.visits.filter(x=>x.id!==v.id).map(x=>x.calendar_event_id).filter(Boolean));
 return bookingData.events.filter(e=>!linked.has(e.id)&&((e.extendedProperties?.private?.ss_visit_id===v.id)||(((r.source_calendar_series_id&&e.recurringEventId===r.source_calendar_series_id&&(e.originalStartTime?.date||e.originalStartTime?.dateTime||e.start?.date||'').slice(0,7)===v.due_month?.slice(0,7))||(e.start?.date||e.start?.dateTime||'').slice(0,10)===v.occurrence_date)&&((r.source_calendar_series_id&&e.recurringEventId===r.source_calendar_series_id)||((e.summary||'').startsWith(r.client+' | ')&&(e.summary||'').includes(r.service)&&(e.summary||'').includes('(Recurring)'))))));
}
async function bookingConfirm(){
 if(bookingBusy)return;const v=bookingSelected,date=document.getElementById('booking-confirm-date').value;
 if(!date||date<BookingRules.today())return showToast('Choose a current or future date.','error');
 if(!document.getElementById('booking-agreed').checked)return showToast('Confirm the customer agreed to this date.','error');
 bookingBusy=true;const status=document.getElementById('booking-save-status');status.textContent='Saving\u2026';
 let lockedVisit=null;const lockToken=crypto.randomUUID();
 try {
  const claim=await bookingRest('rpc/claim_booking_confirmation','POST',{p_id:v.id,p_expected_at:v.updated_at,p_token:lockToken});
  lockedVisit=Array.isArray(claim)?claim[0]:claim;
  let matches=bookingMatchingEvents(v),event=matches[0];if(matches.length>1)throw Error('Several calendar events match. Resolve the duplicate calendar entries before confirming.');
  if(bookingData.warning)throw Error('Reconnect Calendar and refresh before confirming.');
  const r=bookingRecord(v),c=bookingClient(v), id=v.calendar_event_id||event?.id;
  const body={start:{date},end:{date:BookingRules.addDays(date,1)},extendedProperties:{private:{...(event?.extendedProperties?.private||{}),ss_visit_id:v.id,ss_confirmed_date:date}}};
  if(!id){body.id='ss'+v.id.replaceAll('-','');body.summary=[bookingTitle(v),c?.suburb,bookingService(v),r?.revenue?'$'+r.revenue:''].filter(Boolean).join(' | ');body.description=r?.notes||'';}
  const url='https://www.googleapis.com/calendar/v3/calendars/primary/events'+(id?'/'+encodeURIComponent(id):'');
  let response=await googleCalendarFetch(url,{method:id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let saved=await response.json();
  if(response.status===409&&!id){response=await googleCalendarFetch(url+'/'+body.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,id:undefined})});saved=await response.json();}
  if(!response.ok)throw Error(saved.error?.message||'Calendar did not save.');
  await bookingSave(lockedVisit,{status:'confirmed',confirmed_date:date,calendar_event_id:saved.id,next_contact_date:null,_booking_token:lockToken},`Customer agreed to ${date}. Calendar updated.`);
  bookingData.events=bookingData.events.filter(e=>e.id!==saved.id).concat(saved);
  showToast('Booking confirmed');bookingCloseDetail();
 }catch(e){status.textContent=e.message;showToast(e.message,'error');}finally{if(lockedVisit){try{await bookingRest('rpc/release_booking_confirmation','POST',{p_id:v.id,p_token:lockToken});}catch{}}bookingBusy=false;}
}
async function prioritySetManualOnly(enabled){const candidate=_priorityCandidatesById[_prioritySelectedId];if(!candidate)return;try{await priorityPatchRecord('quotes',candidate.recordId,enabled?{manual_only:true,follow_up_enabled:false,next_follow_up_at:null,follow_up_paused_until:null,manual_follow_up_at:candidate.manualFollowUpAt||new Date().toISOString(),manual_follow_up_state:'active'}:{manual_only:false});await priorityRefreshEditedQuote(candidate.id,enabled?'Manual-only follow-up enabled':'Manual-only mode removed');}catch(e){showToast(e.message,'error');}}
function bookingOpenImport(eventId){
 const event=bookingData.events.find(e=>e.id===eventId);if(!event)return;
 bookingSelected={importEvent:event};document.getElementById('booking-content').hidden=true;
 document.getElementById('booking-detail').innerHTML=`<button class="btn-secondary" onclick="bookingCloseDetail()">\u2190 Back</button><div class="booking-detail-card"><h2>${bookingEscape(event.summary)}</h2><span class="booking-pill warning">NOT CONFIRMED</span><p class="booking-source">${bookingEscape(event.description||'')}</p><div class="booking-form"><label>Customer profile<input type="search" id="booking-client-search" class="form-input" placeholder="Search customer name, phone or address" oninput="bookingImportClients()"></label><label>Matched customer<select id="booking-import-client" class="form-input" onchange="bookingImportRecurring()"><option value="">Choose customer\u2026</option></select></label><label>Import as<select id="booking-import-kind" class="form-input"><option value="new">One-off job / requote needed</option><option value="recurring">Recurring arrangement</option></select></label><label>Existing recurring arrangement<select id="booking-import-recurring" class="form-input"><option value="">Create new arrangement</option></select></label><label>Service<input id="booking-import-service" class="form-input"></label><label>Service due month<input id="booking-import-month" type="month" class="form-input" value="${(event.start?.date||event.start?.dateTime||'').startsWith('2099')?'':(event.start?.date||event.start?.dateTime||'').slice(0,7)}"></label><label>Verified frequency<select id="booking-import-frequency" class="form-input"><option value="">Choose frequency\u2026</option>${Object.entries({weekly:'Weekly',fortnightly:'Fortnightly',monthly:'Monthly','6weekly':'Every 6 weeks',bimonthly:'Every 2 months',quarterly:'Quarterly','6monthly':'Every 6 months',annually:'Annually'}).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Verified price (leave blank if requote needed)<input id="booking-import-amount" class="form-input" type="number" min="0" step="0.01"></label><button class="btn-primary" onclick="bookingImportSave()">Import into CRM</button></div></div>`;
}
function bookingImportClients(){const q=document.getElementById('booking-client-search').value.toLowerCase().trim();document.getElementById('booking-import-client').innerHTML='<option value="">Choose customer\u2026</option>'+bookingData.clients.filter(c=>q&&[c.name,c.phone,c.email,c.address,c.suburb].join(' ').toLowerCase().includes(q)).slice(0,40).map(c=>`<option value="${bookingEscape(c.id)}">${bookingEscape([c.name,c.phone,c.address].filter(Boolean).join(' \u00b7 '))}</option>`).join('');bookingImportRecurring();}
function bookingImportRecurring(){const id=document.getElementById('booking-import-client').value;document.getElementById('booking-import-recurring').innerHTML='<option value="">Create new arrangement</option>'+bookingData.recurring.filter(r=>r.client_id===id).map(r=>`<option value="${bookingEscape(r.id)}">${bookingEscape(r.service+' \u00b7 '+r.frequency)}</option>`).join('');}
async function bookingImportSave(){if(bookingBusy)return;bookingBusy=true;try{
 const val=id=>document.getElementById('booking-import-'+id).value,client=val('client'),kind=val('kind'),service=val('service').trim(),month=val('month');
 if(!client||!service)throw Error('Choose the customer profile and service.');
 if(kind==='recurring'&&!val('recurring')&&bookingData.recurring.some(r=>r.active&&r.client_id===client))throw Error('This customer already has a recurring arrangement. Select it, or review the CRM first.');
 if(kind==='recurring'&&!val('recurring')&&!val('frequency'))throw Error('Verify the recurrence frequency first.');
 await bookingRest('rpc/import_calendar_booking','POST',{p_event:bookingSelected.importEvent,p_client_id:client,p_kind:kind,p_existing_recurring_id:val('recurring')||null,p_service:service,p_frequency:val('frequency')||null,p_due_month:month?month+'-01':null,p_amount:val('amount')?Number(val('amount')):null});
 showToast('Imported into CRM');await loadBookingWorkspace();
 }catch(e){showToast(e.message,'error');}finally{bookingBusy=false;}}
function priorityQuotePreview(){
 const el=document.getElementById('priority-next-preview'),candidate=_priorityCandidatesById[_prioritySelectedId],code=document.getElementById('priority-outcome')?.value;
 if(!el||!candidate)return;if(!code){el.textContent='';return;}
 const outcomes=(candidate.noteEntries||[]).filter(n=>n.outcomeCode);let count=0;for(const n of outcomes){if(!BookingRules.attempts.has(n.outcomeCode))break;count++;}
 try{const result=BookingRules.outcome(code,count,document.getElementById('priority-next-contact-date')?.value||'');el.textContent=result.next_contact_date?'Next manual follow-up: '+priorityCandidateDate(result.next_contact_date):BookingRules.labels[result.status];}catch(e){el.textContent=e.message;}
}
// Customer requests should appear promptly while a rep is working on the page.
setInterval(()=>{if(document.visibilityState==='visible'&&document.getElementById('page-followups')?.classList.contains('active')&&!_prioritySelectedId)loadAiFollowUpPriorities(true);},30000);
