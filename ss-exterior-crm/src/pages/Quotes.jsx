import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext.jsx";
import { G, LOGO, supabase } from "../utils/constants.js";
import { Topbar, Badge, Avatar, Card, StatCard, Modal, Field, BtnRow, showToast, showConfirm, showPrompt } from "../utils/ui.jsx";
import { exportCSV, printQuote } from "../utils/helpers.js";

export default function Quotes() {
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
    generatePortalLink, getClientEmail, getClientPhone, approveQuote, rejectQuote, deleteQuote, getClientByRecord,
  } = ctx;

  const navigate = useNavigate();
  const { quoteId } = useParams();
  const closeModal = () => setModal(null);
  const toggle = (id) => setExpandedId(p => p===id ? null : id);
  const [quoteSearch, setQuoteSearch] = useState("");

  useEffect(() => {
    if (!quoteId) return;
    window.requestAnimationFrame(() => {
      setQuoteStatusFilter("all");
      setQuoteSearch("");
      setExpandedQuote(quoteId);
      document.getElementById(`quote-card-${quoteId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [quoteId, quotes, setExpandedQuote, setQuoteStatusFilter]);

  return (
    <>
  <Topbar title={`Quotes (${quotes.length})`}
    extra={<div style={{display:"flex",gap:6}}>
      <button onClick={()=>setModal("addQuote")} style={{padding:"7px 13px",border:"none",borderRadius:8,background:G.green,color:"#fff",fontSize:12,cursor:"pointer",fontWeight:700}}>+ New</button>
      <button onClick={()=>goAI("Build a quote for ")} style={{padding:"7px 13px",border:"none",borderRadius:8,background:"#e8f5e9",color:"#2e7d32",fontSize:12,cursor:"pointer",fontWeight:700}}>Ask AI</button>
      <button onClick={()=>exportCSV(quotes.map(q=>({ID:q.id,Client:q.client,Date:q.date,Total:q.total,Status:q.status})),"quotes.csv")} style={{padding:"7px 13px",border:`1px solid ${G.border}`,borderRadius:8,background:"#fff",fontSize:12,cursor:"pointer",fontWeight:600}}>Export</button>
    </div>}
  />
  <div style={{flex:1,overflow:"auto",padding:isMobile?10:16,paddingBottom:isMobile?90:24,display:"flex",flexDirection:"column",gap:8}}>
    <input value={quoteSearch} onChange={e=>setQuoteSearch(e.target.value)} placeholder="Search by client or description…" style={{border:`1px solid ${G.border}`,borderRadius:9,padding:"10px 14px",fontSize:14,outline:"none",fontFamily:"inherit",flexShrink:0,boxSizing:"border-box"}}/>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",flexShrink:0}}>{["all","pending","approved","sent","rejected"].map(s=><button key={s} onClick={()=>setQuoteStatusFilter(s)} style={{padding:"5px 14px",borderRadius:20,border:`1px solid ${quoteStatusFilter===s?G.green:G.border}`,background:quoteStatusFilter===s?"#e8f5e9":"#fff",color:quoteStatusFilter===s?G.dark:"#555",fontSize:12,fontWeight:quoteStatusFilter===s?700:500,cursor:"pointer",textTransform:"capitalize",whiteSpace:"nowrap"}}>{s==="all"?"All":s}{s!=="all"&&<span style={{marginLeft:4,opacity:.7}}>({quotes.filter(x=>(x.status||"").toLowerCase()===s).length})</span>}</button>)}</div>
    {(()=>{
      const filtered = quotes
        .filter(q=>quoteStatusFilter==="all"||(q.status||"").toLowerCase()===quoteStatusFilter)
        .filter(q=>{const s=quoteSearch.toLowerCase();return !quoteSearch||(q.client||"").toLowerCase().includes(s)||(q.items||[]).some(it=>(it.description||"").toLowerCase().includes(s));});
      return (<>
        {filtered.length===0&&<div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:12,padding:40,textAlign:"center",color:G.muted}}>
          {quoteStatusFilter!=="all"||quoteSearch?"No quotes match your filter":<><div style={{fontSize:16,marginBottom:8}}>No quotes yet</div><button onClick={()=>goAI("Build a quote for ")} style={{background:G.green,color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Build first quote with AI</button></>}
        </div>}
        {filtered.map((q,i)=><div id={`quote-card-${q.id}`} key={q.id||i} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:12}}>
      <div onClick={()=>setExpandedQuote(expandedQuote===q.id?null:q.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",cursor:"pointer"}}>
        <Avatar name={q.client} size={32}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.client}</div>
          <div style={{fontSize:11,color:G.muted}}>{q.date} · {(q.items||[]).map(it=>it.description).join(", ").slice(0,40)||q.id}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
          <div style={{fontWeight:800,fontSize:14}}>${Number(q.total||0).toFixed(2)}</div>
          <Badge s={q.status}/>
        </div>
      </div>
      {expandedQuote===q.id&&<div style={{padding:"0 14px 12px",borderTop:`1px solid ${G.border}`,paddingTop:10}}>
        {(q.items||[]).map((it,j)=><div key={j} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",borderBottom:`1px solid ${G.border}`}}><span>{it.description}</span><span style={{fontWeight:600}}>${Number(it.total||0).toFixed(2)}</span></div>)}
        <div style={{display:"flex",justifyContent:"space-between",fontWeight:800,fontSize:14,marginTop:8,color:G.dark}}><span>TOTAL</span><span>${Number(q.total||0).toFixed(2)}</span></div>
        {q.notes&&<div style={{fontSize:12,color:G.muted,marginTop:6}}>{q.notes}</div>}
        <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
          {q.status==="pending"&&<button onClick={async()=>{
            await approveQuote(q.id);
            showToast("Quote approved — job created","success");
          }} style={{background:G.green,color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✓ Approve</button>}
          {(q.status==="pending"||q.status==="sent")&&<button onClick={async()=>{
            await rejectQuote(q.id);
            showToast("Quote marked as rejected and any reserved credit released","warn");
          }} style={{background:"#fce4ec",color:"#c62828",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✗ Reject</button>}
          <button onClick={()=>{const to=getClientEmail(q.client);const subject=`Quote from SS Exterior Services — ${q.client}`;const body="Hi "+q.client.split(" ")[0]+",\n\nPlease find your quote below.\n\nQuote: "+q.id+"\nDate: "+q.date+"\nTotal: $"+Number(q.total||0).toFixed(2)+"\n\nItems:\n"+(q.items||[]).map(it=>"• "+it.description+" — $"+Number(it.total||0).toFixed(2)).join("\n")+"\n\nThis quote is valid for 30 days.\n\nKind regards,\nSimon — SS Exterior Services\n0447 130 743";window.open("https://outlook.office.com/mail/deeplink/compose?to="+encodeURIComponent(to)+"&subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body),"_blank");setTimeout(()=>printQuote(q),500);}} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>Email</button>
          <button onClick={()=>printQuote(q)} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer"}}>Print</button>
          <button onClick={async()=>{const cl=getClientByRecord(q);if(cl)shareClientPortal(cl);else generatePortalLink("quotes",q.id,"quote");}} style={{background:"#fff3e0",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#e65100"}}>🔗 Share portal</button>
          <button onClick={()=>{const p=getClientPhone(q.client);const msg=SMS_TEMPLATES.quoteFollowUp(q.client,"$"+(q.total||0).toFixed(0));if(p){setSmsModal({phone:p,message:msg,recipient:q.client});}else{setSmsModal(true);}}} style={{background:"#e8f5e9",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#2e7d32"}}>💬 SMS reminder</button>
          <button onClick={()=>{const cl=getClientByRecord(q);if(cl){setTab("clients"); navigate("/clients/"+cl.id);}else showToast("Client not found","warn");}} style={{background:"#e8eaf6",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#3949ab"}}>👤 View client</button>
          <button onClick={e=>{e.stopPropagation();setEditItem(q);setModal("editQuote");}} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:600}}>Edit</button>
          <button onClick={()=>{showConfirm("Delete quote?",{title:"Delete quote",confirmLabel:"Delete",danger:true}).then(async ok=>{if(ok)await deleteQuote(q.id);});}} style={{background:"#fce4ec",border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,color:"#c62828",cursor:"pointer"}}>Delete</button>
        </div>
        </div>}
      </div>)}
      </>);
    })()}
  </div>

{/* INVOICES */}
    </>
  );
}
