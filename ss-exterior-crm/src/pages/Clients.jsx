import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext.jsx";
import { Topbar, Badge, Avatar, Card, showConfirm, showToast } from "../utils/ui.jsx";
import { exportCSV } from "../utils/helpers.js";
import { buildClientActivity, recordBelongsToClient } from "../utils/clientLinks.js";
import { ClientDocumentsPanel } from "../components/InboxTab.jsx";

const money = (value) => "$" + Number(value || 0).toLocaleString("en-AU", { maximumFractionDigits: 0 });
const shortDate = (date) => date ? new Date(date + "T12:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "Not set";

function SectionTitle({ children, action }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:8}}>
      <div style={{fontSize:12,fontWeight:800,textTransform:"uppercase",color:"#5d6b5a",letterSpacing:0}}>{children}</div>
      {action}
    </div>
  );
}

function MiniStat({ label, value, tone = "#2e7d32" }) {
  return (
    <div style={{border:"1px solid #dfe8dc",borderRadius:8,padding:"10px 12px",background:"#fff",minWidth:0}}>
      <div style={{fontSize:11,color:"#66736a",fontWeight:700,marginBottom:3}}>{label}</div>
      <div style={{fontSize:15,fontWeight:850,color:tone,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{value}</div>
    </div>
  );
}

function RecordList({ records, empty, render }) {
  if (!records.length) return <div style={{padding:18,border:"1px solid #e3e8e1",borderRadius:8,background:"#fff",fontSize:13,color:"#66736a",textAlign:"center"}}>{empty}</div>;
  return <div style={{display:"flex",flexDirection:"column",gap:8}}>{records.map(render)}</div>;
}

export default function Clients() {
  const ctx = useAppContext();
  const {
    G, isMobile, clients, setClients, jobs, quotes, invoices, recurringJobs,
    messages, bookingRequests, clientDocuments, setClientDocuments, supabase,
    clientSearch, setClientSearch, setModal, setEditItem, shareClientPortal,
    setTab, goAI, supportsClientIds,
  } = ctx;
  const navigate = useNavigate();
  const { clientId } = useParams();
  const [profileTab, setProfileTab] = useState("overview");

  const sortedClients = useMemo(() => [...clients].sort((a,b)=>(a.name||"").localeCompare(b.name||"")), [clients]);
  const filteredClients = useMemo(() => {
    const q = (clientSearch || "").toLowerCase().trim();
    if (!q) return sortedClients;
    return sortedClients.filter(c =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.address || "").toLowerCase().includes(q) ||
      (c.suburb || "").toLowerCase().includes(q)
    );
  }, [clientSearch, sortedClients]);

  const selectedClient = clients.find(c => c.id === clientId) || null;
  const profileData = useMemo(() => {
    if (!selectedClient) return null;
    const clientJobs = jobs.filter(r => recordBelongsToClient(r, selectedClient));
    const clientQuotes = quotes.filter(r => recordBelongsToClient(r, selectedClient));
    const clientInvoices = invoices.filter(r => recordBelongsToClient(r, selectedClient));
    const clientRecurring = recurringJobs.filter(r => recordBelongsToClient(r, selectedClient));
    const clientMessages = messages.filter(r => recordBelongsToClient(r, selectedClient));
    const clientDocs = clientDocuments.filter(r => recordBelongsToClient(r, selectedClient));
    const paidJobs = clientJobs.filter(j => j.status === "Paid");
    const outstanding = clientInvoices.filter(i => i.status !== "paid").reduce((s,i)=>s + Number(i.total || 0), 0);
    const lastJob = [...paidJobs].sort((a,b)=>String(b.completionDate || b.completion_date || "").localeCompare(String(a.completionDate || a.completion_date || "")))[0];
    const nextJob = [...clientJobs].filter(j => j.status !== "Paid" && (j.completionDate || j.completion_date)).sort((a,b)=>String(a.completionDate || a.completion_date || "").localeCompare(String(b.completionDate || b.completion_date || "")))[0];
    const activity = buildClientActivity(selectedClient, { jobs, quotes, invoices, recurringJobs, messages, documents: clientDocuments });
    return { clientJobs, clientQuotes, clientInvoices, clientRecurring, clientMessages, clientDocs, paidJobs, outstanding, lastJob, nextJob, activity };
  }, [selectedClient, jobs, quotes, invoices, recurringJobs, messages, clientDocuments]);

  const openClient = (client) => {
    setProfileTab("overview");
    setTab("clients");
    navigate("/clients/" + client.id);
  };

  const deleteClient = async (client) => {
    const ok = await showConfirm("Delete " + client.name + "?", { title:"Delete client", confirmLabel:"Delete", danger:true });
    if (!ok) return;
    await supabase.from("clients").delete().eq("id", client.id);
    setClients(cs => cs.filter(x => x.id !== client.id));
    navigate("/clients");
  };

  const clientList = (
    <div style={{
      width: isMobile ? "100%" : 330,
      flexShrink:0,
      borderRight: isMobile ? "none" : `1px solid ${G.border}`,
      background:"#f7faf5",
      display: selectedClient && isMobile ? "none" : "flex",
      flexDirection:"column",
      minHeight:0,
    }}>
      <div style={{padding:12,borderBottom:`1px solid ${G.border}`,display:"flex",flexDirection:"column",gap:8}}>
        <input value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="Search name, phone, email, address…" style={{border:`1px solid ${G.border}`,borderRadius:8,padding:"10px 12px",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12,color:G.muted}}>
          <span>{filteredClients.length} of {clients.length} clients</span>
          <span>{supportsClientIds ? "ID links on" : "Name fallback"}</span>
        </div>
      </div>
      <div style={{overflow:"auto",padding:10,display:"flex",flexDirection:"column",gap:8}}>
        {filteredClients.slice(0,200).map(client => {
          const clientJobs = jobs.filter(r => recordBelongsToClient(r, client));
          const paid = clientJobs.filter(j=>j.status==="Paid").reduce((s,j)=>s+Number(j.revenue||0),0);
          const last = [...clientJobs].sort((a,b)=>String(b.completionDate || b.completion_date || "").localeCompare(String(a.completionDate || a.completion_date || "")))[0];
          return (
            <button key={client.id} id={`client-card-${client.id}`} onClick={()=>openClient(client)} style={{
              border:`1px solid ${selectedClient?.id===client.id ? G.green : G.border}`,
              background:selectedClient?.id===client.id ? "#eff9ea" : "#fff",
              borderRadius:8,
              padding:10,
              display:"flex",
              alignItems:"center",
              gap:10,
              textAlign:"left",
              cursor:"pointer",
              fontFamily:"inherit",
            }}>
              <Avatar name={client.name} size={34}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:800,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{client.name}</div>
                <div style={{fontSize:11,color:G.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{[client.suburb, client.phone].filter(Boolean).join(" - ") || "No contact details"}</div>
                <div style={{fontSize:10,color:"#2e7d32",fontWeight:700,marginTop:2}}>{clientJobs.length} jobs - {money(paid)} paid{last ? " - last " + shortDate(last.completionDate || last.completion_date) : ""}</div>
              </div>
              <Badge s={client.status || "active"}/>
            </button>
          );
        })}
      </div>
    </div>
  );

  const profile = selectedClient && profileData ? (
    <div style={{flex:1,minWidth:0,overflow:"auto",padding:isMobile?12:18,paddingBottom:isMobile?90:28}}>
      {isMobile && <button onClick={()=>navigate("/clients")} style={{border:`1px solid ${G.border}`,background:"#fff",borderRadius:8,padding:"8px 12px",fontSize:13,fontWeight:700,marginBottom:10}}>Back to clients</button>}
      <div style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:8,overflow:"hidden",marginBottom:12}}>
        <div style={{padding:isMobile?14:18,display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr auto",gap:14,alignItems:"start",background:"linear-gradient(180deg,#ffffff,#f7fbf5)"}}>
          <div style={{display:"flex",gap:12,alignItems:"flex-start",minWidth:0}}>
            <Avatar name={selectedClient.name} size={52}/>
            <div style={{minWidth:0}}>
              <div style={{fontSize:isMobile?21:26,fontWeight:900,color:"#192118",lineHeight:1.1,overflow:"hidden",textOverflow:"ellipsis"}}>{selectedClient.name}</div>
              <div style={{fontSize:13,color:"#66736a",marginTop:5}}>{[selectedClient.suburb, selectedClient.address].filter(Boolean).join(" - ") || "No property address"}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
                <Badge s={selectedClient.status || "active"}/>
                <span style={{fontSize:11,fontWeight:800,color:"#2e7d32",background:"#e8f5e9",borderRadius:20,padding:"3px 9px"}}>{selectedClient.id}</span>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:isMobile?"flex-start":"flex-end"}}>
            <button onClick={()=>goAI(`Build a quote for ${selectedClient.name}${selectedClient.address ? " at " + selectedClient.address : ""}`)} style={{background:G.green,color:"#fff",border:"none",borderRadius:8,padding:"9px 13px",fontSize:13,fontWeight:800,cursor:"pointer"}}>Create quote</button>
            <button onClick={()=>setModal("addJob")} style={{background:"#e3f2fd",color:"#1565c0",border:"none",borderRadius:8,padding:"9px 13px",fontSize:13,fontWeight:800,cursor:"pointer"}}>Create job</button>
            <button onClick={()=>shareClientPortal(selectedClient)} style={{background:"#fff3e0",color:"#e65100",border:"none",borderRadius:8,padding:"9px 13px",fontSize:13,fontWeight:800,cursor:"pointer"}}>Share portal</button>
            <button onClick={()=>{setEditItem(selectedClient);setModal("editClient");}} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:8,padding:"9px 13px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Edit</button>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(5,minmax(0,1fr))",gap:8,padding:12,borderTop:`1px solid ${G.border}`,background:"#fbfdf9"}}>
          <MiniStat label="Outstanding" value={money(profileData.outstanding)} tone={profileData.outstanding > 0 ? "#c62828" : "#2e7d32"}/>
          <MiniStat label="Open quotes" value={profileData.clientQuotes.filter(q=>["pending","sent"].includes((q.status||"").toLowerCase())).length}/>
          <MiniStat label="Upcoming jobs" value={profileData.clientJobs.filter(j=>j.status !== "Paid").length}/>
          <MiniStat label="Last service" value={profileData.lastJob ? shortDate(profileData.lastJob.completionDate || profileData.lastJob.completion_date) : "None"}/>
          <MiniStat label="Lifetime value" value={money(profileData.paidJobs.reduce((s,j)=>s+Number(j.revenue||0),0))}/>
        </div>
      </div>

      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:12}}>
        {["overview","jobs","quotes","invoices","communications","files"].map(tab => (
          <button key={tab} onClick={()=>setProfileTab(tab)} style={{border:`1px solid ${profileTab===tab?G.green:G.border}`,background:profileTab===tab?"#e8f5e9":"#fff",color:profileTab===tab?G.dark:"#4b5549",borderRadius:8,padding:"8px 12px",fontSize:13,fontWeight:800,textTransform:"capitalize",cursor:"pointer",whiteSpace:"nowrap"}}>{tab}</button>
        ))}
      </div>

      {profileTab === "overview" && (
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"minmax(260px,.9fr) minmax(320px,1.2fr) minmax(260px,.9fr)",gap:12}}>
          <Card>
            <div style={{padding:14}}>
              <SectionTitle>Relationship</SectionTitle>
              {[
                ["Phone", selectedClient.phone],
                ["Email", selectedClient.email],
                ["Address", [selectedClient.address, selectedClient.suburb].filter(Boolean).join(", ")],
                ["Source", selectedClient.source],
                ["Notes", selectedClient.notes],
              ].map(([label,value]) => value ? <div key={label} style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:800,color:G.muted}}>{label}</div><div style={{fontSize:13,lineHeight:1.4}}>{value}</div></div> : null)}
              {!selectedClient.phone && !selectedClient.email && !selectedClient.address && <div style={{fontSize:13,color:G.muted}}>Add contact and property details so reps have the essentials before creating work.</div>}
            </div>
          </Card>
          <Card>
            <div style={{padding:14}}>
              <SectionTitle>Current Work</SectionTitle>
              <RecordList
                records={[
                  ...profileData.clientJobs.filter(j=>j.status !== "Paid").slice(0,4),
                  ...profileData.clientQuotes.filter(q=>["pending","sent"].includes((q.status||"").toLowerCase())).slice(0,4),
                  ...profileData.clientInvoices.filter(i=>i.status !== "paid").slice(0,4),
                ].slice(0,8)}
                empty="No current work needing attention."
                render={(record, index)=><div key={(record.id||"current")+index} style={{border:"1px solid #e3e8e1",borderRadius:8,padding:10,background:"#fff",display:"flex",justifyContent:"space-between",gap:10}}><div><div style={{fontSize:13,fontWeight:800}}>{record.service || record.id}</div><div style={{fontSize:11,color:G.muted}}>{record.status || record.due_date || record.date}</div></div><div style={{fontWeight:900,color:Number(record.total||record.revenue||0)>0?G.dark:G.muted}}>{record.total ? money(record.total) : record.revenue ? money(record.revenue) : ""}</div></div>}
              />
            </div>
          </Card>
          <Card>
            <div style={{padding:14}}>
              <SectionTitle>Next Best Context</SectionTitle>
              <div style={{display:"flex",flexDirection:"column",gap:10,fontSize:13}}>
                <div><b>Next job:</b> {profileData.nextJob ? `${profileData.nextJob.service} on ${shortDate(profileData.nextJob.completionDate || profileData.nextJob.completion_date)}` : "No upcoming job"}</div>
                <div><b>Recurring:</b> {profileData.clientRecurring.filter(r=>r.active !== false).length || "None active"}</div>
                <div><b>Latest message:</b> {profileData.clientMessages[0]?.text?.slice(0,70) || "No messages yet"}</div>
              </div>
            </div>
          </Card>
          <div style={{gridColumn:"1/-1"}}>
            <Card>
              <div style={{padding:14}}>
                <SectionTitle>Activity Timeline</SectionTitle>
                <RecordList
                  records={profileData.activity.slice(0,18)}
                  empty="No activity has been linked to this client yet."
                  render={(item, index)=><div key={index} style={{display:"grid",gridTemplateColumns:"112px 80px 1fr auto",gap:10,alignItems:"center",padding:"9px 0",borderBottom:index<profileData.activity.slice(0,18).length-1?`1px solid ${G.border}`:"none",fontSize:13}}><div style={{color:G.muted}}>{shortDate(item.date)}</div><div style={{fontSize:11,fontWeight:900,color:G.dark,background:"#e8f5e9",borderRadius:20,padding:"3px 8px",textAlign:"center"}}>{item.type}</div><div style={{fontWeight:700,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div><div style={{fontWeight:900}}>{item.amount ? money(item.amount) : ""}</div></div>}
                />
              </div>
            </Card>
          </div>
        </div>
      )}

      {profileTab === "jobs" && <RecordList records={profileData.clientJobs} empty="No jobs for this client yet." render={j=><Card key={j.id}><div style={{padding:14,display:"flex",justifyContent:"space-between",gap:12}}><div><div style={{fontWeight:900}}>{j.service || "Job"}</div><div style={{fontSize:12,color:G.muted}}>{shortDate(j.completionDate || j.completion_date)} - {j.status}</div>{j.notes&&<div style={{fontSize:12,marginTop:6}}>{j.notes}</div>}</div><div style={{fontWeight:900,color:G.dark}}>{money(j.revenue)}</div></div></Card>} />}
      {profileTab === "quotes" && <RecordList records={profileData.clientQuotes} empty="No quotes for this client yet." render={q=><Card key={q.id}><div style={{padding:14,display:"flex",justifyContent:"space-between",gap:12}}><div><div style={{fontWeight:900}}>{q.id}</div><div style={{fontSize:12,color:G.muted}}>{shortDate(q.date)} - {q.status}</div></div><div style={{fontWeight:900,color:G.dark}}>{money(q.total)}</div></div></Card>} />}
      {profileTab === "invoices" && <RecordList records={profileData.clientInvoices} empty="No invoices or receipts for this client yet." render={i=><Card key={i.id}><div style={{padding:14,display:"flex",justifyContent:"space-between",gap:12}}><div><div style={{fontWeight:900}}>{i.id}</div><div style={{fontSize:12,color:G.muted}}>Due {shortDate(i.due_date)} - {i.status}</div></div><div style={{fontWeight:900,color:i.status==="paid"?"#2e7d32":"#c62828"}}>{money(i.total)}</div></div></Card>} />}
      {profileTab === "communications" && <RecordList records={profileData.clientMessages} empty="No messages for this client yet." render={m=><Card key={m.id || m.created_at}><div style={{padding:14}}><div style={{fontSize:12,color:G.muted,fontWeight:800}}>{shortDate((m.created_at||"").split("T")[0])} - {m.sender || "message"}</div><div style={{fontSize:13,marginTop:5,lineHeight:1.4}}>{m.text}</div></div></Card>} />}
      {profileTab === "files" && <Card><div style={{padding:14}}><ClientDocumentsPanel clientName={selectedClient.name} clientDocuments={clientDocuments} setClientDocuments={setClientDocuments} supabase={supabase} G={G}/></div></Card>}

      <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
        <button onClick={()=>deleteClient(selectedClient)} style={{background:"#fce4ec",color:"#c62828",border:"none",borderRadius:8,padding:"8px 13px",fontSize:13,fontWeight:800,cursor:"pointer"}}>Delete client</button>
      </div>
    </div>
  ) : (
    <div style={{flex:1,display:isMobile?"none":"flex",alignItems:"center",justifyContent:"center",padding:24,color:G.muted,textAlign:"center"}}>
      <div>
        <div style={{fontSize:20,fontWeight:900,color:"#293327",marginBottom:8}}>Choose a client profile</div>
        <div style={{fontSize:14,maxWidth:380,lineHeight:1.5}}>Search a name, phone, email, address or suburb. Opening a result shows the full relationship: work history, quotes, invoices, communications and files.</div>
      </div>
    </div>
  );

  return (
    <>
      <Topbar title={selectedClient ? selectedClient.name : `Clients (${clients.length})`}
        extra={<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button onClick={()=>setModal("addClient")} style={{padding:"7px 13px",border:"none",borderRadius:8,background:G.green,color:"#fff",fontSize:12,cursor:"pointer",fontWeight:800}}>+ New</button>
          <button onClick={()=>goAI("Add new client: ")} style={{padding:"7px 13px",border:"none",borderRadius:8,background:"#e8f5e9",color:"#2e7d32",fontSize:12,cursor:"pointer",fontWeight:800}}>Ask AI</button>
          <button onClick={()=>exportCSV(clients.map(c=>({ID:c.id,Name:c.name,Phone:c.phone,Email:c.email,Address:c.address,Suburb:c.suburb,Status:c.status})),"clients.csv")} style={{padding:"7px 13px",border:`1px solid ${G.border}`,borderRadius:8,background:"#fff",fontSize:12,cursor:"pointer",fontWeight:700}}>Export</button>
        </div>}
      />
      <div style={{flex:1,minHeight:0,display:"flex",overflow:"hidden",background:G.bg}}>
        {clientList}
        {profile}
      </div>
    </>
  );
}
