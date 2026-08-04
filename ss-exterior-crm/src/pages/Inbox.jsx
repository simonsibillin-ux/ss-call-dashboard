import React, { useState } from "react";
import { useAppContext } from "../context/AppContext.jsx";
import { G, LOGO, supabase } from "../utils/constants.js";
import { Topbar, Badge, Avatar, Card, StatCard, Modal, Field, BtnRow, showToast, showConfirm, showPrompt } from "../utils/ui.jsx";
import { InboxTab, MsgThread } from "../components/InboxTab.jsx";

export default function Inbox() {
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
  } = ctx;

  const closeModal = () => setModal(null);
  const toggle = (id) => setExpandedId(p => p===id ? null : id);

  return (
    <>
<InboxTab
  bookingRequests={bookingRequests} setBookingRequests={setBookingRequests}
  messages={messages} setMessages={setMessages}
  unreadMessages={unreadMessages} setUnreadMessages={setUnreadMessages}
  referrals={referrals} setReferrals={setReferrals}
  clients={clients} setClients={setClients}
  jobs={jobs} setJobs={setJobs}
  G={G} isMobile={isMobile} supabase={supabase}
  sendClientPush={sendClientPush}
  MsgThread={MsgThread}
/>

{false && (()=>{
  const [inboxOpen, setInboxOpen] = React.useState({bookings:true, messages:true, referrals:true});
  const [showArchivedBookings, setShowArchivedBookings] = React.useState(false);
  const [showArchivedReferrals, setShowArchivedReferrals] = React.useState(false);
  const toggleInbox = k => setInboxOpen(s=>({...s,[k]:!s[k]}));

  const archiveBooking = async (id) => {
    if(!await showConfirm("Archive this booking request?",{title:"Archive booking",confirmLabel:"Archive"}))return;
    await supabase.from("bookings").update({status:"archived"}).eq("id",id);
    setBookingRequests(bs=>bs.map(x=>x.id===id?{...x,status:"archived"}:x));
  };
  const restoreBooking = async (id) => {
    await supabase.from("bookings").update({status:"pending"}).eq("id",id);
    setBookingRequests(bs=>bs.map(x=>x.id===id?{...x,status:"pending"}:x));
  };
  const archiveReferral = async (id) => {
    if(!await showConfirm("Archive this referral?",{title:"Archive referral",confirmLabel:"Archive"}))return;
    await supabase.from("referrals").update({status:"archived"}).eq("id",id);
    setReferrals(rs=>rs.map(x=>x.id===id?{...x,status:"archived"}:x));
  };
  const restoreReferral = async (id) => {
    await supabase.from("referrals").update({status:"pending"}).eq("id",id);
    setReferrals(rs=>rs.map(x=>x.id===id?{...x,status:"pending"}:x));
  };
  const archiveMsgThread = async (clientName) => {
    if(!await showConfirm("Archive all messages with "+clientName+"?",{title:"Archive messages",confirmLabel:"Archive"}))return;
    await supabase.from("messages").update({read:true}).eq("client_name",clientName);
    setMessages(ms=>ms.filter(m=>m.client_name!==clientName));
  };

  const activeBookings = bookingRequests.filter(b=>b.status!=="archived");
  const archivedBookings = bookingRequests.filter(b=>b.status==="archived");
  const activeReferrals = referrals.filter(r=>!r.referred_name?.startsWith("Manual")&&r.status!=="archived");
  const archivedReferrals = referrals.filter(r=>!r.referred_name?.startsWith("Manual")&&r.status==="archived");

  const SectionHeader = ({id, icon, label, count, badge}) => (
    <div onClick={()=>toggleInbox(id)} style={{padding:"12px 16px",borderBottom:inboxOpen[id]?`1px solid ${G.border}`:"none",fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",userSelect:"none"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        {icon} {label}
        {count!==undefined&&<span style={{fontSize:12,fontWeight:400,color:G.muted}}>({count})</span>}
        {badge}
      </div>
      <span style={{fontSize:12,color:G.muted,transition:"transform 0.2s",display:"inline-block",transform:inboxOpen[id]?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
    </div>
  );

  return <>
    <Topbar title="Inbox" extra={<span/>}/>
    <div style={{flex:1,overflow:"auto",padding:isMobile?10:16,paddingBottom:isMobile?90:40,display:"flex",flexDirection:"column",gap:12}}>

      {/* Booking Requests */}
      <div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:12}}>
        <SectionHeader id="bookings" icon="📅" label="Booking Requests" count={activeBookings.length}/>
        {inboxOpen.bookings && <>
          {activeBookings.length===0
            ? <div style={{padding:20,textAlign:"center",color:G.muted,fontSize:13}}>No booking requests</div>
            : activeBookings.map((b,i)=>(
              <div key={b.id||i} style={{padding:"12px 16px",borderBottom:`1px solid ${G.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13}}>{b.client_name}</div>
                    <div style={{fontSize:12,color:G.muted}}>{b.service} · {b.preferred_date||"Flexible"}</div>
                    {b.notes&&<div style={{fontSize:12,color:"#555",marginTop:2,fontStyle:"italic"}}>"{b.notes}"</div>}
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:20,height:"fit-content",background:(b.status||"pending")==="confirmed"?"#e8f5e9":"#fff8e1",color:(b.status||"pending")==="confirmed"?"#2e7d32":"#e65100",flexShrink:0,marginLeft:8}}>{(b.status||"PENDING").toUpperCase()}</span>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {(b.status||"pending")==="pending"&&<>
                    <button onClick={async()=>{
                      await supabase.from("bookings").update({status:"confirmed"}).eq("id",b.id);
                      setBookingRequests(bs=>bs.map(x=>x.id===b.id?{...x,status:"confirmed"}:x));
                      const nj={id:`J-${Date.now()}`,client:b.client_name,service:b.service,description:b.notes||"",status:"Active",revenue:0,hours:0,completion_date:b.preferred_date||null,notes:"Booked via portal"};
                      await supabase.from("jobs").insert(nj);
                      setJobs(js=>[{...nj,completionDate:nj.completion_date||""},...js]);
                      await supabase.from("messages").insert({client_name:b.client_name,portal_token:"",sender:"simon",text:`Hi ${b.client_name.split(" ")[0]}, your ${b.service} booking is confirmed! We will see you then. Simon`,read:false,created_at:new Date().toISOString()});
                      sendClientPush(b.client_name,"📅 Booking Confirmed!","Your "+b.service+" booking"+(b.preferred_date?" for "+b.preferred_date:"")+" is confirmed. See you then!");
                      showToast("Booking confirmed — job created","success");
                    }} style={{background:G.green,color:"#fff",border:"none",borderRadius:7,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Confirm</button>
                    <button onClick={async()=>{
                      await supabase.from("bookings").update({status:"declined"}).eq("id",b.id);
                      setBookingRequests(bs=>bs.map(x=>x.id===b.id?{...x,status:"declined"}:x));
                      sendClientPush(b.client_name,"📅 Booking Update","We cannot accommodate your "+b.service+" request at that time. Please contact Simon on 0447 130 743 to arrange an alternative.");
                    }} style={{background:"#fce4ec",color:"#c62828",border:"none",borderRadius:7,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>Decline</button>
                  </>}
                  <button onClick={()=>archiveBooking(b.id)} style={{background:"#f5f5f5",color:G.muted,border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 12px",fontSize:11,cursor:"pointer",marginLeft:"auto"}}>Archive</button>
                </div>
              </div>
            ))
          }
          {archivedBookings.length>0&&<>
            <div onClick={()=>setShowArchivedBookings(s=>!s)} style={{padding:"10px 16px",fontSize:12,color:G.muted,cursor:"pointer",borderTop:`1px solid ${G.border}`,display:"flex",alignItems:"center",gap:6}}>
              <span style={{transform:showArchivedBookings?"rotate(180deg)":"none",display:"inline-block"}}>▾</span> {archivedBookings.length} archived booking{archivedBookings.length>1?"s":""}
            </div>
            {showArchivedBookings&&archivedBookings.map((b,i)=>(
              <div key={b.id||i} style={{padding:"10px 16px",borderTop:`1px solid ${G.border}`,opacity:0.6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:12}}>{b.client_name}</div>
                  <div style={{fontSize:11,color:G.muted}}>{b.service}</div>
                </div>
                <button onClick={()=>restoreBooking(b.id)} style={{fontSize:11,color:G.green,background:"none",border:`1px solid ${G.green}`,borderRadius:6,padding:"3px 10px",cursor:"pointer"}}>Restore</button>
              </div>
            ))}
          </>}
        </>}
      </div>

      {/* Messages */}
      <div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:12}}>
        <SectionHeader id="messages" icon="💬" label="Client Messages" badge={unreadMessages>0?<span style={{fontSize:11,background:"#e8f5e9",color:"#2e7d32",padding:"2px 8px",borderRadius:20,fontWeight:600}}>{unreadMessages} unread</span>:null}/>
        {inboxOpen.messages && <>
          {messages.length===0
            ? <div style={{padding:20,textAlign:"center",color:G.muted,fontSize:13}}>No messages yet</div>
            : (()=>{
                const byClient = {};
                messages.forEach(m=>{
                  if(!byClient[m.client_name]) byClient[m.client_name]=[];
                  byClient[m.client_name].push(m);
                });
                return Object.entries(byClient)
                  .sort((a,b)=>{
                    const ta = a[1][a[1].length-1]?.created_at||"";
                    const tb = b[1][b[1].length-1]?.created_at||"";
                    return tb.localeCompare(ta);
                  })
                  .map(([clientName,msgs])=>(
                    <div key={clientName} style={{position:"relative"}}>
                      <MsgThread clientName={clientName} msgs={msgs} G={G} supabase={supabase} setMessages={setMessages} setUnreadMessages={setUnreadMessages} sendClientPush={sendClientPush}/>
                      <button onClick={()=>archiveMsgThread(clientName)} style={{position:"absolute",top:10,right:12,fontSize:10,color:G.muted,background:"#f5f5f5",border:`1px solid ${G.border}`,borderRadius:5,padding:"2px 8px",cursor:"pointer"}}>Archive</button>
                    </div>
                  ));
              })()
          }
        </>}
      </div>

      {/* Referrals */}
      <div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:12}}>
        <SectionHeader id="referrals" icon="🎁" label="Referrals" count={activeReferrals.length}/>
        {inboxOpen.referrals && <>
          {activeReferrals.length===0
            ? <div style={{padding:20,textAlign:"center",color:G.muted,fontSize:13}}>No referrals yet</div>
            : activeReferrals.map((r,i)=>(
              <div key={r.id||i} style={{padding:"11px 16px",borderBottom:`1px solid ${G.border}`,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,background:"#e8f5e9",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🎁</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13}}>{r.referred_name}</div>
                  <div style={{fontSize:11,color:G.muted}}>Referred by {r.referrer_name}{r.referred_phone?" · "+r.referred_phone:""}</div>
                  <div style={{fontSize:11,color:G.muted}}>{r.created_at?new Date(r.created_at).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):""}</div>
                </div>
                <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:r.status==="paid"?"#e8f5e9":"#fff8e1",color:r.status==="paid"?"#2e7d32":"#e65100",flexShrink:0}}>{(r.status||"pending").toUpperCase()}</span>
                <button onClick={()=>archiveReferral(r.id)} style={{fontSize:10,color:G.muted,background:"#f5f5f5",border:`1px solid ${G.border}`,borderRadius:5,padding:"3px 8px",cursor:"pointer",flexShrink:0}}>Archive</button>
              </div>
            ))
          }
          {archivedReferrals.length>0&&<>
            <div onClick={()=>setShowArchivedReferrals(s=>!s)} style={{padding:"10px 16px",fontSize:12,color:G.muted,cursor:"pointer",borderTop:`1px solid ${G.border}`,display:"flex",alignItems:"center",gap:6}}>
              <span style={{transform:showArchivedReferrals?"rotate(180deg)":"none",display:"inline-block"}}>▾</span> {archivedReferrals.length} archived referral{archivedReferrals.length>1?"s":""}
            </div>
            {showArchivedReferrals&&archivedReferrals.map((r,i)=>(
              <div key={r.id||i} style={{padding:"10px 16px",borderTop:`1px solid ${G.border}`,opacity:0.6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:12}}>{r.referred_name}</div>
                  <div style={{fontSize:11,color:G.muted}}>Referred by {r.referrer_name}</div>
                </div>
                <button onClick={()=>restoreReferral(r.id)} style={{fontSize:11,color:G.green,background:"none",border:`1px solid ${G.green}`,borderRadius:6,padding:"3px 10px",cursor:"pointer"}}>Restore</button>
              </div>
            ))}
          </>}
        </>}
      </div>

    </div>
  </>;
})() /* disabled */}

    </>
  );
}
