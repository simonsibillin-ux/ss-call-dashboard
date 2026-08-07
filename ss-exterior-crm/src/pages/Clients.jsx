import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppContext } from "../context/AppContext.jsx";
import { Topbar, Badge, Avatar, Card, showConfirm, showToast } from "../utils/ui.jsx";
import { exportCSV } from "../utils/helpers.js";
import { buildClientActivity, recordBelongsToClient } from "../utils/clientLinks.js";
import { ClientDocumentsPanel } from "../components/InboxTab.jsx";

const money = (value) => "$" + Number(value || 0).toLocaleString("en-AU", { maximumFractionDigits: 0 });
const shortDate = (date) => date ? new Date(date + "T12:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "Not set";
const compactDate = (date) => date ? new Date(date + "T12:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "None";
const LEAD_SOURCES = [
  { value:"Inbound phone call", label:"📞 Inbound phone call" },
  { value:"Meta Ads", label:"📘 Meta / Facebook Ad" },
  { value:"Google Ads", label:"🔍 Google Ad" },
  { value:"Website", label:"🌐 Website" },
  { value:"Referral", label:"🤝 Referral / word of mouth" },
  { value:"Repeat customer", label:"🔄 Repeat customer" },
  { value:"Other", label:"❓ Other" },
];
const normaliseLeadSource = (source = "") => source === "Meta / Facebook Ad" ? "Meta Ads" : source;

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
    <div style={{border:"1px solid #dfe8dc",borderRadius:8,padding:"10px 12px",background:"#fff",minWidth:138,flex:"1 1 138px"}}>
      <div style={{fontSize:11,color:"#66736a",fontWeight:700,marginBottom:3}}>{label}</div>
      <div style={{fontSize:15,fontWeight:850,color:tone,lineHeight:1.25,overflowWrap:"anywhere"}}>{value}</div>
    </div>
  );
}

function RecordList({ records, empty, render }) {
  if (!records.length) return <div style={{padding:18,border:"1px solid #e3e8e1",borderRadius:8,background:"#fff",fontSize:13,color:"#66736a",textAlign:"center"}}>{empty}</div>;
  return <div style={{display:"flex",flexDirection:"column",gap:8}}>{records.map(render)}</div>;
}

function ClickableRecordCard({ children, onClick, style = {} }) {
  const onKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };
  return (
    <Card
      onClick={onClick}
      style={{
        cursor: "pointer",
        transition: "border-color .15s, box-shadow .15s, transform .15s",
        ...style,
      }}
    >
      <div role="button" tabIndex={0} onKeyDown={onKeyDown}>
        {children}
      </div>
    </Card>
  );
}

function RelationshipPanel({ client, G, supabase, setClients }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [form, setForm] = useState({
    name: client.name || "",
    phone: client.phone || "",
    email: client.email || "",
    address: client.address || "",
    suburb: client.suburb || "",
    source: normaliseLeadSource(client.source),
    notes: client.notes || "",
    status: client.status || "active",
    campaign_name: client.campaign_name || "",
    campaign_id: client.campaign_id || "",
  });

  useEffect(() => {
    setForm({
      name: client.name || "",
      phone: client.phone || "",
      email: client.email || "",
      address: client.address || "",
      suburb: client.suburb || "",
      source: normaliseLeadSource(client.source),
      notes: client.notes || "",
      status: client.status || "active",
      campaign_name: client.campaign_name || "",
      campaign_id: client.campaign_id || "",
    });
    setEditing(false);
  }, [client.id]);

  useEffect(() => {
    if (!editing || form.source !== "Meta Ads" || campaigns.length) return;
    fetch("/api/meta-ads?days=7")
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Campaigns unavailable")))
      .then(data => setCampaigns(data.campaigns || []))
      .catch(() => setCampaigns([]));
  }, [editing, form.source, campaigns.length]);

  const update = (key) => (event) => setForm(prev => ({ ...prev, [key]: event.target.value }));
  const save = async () => {
    setSaving(true);
    const clientUpdates = {
      ...form,
      campaign_name: form.source === "Meta Ads" ? (form.campaign_name || null) : null,
      campaign_id: form.source === "Meta Ads" ? (form.campaign_id || null) : null,
    };
    const { error } = await supabase.from("clients").update(clientUpdates).eq("id", client.id);
    if (!error && form.name.trim() && form.name.trim() !== client.name) {
      const nextName = form.name.trim();
      await Promise.all([
        supabase.from("jobs").update({ client: nextName }).eq("client_id", client.id),
        supabase.from("quotes").update({ client: nextName }).eq("client_id", client.id),
        supabase.from("invoices").update({ client: nextName }).eq("client_id", client.id),
        supabase.from("recurring_jobs").update({ client: nextName }).eq("client_id", client.id),
        supabase.from("messages").update({ client_name: nextName }).eq("client_id", client.id),
        supabase.from("bookings").update({ client_name: nextName }).eq("client_id", client.id),
        supabase.from("client_documents").update({ client_name: nextName }).eq("client_id", client.id),
        supabase.from("client_credits").update({ client_name: nextName }).eq("client_id", client.id),
      ]);
    }
    if (error) {
      setSaving(false);
      showToast("Could not save relationship details: " + error.message, "error");
      return;
    }
    const { data: profileLeads, error: leadLookupError } = await supabase.from("bookings")
      .select("id")
      .eq("client_id", client.id)
      .eq("source", "Client profile")
      .limit(1);
    let leadError = leadLookupError;
    const existingLeadId = profileLeads?.[0]?.id;
    if (!leadError && form.source === "Meta Ads") {
      const leadRecord = {
        client_name: form.name.trim() || client.name,
        client_id: client.id,
        service: "General enquiry",
        address: form.address || "",
        notes: "Added from client profile",
        source: "Client profile",
        ad_source: "Meta Ads",
        campaign_name: form.campaign_name || null,
        campaign_id: form.campaign_id || null,
      };
      const result = existingLeadId
        ? await supabase.from("bookings").update(leadRecord).eq("id", existingLeadId)
        : await supabase.from("bookings").insert({ ...leadRecord, status:"pending", created_at:new Date().toISOString() });
      leadError = result.error;
    } else if (!leadError && existingLeadId) {
      const result = await supabase.from("bookings").delete().eq("id", existingLeadId);
      leadError = result.error;
    }
    setSaving(false);
    setClients(items => items.map(item => item.id === client.id ? { ...item, ...clientUpdates, name: form.name.trim() || item.name } : item));
    setEditing(false);
    showToast(leadError ? "Client saved, but the Marketing Hub lead could not be synced: " + leadError.message : "Relationship details saved", leadError ? "error" : "success");
  };

  if (editing) {
    const inputStyle = {width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box",outline:"none",background:"#fff"};
    return (
      <Card>
        <div style={{padding:14}}>
          <SectionTitle action={<button onClick={()=>setEditing(false)} style={{background:"#fff",border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 10px",fontSize:12,fontWeight:800,cursor:"pointer"}}>Cancel</button>}>Relationship</SectionTitle>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
            <label style={{fontSize:12,fontWeight:800,color:G.muted,gridColumn:"1/-1"}}>Client name<input value={form.name} onChange={update("name")} style={{...inputStyle,marginTop:4}}/></label>
            <label style={{fontSize:12,fontWeight:800,color:G.muted}}>Phone<input value={form.phone} onChange={update("phone")} style={{...inputStyle,marginTop:4}}/></label>
            <label style={{fontSize:12,fontWeight:800,color:G.muted}}>Email<input value={form.email} onChange={update("email")} style={{...inputStyle,marginTop:4}}/></label>
            <label style={{fontSize:12,fontWeight:800,color:G.muted,gridColumn:"1/-1"}}>Street address<input value={form.address} onChange={update("address")} style={{...inputStyle,marginTop:4}}/></label>
            <label style={{fontSize:12,fontWeight:800,color:G.muted}}>Suburb<input value={form.suburb} onChange={update("suburb")} style={{...inputStyle,marginTop:4}}/></label>
            <label style={{fontSize:12,fontWeight:800,color:G.muted}}>Status<select value={form.status} onChange={update("status")} style={{...inputStyle,marginTop:4}}><option value="active">active</option><option value="pending">pending</option><option value="follow-up">follow-up</option><option value="overdue">overdue</option><option value="inactive">inactive</option><option value="completed">completed</option></select></label>
            <label style={{fontSize:12,fontWeight:800,color:G.muted,gridColumn:"1/-1"}}>Lead source<select value={form.source} onChange={event => setForm(prev => ({...prev, source:event.target.value, campaign_name:"", campaign_id:""}))} style={{...inputStyle,marginTop:4}}><option value="">— Select lead source —</option>{LEAD_SOURCES.map(source => <option key={source.value} value={source.value}>{source.label}</option>)}</select></label>
            {form.source === "Meta Ads" && <label style={{fontSize:12,fontWeight:800,color:G.muted,gridColumn:"1/-1"}}>Meta campaign<select value={form.campaign_name} onChange={event => { const campaign = campaigns.find(item => item.name === event.target.value); setForm(prev => ({...prev,campaign_name:event.target.value,campaign_id:campaign?.id || ""})); }} style={{...inputStyle,marginTop:4}}><option value="">— Select campaign —</option>{form.campaign_name && !campaigns.some(campaign => campaign.name === form.campaign_name) && <option value={form.campaign_name}>{form.campaign_name}</option>}{campaigns.map(campaign => <option key={campaign.id} value={campaign.name}>{campaign.name}</option>)}</select>{!campaigns.length && <span style={{display:"block",fontSize:11,fontWeight:500,color:G.muted,marginTop:4}}>No live Meta campaigns are currently available.</span>}</label>}
            <label style={{fontSize:12,fontWeight:800,color:G.muted,gridColumn:"1/-1"}}>Important notes<textarea value={form.notes} onChange={update("notes")} rows={3} style={{...inputStyle,marginTop:4,resize:"vertical"}}/></label>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:12}}>
            <button onClick={save} disabled={saving} style={{background:G.green,color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:900,cursor:"pointer",opacity:saving ? .7 : 1}}>{saving ? "Saving..." : "Save details"}</button>
          </div>
        </div>
      </Card>
    );
  }

  const details = [
    ["Phone", client.phone],
    ["Email", client.email],
    ["Address", [client.address, client.suburb].filter(Boolean).join(", ")],
    ["Source", client.source],
    ["Campaign", client.source === "Meta Ads" ? client.campaign_name : ""],
    ["Notes", client.notes],
  ].filter(([, value]) => value);

  return (
    <Card>
      <div style={{padding:14}}>
        <SectionTitle action={<button onClick={()=>setEditing(true)} style={{background:"#e8f5e9",color:G.dark,border:"none",borderRadius:7,padding:"6px 10px",fontSize:12,fontWeight:900,cursor:"pointer"}}>Edit details</button>}>Relationship</SectionTitle>
        {details.map(([label,value]) => <div key={label} style={{marginBottom:10}}><div style={{fontSize:11,fontWeight:800,color:G.muted}}>{label}</div><div style={{fontSize:13,lineHeight:1.4}}>{value}</div></div>)}
        {!details.length && <div style={{fontSize:13,color:G.muted}}>Add contact and property details so reps have the essentials before creating work.</div>}
      </div>
    </Card>
  );
}

function ClientCreditPanel({ client, G, supabase, setClients, referrals, setReferrals, sendClientPush }) {
  const [credit, setCredit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [editEarned, setEditEarned] = useState("");
  const [editUsed, setEditUsed] = useState("");
  const [editReserved, setEditReserved] = useState("");

  const totalEarned = Number(credit?.total_earned ?? client.referral_credit ?? 0);
  const totalUsed = Number(credit?.total_used || 0);
  const totalReserved = Number(credit?.total_reserved || 0);
  const available = credit ? Math.max(0, totalEarned - totalUsed - totalReserved) : Math.max(0, Number(client.referral_credit || 0));
  const syncClientBalance = (nextAvailable) => {
    setClients(items => items.map(item => item.id === client.id ? { ...item, referral_credit: Math.max(0, Number(nextAvailable) || 0) } : item));
  };

  const loadCredit = async () => {
    setLoading(true);
    let record = null;
    if (client.id) {
      const { data } = await supabase.from("client_credits").select("*").eq("client_id", client.id).limit(1);
      record = data?.[0] || null;
    }
    if (!record && client.name) {
      const { data } = await supabase.from("client_credits").select("*").eq("client_name", client.name).limit(1);
      record = data?.[0] || null;
    }
    setCredit(record);
    setEditEarned(String(Number(record?.total_earned || client.referral_credit || 0).toFixed(2)));
    setEditUsed(String(Number(record?.total_used || 0).toFixed(2)));
    setEditReserved(String(Number(record?.total_reserved || 0).toFixed(2)));
    setLoading(false);
  };

  useEffect(() => {
    loadCredit();
  }, [client.id, client.name]);

  const persistCredit = async ({ totalEarned, totalUsed, totalReserved = 0, reason, notify = false }) => {
    const next = {
      client_id: client.id,
      client_name: client.name,
      total_earned: Math.max(0, Number(totalEarned) || 0),
      total_used: Math.max(0, Number(totalUsed) || 0),
      total_reserved: Math.max(0, Number(totalReserved) || 0),
      updated_at: new Date().toISOString(),
    };
    const payload = credit?.id ? next : { ...next, id: `CC-${Date.now()}` };
    const { error } = credit?.id
      ? await supabase.from("client_credits").update(next).eq("id", credit.id)
      : await supabase.from("client_credits").insert(payload);
    if (error) {
      showToast("Could not save credit: " + error.message, "error");
      return null;
    }
    const saved = { ...(credit || {}), ...payload };
    const nextAvailable = Math.max(0, saved.total_earned - saved.total_used - saved.total_reserved);
    await supabase.from("clients").update({ referral_credit: nextAvailable }).eq("id", client.id);
    setCredit(saved);
    setEditEarned(saved.total_earned.toFixed(2));
    setEditUsed(saved.total_used.toFixed(2));
    setEditReserved(saved.total_reserved.toFixed(2));
    syncClientBalance(nextAvailable);
    if (reason) {
      const ref = { id:`REF-MAN-${Date.now()}`, referrer_name:client.name, client_id:client.id, referred_name:reason, status:"paid", credit_amount:Number(amount)||0, job_value:0, created_at:new Date().toISOString() };
      await supabase.from("referrals").insert(ref);
      setReferrals(rs => [ref, ...rs]);
    }
    if (notify && sendClientPush) {
      sendClientPush(client.name, "Credit added to your account", "Simon has added $" + Number(amount).toFixed(2) + " credit to your account.");
    }
    return saved;
  };

  const addCredit = async () => {
    const add = Number(amount);
    if (!add || add <= 0) {
      showToast("Enter a credit amount greater than $0", "warn");
      return;
    }
    const saved = await persistCredit({
      totalEarned: Number(credit?.total_earned || client.referral_credit || 0) + add,
      totalUsed: Number(credit?.total_used || 0),
      totalReserved: Number(credit?.total_reserved || 0),
      reason: "Manual: " + (note || "credit adjustment"),
      notify: true,
    });
    if (saved) {
      setAmount("");
      setNote("");
      showToast("Credit added", "success");
    }
  };

  const saveEdit = async () => {
    const saved = await persistCredit({ totalEarned: Number(editEarned), totalUsed: Number(editUsed), totalReserved: Number(editReserved) });
    if (saved) showToast("Credit updated", "success");
  };

  const markUsed = async () => {
    const used = Number(prompt("Amount of credit to mark as used:", available.toFixed(2)));
    if (!used || used <= 0) return;
    if (used > available) {
      showToast("Cannot use more than the available credit", "warn");
      return;
    }
    const saved = await persistCredit({ totalEarned, totalUsed: totalUsed + used, totalReserved });
    if (saved) showToast("Credit marked as used", "success");
  };

  const deleteCredit = async () => {
    if (!await showConfirm("Delete all credit for " + client.name + "?", { title:"Delete credit", confirmLabel:"Delete", danger:true })) return;
    if (credit?.id) await supabase.from("client_credits").delete().eq("id", credit.id);
    await supabase.from("clients").update({ referral_credit: 0 }).eq("id", client.id);
    setCredit(null);
    setEditEarned("0.00");
    setEditUsed("0.00");
    setEditReserved("0.00");
    syncClientBalance(0);
    showToast("Credit deleted", "success");
  };

  const inputStyle = {width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box",outline:"none",background:"#fff"};

  return (
    <Card>
      <div style={{padding:14}}>
        <SectionTitle>Client Credit</SectionTitle>
        {loading ? <div style={{padding:16,color:G.muted,fontSize:13}}>Loading credit...</div> : <>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
            <MiniStat label="Available" value={money(available)} tone={available > 0 ? "#2e7d32" : "#66736a"}/>
            <MiniStat label="Reserved" value={money(totalReserved)} tone={totalReserved > 0 ? "#e65100" : "#66736a"}/>
            <MiniStat label="Total earned" value={money(totalEarned)}/>
            <MiniStat label="Total used" value={money(totalUsed)} tone="#1565c0"/>
          </div>
          {available > 0 && <div style={{padding:"10px 12px",background:"#e8f5e9",border:"1px solid #a5d6a7",borderRadius:8,fontSize:13,fontWeight:800,color:"#255d27",marginBottom:12}}>
            This client has {money(available)} available. CSR should mention it before quoting or booking.
          </div>}
          <div style={{border:"1px solid #dfe8dc",borderRadius:8,padding:12,background:"#fbfdf9",marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:800,color:G.muted,textTransform:"uppercase",marginBottom:8}}>Add credit</div>
            <div style={{display:"grid",gridTemplateColumns:"160px 1fr auto",gap:8,alignItems:"end"}}>
              <label style={{fontSize:12,fontWeight:800,color:G.muted}}>Amount<input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" style={{...inputStyle,marginTop:4}}/></label>
              <label style={{fontSize:12,fontWeight:800,color:G.muted}}>Reason<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Referral, goodwill, adjustment..." style={{...inputStyle,marginTop:4}}/></label>
              <button onClick={addCredit} style={{background:G.green,color:"#fff",border:"none",borderRadius:8,padding:"9px 14px",fontSize:13,fontWeight:900,cursor:"pointer"}}>Add</button>
            </div>
          </div>
          <div style={{border:"1px solid #dfe8dc",borderRadius:8,padding:12,background:"#fff"}}>
            <div style={{fontSize:12,fontWeight:800,color:G.muted,textTransform:"uppercase",marginBottom:8}}>Manage balance</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,marginBottom:10}}>
              <label style={{fontSize:12,fontWeight:800,color:G.muted}}>Total earned<input value={editEarned} onChange={e=>setEditEarned(e.target.value)} type="number" min="0" step="0.01" style={{...inputStyle,marginTop:4}}/></label>
              <label style={{fontSize:12,fontWeight:800,color:G.muted}}>Total used<input value={editUsed} onChange={e=>setEditUsed(e.target.value)} type="number" min="0" step="0.01" style={{...inputStyle,marginTop:4}}/></label>
              <label style={{fontSize:12,fontWeight:800,color:G.muted}}>Reserved<input value={editReserved} onChange={e=>setEditReserved(e.target.value)} type="number" min="0" step="0.01" style={{...inputStyle,marginTop:4}}/></label>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button onClick={saveEdit} style={{background:G.green,color:"#fff",border:"none",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:900,cursor:"pointer"}}>Save balance</button>
              <button onClick={markUsed} disabled={available <= 0} style={{background:"#e3f2fd",color:"#1565c0",border:"none",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:800,cursor:"pointer",opacity:available <= 0 ? .55 : 1}}>Mark used</button>
              <button onClick={()=>persistCredit({ totalEarned, totalUsed: totalEarned, totalReserved: 0 })} disabled={totalEarned <= 0} style={{background:"#fff8e1",color:"#e65100",border:"none",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:800,cursor:"pointer",opacity:totalEarned <= 0 ? .55 : 1}}>Unavailable</button>
              <button onClick={()=>persistCredit({ totalEarned, totalUsed: 0, totalReserved: 0 })} disabled={totalEarned <= 0} style={{background:"#e8f5e9",color:"#2e7d32",border:"none",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:800,cursor:"pointer",opacity:totalEarned <= 0 ? .55 : 1}}>Available</button>
              <button onClick={deleteCredit} style={{background:"#fce4ec",color:"#c62828",border:"none",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:800,cursor:"pointer",marginLeft:"auto"}}>Delete credit</button>
            </div>
          </div>
        </>}
      </div>
    </Card>
  );
}

function NotesPanel({ client, notes, setClientNotes, G, supabase }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const note = text.trim();
    if (!note || saving) return;
    setSaving(true);
    const payload = {
      id: `NOTE-${Date.now()}`,
      client_id: client.id,
      client_name: client.name,
      note,
      created_by: "CRM",
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("client_notes").insert(payload);
    setSaving(false);
    if (error) {
      showToast("Could not save note: " + error.message, "error");
      return;
    }
    setClientNotes(items => [payload, ...items]);
    setText("");
    showToast("Note added", "success");
  };
  return (
    <Card>
      <div style={{padding:14}}>
        <SectionTitle>Add Note</SectionTitle>
        <textarea value={text} onChange={event=>setText(event.target.value)} rows={3} placeholder="Add a call note, access instruction, follow-up detail..." style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"10px 12px",fontSize:13,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",outline:"none"}}/>
        <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
          <button onClick={save} disabled={saving || !text.trim()} style={{background:G.green,color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:900,cursor:"pointer",opacity:saving || !text.trim() ? .55 : 1}}>{saving ? "Saving..." : "Add note"}</button>
        </div>
        <div style={{marginTop:12}}>
          <RecordList
            records={notes}
            empty="No internal notes yet."
            render={note => <div key={note.id} style={{border:"1px solid #e3e8e1",borderRadius:8,padding:10,background:"#fff"}}><div style={{fontSize:12,color:G.muted,fontWeight:800,marginBottom:4}}>{shortDate((note.created_at || "").split("T")[0])}</div><div style={{fontSize:13,lineHeight:1.45}}>{note.note}</div></div>}
          />
        </div>
      </div>
    </Card>
  );
}

export default function Clients() {
  const ctx = useAppContext();
  const {
    G, isMobile, clients, setClients, jobs, quotes, invoices, recurringJobs,
    messages, referrals, setReferrals, clientDocuments, setClientDocuments, clientNotes, setClientNotes, supabase,
    clientSearch, setClientSearch, setModal, shareClientPortal,
    setTab, goAI, sendClientPush,
  } = ctx;
  const navigate = useNavigate();
  const { clientId } = useParams();
  const [profileTab, setProfileTab] = useState("overview");

  useEffect(() => {
    setTab("clients");
  }, [setTab]);

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
    const notes = clientNotes.filter(r => recordBelongsToClient(r, selectedClient));
    const clientDocs = clientDocuments.filter(r => recordBelongsToClient(r, selectedClient));
    const paidJobs = clientJobs.filter(j => j.status === "Paid");
    const outstanding = clientInvoices.filter(i => i.status !== "paid").reduce((s,i)=>s + Number(i.total || 0), 0);
    const lastJob = [...paidJobs].sort((a,b)=>String(b.completionDate || b.completion_date || "").localeCompare(String(a.completionDate || a.completion_date || "")))[0];
    const nextJob = [...clientJobs].filter(j => j.status !== "Paid" && (j.completionDate || j.completion_date)).sort((a,b)=>String(a.completionDate || a.completion_date || "").localeCompare(String(b.completionDate || b.completion_date || "")))[0];
    const activity = buildClientActivity(selectedClient, { jobs, quotes, invoices, recurringJobs, messages, documents: clientDocuments, notes: clientNotes });
    return { clientJobs, clientQuotes, clientInvoices, clientRecurring, clientMessages, notes, clientDocs, paidJobs, outstanding, lastJob, nextJob, activity };
  }, [selectedClient, jobs, quotes, invoices, recurringJobs, messages, clientDocuments, clientNotes]);

  const openClient = (client) => {
    setProfileTab("overview");
    setTab("clients");
    navigate("/clients/" + client.id);
  };

  const recordPath = (record) => {
    if (!record?.id || !profileData) return null;
    if (profileData.clientJobs.some(item => item.id === record.id)) return "/jobs/" + record.id;
    if (profileData.clientRecurring.some(item => item.id === record.id)) return "/jobs/recurring/" + record.id;
    if (profileData.clientQuotes.some(item => item.id === record.id)) return "/quotes/" + record.id;
    if (profileData.clientInvoices.some(item => item.id === record.id)) {
      return record.status === "paid" ? "/receipts/" + record.id : "/invoices/" + record.id;
    }
    return null;
  };

  const openRecord = (record) => {
    const path = recordPath(record);
    if (path) navigate(path);
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
        <div style={{fontSize:12,color:G.muted}}>{filteredClients.length} of {clients.length} clients</div>
      </div>
      <div style={{overflow:"auto",padding:10,display:"flex",flexDirection:"column",gap:8}}>
        {filteredClients.slice(0,200).map(client => {
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
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:isMobile?"flex-start":"flex-end"}}>
            <button onClick={()=>goAI(`Build a quote for ${selectedClient.name}${selectedClient.address ? " at " + selectedClient.address : ""}`)} style={{background:G.green,color:"#fff",border:"none",borderRadius:8,padding:"9px 13px",fontSize:13,fontWeight:800,cursor:"pointer"}}>Create quote</button>
            <button onClick={()=>setModal("addJob")} style={{background:"#e3f2fd",color:"#1565c0",border:"none",borderRadius:8,padding:"9px 13px",fontSize:13,fontWeight:800,cursor:"pointer"}}>Create job</button>
            <button onClick={()=>shareClientPortal(selectedClient)} style={{background:"#fff3e0",color:"#e65100",border:"none",borderRadius:8,padding:"9px 13px",fontSize:13,fontWeight:800,cursor:"pointer"}}>Share portal</button>
            <button onClick={()=>deleteClient(selectedClient)} style={{background:"#fce4ec",color:"#c62828",border:"none",borderRadius:8,padding:"9px 13px",fontSize:13,fontWeight:800,cursor:"pointer"}}>Delete client</button>
          </div>
        </div>
        {(selectedClient.referral_credit || 0) > 0 && <div style={{padding:"10px 18px",borderTop:`1px solid ${G.border}`,background:"#e8f5e9",color:"#255d27",fontSize:13,fontWeight:850}}>
          Client has {money(selectedClient.referral_credit)} credit available.
        </div>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",padding:12,borderTop:`1px solid ${G.border}`,background:"#fbfdf9"}}>
          <MiniStat label="Outstanding" value={money(profileData.outstanding)} tone={profileData.outstanding > 0 ? "#c62828" : "#2e7d32"}/>
          <MiniStat label="Credit" value={money(selectedClient.referral_credit)} tone={(selectedClient.referral_credit || 0) > 0 ? "#2e7d32" : "#66736a"}/>
          <MiniStat label="Open quotes" value={profileData.clientQuotes.filter(q=>["pending","sent"].includes((q.status||"").toLowerCase())).length}/>
          <MiniStat label="Upcoming jobs" value={profileData.clientJobs.filter(j=>j.status !== "Paid").length}/>
          <MiniStat label="Last service" value={compactDate(profileData.lastJob?.completionDate || profileData.lastJob?.completion_date)}/>
          <MiniStat label="Lifetime value" value={money(profileData.paidJobs.reduce((s,j)=>s+Number(j.revenue||0),0))}/>
        </div>
      </div>

      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:12}}>
        {["overview","jobs","quotes","invoices","credit","communications","files"].map(tab => (
          <button key={tab} onClick={()=>setProfileTab(tab)} style={{border:`1px solid ${profileTab===tab?G.green:G.border}`,background:profileTab===tab?"#e8f5e9":"#fff",color:profileTab===tab?G.dark:"#4b5549",borderRadius:8,padding:"8px 12px",fontSize:13,fontWeight:800,textTransform:"capitalize",cursor:"pointer",whiteSpace:"nowrap"}}>{tab === "credit" ? "Client credit" : tab}</button>
        ))}
      </div>

      {profileTab === "overview" && (
        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:12}}>
          <RelationshipPanel client={selectedClient} G={G} supabase={supabase} setClients={setClients}/>
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
                render={(record, index)=><ClickableRecordCard key={(record.id||"current")+index} onClick={()=>openRecord(record)} style={{borderRadius:8}}><div style={{padding:10,display:"flex",justifyContent:"space-between",gap:10}}><div><div style={{fontSize:13,fontWeight:800}}>{record.service || record.id}</div><div style={{fontSize:11,color:G.muted}}>{record.status || record.due_date || record.date}</div></div><div style={{fontWeight:900,color:Number(record.total||record.revenue||0)>0?G.dark:G.muted}}>{record.total ? money(record.total) : record.revenue ? money(record.revenue) : ""}</div></div></ClickableRecordCard>}
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
          <div>
            <Card>
              <div style={{padding:14}}>
                <SectionTitle>Activity Timeline</SectionTitle>
                <RecordList
                  records={profileData.activity.slice(0,18)}
                  empty="No activity has been linked to this client yet."
                  render={(item, index)=><div key={index} onClick={()=>openRecord(item.record)} role={recordPath(item.record) ? "button" : undefined} tabIndex={recordPath(item.record) ? 0 : undefined} onKeyDown={event=>{if((event.key==="Enter"||event.key===" ")&&recordPath(item.record)){event.preventDefault();openRecord(item.record);}}} style={{display:"grid",gridTemplateColumns:"112px 80px 1fr auto",gap:10,alignItems:"center",padding:"9px 0",borderBottom:index<profileData.activity.slice(0,18).length-1?`1px solid ${G.border}`:"none",fontSize:13,cursor:recordPath(item.record)?"pointer":"default"}}><div style={{color:G.muted}}>{shortDate(item.date)}</div><div style={{fontSize:11,fontWeight:900,color:G.dark,background:"#e8f5e9",borderRadius:20,padding:"3px 8px",textAlign:"center"}}>{item.type}</div><div style={{fontWeight:700,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div><div style={{fontWeight:900}}>{item.amount ? money(item.amount) : ""}</div></div>}
                />
              </div>
            </Card>
          </div>
        </div>
      )}

      {profileTab === "jobs" && <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div>
          <SectionTitle>Upcoming Jobs</SectionTitle>
          <RecordList records={profileData.clientJobs.filter(j=>j.status !== "Paid")} empty="No upcoming jobs for this client." render={j=><ClickableRecordCard key={j.id} onClick={()=>openRecord(j)}><div style={{padding:14,display:"flex",justifyContent:"space-between",gap:12}}><div><div style={{fontWeight:900}}>{j.service || "Job"}</div><div style={{fontSize:12,color:G.muted}}>{shortDate(j.completionDate || j.completion_date)} - {j.status}</div>{j.notes&&<div style={{fontSize:12,marginTop:6}}>{j.notes}</div>}</div><div style={{fontWeight:900,color:G.dark}}>{money(j.revenue)}</div></div></ClickableRecordCard>} />
        </div>
        <div>
          <SectionTitle>Recurring Jobs</SectionTitle>
          <RecordList records={profileData.clientRecurring} empty="No recurring jobs for this client." render={r=><ClickableRecordCard key={r.id} onClick={()=>openRecord(r)}><div style={{padding:14,display:"flex",justifyContent:"space-between",gap:12}}><div><div style={{fontWeight:900}}>{r.service || "Recurring service"}</div><div style={{fontSize:12,color:G.muted}}>{r.frequency || "recurring"} - next {shortDate(r.next_date)} - {r.active === false ? "Paused" : "Active"}</div>{r.notes&&<div style={{fontSize:12,marginTop:6}}>{r.notes}</div>}</div><div style={{fontWeight:900,color:"#1565c0"}}>{money(r.revenue)}</div></div></ClickableRecordCard>} />
        </div>
        <div>
          <SectionTitle>Completed Jobs</SectionTitle>
          <RecordList records={profileData.clientJobs.filter(j=>j.status === "Paid")} empty="No completed jobs for this client yet." render={j=><ClickableRecordCard key={j.id} onClick={()=>openRecord(j)}><div style={{padding:14,display:"flex",justifyContent:"space-between",gap:12}}><div><div style={{fontWeight:900}}>{j.service || "Job"}</div><div style={{fontSize:12,color:G.muted}}>{shortDate(j.completionDate || j.completion_date)} - {j.status}</div>{j.notes&&<div style={{fontSize:12,marginTop:6}}>{j.notes}</div>}</div><div style={{fontWeight:900,color:G.dark}}>{money(j.revenue)}</div></div></ClickableRecordCard>} />
        </div>
      </div>}
      {profileTab === "quotes" && <RecordList records={profileData.clientQuotes} empty="No quotes for this client yet." render={q=><ClickableRecordCard key={q.id} onClick={()=>openRecord(q)}><div style={{padding:14,display:"flex",justifyContent:"space-between",gap:12}}><div><div style={{fontWeight:900}}>{q.id}</div><div style={{fontSize:12,color:G.muted}}>{shortDate(q.date)} - {q.status}</div></div><div style={{fontWeight:900,color:G.dark}}>{money(q.total)}</div></div></ClickableRecordCard>} />}
      {profileTab === "invoices" && <RecordList records={profileData.clientInvoices} empty="No invoices or receipts for this client yet." render={i=><ClickableRecordCard key={i.id} onClick={()=>openRecord(i)}><div style={{padding:14,display:"flex",justifyContent:"space-between",gap:12}}><div><div style={{fontWeight:900}}>{i.id}</div><div style={{fontSize:12,color:G.muted}}>Due {shortDate(i.due_date)} - {i.status}</div></div><div style={{fontWeight:900,color:i.status==="paid"?"#2e7d32":"#c62828"}}>{money(i.total)}</div></div></ClickableRecordCard>} />}
      {profileTab === "credit" && <ClientCreditPanel client={selectedClient} G={G} supabase={supabase} setClients={setClients} referrals={referrals} setReferrals={setReferrals} sendClientPush={sendClientPush}/>}
      {profileTab === "communications" && <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <NotesPanel client={selectedClient} notes={profileData.notes} setClientNotes={setClientNotes} G={G} supabase={supabase}/>
        <div>
          <SectionTitle>Messages</SectionTitle>
          <RecordList records={profileData.clientMessages} empty="No messages for this client yet." render={m=><Card key={m.id || m.created_at}><div style={{padding:14}}><div style={{fontSize:12,color:G.muted,fontWeight:800}}>{shortDate((m.created_at||"").split("T")[0])} - {m.sender || "message"}</div><div style={{fontSize:13,marginTop:5,lineHeight:1.4}}>{m.text}</div></div></Card>} />
        </div>
      </div>}
      {profileTab === "files" && <Card><div style={{padding:14}}><ClientDocumentsPanel clientName={selectedClient.name} clientDocuments={clientDocuments} setClientDocuments={setClientDocuments} supabase={supabase} G={G}/></div></Card>}

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
