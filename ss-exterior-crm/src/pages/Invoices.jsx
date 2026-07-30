import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext.jsx";
import { G, LOGO, supabase } from "../utils/constants.js";
import { Topbar, Badge, Avatar, Card, StatCard, Modal, Field, BtnRow, showToast, showConfirm, showPrompt } from "../utils/ui.jsx";
import { exportCSV, printInvoice } from "../utils/helpers.js";

export default function Invoices() {
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
    generatePortalLink, getClientEmail, getClientPhone, getClientByRecord,
  } = ctx;

  const navigate = useNavigate();
  const closeModal = () => setModal(null);
  const toggle = (id) => setExpandedId(p => p===id ? null : id);
  const [invoiceSearch, setInvoiceSearch] = useState("");

  return (
    <>
  <Topbar title={`Invoices (${invoices.length})`}
    extra={<div style={{display:"flex",gap:6}}>
      <button onClick={()=>setModal("addInvoice")} style={{padding:"7px 13px",border:"none",borderRadius:8,background:G.green,color:"#fff",fontSize:12,cursor:"pointer",fontWeight:700}}>+ New</button>
      <button onClick={()=>goAI("Create a new invoice for a client")} style={{padding:"7px 13px",border:"none",borderRadius:8,background:"#e8f5e9",color:"#2e7d32",fontSize:12,cursor:"pointer",fontWeight:700}}>Ask AI</button>
      <button onClick={()=>exportCSV(invoices.map(i=>({ID:i.id,Client:i.client,Date:i.date,Due:i.due_date,Total:i.total,Status:i.status})),"invoices.csv")} style={{padding:"7px 13px",border:`1px solid ${G.border}`,borderRadius:8,background:"#fff",fontSize:12,cursor:"pointer",fontWeight:600}}>Export</button>
    </div>}
  />
  <div style={{flex:1,overflow:"auto",padding:isMobile?10:16,paddingBottom:isMobile?90:24,display:"flex",flexDirection:"column",gap:8}}>
    <input value={invoiceSearch} onChange={e=>setInvoiceSearch(e.target.value)} placeholder="Search by client or invoice ID…" style={{border:`1px solid ${G.border}`,borderRadius:9,padding:"10px 14px",fontSize:14,outline:"none",fontFamily:"inherit",flexShrink:0,boxSizing:"border-box"}}/>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",flexShrink:0}}>{["all","sent","paid","overdue"].map(s=><button key={s} onClick={()=>setInvoiceStatusFilter(s)} style={{padding:"5px 14px",borderRadius:20,border:`1px solid ${invoiceStatusFilter===s?(s==="overdue"?"#c62828":G.green):G.border}`,background:invoiceStatusFilter===s?(s==="overdue"?"#fce4ec":"#e8f5e9"):"#fff",color:invoiceStatusFilter===s?(s==="overdue"?"#c62828":G.dark):"#555",fontSize:12,fontWeight:invoiceStatusFilter===s?700:500,cursor:"pointer",textTransform:"capitalize",whiteSpace:"nowrap"}}>{s==="all"?"All":s}{s!=="all"&&<span style={{marginLeft:4,opacity:.7}}>({invoices.filter(x=>(x.status||"").toLowerCase()===s).length})</span>}</button>)}</div>
    {(()=>{
      const filtered = invoices
        .filter(i=>invoiceStatusFilter==="all"||(i.status||"").toLowerCase()===invoiceStatusFilter)
        .filter(i=>{const s=invoiceSearch.toLowerCase();return !invoiceSearch||(i.client||"").toLowerCase().includes(s)||(i.id||"").toLowerCase().includes(s);});
      return (<>
        {filtered.length===0&&<div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:12,padding:40,textAlign:"center",color:G.muted}}>{invoiceStatusFilter!=="all"||invoiceSearch?"No invoices match your filter":"No invoices"}</div>}
        {filtered.map((inv,i)=><div key={inv.id||i} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:12}}>
      <div onClick={()=>setExpandedInvoice(expandedInvoice===inv.id?null:inv.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",cursor:"pointer"}}>
        <Avatar name={inv.client} size={32}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inv.client}</div>
          <div style={{fontSize:11,color:G.muted}}>{inv.id} · Due: {inv.due_date}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
          <div style={{fontWeight:800,fontSize:14}}>${Number(inv.total||0).toFixed(2)}</div>
          <Badge s={inv.status}/>
        </div>
      </div>
      {expandedInvoice===inv.id&&<div style={{padding:"0 14px 12px",borderTop:`1px solid ${G.border}`,paddingTop:10}}>
        {(inv.items||[]).map((it,j)=><div key={j} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",borderBottom:`1px solid ${G.border}`}}><span>{it.description}</span><span style={{fontWeight:600}}>${Number(it.total||0).toFixed(2)}</span></div>)}
        <div style={{fontSize:12,color:G.muted,marginTop:6}}>BSB: 063-698 | Account: 10348025 | Ref: {inv.id}</div>
        <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
          {inv.status!=="paid"&&<button onClick={async()=>{
  // 1. Mark invoice paid
  await supabase.from("invoices").update({status:"paid"}).eq("id",inv.id);
  setInvoices(is=>is.map(x=>x.id===inv.id?{...x,status:"paid"}:x));
  // 2. Push notification to client
  sendClientPush(inv.client,'✅ Payment Received — Thank You!','Your payment of $'+Number(inv.total||0).toLocaleString('en-AU',{minimumFractionDigits:2})+' has been received. Your receipt is ready in your portal.');
  // 3. Mark linked job as Paid
  if(inv.job_id){
await supabase.from("jobs").update({status:"Paid",revenue:inv.total}).eq("id",inv.job_id);
setJobs(js=>js.map(x=>x.id===inv.job_id?{...x,status:"Paid",revenue:inv.total}:x));
  }
  // 4. Fire review request SMS (autopilot)
  const linkedJob = inv.job_id ? jobs.find(j=>j.id===inv.job_id) : null;
  const suppressed = linkedJob?.suppress_review || false;
  const alreadySent = linkedJob?.review_sent || false;
  if(!suppressed && !alreadySent){
await sendReviewSms(inv.client);
if(inv.job_id){
await supabase.from("jobs").update({review_sent:true}).eq("id",inv.job_id);
setJobs(js=>js.map(x=>x.id===inv.job_id?{...x,review_sent:true}:x));
}
  }
}} style={{background:G.green,color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Mark paid</button>}
          <button onClick={()=>{const to=getClientEmail(inv.client);const subject="Invoice "+inv.id+" — SS Exterior Services";const body="Hi "+inv.client.split(" ")[0]+",\n\nInvoice: "+inv.id+"\nDate: "+inv.date+"\nDue: "+inv.due_date+"\nTotal: $"+Number(inv.total||0).toFixed(2)+"\n\nPayment: BSB 063-698 | Account 10348025 | Ref: "+inv.id+"\n\nKind regards,\nSimon — SS Exterior Services\n0447 130 743";window.open("https://outlook.office.com/mail/deeplink/compose?to="+encodeURIComponent(to)+"&subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body),"_blank");setTimeout(()=>printInvoice(inv),500);}} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>Email</button>
          <button onClick={()=>printInvoice(inv)} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>Print</button>
          <button onClick={async()=>{const cl=getClientByRecord(inv);if(cl)shareClientPortal(cl);else generatePortalLink("invoices",inv.id,"invoice");}} style={{background:"#fff3e0",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#e65100"}}>🔗 Share portal</button>
          <button onClick={()=>{const cl=getClientByRecord(inv);if(cl){setTab("clients"); navigate("/clients/"+cl.id);}else showToast("Client not found","warn");}} style={{background:"#e8eaf6",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#3949ab"}}>👤 View client</button>
          {inv.status!=="paid"&&<button onClick={()=>{const p=getClientPhone(inv.client);const msg=SMS_TEMPLATES.invoiceReminder(inv.client,"$"+Number(inv.total||0).toFixed(0),inv.due_date,inv.id);if(p){setSmsModal({phone:p,message:msg,recipient:inv.client});}else{setSmsModal(true);}}} style={{background:"#e8f5e9",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#2e7d32"}}>SMS reminder</button>}
          <button onClick={e=>{e.stopPropagation();setEditItem(inv);setModal("editInvoice");}} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600}}>Edit</button>
          <button onClick={()=>{showConfirm("Delete invoice?",{title:"Delete invoice",confirmLabel:"Delete",danger:true}).then(ok=>{if(ok)supabase.from("invoices").delete().eq("id",inv.id).then(()=>setInvoices(is=>is.filter(x=>x.id!==inv.id)));});}} style={{background:"#fce4ec",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,color:"#c62828",cursor:"pointer"}}>Delete</button>
        </div>
        </div>}
      </div>)}
      </>);
    })()}
  </div>

{/* CALENDAR */}
    </>
  );
}
