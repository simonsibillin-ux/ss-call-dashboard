import React, { useState } from "react";
import { G, supabase } from "../utils/constants.js";
import { showToast, showConfirm } from "../utils/ui.jsx";

function ClientDocumentsPanel({clientName, clientDocuments, setClientDocuments, supabase, G}) {
  const [uploading, setUploading] = useState(false);
  const docs = clientDocuments.filter(d=>d.client_name===clientName);

  const uploadDoc = async (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    if(file.size > 10*1024*1024) { alert("File too large. Max 10MB."); return; }
    setUploading(true);
    try {
      // Upload to Supabase Storage
      // Sanitize filename - remove spaces and special chars that break storage paths
      const safeClient = clientName.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 30);
      const safeFile = file.name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "").replace(/-+/g, "-");
      const fileName = `${safeClient}-${Date.now()}-${safeFile}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("client-docs")
        .upload(fileName, file, { upsert: false });
      if(uploadErr) { alert("Upload error: "+uploadErr.message); setUploading(false); return; }
      const { data: urlData } = supabase.storage.from("client-docs").getPublicUrl(fileName);
      const doc = {
        id: `DOC-${Date.now()}`,
        client_name: clientName,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        show_on_portal: false,
        notes: "",
        uploaded_at: new Date().toISOString()
      };
      await supabase.from("client_documents").insert(doc);
      setClientDocuments(ds=>[doc,...ds]);
    } catch(err) { alert("Error: "+err.message); }
    setUploading(false);
    e.target.value = "";
  };

  const togglePortal = async (doc) => {
    const newVal = !doc.show_on_portal;
    await supabase.from("client_documents").update({show_on_portal:newVal}).eq("id",doc.id);
    setClientDocuments(ds=>ds.map(d=>d.id===doc.id?{...d,show_on_portal:newVal}:d));
    if(newVal) sendClientPush(clientName,'📎 New Document Shared','Simon has shared a document with you: '+doc.file_name+'. View it in your portal under Docs.');
  };

  const deleteDoc = async (doc) => {
    if(!await showConfirm("Delete "+doc.file_name+"?",{title:"Delete document",confirmLabel:"Delete",danger:true}))return;
    // Remove from storage
    const fileName = doc.file_url.split("/").pop();
    await supabase.storage.from("client-docs").remove([fileName]);
    await supabase.from("client_documents").delete().eq("id",doc.id);
    setClientDocuments(ds=>ds.filter(d=>d.id!==doc.id));
  };

  const formatSize = (bytes) => bytes>1024*1024?(bytes/1024/1024).toFixed(1)+"MB":(bytes/1024).toFixed(0)+"KB";
  const fileIcon = (type) => type?.includes("pdf")?"📄":type?.includes("image")?"🖼️":type?.includes("word")?"📝":"📎";

  return <div style={{marginTop:10}}>
    <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>📎 Client Documents</div>
    {docs.length===0&&<div style={{fontSize:12,color:G.muted,marginBottom:8}}>No documents yet</div>}
    {docs.map(doc=>(
      <div key={doc.id} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:9,padding:"9px 12px",marginBottom:6,display:"flex",alignItems:"center",gap:10}}>
        <div style={{fontSize:20,flexShrink:0}}>{fileIcon(doc.file_type)}</div>
        <div style={{flex:1,minWidth:0}}>
          <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{fontSize:13,fontWeight:600,color:G.dark,textDecoration:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>{doc.file_name}</a>
          <div style={{fontSize:11,color:G.muted}}>{doc.file_size?formatSize(doc.file_size):""} · {new Date(doc.uploaded_at).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"})}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,cursor:"pointer",color:doc.show_on_portal?"#2e7d32":G.muted,fontWeight:600}}>
            <input type="checkbox" checked={doc.show_on_portal} onChange={()=>togglePortal(doc)} style={{accentColor:"#6DC135"}}/>
            Portal
          </label>
          <button onClick={()=>deleteDoc(doc)} style={{background:"#fce4ec",border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,color:"#c62828",cursor:"pointer"}}>Delete</button>
        </div>
      </div>
    ))}
    <label style={{display:"flex",alignItems:"center",gap:8,border:`1px dashed ${G.green}`,borderRadius:9,padding:"8px 12px",cursor:"pointer",fontSize:12,color:G.green,fontWeight:600,marginTop:4}}>
      <input type="file" onChange={uploadDoc} style={{display:"none"}} accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.txt"/>
      {uploading?"⏳ Uploading…":"📎 Attach document"}
    </label>
  </div>;
}

// ── CREDIT MANAGER COMPONENT ────────────────────────────────

// ── InboxTab component (proper component so useState works) ──────────────────
function InboxTab({bookingRequests,setBookingRequests,messages,setMessages,unreadMessages,setUnreadMessages,referrals,setReferrals,clients,setClients,jobs,setJobs,G,isMobile,supabase,sendClientPush,MsgThread}) {
  const [inboxOpen, setInboxOpen] = useState({bookings:true,messages:true,referrals:true});
  const [showArchivedBookings, setShowArchivedBookings] = useState(false);
  const [showArchivedReferrals, setShowArchivedReferrals] = useState(false);
  const toggleInbox = k => setInboxOpen(s=>({...s,[k]:!s[k]}));

  const archiveBooking = async(id)=>{
    if(!await showConfirm("Archive this booking request?",{title:"Archive booking",confirmLabel:"Archive"}))return;
    await supabase.from("bookings").update({status:"archived"}).eq("id",id);
    setBookingRequests(bs=>bs.map(x=>x.id===id?{...x,status:"archived"}:x));
  };
  const restoreBooking = async(id)=>{
    await supabase.from("bookings").update({status:"pending"}).eq("id",id);
    setBookingRequests(bs=>bs.map(x=>x.id===id?{...x,status:"pending"}:x));
  };
  const archiveReferral = async(id)=>{
    if(!await showConfirm("Archive this referral?",{title:"Archive referral",confirmLabel:"Archive"}))return;
    await supabase.from("referrals").update({status:"archived"}).eq("id",id);
    setReferrals(rs=>rs.map(x=>x.id===id?{...x,status:"archived"}:x));
  };
  const restoreReferral = async(id)=>{
    await supabase.from("referrals").update({status:"pending"}).eq("id",id);
    setReferrals(rs=>rs.map(x=>x.id===id?{...x,status:"pending"}:x));
  };
  const archiveMsgThread = async(clientName)=>{
    if(!await showConfirm("Archive all messages with "+clientName+"?",{title:"Archive messages",confirmLabel:"Archive"}))return;
    await supabase.from("messages").update({read:true}).eq("client_name",clientName);
    setMessages(ms=>ms.filter(m=>m.client_name!==clientName));
  };

  const activeBookings = bookingRequests.filter(b=>b.status!=="archived");
  const archivedBookings = bookingRequests.filter(b=>b.status==="archived");
  const activeReferrals = referrals.filter(r=>!r.referred_name?.startsWith("Manual")&&r.status!=="archived");
  const archivedReferrals = referrals.filter(r=>!r.referred_name?.startsWith("Manual")&&r.status==="archived");

  const SectionHeader = ({id,icon,label,count,badge})=>(
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
    <div style={{padding:"12px 16px",borderBottom:`1px solid ${G.border}`,fontWeight:700,fontSize:16,background:"#fff",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <span>Inbox</span>
    </div>
    <div style={{flex:1,overflow:"auto",padding:isMobile?10:16,paddingBottom:isMobile?90:40,display:"flex",flexDirection:"column",gap:12}}>

      {/* Booking Requests */}
      <div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:12}}>
        <SectionHeader id="bookings" icon="📅" label="Booking Requests" count={activeBookings.length}/>
        {inboxOpen.bookings&&<>
          {activeBookings.length===0
            ?<div style={{padding:20,textAlign:"center",color:G.muted,fontSize:13}}>No booking requests</div>
            :activeBookings.map((b,i)=>(
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
                      await supabase.from("messages").insert({client_name:b.client_name,portal_token:"",sender:"simon",text:"Hi "+b.client_name.split(" ")[0]+", your "+b.service+" booking is confirmed! We will see you then. Simon",read:false,created_at:new Date().toISOString()});
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
              <span style={{transform:showArchivedBookings?"rotate(180deg)":"none",display:"inline-block"}}>▾</span> {archivedBookings.length} archived
            </div>
            {showArchivedBookings&&archivedBookings.map((b,i)=>(
              <div key={b.id||i} style={{padding:"10px 16px",borderTop:`1px solid ${G.border}`,opacity:0.6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontWeight:600,fontSize:12}}>{b.client_name}</div><div style={{fontSize:11,color:G.muted}}>{b.service}</div></div>
                <button onClick={()=>restoreBooking(b.id)} style={{fontSize:11,color:G.green,background:"none",border:`1px solid ${G.green}`,borderRadius:6,padding:"3px 10px",cursor:"pointer"}}>Restore</button>
              </div>
            ))}
          </>}
        </>}
      </div>

      {/* Messages */}
      <div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:12}}>
        <SectionHeader id="messages" icon="💬" label="Client Messages" badge={unreadMessages>0?<span style={{fontSize:11,background:"#e8f5e9",color:"#2e7d32",padding:"2px 8px",borderRadius:20,fontWeight:600}}>{unreadMessages} unread</span>:null}/>
        {inboxOpen.messages&&<>
          {messages.length===0
            ?<div style={{padding:20,textAlign:"center",color:G.muted,fontSize:13}}>No messages yet</div>
            :(()=>{
              const byClient={};
              messages.forEach(m=>{if(!byClient[m.client_name])byClient[m.client_name]=[];byClient[m.client_name].push(m);});
              return Object.entries(byClient)
                .sort((a,b)=>{const ta=a[1][a[1].length-1]?.created_at||"";const tb=b[1][b[1].length-1]?.created_at||"";return tb.localeCompare(ta);})
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
        {inboxOpen.referrals&&<>
          {activeReferrals.length===0
            ?<div style={{padding:20,textAlign:"center",color:G.muted,fontSize:13}}>No referrals yet</div>
            :activeReferrals.map((r,i)=>(
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
              <span style={{transform:showArchivedReferrals?"rotate(180deg)":"none",display:"inline-block"}}>▾</span> {archivedReferrals.length} archived
            </div>
            {showArchivedReferrals&&archivedReferrals.map((r,i)=>(
              <div key={r.id||i} style={{padding:"10px 16px",borderTop:`1px solid ${G.border}`,opacity:0.6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontWeight:600,fontSize:12}}>{r.referred_name}</div><div style={{fontSize:11,color:G.muted}}>Referred by {r.referrer_name}</div></div>
                <button onClick={()=>restoreReferral(r.id)} style={{fontSize:11,color:G.green,background:"none",border:`1px solid ${G.green}`,borderRadius:6,padding:"3px 10px",cursor:"pointer"}}>Restore</button>
              </div>
            ))}
          </>}
        </>}
      </div>

    </div>
  </>;
}

function CreditManager({clients, setClients, supabase, referrals, setReferrals, G, sendClientPush}) {
  const [creditSearch, setCreditSearch] = useState("");
  const [creditEdit, setCreditEdit] = useState(null);
  const [addAmount, setAddAmount] = useState("");
  const [addNote, setAddNote] = useState("");
  const [addClient, setAddClient] = useState("");

  const clientsWithCredit = clients.filter(c=>(c.referral_credit||0)>0);
  const searchedClients = creditSearch
    ? clients.filter(c=>(c.name||"").toLowerCase().includes(creditSearch.toLowerCase()))
    : clientsWithCredit;

  return <>
    {/* Add manual credit */}
    <div style={{padding:"12px 16px",borderBottom:`1px solid ${G.border}`,background:"#f9f9f9"}}>
      <div style={{fontSize:12,fontWeight:600,color:G.muted,textTransform:"uppercase",marginBottom:8}}>Add manual credit</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <div>
          <div style={{fontSize:11,color:G.muted,marginBottom:3}}>Client</div>
          <select value={addClient} onChange={e=>setAddClient(e.target.value)} style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"7px 10px",fontSize:13,fontFamily:"inherit",background:"#fff"}}>
            <option value="">— Select client —</option>
            {clients.sort((a,b)=>a.name.localeCompare(b.name)).map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:11,color:G.muted,marginBottom:3}}>Amount ($)</div>
          <input value={addAmount} onChange={e=>setAddAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"7px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>
      </div>
      <input value={addNote} onChange={e=>setAddNote(e.target.value)} placeholder="Reason (e.g. Manual bonus, referral adjustment)" style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"7px 10px",fontSize:13,fontFamily:"inherit",marginBottom:8,boxSizing:"border-box"}}/>
      <button onClick={async()=>{
        if(!addClient||!addAmount){alert("Select a client and enter an amount");return;}
        const amt = parseFloat(addAmount)||0;
        if(amt<=0){alert("Amount must be greater than 0");return;}
        const {data:existing} = await supabase.from("client_credits").select("*").eq("client_name",addClient).single();
        const prevEarned = existing?.total_earned||0;
        const prevUsed = existing?.total_used||0;
        if(existing){
          await supabase.from("client_credits").update({total_earned:prevEarned+amt,updated_at:new Date().toISOString()}).eq("client_name",addClient);
        } else {
          await supabase.from("client_credits").insert({id:`CC-${Date.now()}`,client_name:addClient,total_earned:amt,total_used:0});
        }
        const newCredit = prevEarned + amt - prevUsed;
        await supabase.from("clients").update({referral_credit:newCredit}).eq("name",addClient);
        setClients(cs=>cs.map(c=>c.name===addClient?{...c,referral_credit:newCredit}:c));
        const ref = {id:`REF-MAN-${Date.now()}`,referrer_name:addClient,referred_name:"Manual: "+(addNote||"adjustment"),status:"paid",credit_amount:amt,job_value:0,created_at:new Date().toISOString()};
        await supabase.from("referrals").insert(ref);
        setReferrals(rs=>[ref,...rs]);
        setAddClient(""); setAddAmount(""); setAddNote("");
        sendClientPush(addClient,'🎁 Credit Added to Your Account','Simon has added $'+amt.toFixed(2)+' credit to your account. Check your portal to see your balance!');
        alert(`$${amt.toFixed(2)} credit added to ${addClient}!`);
      }} style={{background:G.green,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Add credit</button>
    </div>

    {/* Search + list */}
    <div style={{padding:"10px 14px"}}>
      <input value={creditSearch} onChange={e=>setCreditSearch(e.target.value)} placeholder="Search client…" style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"7px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
    </div>
    {searchedClients.length===0&&<div style={{padding:"12px 16px",color:G.muted,fontSize:13,textAlign:"center"}}>{creditSearch?"No clients match":"No clients with credit yet"}</div>}
    {searchedClients.slice(0,20).map(c=>(
      <div key={c.id} style={{padding:"10px 16px",borderTop:`1px solid ${G.border}`,display:"flex",alignItems:"center",gap:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:600,fontSize:13}}>{c.name}</div>
          <div style={{fontSize:12,color:(c.referral_credit||0)>0?"#2e7d32":G.muted,fontWeight:(c.referral_credit||0)>0?700:400}}>
            {(c.referral_credit||0)>0?`$${(c.referral_credit||0).toFixed(2)} available`:"No credit"}
          </div>
        </div>
        {creditEdit===c.id
          ? <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input defaultValue={(c.referral_credit||0).toFixed(2)} id={`ce-${c.id}`} type="number" min="0" step="0.01" style={{width:80,border:`1px solid ${G.border}`,borderRadius:7,padding:"5px 8px",fontSize:13,fontFamily:"inherit"}}/>
              <button onClick={async()=>{
                const newVal = parseFloat(document.getElementById(`ce-${c.id}`)?.value)||0;
                await supabase.from("clients").update({referral_credit:newVal}).eq("id",c.id);
                await supabase.from("client_credits").upsert({id:`CC-${c.id}`,client_name:c.name,total_earned:newVal,total_used:0,updated_at:new Date().toISOString()},{onConflict:"client_name"});
                setClients(cs=>cs.map(x=>x.id===c.id?{...x,referral_credit:newVal}:x));
                setCreditEdit(null);
              }} style={{background:G.green,color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Save</button>
              <button onClick={()=>setCreditEdit(null)} style={{background:"#f5f5f5",border:"none",borderRadius:7,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>Cancel</button>
            </div>
          : <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setCreditEdit(c.id)} style={{background:"#e3f2fd",border:"none",borderRadius:7,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer",color:"#1565c0"}}>Edit</button>
              <button onClick={async()=>{
                if(!await showConfirm("Remove all credit from "+c.name+"?",{title:"Remove credit",confirmLabel:"Remove",danger:true}))return;
                await supabase.from("clients").update({referral_credit:0}).eq("id",c.id);
                await supabase.from("client_credits").upsert({id:`CC-${c.id}`,client_name:c.name,total_earned:0,total_used:0,updated_at:new Date().toISOString()},{onConflict:"client_name"});
                setClients(cs=>cs.map(x=>x.id===c.id?{...x,referral_credit:0}:x));
              }} style={{background:"#fce4ec",border:"none",borderRadius:7,padding:"5px 12px",fontSize:12,color:"#c62828",cursor:"pointer"}}>Clear</button>
            </div>
        }
      </div>
    ))}
  </>;
}

// ── MSG THREAD COMPONENT ────────────────────────────────────
function MsgThread({clientName, msgs, G, supabase, setMessages, setUnreadMessages, sendClientPush}) {
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState("");
  const lastMsg = msgs[msgs.length-1];
  const hasUnread = msgs.some(m=>m.sender==="client"&&!m.read);

  const sendReply = async () => {
    if(!reply.trim()) return;
    const txt = reply;
    setReply("");
    const msg = {client_name:clientName,portal_token:"",sender:"simon",text:txt,read:false,created_at:new Date().toISOString()};
    await supabase.from("messages").insert(msg);
    setMessages(ms=>[...ms,msg]);
    if(sendClientPush) sendClientPush(clientName,'💬 New message from Simon',txt);
  };

  return <div style={{borderBottom:`1px solid ${G.border}`}}>
    <div onClick={async()=>{
      setExpanded(e=>!e);
      if(!expanded&&hasUnread){
        await supabase.from("messages").update({read:true}).eq("client_name",clientName).eq("sender","client");
        setMessages(ms=>ms.map(m=>m.client_name===clientName&&m.sender==="client"?{...m,read:true}:m));
        setUnreadMessages(n=>Math.max(0,n-msgs.filter(m=>m.sender==="client"&&!m.read).length));
      }
    }} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",cursor:"pointer"}}>
      <div style={{width:36,height:36,borderRadius:10,background:G.green,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14,flexShrink:0}}>{(clientName||"?")[0].toUpperCase()}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:hasUnread?800:600,fontSize:13}}>{clientName}</div>
        <div style={{fontSize:11,color:G.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lastMsg.sender==="simon"?"You: ":""}{lastMsg.text}</div>
      </div>
      <div style={{fontSize:10,color:G.muted,flexShrink:0}}>{new Date(lastMsg.created_at).toLocaleDateString("en-AU",{day:"numeric",month:"short"})}</div>
      {hasUnread&&<div style={{width:8,height:8,background:G.green,borderRadius:"50%",flexShrink:0}}/>}
    </div>
    {expanded&&<div style={{borderTop:`1px solid ${G.border}`,background:"#fafafa"}}>
      <div style={{maxHeight:250,overflow:"auto",padding:12,display:"flex",flexDirection:"column",gap:8}}>
        {msgs.map((m,i)=><div key={i} style={{display:"flex",flexDirection:"column",alignItems:m.sender==="simon"?"flex-end":"flex-start"}}>
          <div style={{maxWidth:"78%",padding:"8px 12px",borderRadius:12,background:m.sender==="simon"?G.green:"#f0f0f0",color:m.sender==="simon"?"#fff":"#1a1a1a",fontSize:13,borderBottomRightRadius:m.sender==="simon"?3:12,borderBottomLeftRadius:m.sender==="client"?3:12}}>{m.text}</div>
          <div style={{fontSize:10,color:G.muted,marginTop:2}}>{new Date(m.created_at).toLocaleString("en-AU",{hour:"2-digit",minute:"2-digit",day:"numeric",month:"short"})}</div>
        </div>)}
      </div>
      <div style={{display:"flex",gap:8,padding:"8px 12px",borderTop:`1px solid ${G.border}`}}>
        <input value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")sendReply();}} placeholder="Reply…" style={{flex:1,border:`1px solid ${G.border}`,borderRadius:20,padding:"7px 12px",fontSize:13,fontFamily:"inherit",outline:"none"}}/>
        <button onClick={sendReply} style={{background:G.green,color:"#fff",border:"none",borderRadius:20,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Send</button>
      </div>
    </div>}
  </div>;
}


export { ClientDocumentsPanel, InboxTab, CreditManager, MsgThread };
