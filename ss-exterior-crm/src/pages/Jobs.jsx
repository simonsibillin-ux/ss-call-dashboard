import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext.jsx";
import { G, LOGO, supabase } from "../utils/constants.js";
import { Topbar, Badge, Avatar, Card, StatCard, Modal, Field, BtnRow, showToast, showConfirm, showPrompt } from "../utils/ui.jsx";
import { exportCSV } from "../utils/helpers.js";

export default function Jobs() {
  const ctx = useAppContext();
  const {
    G, LOGO, supabase, isMobile,
    clients, setClients, jobs, setJobs, expenses, setExpenses,
    quotes, setQuotes, invoices, setInvoices, recurringJobs, setRecurringJobs,
    messages, setMessages, bookingRequests, setBookingRequests,
    referrals, setReferrals, clientDocuments, setClientDocuments,
    tab, setTab, search, setSearch, expandedId, setExpandedId,
    modal, setModal, editItem, setEditItem,
    expandedClient, setExpandedClient, expandedJob, setExpandedJob,
    expandedQuote, setExpandedQuote, expandedInvoice, setExpandedInvoice,
    expandedReceipt, setExpandedReceipt,
    jobStatusFilter, setJobStatusFilter,
    quoteStatusFilter, setQuoteStatusFilter,
    invoiceStatusFilter, setInvoiceStatusFilter,
    manageCreditModal, setManageCreditModal,
    recurringModal, setRecurringModal,
    smsModal, setSmsModal,
    unreadMessages, setUnreadMessages,
    calEvents, setCalEvents, calView, setCalView, calDate, setCalDate,
    newEvent, setNewEvent, calToken, calLoading,
    signInGoogle, loadCalEvents, addToCalendar, deleteCalEvent, updateCalEvent,
    campTab, setCampTab, campMessage, setCampMessage, campSubject, setCampSubject,
    campTemplate, setCampTemplate, audienceFilter, setAudienceFilter,
    suburbFilter, setSuburbFilter, statusFilter, setStatusFilter,
    selectedRecipients, setSelectedRecipients, campSending, setCampSending,
    campResult, setCampResult, brevoKey, setBrevoKey, brevoInput, setBrevoInput,
    campHtmlBody, setCampHtmlBody, aiEmailPrompt, setAiEmailPrompt,
    aiEmailGenerating, setAiEmailGenerating, emailViewMode, setEmailViewMode,
    campAttachment, setCampAttachment, campHistory, setCampHistory,
    showCampHistory, setShowCampHistory, expandedCampHist, setExpandedCampHist,
    campRecipSearch, setCampRecipSearch, clientSearch, setClientSearch,
    jobSearch, setJobSearch,
    aiMessages, setAiMessages, aiInput, setAiInput, aiLoading, setAiLoading,
    chatBottom,
    autopilotLog, setAutopilotLog, autopilotLogOpen, setAutopilotLogOpen,
    autopilotSettings, setAutopilotSettings, autopilotLoading, setAutopilotLoading,
    morningBriefing, briefingDismissed, setBriefingDismissed,
    sendSMS, sendClientPush, sendReviewSms,
    generateClientPortalLink, shareClientPortal,
    isAutopilotOn, logAutopilotAction, SMS_TEMPLATES,
    totalRevenue, totalExpenses, netProfit, creditClients, setCreditClients,
    goAI,
    getClientPhone, approveQuote, createRecurringCalendarSeries, getClientByRecord, linkRecordToClient,
  } = ctx;

  const navigate = useNavigate();
  const closeModal = () => setModal(null);
  const toggle = (id) => setExpandedId(p => p===id ? null : id);

  return (
    <>
  <Topbar title={`Jobs (${jobs.length})`}
    extra={<div style={{display:"flex",gap:6}}>
      <button onClick={()=>setModal("addJob")} style={{padding:"7px 13px",border:"none",borderRadius:8,background:G.green,color:"#fff",fontSize:12,cursor:"pointer",fontWeight:700}}>+ New</button>
      <button onClick={()=>setRecurringModal({})} style={{padding:"7px 13px",border:"none",borderRadius:8,background:"#e3f2fd",color:"#1565c0",fontSize:12,cursor:"pointer",fontWeight:700}}>🔁 Recurring</button>
      <button onClick={()=>goAI("Log a new job: ")} style={{padding:"7px 13px",border:"none",borderRadius:8,background:"#e8f5e9",color:"#2e7d32",fontSize:12,cursor:"pointer",fontWeight:700}}>Ask AI</button>
      <button onClick={()=>exportCSV(jobs.map(j=>({ID:j.id,Client:j.client,Service:j.service,Status:j.status,Revenue:j.revenue,Hours:j.hours,Date:j.completionDate||j.completion_date})),"jobs.csv")} style={{padding:"7px 13px",border:`1px solid ${G.border}`,borderRadius:8,background:"#fff",fontSize:12,cursor:"pointer",fontWeight:600}}>Export</button>
    </div>}
  />
  <div style={{flex:1,overflow:"auto",padding:isMobile?10:16,paddingBottom:isMobile?90:24,display:"flex",flexDirection:"column",gap:8}}>
    <input value={jobSearch} onChange={e=>setJobSearch(e.target.value)} placeholder="Search by client or service…" style={{border:`1px solid ${G.border}`,borderRadius:9,padding:"10px 14px",fontSize:14,outline:"none",fontFamily:"inherit",flexShrink:0,boxSizing:"border-box"}}/>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",flexShrink:0}}>{["all","Active","Invoiced","Paid","Quoted"].map(s=><button key={s} onClick={()=>setJobStatusFilter(s)} style={{padding:"5px 14px",borderRadius:20,border:`1px solid ${jobStatusFilter===s?G.green:G.border}`,background:jobStatusFilter===s?"#e8f5e9":"#fff",color:jobStatusFilter===s?G.dark:"#555",fontSize:12,fontWeight:jobStatusFilter===s?700:500,cursor:"pointer",whiteSpace:"nowrap"}}>{s==="all"?"All":s}{s!=="all"&&<span style={{marginLeft:4,opacity:.7}}>({jobs.filter(x=>x.status===s).length})</span>}</button>)}</div>
    {(()=>{const filteredJobs=jobs.filter(j=>jobStatusFilter==="all"||j.status===jobStatusFilter).filter(j=>{const q=jobSearch.toLowerCase();return !jobSearch||(j.client||"").toLowerCase().includes(q)||(j.service||"").toLowerCase().includes(q);});return(<>{filteredJobs.map((j,i)=><div key={j.id||i} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:12}}>
      <div onClick={()=>setExpandedJob(expandedJob===j.id?null:j.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",cursor:"pointer"}}>
        <Avatar name={j.client} size={32}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.client}</div>
          <div style={{fontSize:11,color:G.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.service}{(j.completionDate||j.completion_date)?<span style={{color:"#aaa"}}> · {new Date((j.completionDate||j.completion_date)+"T12:00:00").toLocaleDateString("en-AU",{day:"numeric",month:"short"})}</span>:""}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
          <div style={{fontWeight:800,fontSize:14,color:j.revenue>0?G.dark:G.muted}}>{j.revenue>0?"$"+Number(j.revenue).toLocaleString("en-AU",{maximumFractionDigits:0}):"—"}</div>
          <Badge s={j.status}/>
        </div>
      </div>
      {expandedJob===j.id&&<div style={{padding:"10px 14px",borderTop:`1px solid ${G.border}`,background:G.bg,fontSize:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          {(j.completionDate||j.completion_date)&&<div><div style={{fontSize:10,color:G.muted,fontWeight:600,textTransform:"uppercase"}}>Date</div><div>{j.completionDate||j.completion_date}</div></div>}
          {j.hours>0&&<div><div style={{fontSize:10,color:G.muted,fontWeight:600,textTransform:"uppercase"}}>Hours</div><div>{j.hours}h @ ${j.hours>0?(j.revenue/j.hours).toFixed(0):0}/hr</div></div>}
          {j.description&&<div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.muted,fontWeight:600,textTransform:"uppercase"}}>Description</div><div style={{color:G.muted}}>{j.description}</div></div>}
          {j.notes&&<div style={{gridColumn:"1/-1"}}><div style={{fontSize:10,color:G.muted,fontWeight:600,textTransform:"uppercase"}}>Notes</div><div style={{color:G.muted}}>{j.notes}</div></div>}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {j.status==="Active"&&<button onClick={()=>{const inv=linkRecordToClient({id:`INV-${Date.now()}`,quote_id:"",job_id:j.id,client:j.client,date:new Date().toISOString().split("T")[0],due_date:new Date(Date.now()+14*864e5).toISOString().split("T")[0],items:[{description:j.service,qty:1,unit:"",rate:j.revenue||0,total:j.revenue||0}],total:j.revenue||0,status:"sent",notes:"",portal_token:""}, getClientByRecord(j));supabase.from("invoices").insert(inv).then(()=>{setInvoices(is=>[inv,...is]);supabase.from("jobs").update({status:"Invoiced"}).eq("id",j.id).then(()=>setJobs(js=>js.map(x=>x.id===j.id?{...x,status:"Invoiced"}:x)));});}} style={{background:"#e3f2fd",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#1565c0"}}>Create invoice</button>}
          <button onClick={async()=>{const cl=getClientByRecord(j);if(cl)shareClientPortal(cl);else showToast("Client not found","warn");}} style={{background:"#fff3e0",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#e65100"}}>🔗 Portal</button>
          <button onClick={()=>{const p=getClientPhone(j.client);const msg=SMS_TEMPLATES.jobConfirmation(j.client,j.service);if(p){setSmsModal({phone:p,message:msg,recipient:j.client});}else{setSmsModal(true);}}} style={{background:"#e8f5e9",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#2e7d32"}}>💬 SMS follow-up</button>
          <button onClick={()=>{const cl=getClientByRecord(j);if(cl){setTab("clients"); navigate("/clients/"+cl.id);}else showToast("Client not found","warn");}} style={{background:"#e8eaf6",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#3949ab"}}>👤 View client</button>
          <button onClick={()=>setRecurringModal(j)} style={{background:"#e3f2fd",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#1565c0"}}>🔁 Recurring</button>
          <button onClick={e=>{e.stopPropagation();setEditItem(j);setModal("editJob");}} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600}}>Edit</button>
          <button onClick={()=>{(async()=>{const _ok=await showConfirm("Delete this job?",{title:"Delete job",confirmLabel:"Delete",danger:true});if(!_ok)return;
            supabase.from("jobs").delete().eq("id",j.id).then(()=>setJobs(js=>js.filter(x=>x.id!==j.id)));
            if(calToken){const jDate=j.completionDate||j.completion_date;const ev=calEvents.find(e=>(e.summary||"").toLowerCase().includes((j.client||"").toLowerCase())&&(e.start?.date||(e.start?.dateTime||"").split("T")[0])===jDate);if(ev)deleteCalEvent(ev.id);}
          })()}} style={{background:"#fce4ec",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,color:"#c62828",cursor:"pointer"}}>Delete</button>
        </div>
      </div>}
    </div>)}
    {filteredJobs.length===0&&<div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:12,padding:40,textAlign:"center",color:G.muted}}>{jobStatusFilter!=="all"||jobSearch?"No jobs match your filter":"No jobs yet — add one with the button above or ask AI"}</div>}</>);})()}

    {/* Recurring jobs section */}
    {recurringJobs.length>0&&<>
      <div style={{fontWeight:700,fontSize:13,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginTop:8,marginBottom:6}}>🔁 Recurring jobs ({recurringJobs.filter(r=>r.active).length} active)</div>
      {recurringJobs.map((r,i)=><div key={r.id||i} style={{background:"#fff",border:`2px dashed ${G.border}`,borderRadius:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px"}}>
          <div style={{width:32,height:32,borderRadius:8,background:"#e3f2fd",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🔁</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.client}</div>
            <div style={{fontSize:11,color:G.muted}}>{r.service} · {r.frequency}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
            <div style={{fontWeight:800,fontSize:13,color:"#1565c0"}}>Next: {r.next_date||"TBC"}</div>
            <div style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:r.active?"#e8f5e9":"#f5f5f5",color:r.active?"#2e7d32":"#888"}}>{r.active?"ACTIVE":"PAUSED"}</div>
          </div>
        </div>
        <div style={{padding:"0 14px 12px",borderTop:`1px solid ${G.border}`,paddingTop:10,display:"flex",gap:6,flexWrap:"wrap",fontSize:12}}>
          <button onClick={async()=>{
            const freqDays={weekly:7,fortnightly:14,monthly:30,"6weekly":42,bimonthly:61,quarterly:91,"6monthly":182,annually:365};
            const days=freqDays[r.frequency]||91;
            const visitDate = r.next_date||new Date().toISOString().split("T")[0];
            const newNextDate=(()=>{const d=new Date(visitDate+"T12:00:00");d.setDate(d.getDate()+days);return d.toISOString().split("T")[0];})();
            const completedJob=linkRecordToClient({id:`J-${Date.now()}`,client:r.client,service:r.service,description:r.description||"Recurring service",status:"Active",revenue:r.revenue||0,hours:r.hours||0,completion_date:visitDate,notes:r.notes||""}, getClientByRecord(r));
            await supabase.from("jobs").insert(completedJob);
            setJobs(js=>[{...completedJob,completionDate:completedJob.completion_date},...js]);
            // Ask about next visit date
            // Just advance the next_date tracker — calendar events already pre-created
            await supabase.from("recurring_jobs").update({next_date:newNextDate}).eq("id",r.id);
            setRecurringJobs(rs=>rs.map(x=>x.id===r.id?{...x,next_date:newNextDate}:x));
            showToast("Visit logged for "+visitDate+". Next: "+newNextDate,"success");
              sendClientPush(r.client,'✅ Service Completed','Your '+r.service+' on '+visitDate+' is complete. Next visit: '+newNextDate+'. Thank you!');
          }} style={{background:G.green,color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontWeight:700,cursor:"pointer"}}>✓ Log completed visit</button>
          <button onClick={async()=>{
            // Reschedule: move next_date without logging a job
            const newDate=await showPrompt("Set new date for this visit",{defaultValue:r.next_date||"",inputType:"date",confirmLabel:"Set date"});
            if(!newDate||!/^\d{4}-\d{2}-\d{2}$/.test(newDate)){if(newDate!==null)alert("Invalid date format. Use YYYY-MM-DD.");return;}
            const scope=await showConfirm("Update just this visit to "+newDate+"? (Cancel = update all future dates)",{title:"Reschedule scope",confirmLabel:"This visit only"});
            if(scope){
              // Just update next_date for this one visit
              await supabase.from("recurring_jobs").update({next_date:newDate}).eq("id",r.id);
              setRecurringJobs(rs=>rs.map(x=>x.id===r.id?{...x,next_date:newDate}:x));
              await addToCalendar(`${r.client} | ${r.service} | $${(r.revenue||0).toFixed(0)} (Recurring)`,newDate,r.notes||"",null,"#1565c0");
              showToast("Visit rescheduled to "+newDate,"success");
            } else {
              // Update next_date (all future flows from this new date)
              await supabase.from("recurring_jobs").update({next_date:newDate}).eq("id",r.id);
              setRecurringJobs(rs=>rs.map(x=>x.id===r.id?{...x,next_date:newDate}:x));
              if(calToken) { await createRecurringCalendarSeries(r, newDate, 12); await loadCalEvents(); }
              showToast("Recurring plan rescheduled from "+newDate,"success");
            }
          }} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:600}}>📅 Reschedule</button>
          <button onClick={async()=>{
            const pause=!r.active;
            await supabase.from("recurring_jobs").update({active:pause}).eq("id",r.id);
            setRecurringJobs(rs=>rs.map(x=>x.id===r.id?{...x,active:pause}:x));
          }} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:600}}>{r.active?"Pause":"Resume"}</button>
          <button onClick={()=>setRecurringModal({...r, editing:true})} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 12px",cursor:"pointer",fontWeight:600}}>Edit</button>
          <button onClick={async()=>{(async()=>{const _ok=await showConfirm("Delete this recurring job?",{title:"Delete recurring job",confirmLabel:"Delete",danger:true});if(_ok){await supabase.from("recurring_jobs").delete().eq("id",r.id);setRecurringJobs(rs=>rs.filter(x=>x.id!==r.id));}})();}} style={{background:"#fce4ec",border:"none",borderRadius:7,padding:"6px 12px",color:"#c62828",cursor:"pointer"}}>Delete</button>
        </div>
      </div>)}
    </>}

  </div>

{/* QUOTES */}
    </>
  );
}
