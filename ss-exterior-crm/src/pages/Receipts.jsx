import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext.jsx";
import { G, LOGO, supabase } from "../utils/constants.js";
import { Topbar, Badge, Avatar, Card, StatCard, Modal, Field, BtnRow, showToast, showConfirm, showPrompt } from "../utils/ui.jsx";
import { exportCSV, printReceipt } from "../utils/helpers.js";

export default function Receipts() {
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
    getClientEmail, getClientPhone, openOutlookEmail, getClientByRecord,
  } = ctx;

  const navigate = useNavigate();
  const { receiptId } = useParams();
  const closeModal = () => setModal(null);
  const toggle = (id) => setExpandedId(p => p===id ? null : id);
  const [receiptSearch, setReceiptSearch] = useState("");

  useEffect(() => {
    if (!receiptId) return;
    window.requestAnimationFrame(() => {
      setReceiptSearch("");
      setExpandedReceipt(receiptId);
      document.getElementById(`receipt-card-${receiptId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [receiptId, invoices, setExpandedReceipt]);

  return (
    <>
  <Topbar title={`Receipts (${invoices.filter(i=>i.status==="paid").length})`}
    extra={<div style={{display:"flex",gap:6}}>
      <button onClick={()=>setModal("addInvoice")} style={{padding:"7px 13px",border:"none",borderRadius:8,background:G.green,color:"#fff",fontSize:12,cursor:"pointer",fontWeight:700}}>+ Manual receipt</button>
      <button onClick={()=>goAI("Mark an invoice as paid or create a receipt for ")} style={{padding:"7px 13px",border:"none",borderRadius:8,background:"#e8f5e9",color:"#2e7d32",fontSize:12,cursor:"pointer",fontWeight:700}}>Ask AI</button>
      <button onClick={()=>exportCSV(invoices.filter(i=>i.status==="paid").map(i=>({ID:i.id,Client:i.client,Date:i.date,Total:i.total})),"receipts.csv")} style={{padding:"7px 13px",border:`1px solid ${G.border}`,borderRadius:8,background:"#fff",fontSize:12,cursor:"pointer",fontWeight:600}}>Export</button>
    </div>}
  />
  <div style={{flex:1,overflow:"auto",padding:isMobile?10:16,paddingBottom:isMobile?90:24,display:"flex",flexDirection:"column",gap:8}}>
    <input value={receiptSearch} onChange={e=>setReceiptSearch(e.target.value)} placeholder="Search by client or invoice ID…" style={{border:`1px solid ${G.border}`,borderRadius:9,padding:"10px 14px",fontSize:14,outline:"none",fontFamily:"inherit",flexShrink:0,boxSizing:"border-box"}}/>
    {(()=>{
      const filtered = invoices.filter(i=>{
        if(i.status!=="paid") return false;
        if(!receiptSearch) return true;
        const s=receiptSearch.toLowerCase();
        return (i.client||"").toLowerCase().includes(s)||(i.id||"").toLowerCase().includes(s);
      });
      return (<>
        {filtered.length===0&&(
          <div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:12,padding:40,textAlign:"center",color:G.muted}}>
            {receiptSearch?"No receipts match your search":<><div style={{fontSize:15,marginBottom:8}}>No receipts yet</div><div style={{fontSize:13}}>Mark an invoice as paid to generate a receipt</div></>}
          </div>
        )}
        {filtered.map((inv)=>(
          <Card key={inv.id} style={{scrollMargin:"90px"}} onClick={undefined}>
        <div id={`receipt-card-${inv.id}`}>
        <div onClick={()=>setExpandedReceipt(expandedReceipt===inv.id?null:inv.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",cursor:"pointer"}}>
          <Avatar name={inv.client} size={34}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inv.client}</div>
            <div style={{fontSize:12,color:G.muted}}>{inv.id} · Paid: {inv.date}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
            <div style={{fontWeight:800,fontSize:14,color:"#2e7d32"}}>${(inv.total||0).toFixed(2)}</div>
            <span style={{background:"#e8f5e9",color:"#2e7d32",fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20}}>PAID</span>
          </div>
        </div>
        {expandedReceipt===inv.id&&<div style={{padding:"0 14px 14px",borderTop:`1px solid ${G.border}`,paddingTop:10}}>
          {(inv.items||[]).map((it,j)=><div key={j} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"4px 0",borderBottom:`1px solid ${G.border}`}}><span>{it.description}</span><span style={{fontWeight:600}}>${(it.total||0).toFixed(2)}</span></div>)}
          <div style={{display:"flex",justifyContent:"space-between",fontWeight:800,fontSize:14,marginTop:8,color:"#2e7d32"}}><span>TOTAL PAID</span><span>${(inv.total||0).toFixed(2)}</span></div>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button onClick={()=>printReceipt(inv)} style={{background:G.green,color:"#fff",border:"none",borderRadius:7,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Print receipt / PDF</button>
            <button onClick={()=>{
              const p=getClientPhone(inv.client);
              const msg=SMS_TEMPLATES.paymentThankYou(inv.client,"$"+(inv.total||0).toFixed(0));
              if(p){setSmsModal({phone:p,message:msg,recipient:inv.client});}else{setSmsModal(true);}
            }} style={{background:"#e8f5e9",border:"none",borderRadius:7,padding:"7px 14px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#2e7d32"}}>SMS thank you</button>
            <button onClick={()=>{const p=getClientPhone(inv.client);const msg=SMS_TEMPLATES.paymentThankYou(inv.client);if(p){setSmsModal({phone:p,message:msg,recipient:inv.client});}else{setSmsModal(true);}}} style={{background:"#e8f5e9",border:"none",borderRadius:7,padding:"7px 14px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#2e7d32"}}>💬 SMS review request</button>
            <button onClick={()=>{const cl=getClientByRecord(inv);if(cl){setTab("clients"); navigate("/clients/"+cl.id);}else showToast("Client not found","warn");}} style={{background:"#e8eaf6",border:"none",borderRadius:7,padding:"7px 14px",fontSize:12,cursor:"pointer",fontWeight:600,color:"#3949ab"}}>👤 View client</button>
            <button onClick={()=>{
              const to = getClientEmail(inv.client);
              const subject = `Payment Receipt — SS Exterior Services`;
              const body = `Hi ${inv.client.split(" ")[0]},\n\nThank you for your payment! Please find your receipt below.\n\nReceipt for Invoice: ${inv.id}\nAmount Paid: $${(inv.total||0).toFixed(2)}\nDate: ${inv.date}\n\nThank you for choosing SS Exterior Services — we look forward to working with you again!\n\nKind regards,\nSS Exterior Services\n0447 130 743\nssexteriorservices@outlook.com`;
              openOutlookEmail(to, subject, body);
              setTimeout(()=>printReceipt(inv), 500);
            }} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:7,padding:"7px 14px",fontSize:12,cursor:"pointer"}}>Email receipt</button>
          </div>
        </div>}
        </div>
      </Card>
        ))}
      </>);
    })()}
  </div>

{/* CAMPAIGNS */}
    </>
  );
}
