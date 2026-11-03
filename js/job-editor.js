let bookingEditorState=null;
const bookingMoney=value=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(Number(value)||0);
function bookingBaseRecord(v){return v.recurring_job_id?bookingData.recurring.find(r=>r.id===v.recurring_job_id):bookingData.jobs.find(j=>j.id===v.job_id);}
function bookingItemsHtml(record){
 const items=Array.isArray(record?.items)?record.items:[];
 if(!items.length)return '';
 return `<div class="booking-line-summary">${items.map(i=>`<div><span>${bookingEscape(i.description||i.name||'Service')}<small>${bookingEscape(i.qty??1)}${i.unit?' '+bookingEscape(i.unit):''}</small></span><strong>${bookingMoney(i.total??Number(i.qty||1)*Number(i.rate||0))}</strong></div>`).join('')}</div>`;
}
function bookingJobActionsHtml(v){
 const r=bookingBaseRecord(v);if(!r)return '';
 return `<div class="booking-job-actions"><button type="button" class="btn-secondary" onclick="bookingOpenEditor()">Edit job</button><button type="button" class="booking-text-action" onclick="bookingOpenQuote()">View linked quote</button><button type="button" class="booking-text-action" onclick="bookingOpenLifecycle()">Archive or delete</button></div>`;
}
function bookingSwitchPanel(id,title){
 if(bookingBusy)return false;
 for(const panel of document.querySelector('.booking-dialog-scroll').children)panel.hidden=panel.id!==id;
 document.getElementById('booking-dialog-title').textContent=title;
 const feedback=document.getElementById('booking-dialog-feedback');if(feedback)feedback.hidden=true;
 document.querySelector('.booking-dialog-scroll').scrollTop=0;return true;
}
function bookingSecondaryPanel(id,html,title){
 let panel=document.getElementById(id);
 if(!panel){panel=document.createElement('section');panel.id=id;document.querySelector('.booking-dialog-scroll').append(panel);}
 panel.innerHTML=html;bookingSwitchPanel(id,title);
 panel.querySelector('input,select,button')?.focus();
}
async function bookingOpenEditor(){
 if(bookingBusy||!bookingSelected?.id)return;
 const selected=bookingSelected,table=selected.recurring_job_id?'recurring_jobs':'jobs',recordId=selected.recurring_job_id||selected.job_id;
 bookingBusy=true;
 try{
  const [records,visits]=await Promise.all([bookingRest(table+'?id=eq.'+encodeURIComponent(recordId)+'&select=*&limit=1'),bookingRest('booking_visits?id=eq.'+encodeURIComponent(selected.id)+'&select=*&limit=1')]);
  const record=records[0],visit=visits[0];
  if(!record||!visit||visit.archived_at||record.archived_at||record.deleted_at||(selected.recurring_job_id&&!record.active)||(!selected.recurring_job_id&&String(record.status).toLowerCase()!=='active'))throw Error('This job is no longer active. Refresh the booking list.');
  const collection=selected.recurring_job_id?'recurring':'jobs';
  bookingData[collection]=bookingData[collection].map(row=>row.id===record.id?record:row);
  bookingData.visits=bookingData.visits.map(row=>row.id===visit.id?visit:row);bookingSelected=visit;
  bookingBusy=false;bookingRenderEditor();
 }catch(e){bookingNotify(e.message,'error');}finally{bookingBusy=false;}
}
function bookingRenderEditor(){
 if(bookingBusy||!bookingSelected?.id)return;
 const v=bookingSelected,r=bookingBaseRecord(v),effective=bookingRecord(v);if(!r)return;
 bookingEditorState={visitId:v.id,recordVersion:r.updated_at,scope:v.recurring_job_id?'visit':'job',items:JobEditRules.itemsFromRecord(effective)};
 bookingSecondaryPanel('booking-editor-panel',`<div class="booking-editor"><header><h2>${bookingEscape(bookingTitle(v))}</h2><p class="booking-muted">${bookingEscape(bookingLocation(v))}</p></header>
 <div class="booking-form">${v.recurring_job_id?`<label for="job-edit-scope">Apply changes to</label><select id="job-edit-scope" class="form-input" onchange="bookingEditorScopeChanged()"><option value="visit">This visit only</option><option value="future">This visit and the recurring arrangement</option></select><p id="job-edit-scope-help" class="booking-muted">Future visits keep the regular service and price.</p>`:'<p class="booking-muted">Changes apply to this job.</p>'}
 <label for="job-edit-service">Service summary</label><input class="form-input" id="job-edit-service" maxlength="500" value="${bookingEscape(effective.service||'')}">
 <label for="job-edit-description">Work instructions / scope</label><textarea class="form-input" id="job-edit-description" rows="4">${bookingEscape(effective.description||'')}</textarea>
 <div class="booking-editor-section"><h3>Services &amp; pricing</h3><div id="job-edit-items"></div><button type="button" class="btn-secondary" onclick="bookingEditorAddItem()">Add service item</button><div class="booking-editor-total"><span>Job total</span><strong id="job-edit-total"></strong></div></div>
 <label for="job-edit-hours">Estimated hours</label><input class="form-input" id="job-edit-hours" type="number" min="0" step="0.25" value="${Number(effective.hours)||0}">
 <div id="job-edit-recurrence" class="booking-editor-section" hidden><h3>Recurring arrangement</h3><label for="job-edit-frequency">Frequency</label><select id="job-edit-frequency" class="form-input" onchange="bookingEditorFrequencyChanged()">${Object.entries({weekly:'Weekly',fortnightly:'Every 2 weeks',monthly:'Monthly','6weekly':'Every 6 weeks',bimonthly:'Every 2 months',quarterly:'Every 3 months','6monthly':'Every 6 months',annually:'Annually',custom:'Custom interval'}).map(([key,label])=>`<option value="${key}" ${r.frequency===key?'selected':''}>${label}</option>`).join('')}</select><div id="job-edit-custom-field" hidden><label for="job-edit-custom">Days between visits</label><input id="job-edit-custom" class="form-input" type="number" min="1" max="3650" step="1" value="${r.custom_days||''}"></div><label for="job-edit-next-month">Next service month</label><input type="month" class="form-input" id="job-edit-next-month" value="${r.next_date?.slice(0,7)||''}"><p class="booking-muted">Changing the frequency or starting month rebuilds unconfirmed CRM visits. Existing calendar entries are retained. Confirmed dates must be reviewed first.</p></div>
 <label for="job-edit-reason">Reason for change (optional)</label><textarea id="job-edit-reason" class="form-input" rows="2"></textarea>
 <div class="booking-editor-footer"><button type="button" class="btn-secondary" onclick="bookingShowMain()">Cancel</button><button type="button" class="btn-primary" id="job-edit-save" onclick="bookingEditorSave()">Save job changes</button></div><div id="job-edit-error" role="status"></div></div></div>`,'Edit job');
 bookingEditorRenderItems();bookingEditorScopeChanged();
}
function bookingEditorScopeChanged(){
 if(!bookingEditorState)return;
 bookingEditorState.scope=document.getElementById('job-edit-scope')?.value||'job';
 const future=bookingEditorState.scope==='future';
 document.getElementById('job-edit-recurrence').hidden=!future;
 const help=document.getElementById('job-edit-scope-help');if(help)help.textContent=future?'Updates the regular service and price. Other confirmed visits and individual visit changes are retained.':'Future visits keep the regular service and price.';
 bookingEditorFrequencyChanged();
}
function bookingEditorFrequencyChanged(){document.getElementById('job-edit-custom-field').hidden=document.getElementById('job-edit-frequency').value!=='custom';}
function bookingEditorRenderItems(){
 const holder=document.getElementById('job-edit-items');
 holder.innerHTML=bookingEditorState.items.map((item,index)=>`<div class="booking-edit-item"><label>Service / item<input class="form-input" aria-label="Item ${index+1} description" value="${bookingEscape(item.description)}" oninput="bookingEditorItem(${index},'description',this.value)"></label><label>Quantity<input type="number" class="form-input" aria-label="Item ${index+1} quantity" min="0.000001" step="any" value="${item.qty}" oninput="bookingEditorItem(${index},'qty',this.value)"></label><label>Unit<input class="form-input" aria-label="Item ${index+1} unit" value="${bookingEscape(item.unit)}" oninput="bookingEditorItem(${index},'unit',this.value)"></label><label>Unit price<input type="number" class="form-input" aria-label="Item ${index+1} unit price" step="any" value="${item.rate}" oninput="bookingEditorItem(${index},'rate',this.value)"></label><div class="booking-edit-item-total"><span>Line total</span><strong id="job-edit-line-${index}">${bookingMoney(Number(item.qty)*Number(item.rate))}</strong></div><button type="button" class="booking-text-action" aria-label="Remove item ${index+1}" onclick="bookingEditorRemoveItem(${index})">Remove</button></div>`).join('');
 bookingEditorUpdateTotal();
}
function bookingEditorItem(index,key,value){bookingEditorState.items[index][key]=value;bookingEditorUpdateTotal();}
function bookingEditorUpdateTotal(){
 bookingEditorState.items.forEach((item,index)=>{const el=document.getElementById('job-edit-line-'+index);if(el)el.textContent=bookingMoney(Number(item.qty)*Number(item.rate));});
 try{document.getElementById('job-edit-total').textContent=bookingMoney(JobEditRules.validate(bookingEditorState.items).total);}catch{document.getElementById('job-edit-total').textContent='Check line items';}
}
function bookingEditorAddItem(){if(bookingEditorState.items.length>=50)return bookingNotify('Use no more than 50 items.','error');bookingEditorState.items.push({description:'',qty:1,unit:'',rate:0});bookingEditorRenderItems();document.querySelectorAll('[aria-label$="description"]').item(bookingEditorState.items.length-1)?.focus();}
function bookingEditorRemoveItem(index){bookingEditorState.items.splice(index,1);bookingEditorRenderItems();}
function bookingMergeEdit(result,v){
 const collection=v.recurring_job_id?'recurring':'jobs';
 bookingData[collection]=bookingData[collection].map(r=>r.id===result.record.id?result.record:r);
 const rows=new Map((result.visits||[]).map(row=>[row.id,row]));
 bookingData.visits=bookingData.visits.map(row=>rows.get(row.id)||row);
 const existing=new Set(bookingData.visits.map(row=>row.id));for(const row of rows.values())if(!existing.has(row.id))bookingData.visits.push(row);
 bookingSelected=bookingData.visits.find(row=>row.id===v.id);
}
async function bookingEditorSave(){
 if(bookingBusy)return;
 const v=bookingSelected,scope=bookingEditorState.scope;
 const error=document.getElementById('job-edit-error'),button=document.getElementById('job-edit-save');
 try{
  const service=document.getElementById('job-edit-service').value.trim();if(!service)throw Error('Enter a service summary.');
  const validated=JobEditRules.validate(bookingEditorState.items),hours=Number(document.getElementById('job-edit-hours').value);
  if(!Number.isFinite(hours)||hours<0)throw Error('Enter valid estimated hours.');
  const changes={service,description:document.getElementById('job-edit-description').value,items:validated.items,hours};
  if(scope==='future'){changes.frequency=document.getElementById('job-edit-frequency').value;changes.custom_days=changes.frequency==='custom'?Number(document.getElementById('job-edit-custom').value):null;changes.next_month=document.getElementById('job-edit-next-month').value;}
  const draft={channel:document.getElementById('booking-channel')?.value,outcome:document.getElementById('booking-outcome')?.value,note:document.getElementById('booking-note')?.value,internal:document.getElementById('booking-internal-note')?.value,next:document.getElementById('booking-next-date')?.value};
  bookingBusy=true;button.disabled=true;error.textContent='Saving...';
  const result=await bookingRest('rpc/edit_booking_job','POST',{p_visit_id:v.id,p_scope:scope,p_changes:changes,p_expected_visit_at:v.updated_at,p_expected_record_at:bookingEditorState.recordVersion,p_reason:document.getElementById('job-edit-reason').value.trim()});
  bookingMergeEdit(result,v);bookingBusy=false;bookingOpenDetail(v.id);bookingRenderCards();
  if(draft.channel&&document.getElementById('booking-channel')){document.getElementById('booking-channel').value=draft.channel;document.getElementById('booking-outcome').value=draft.outcome;document.getElementById('booking-note').value=draft.note;document.getElementById('booking-next-date').value=draft.next;bookingOutcomePreview();}
  if(draft.internal!==undefined&&document.getElementById('booking-internal-note'))document.getElementById('booking-internal-note').value=draft.internal;
  bookingNotify('Job changes saved');
 }catch(e){error.textContent=e.message;bookingNotify(e.message,'error');}finally{bookingBusy=false;if(button.isConnected)button.disabled=false;}
}
function bookingQuoteId(v){
 const r=bookingBaseRecord(v),job=v.job_id?r:bookingData.jobs.find(j=>j.id===r?.source_job_id);
 return job?.quote_id||String(job?.description||'').match(/\bQ-[A-Za-z0-9-]+\b/)?.[0]||null;
}
async function bookingOpenQuote(){
 if(bookingBusy||!bookingSelected)return;
 const v=bookingSelected,id=bookingQuoteId(v);
 bookingSecondaryPanel('booking-quote-panel','<div class="booking-editor"><h2>Original quote</h2><p class="booking-muted">Loading...</p></div>','Original quote');
 if(!id){document.getElementById('booking-quote-panel').innerHTML='<div class="booking-editor"><h2>No linked quote</h2><p class="booking-muted">This job was created directly or imported from Calendar.</p><button class="btn-secondary" onclick="bookingShowMain()">Back to job</button></div>';return;}
 try{
  const rows=await bookingRest('quotes?id=eq.'+encodeURIComponent(id)+'&select=*&limit=1'),q=rows[0];
  if(!q)throw Error('The linked quote is unavailable.');
  if(bookingSelected?.id!==v.id||!document.getElementById('booking-quote-panel'))return;
  document.getElementById('booking-quote-panel').innerHTML=`<div class="booking-editor"><h2>${bookingEscape(q.id)}</h2><p>${bookingEscape(q.client)} &middot; ${bookingEscape(q.status||'')}</p><p class="booking-muted">${q.date?priorityCandidateDate(q.date):''}</p>${bookingItemsHtml(q)}<div class="booking-editor-total"><span>Original quoted total</span><strong>${bookingMoney(q.total)}</strong></div><p class="booking-muted">Job edits do not change the original quote.</p><div class="booking-editor-footer"><button class="btn-secondary" onclick="bookingShowMain()">Back to job</button><a class="booking-text-action" href="${bookingEscape(CRM_URL+'/quotes/'+encodeURIComponent(q.id))}" target="_blank" rel="noopener">Open in CRM &rarr;</a></div></div>`;
 }catch(e){if(document.getElementById('booking-quote-panel'))document.getElementById('booking-quote-panel').innerHTML=`<div class="booking-editor"><p>${bookingEscape(e.message)}</p><button class="btn-secondary" onclick="bookingShowMain()">Back to job</button></div>`;}
}
function bookingOpenLifecycle(){
 const v=bookingSelected,r=bookingBaseRecord(v);if(!r)return;
 const recurring=Boolean(v.recurring_job_id);
 bookingSecondaryPanel('booking-lifecycle-panel',`<div class="booking-editor"><h2>${recurring?'Manage recurring arrangement':'Manage job'}</h2><p>${bookingEscape(bookingTitle(v))}</p><p class="booking-muted">${recurring?'This applies to the whole recurring arrangement and its visits.':'This applies to this job.'} History, original quotes, invoices and existing calendar entries are retained.</p><div class="booking-form"><label for="job-manage-action">Action</label><select class="form-input" id="job-manage-action"><option value="archive">Archive ${recurring?'arrangement':'job'}</option><option value="delete">Delete ${recurring?'arrangement':'job'} (recoverable)</option></select><label for="job-manage-reason">Reason</label><textarea id="job-manage-reason" class="form-input" rows="3"></textarea><label class="booking-check"><input type="checkbox" id="job-manage-agreed"> Remove ${recurring?'this arrangement and its visits':'this job'} from active work</label><div class="booking-editor-footer"><button class="btn-secondary" onclick="bookingShowMain()">Cancel</button><button class="btn-secondary booking-danger-action" id="job-manage-save" onclick="bookingManageSave()">Confirm action</button></div><div id="job-manage-error" role="status"></div></div></div>`,'Archive or delete');
}
async function bookingManageSave(){
 if(bookingBusy)return;
 const v=bookingSelected,r=bookingBaseRecord(v),button=document.getElementById('job-manage-save'),error=document.getElementById('job-manage-error');
 try{const reason=document.getElementById('job-manage-reason').value.trim();if(!reason)throw Error('Enter a reason.');if(!document.getElementById('job-manage-agreed').checked)throw Error('Confirm which job or arrangement will be removed.');
 bookingBusy=true;button.disabled=true;
 await bookingRest('rpc/manage_booking_job','POST',{p_kind:v.recurring_job_id?'recurring_job':'job',p_id:r.id,p_action:document.getElementById('job-manage-action').value,p_expected_at:r.updated_at,p_reason:reason});
 bookingRemoveDialog();bookingSelected=null;await loadBookingWorkspace();bookingNotify('Job removed from active work');
 }catch(e){error.textContent=e.message;bookingNotify(e.message,'error');}finally{bookingBusy=false;if(button.isConnected)button.disabled=false;}
}
function bookingOpenArchived(){
 const records=[...bookingData.recurring.filter(r=>r.archived_at||r.deleted_at).map(r=>({...r,kind:'recurring_job'})),...bookingData.jobs.filter(r=>r.archived_at||r.deleted_at).map(r=>({...r,kind:'job'}))];
 bookingSelected=null;
 bookingShowDialog('Archived jobs',`<div class="booking-editor"><h2>Archived &amp; deleted jobs</h2>${records.length?records.map(r=>`<article class="booking-archive-row"><div><strong>${bookingEscape(r.client)}</strong><p>${bookingEscape(r.service)}</p><small>${r.kind==='recurring_job'?'Recurring arrangement':'Job'} &middot; ${r.deleted_at?'Deleted':'Archived'}</small></div><button class="btn-secondary" onclick="bookingRestoreJob(${bookingArg(r.kind)},${bookingArg(r.id)})">Restore</button></article>`).join(''):'<p class="booking-muted">No archived jobs.</p>'}</div>`);
}
async function bookingRestoreJob(kind,id){
 if(bookingBusy)return;bookingBusy=true;
 try{const r=bookingData[kind==='recurring_job'?'recurring':'jobs'].find(r=>r.id===id);await bookingRest('rpc/manage_booking_job','POST',{p_kind:kind,p_id:id,p_action:'restore',p_expected_at:r.updated_at,p_reason:'Restored from archived jobs'});bookingRemoveDialog();await loadBookingWorkspace();bookingNotify('Job restored');}
 catch(e){bookingNotify(e.message,'error');}finally{bookingBusy=false;}
}
