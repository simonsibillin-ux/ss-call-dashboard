import React, { useState } from "react";
import { useAppContext } from "../context/AppContext.jsx";
import { Modal, Field, BtnRow, showToast, showConfirm } from "../utils/ui.jsx";

export default function Modals() {
  const {
    supabase, G, isMobile,
    clients, setClients,
    jobs, setJobs,
    expenses, setExpenses,
    quotes, setQuotes,
    invoices, setInvoices,
    recurringJobs, setRecurringJobs,
    referrals, setReferrals,
    modal, setModal,
    editItem, setEditItem,
    manageCreditModal, setManageCreditModal,
    recurringModal, setRecurringModal,
    smsModal, setSmsModal,
    sendSMS, sendClientPush, generateClientPortalLink,
    addToCalendar, deleteCalEvent, calEvents, SMS_TEMPLATES,
    calToken, loadCalEvents,
    getClientPhone, linkRecordToClient,
  } = useAppContext();

  const closeModal = () => setModal(null);

  const isCreditLine = (item) => item?.is_credit || String(item?.description || "").toLowerCase().includes("client credit");

  const creditAmountFromItems = (items = []) => items
    .filter(isCreditLine)
    .reduce((sum, item) => sum + Math.abs(Number(item.total || 0)), 0);

  const creditAmountForClient = (items = [], client) => {
    if (!client) return creditAmountFromItems(items);
    return items
      .filter(isCreditLine)
      .filter(item => !item.credit_client_id || item.credit_client_id === client.id)
      .reduce((sum, item) => sum + Math.abs(Number(item.total || 0)), 0);
  };

  const findCreditClient = (clientName, items = []) => {
    const creditClientId = items.find(item => item.credit_client_id)?.credit_client_id;
    if (creditClientId) {
      const byId = clients.find(c => c.id === creditClientId);
      if (byId) return byId;
    }
    return clients.find(c => c.name === clientName) || null;
  };

  const fetchCreditRecord = async (client) => {
    if (!client) return null;
    if (client.id) {
      const { data } = await supabase.from("client_credits").select("*").eq("client_id", client.id).limit(1);
      if (data?.[0]) return data[0];
    }
    const { data } = await supabase.from("client_credits").select("*").eq("client_name", client.name).limit(1);
    return data?.[0] || null;
  };

  const writeCreditTotals = async (client, record, totals) => {
    if (!client) return;
    const payload = {
      client_id: client.id,
      client_name: client.name,
      total_earned: Math.max(0, Number(totals.total_earned) || 0),
      total_used: Math.max(0, Number(totals.total_used) || 0),
      total_reserved: Math.max(0, Number(totals.total_reserved) || 0),
      updated_at: new Date().toISOString(),
    };
    const nextAvailable = Math.max(0, payload.total_earned - payload.total_used - payload.total_reserved);
    if (record?.id) await supabase.from("client_credits").update(payload).eq("id", record.id);
    else await supabase.from("client_credits").insert({ id:`CC-${Date.now()}`, ...payload });
    await supabase.from("clients").update({ referral_credit: nextAvailable }).eq("id", client.id);
    setClients(cs => cs.map(c => c.id === client.id ? { ...c, referral_credit: nextAvailable } : c));
  };

  const updateCreditReservation = async (client, deltaReserved) => {
    if (!client || !deltaReserved) return;
    const record = await fetchCreditRecord(client);
    const available = Number(client.referral_credit || 0);
    const totalEarned = Number(record?.total_earned ?? (available + Math.max(0, deltaReserved)));
    await writeCreditTotals(client, record, {
      total_earned: totalEarned,
      total_used: Number(record?.total_used || 0),
      total_reserved: Math.max(0, Number(record?.total_reserved || 0) + deltaReserved),
    });
  };

  const syncQuoteCreditReservation = async ({ previousClientName, nextClientName, previousItems = [], nextItems = [] }) => {
    const previousClient = findCreditClient(previousClientName, previousItems);
    const nextClient = findCreditClient(nextClientName, nextItems);
    if (previousClient?.id && nextClient?.id && previousClient.id === nextClient.id) {
      const delta = creditAmountForClient(nextItems, nextClient) - creditAmountForClient(previousItems, previousClient);
      await updateCreditReservation(nextClient, delta);
      return;
    }
    await updateCreditReservation(previousClient, -creditAmountForClient(previousItems, previousClient));
    await updateCreditReservation(nextClient, creditAmountForClient(nextItems, nextClient));
  };


  function AddClientModal() {
    const [f, setF] = useState({name:"",phone:"",email:"",address:"",suburb:"",notes:"",status:"active"});
    const upd = k => v => setF(p=>({...p,[k]:v}));
    const save = async () => {
      if (!f.name.trim()) return;
      const nc={id:`C-NEW-${Date.now()}`,source:"new",...f};
      await supabase.from("clients").insert(nc);
      setClients(c=>[nc,...c]); closeModal();
    };
    return <Modal title="Add new client" onClose={closeModal}>
      <Field label="Full name" value={f.name} onChange={upd("name")} required placeholder="e.g. Jane Smith"/>
      <Field label="Phone" value={f.phone} onChange={upd("phone")} placeholder="04XX XXX XXX"/>
      <Field label="Email" value={f.email} onChange={upd("email")} type="email"/>
      <Field label="Street address" value={f.address} onChange={upd("address")}/>
      <Field label="Suburb" value={f.suburb} onChange={upd("suburb")}/>
      <Field label="Notes" value={f.notes} onChange={upd("notes")} placeholder="Service history, preferences..."/>
      <Field label="Status" value={f.status} onChange={upd("status")} options={["active","pending","overdue","inactive"]}/>
      <BtnRow onCancel={closeModal} onSave={save} saveLabel="Save client"/>
    </Modal>;
  }

  function AddJobModal() {
    const [f, setF] = useState({client:"",service:"",description:"",status:"Paid",revenue:"",hours:"",completion_date:new Date().toISOString().split("T")[0],notes:""});
    const upd = k => v => setF(p=>({...p,[k]:v}));
    const save = async () => {
      if (!f.client.trim()||!f.service.trim()) return;
      const nj=linkRecordToClient({id:`J-NEW-${Date.now()}`,client:f.client,service:f.service,description:f.description||"",status:f.status||"Active",revenue:parseFloat(f.revenue)||0,hours:parseFloat(f.hours)||0,completion_date:f.completion_date||null,notes:f.notes||""}, f.client);
      const {error:jobErr} = await supabase.from("jobs").insert(nj);
      if(jobErr){showToast("Error saving job: "+jobErr.message,"error");return;}
      setJobs(j=>[{...nj,completionDate:nj.completion_date||""},...j]);
      sendClientPush(f.client,'🔧 Job Scheduled','Your '+f.service+' job'+(f.completion_date?' on '+f.completion_date:' has been added')+'. We will be in touch shortly.');
      if (f.completion_date) {
        const calC = clients.find(c=>c.name===f.client)||{};
        const calTitle = [f.client, calC.phone||f.phone, calC.address||f.address, f.service, parseFloat(f.revenue)>0?`$${parseFloat(f.revenue).toFixed(0)}`:""].filter(Boolean).join(" | ");
        const calDesc = `Service: ${f.service}\nPrice: $${parseFloat(f.revenue)||0}\nAddress: ${calC.address||""}\nPhone: ${calC.phone||""}\nNotes: ${f.notes||""}`;
        const evId = await addToCalendar(calTitle, f.completion_date, calDesc);
        if (evId) loadCalEvents();
      }
      closeModal();
    };
    return <Modal title="Log a job" onClose={closeModal}>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Client *</div>
        <select value={f.client} onChange={e=>{upd("client")(e.target.value);}} style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",marginBottom:6}}>
          <option value="">— Select client —</option>
          {clients.sort((a,b)=>a.name.localeCompare(b.name)).map(c=><option key={c.id} value={c.name}>{c.name}{c.suburb?" — "+c.suburb:""}</option>)}
        </select>
        <input value={f.client} onChange={e=>upd("client")(e.target.value)} placeholder="Or type a name..." style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
        {(()=>{const cl=clients.find(c=>c.name===f.client);return cl?<div style={{marginTop:6,padding:"8px 10px",background:"#f0f7eb",borderRadius:8,fontSize:12,color:"#2d5a1b",lineHeight:1.7}}>
          {cl.address&&<div>📍 {cl.address}{cl.suburb?", "+cl.suburb:""}</div>}
          {cl.phone&&<div>📱 {cl.phone}</div>}
          {cl.email&&<div>✉️ {cl.email}</div>}
        </div>:null;})()}
      </div>
      <Field label="Service performed" value={f.service} onChange={upd("service")} required placeholder="e.g. Gutter clean + solar panels"/>
      <Field label="Description / notes" value={f.description} onChange={upd("description")}/>
      <div style={{marginBottom:8}}>
        <Field label="Date" value={f.completion_date} onChange={upd("completion_date")} type="date"/>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:G.muted,marginTop:4,cursor:"pointer"}}>
          <input type="checkbox" checked={!f.completion_date} onChange={e=>{if(e.target.checked)upd("completion_date")("");else upd("completion_date")(new Date().toISOString().split("T")[0]);}}/>
          Leave unscheduled (add to calendar later)
        </label>
      </div>
      {/* Line items with multiplier support */}
      {(()=>{
        const MULT_PRESETS = {"Heavy debris":1.5,"Steep pitch":1.4,"Difficult access":1.3,"Hazard":1.3,"Urgency":1.2};
        const lineItems = f.items && f.items.length ? f.items : [{description:f.service||"",qty:"1",rate:String(f.revenue||""),multiplier:"1",multiplierLabel:"",total:parseFloat(f.revenue)||0}];
        if(!f.items) setTimeout(()=>upd("items")(lineItems),0);
        const updateLineItem=(idx2,key,val)=>{
          const next=[...lineItems];
          next[idx2]={...next[idx2],[key]:val};
          const t=(parseFloat(next[idx2].qty)||1)*(parseFloat(next[idx2].rate)||0)*(parseFloat(next[idx2].multiplier)||1);
          next[idx2].total=Math.round(t*100)/100;
          const tot=next.reduce((s,x)=>s+(x.total||0),0);
          upd("items")(next);
          upd("revenue")(Math.round(tot*100)/100);
        };
        return <>
          {lineItems.map((it,idx2)=><div key={idx2} style={{background:G.bg,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${G.border}`}}>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Description</div>
              <input value={it.description} onChange={e=>updateLineItem(idx2,"description",e.target.value)} placeholder="e.g. Gutter clean — single storey" style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"9px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr",gap:8,marginBottom:8}}>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Qty</div>
                <input value={it.qty||"1"} onChange={e=>updateLineItem(idx2,"qty",e.target.value)} type="number" min="0" style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"9px 10px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Rate ($)</div>
                <input value={it.rate||""} onChange={e=>updateLineItem(idx2,"rate",e.target.value)} type="number" min="0" placeholder="0.00" style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"9px 10px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Multiplier</div>
                <select value={it.multiplierLabel||""} onChange={e=>{updateLineItem(idx2,"multiplierLabel",e.target.value);if(MULT_PRESETS[e.target.value])updateLineItem(idx2,"multiplier",MULT_PRESETS[e.target.value]);else updateLineItem(idx2,"multiplier","1");}} style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"9px 8px",fontSize:12,fontFamily:"inherit",background:"#fff",outline:"none",boxSizing:"border-box"}}>
                  <option value="">None ×1.0</option>
                  <option value="Heavy debris">Heavy debris ×1.5</option>
                  <option value="Steep pitch">Steep pitch ×1.4</option>
                  <option value="Difficult access">Difficult access ×1.3</option>
                  <option value="Hazard">Hazard ×1.3</option>
                  <option value="Urgency">Urgency ×1.2</option>
                </select>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:8,borderTop:`1px solid ${G.border}`}}>
              <div style={{fontSize:13,fontWeight:700,color:"#2e7d32"}}>Line total: ${((parseFloat(it.qty)||1)*(parseFloat(it.rate)||0)*(parseFloat(it.multiplier)||1)).toFixed(2)}</div>
              {lineItems.length>1&&<button onClick={()=>{const next2=lineItems.filter((_,n)=>n!==idx2);const tot2=next2.reduce((s,x)=>s+(x.total||0),0);upd("items")(next2);upd("revenue")(Math.round(tot2*100)/100);}} style={{fontSize:12,color:"#c62828",background:"#fce4ec",border:"1px solid #ef9a9a",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:600}}>Remove</button>}
            </div>
          </div>)}
          <button onClick={()=>upd("items")([...lineItems,{description:"",qty:"1",rate:"",multiplier:"1",multiplierLabel:"",total:0}])} style={{width:"100%",border:`1px dashed ${G.green}`,background:"none",borderRadius:7,padding:"7px",fontSize:12,color:G.green,cursor:"pointer",marginBottom:6}}>+ Add line item</button>
          <div style={{display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:14,padding:"6px 0",borderTop:`1px solid ${G.border}`}}>
            <span>Total</span><span style={{color:"#2e7d32"}}>${(parseFloat(f.revenue)||0).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
          </div>
        </>;
      })()}
      <Field label="Hours worked" value={f.hours} onChange={upd("hours")} type="number" placeholder="0"/>
      <Field label="Status" value={f.status} onChange={upd("status")} options={["Paid","Invoiced","Quoted","Active"]}/>
      <Field label="Notes (cash, partial payment, etc.)" value={f.notes} onChange={upd("notes")}/>
      <BtnRow onCancel={closeModal} onSave={save} saveLabel="Save job"/>
    </Modal>;
  }

  function AddExpenseModal() {
    const [f, setF] = useState({date:new Date().toISOString().split("T")[0],category:"Fuel",supplier:"",amount:"",notes:""});
    const upd = k => v => setF(p=>({...p,[k]:v}));
    const save = async () => {
      if (!f.amount) return;
      const ne={...f,amount:parseFloat(f.amount)||0};
      const {data:saved,error:expErr} = await supabase.from("expenses").insert(ne).select().single();
      if(expErr){alert("Error saving expense: "+expErr.message);return;}
      setExpenses(e=>[saved||{...ne,id:`E-${Date.now()}`},...e]);
      closeModal();
    };
    return <Modal title="Log an expense" onClose={closeModal}>
      <Field label="Date" value={f.date} onChange={upd("date")} type="date"/>
      <Field label="Category" value={f.category} onChange={upd("category")} options={["Fuel","Tools","Materials","Admin","Subcontractor","Other"]}/>
      <Field label="Supplier / description" value={f.supplier} onChange={upd("supplier")} placeholder="e.g. United Kilmore"/>
      <Field label="Amount ($)" value={f.amount} onChange={upd("amount")} type="number" required placeholder="0.00"/>
      <Field label="Notes" value={f.notes} onChange={upd("notes")}/>
      <BtnRow onCancel={closeModal} onSave={save} saveLabel="Save expense"/>
    </Modal>;
  }

  function AddQuoteModal() {
    const [client, setClient] = useState("");
    const [notes, setNotes] = useState("");
    const [items, setItems] = useState([{description:"",qty:"1",unit:"",rate:"",total:0}]);
    const [partialCredit, setPartialCredit] = useState("");
    const selectedClient = clients.find(c => c.name === client) || null;
    const availableCredit = Math.max(0, Number(selectedClient?.referral_credit || 0));
    const appliedCredit = creditAmountForClient(items, selectedClient);
    const serviceTotal = items.filter(it => !isCreditLine(it)).reduce((s,it)=>s+(Number(it.total)||0),0);
    const updItem = (i,k,v) => setItems(its=>its.map((it,idx)=>{
      if(idx!==i) return it;
      const u={...it,[k]:v};
      if(k==="qty"||k==="rate"||k==="multiplier") u.total=(parseFloat(k==="qty"?v:u.qty)||1)*(parseFloat(k==="rate"?v:u.rate)||0)*(parseFloat(k==="multiplier"?v:u.multiplier)||1);
      return u;
    }));
    const applyCredit = (amount) => {
      if (!selectedClient) return;
      const safeAmount = Math.min(Math.max(0, Number(amount) || 0), availableCredit, serviceTotal);
      setItems(its => {
        const serviceItems = its.filter(it => !isCreditLine(it));
        if (safeAmount <= 0) return serviceItems;
        return [...serviceItems, {description:`Client credit applied - ${selectedClient.name}`,qty:"1",unit:"credit",rate:String(-safeAmount),total:-safeAmount,is_credit:true,credit_client_id:selectedClient.id}];
      });
    };
    const grandTotal = items.reduce((s,it)=>s+(it.total||0),0);
    const save = async () => {
      if (!client.trim()) return;
      const cleanItems = items.map(it=>({description:it.description,qty:parseFloat(it.qty)||1,unit:it.unit||"",rate:parseFloat(it.rate)||0,total:it.total||0,...(it.is_credit?{is_credit:true,credit_client_id:it.credit_client_id}: {})}));
      const nq=linkRecordToClient({id:`Q-${Date.now()}`,client,date:new Date().toISOString().split("T")[0],total:grandTotal,status:"pending",items:cleanItems,notes}, client);
      await supabase.from("quotes").insert(nq);
      await syncQuoteCreditReservation({ previousClientName:null, nextClientName:client, previousItems:[], nextItems:cleanItems });
      setQuotes(q=>[{...nq,total:grandTotal},...q]); closeModal();
    };
    return <Modal title="New quote" onClose={closeModal}>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Client *</div>
        <select value={client} onChange={e=>setClient(e.target.value)} style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",outline:"none",background:"#fff",marginBottom:6}}>
          <option value="">— Select client —</option>
          {clients.sort((a,b)=>a.name.localeCompare(b.name)).map(c=><option key={c.id} value={c.name}>{c.name}{c.suburb?" — "+c.suburb:""}</option>)}
        </select>
        <input value={client} onChange={e=>setClient(e.target.value)} placeholder="Or type a new name..." style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
        {selectedClient && availableCredit > 0 && <div style={{marginTop:8,padding:"10px 12px",background:"#e8f5e9",border:"1px solid #a5d6a7",borderRadius:8,fontSize:12,color:"#255d27"}}>
          <div style={{fontWeight:800,marginBottom:6}}>{selectedClient.name} has ${availableCredit.toFixed(2)} credit available.</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            <button onClick={()=>applyCredit(availableCredit)} style={{background:G.green,color:"#fff",border:"none",borderRadius:7,padding:"6px 10px",fontSize:12,fontWeight:800,cursor:"pointer"}}>Use all credit</button>
            <input value={partialCredit} onChange={e=>setPartialCredit(e.target.value)} type="number" min="0" max={availableCredit} step="0.01" placeholder="Partial amount" style={{width:130,border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 8px",fontSize:12,fontFamily:"inherit"}}/>
            <button onClick={()=>applyCredit(partialCredit)} style={{background:"#fff",color:"#2e7d32",border:`1px solid ${G.green}`,borderRadius:7,padding:"6px 10px",fontSize:12,fontWeight:800,cursor:"pointer"}}>Apply partial</button>
            {appliedCredit > 0 && <button onClick={()=>applyCredit(0)} style={{background:"#fce4ec",color:"#c62828",border:"none",borderRadius:7,padding:"6px 10px",fontSize:12,fontWeight:800,cursor:"pointer"}}>Remove credit</button>}
          </div>
        </div>}
      </div>
      <div style={{marginBottom:8,fontSize:13,fontWeight:600,color:G.black}}>Line items</div>
      {items.map((it,i)=><div key={i} style={{background:G.bg,borderRadius:8,padding:10,marginBottom:8}}>
        <Field label="Description" value={it.description} onChange={v=>updItem(i,"description",v)} placeholder="e.g. Gutter clean single storey 40m"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,alignItems:"end"}}>
          <Field label="Qty" value={it.qty} onChange={v=>updItem(i,"qty",v)} type="number"/>
          <Field label="Unit" value={it.unit} onChange={v=>updItem(i,"unit",v)} placeholder="m / panes"/>
          <Field label="Rate ($)" value={it.rate} onChange={v=>updItem(i,"rate",v)} type="number"/>
          <div><div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",marginBottom:4}}>Total</div><div style={{padding:"8px 10px",fontSize:14,fontWeight:700,color:G.dark}}>${(it.total||0).toFixed(2)}</div></div>
        </div>
        {items.length>1&&<button onClick={()=>setItems(its=>its.filter((_,idx)=>idx!==i))} style={{fontSize:11,color:"#c62828",background:"none",border:"none",cursor:"pointer",padding:0}}>Remove</button>}
      </div>)}
      <button onClick={()=>setItems(its=>[...its,{description:"",qty:"1",unit:"",rate:"",total:0}])} style={{fontSize:12,color:G.green,background:"none",border:`1px dashed ${G.green}`,borderRadius:7,padding:"6px 14px",cursor:"pointer",width:"100%",marginBottom:12}}>+ Add line item</button>
      <div style={{display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:15,padding:"8px 0",borderTop:`1px solid ${G.border}`,marginBottom:10}}>
        <span>Grand total</span><span style={{color:G.dark}}>${grandTotal.toFixed(2)}</span>
      </div>
      <Field label="Notes" value={notes} onChange={setNotes} placeholder="Valid 30 days, special conditions..."/>
      <BtnRow onCancel={closeModal} onSave={save} saveLabel="Save quote"/>
    </Modal>;
  }

  function EditClientModal({client, onDone}) {
    const [f, setF] = useState({name:client.name||"",phone:client.phone||"",email:client.email||"",address:client.address||"",suburb:client.suburb||"",notes:client.notes||"",status:client.status||"active"});
    const upd = k => v => setF(p=>({...p,[k]:v}));
    const save = async () => {
      await supabase.from("clients").update(f).eq("id",client.id);
      setClients(cl=>cl.map(x=>x.id===client.id?{...x,...f}:x));
      onDone();
    };
    return <Modal title="Edit client" onClose={onDone}>
      <Field label="Full name" value={f.name} onChange={upd("name")} required/>
      <Field label="Phone" value={f.phone} onChange={upd("phone")}/>
      <Field label="Email" value={f.email} onChange={upd("email")} type="email"/>
      <Field label="Street address" value={f.address} onChange={upd("address")}/>
      <Field label="Suburb" value={f.suburb} onChange={upd("suburb")}/>
      <Field label="Notes" value={f.notes} onChange={upd("notes")}/>
      <Field label="Status" value={f.status} onChange={upd("status")} options={["active","pending","overdue","inactive"]}/>
      <BtnRow onCancel={onDone} onSave={save} saveLabel="Save changes"/>
    </Modal>;
  }

  function EditJobModal({job, onDone}) {
    const [f, setF] = useState({client:job.client||"",service:job.service||"",description:job.description||"",status:job.status||"Paid",revenue:job.revenue||"",hours:job.hours||"",completion_date:job.completionDate||job.completion_date||"",notes:job.notes||""});
    const upd = k => v => setF(p=>({...p,[k]:v}));
    const save = async () => {
      const upd2 = linkRecordToClient({client:f.client,service:f.service,description:f.description||"",status:f.status,revenue:parseFloat(f.revenue)||0,hours:parseFloat(f.hours)||0,completion_date:f.completion_date||null,notes:f.notes||""}, f.client);
      const {error:editErr} = await supabase.from("jobs").update(upd2).eq("id",job.id);
      if(editErr){alert("Error saving job: "+editErr.message);return;}
      setJobs(jb=>jb.map(x=>x.id===job.id?{...x,...upd2,completionDate:upd2.completion_date||""}:x));
      // Sync Google Calendar
      if(true) {
        const calC = clients.find(c=>c.name===f.client)||{};
        const calTitle = [f.client,calC.phone,calC.address,f.service,parseFloat(f.revenue)>0?`$${parseFloat(f.revenue).toFixed(0)}`:""].filter(Boolean).join(" | ");
        const oldDate = job.completionDate||job.completion_date;
        // Remove old event if date changed or job unscheduled
        if(oldDate) {
          const oldEvent = calEvents.find(ev=>(ev.summary||"").toLowerCase().includes((f.client||"").toLowerCase())&&(ev.start?.date||(ev.start?.dateTime||"").split("T")[0])===oldDate);
          console.log("[editJob] oldDate:", oldDate, "oldEvent found:", !!oldEvent, "calEvents count:", calEvents.length);
          if(oldEvent) await deleteCalEvent(oldEvent.id);
        }
        // Create new event if scheduled
        if(upd2.completion_date) {
          console.log("[editJob] creating new event for date:", upd2.completion_date);
          const newId = await addToCalendar(calTitle, upd2.completion_date, upd2.notes||"");
          console.log("[editJob] addToCalendar returned:", newId);
          sendClientPush(f.client,'📅 Booking Updated','Your '+f.service+' has been updated to '+upd2.completion_date+'. See you then!');
        }
      }
      onDone();
    };
    return <Modal title="Edit job" onClose={onDone}>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Client *</div>
        <select value={f.client} onChange={e=>upd("client")(e.target.value)} style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",background:"#fff",marginBottom:6}}>
          <option value="">— Select client —</option>
          {clients.sort((a,b)=>a.name.localeCompare(b.name)).map(c=><option key={c.id} value={c.name}>{c.name}{c.suburb?" — "+c.suburb:""}</option>)}
        </select>
        <input value={f.client} onChange={e=>upd("client")(e.target.value)} placeholder="Or type name..." style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
        {(()=>{const cl=clients.find(c=>c.name===f.client);return cl?<div style={{marginTop:6,padding:"8px 10px",background:"#f0f7eb",borderRadius:8,fontSize:12,color:"#2d5a1b",lineHeight:1.7}}>
          {cl.address&&<div>📍 {cl.address}{cl.suburb?", "+cl.suburb:""}</div>}
          {cl.phone&&<div>📱 {cl.phone}</div>}
        </div>:null;})()}
      </div>
      <Field label="Service" value={f.service} onChange={upd("service")} required/>
      <Field label="Description" value={f.description} onChange={upd("description")}/>
      <div style={{marginBottom:8}}>
        <Field label="Date" value={f.completion_date} onChange={upd("completion_date")} type="date"/>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:G.muted,marginTop:4,cursor:"pointer"}}>
          <input type="checkbox" checked={!f.completion_date} onChange={e=>{if(e.target.checked)upd("completion_date")("");else upd("completion_date")(new Date().toISOString().split("T")[0]);}}/>
          Leave unscheduled (add to calendar later)
        </label>
      </div>
      {/* Line items with multiplier support */}
      {(()=>{
        const MULT_PRESETS = {"Heavy debris":1.5,"Steep pitch":1.4,"Difficult access":1.3,"Hazard":1.3,"Urgency":1.2};
        const lineItems = f.items && f.items.length ? f.items : [{description:f.service||"",qty:"1",rate:String(f.revenue||""),multiplier:"1",multiplierLabel:"",total:parseFloat(f.revenue)||0}];
        if(!f.items) setTimeout(()=>upd("items")(lineItems),0);
        const updateLineItem=(idx2,key,val)=>{
          const next=[...lineItems];
          next[idx2]={...next[idx2],[key]:val};
          const t=(parseFloat(next[idx2].qty)||1)*(parseFloat(next[idx2].rate)||0)*(parseFloat(next[idx2].multiplier)||1);
          next[idx2].total=Math.round(t*100)/100;
          const tot=next.reduce((s,x)=>s+(x.total||0),0);
          upd("items")(next);
          upd("revenue")(Math.round(tot*100)/100);
        };
        return <>
          {lineItems.map((it,idx2)=><div key={idx2} style={{background:G.bg,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${G.border}`}}>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Description</div>
              <input value={it.description} onChange={e=>updateLineItem(idx2,"description",e.target.value)} placeholder="e.g. Gutter clean — single storey" style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"9px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr",gap:8,marginBottom:8}}>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Qty</div>
                <input value={it.qty||"1"} onChange={e=>updateLineItem(idx2,"qty",e.target.value)} type="number" min="0" style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"9px 10px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Rate ($)</div>
                <input value={it.rate||""} onChange={e=>updateLineItem(idx2,"rate",e.target.value)} type="number" min="0" placeholder="0.00" style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"9px 10px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Multiplier</div>
                <select value={it.multiplierLabel||""} onChange={e=>{updateLineItem(idx2,"multiplierLabel",e.target.value);if(MULT_PRESETS[e.target.value])updateLineItem(idx2,"multiplier",MULT_PRESETS[e.target.value]);else updateLineItem(idx2,"multiplier","1");}} style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"9px 8px",fontSize:12,fontFamily:"inherit",background:"#fff",outline:"none",boxSizing:"border-box"}}>
                  <option value="">None ×1.0</option>
                  <option value="Heavy debris">Heavy debris ×1.5</option>
                  <option value="Steep pitch">Steep pitch ×1.4</option>
                  <option value="Difficult access">Difficult access ×1.3</option>
                  <option value="Hazard">Hazard ×1.3</option>
                  <option value="Urgency">Urgency ×1.2</option>
                </select>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:8,borderTop:`1px solid ${G.border}`}}>
              <div style={{fontSize:13,fontWeight:700,color:"#2e7d32"}}>Line total: ${((parseFloat(it.qty)||1)*(parseFloat(it.rate)||0)*(parseFloat(it.multiplier)||1)).toFixed(2)}</div>
              {lineItems.length>1&&<button onClick={()=>{const next2=lineItems.filter((_,n)=>n!==idx2);const tot2=next2.reduce((s,x)=>s+(x.total||0),0);upd("items")(next2);upd("revenue")(Math.round(tot2*100)/100);}} style={{fontSize:12,color:"#c62828",background:"#fce4ec",border:"1px solid #ef9a9a",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:600}}>Remove</button>}
            </div>
          </div>)}
          <button onClick={()=>upd("items")([...lineItems,{description:"",qty:"1",rate:"",multiplier:"1",multiplierLabel:"",total:0}])} style={{width:"100%",border:`1px dashed ${G.green}`,background:"none",borderRadius:7,padding:"7px",fontSize:12,color:G.green,cursor:"pointer",marginBottom:6}}>+ Add line item</button>
          <div style={{display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:14,padding:"6px 0",borderTop:`1px solid ${G.border}`}}>
            <span>Total</span><span style={{color:"#2e7d32"}}>${(parseFloat(f.revenue)||0).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
          </div>
        </>;
      })()}
      <Field label="Hours" value={f.hours} onChange={upd("hours")} type="number"/>
      <Field label="Status" value={f.status} onChange={upd("status")} options={["Active","Paid","Invoiced","Quoted"]}/>
      <Field label="Notes" value={f.notes} onChange={upd("notes")}/>
      <BtnRow onCancel={onDone} onSave={save} saveLabel="Save changes"/>
    </Modal>;
  }

  function EditQuoteModal({quote, onDone}) {
    const [client, setClient] = useState(quote.client||"");
    const [notes, setNotes] = useState(quote.notes||"");
    const [status, setStatus] = useState(quote.status||"pending");
    const [items, setItems] = useState((quote.items||[]).map(it=>({...it,qty:String(it.qty||1),rate:String(it.rate||0)})));
    const [partialCredit, setPartialCredit] = useState("");
    const selectedClient = clients.find(c => c.name === client) || null;
    const originalAppliedCredit = creditAmountForClient(quote.items || [], selectedClient);
    const availableCredit = Math.max(0, Number(selectedClient?.referral_credit || 0) + originalAppliedCredit);
    const appliedCredit = creditAmountForClient(items, selectedClient);
    const serviceTotal = items.filter(it => !isCreditLine(it)).reduce((s,it)=>s+(Number(it.total)||0),0);
    const updItem = (i,k,v) => setItems(its=>its.map((it,idx)=>{
      if(idx!==i) return it;
      const u={...it,[k]:v};
      if(k==="qty"||k==="rate"||k==="multiplier") u.total=(parseFloat(k==="qty"?v:u.qty)||1)*(parseFloat(k==="rate"?v:u.rate)||0)*(parseFloat(k==="multiplier"?v:u.multiplier)||1);
      return u;
    }));
    const applyCredit = (amount) => {
      if (!selectedClient) return;
      const safeAmount = Math.min(Math.max(0, Number(amount) || 0), availableCredit, serviceTotal);
      setItems(its => {
        const serviceItems = its.filter(it => !isCreditLine(it));
        if (safeAmount <= 0) return serviceItems;
        return [...serviceItems, {description:`Client credit applied - ${selectedClient.name}`,qty:"1",unit:"credit",rate:String(-safeAmount),total:-safeAmount,is_credit:true,credit_client_id:selectedClient.id}];
      });
    };
    const grandTotal = items.reduce((s,it)=>s+(it.total||0),0);
    const save = async () => {
      const cleanItems = items.map(it=>({description:it.description,qty:parseFloat(it.qty)||1,unit:it.unit||"",rate:parseFloat(it.rate)||0,total:it.total||0,...(it.is_credit?{is_credit:true,credit_client_id:it.credit_client_id}: {})}));
      const upd = linkRecordToClient({client,notes,status,items:cleanItems,total:grandTotal}, client);
      await supabase.from("quotes").update(upd).eq("id",quote.id);
      await syncQuoteCreditReservation({ previousClientName:quote.client, nextClientName:client, previousItems:quote.items || [], nextItems:cleanItems });
      setQuotes(qs=>qs.map(x=>x.id===quote.id?{...x,...upd}:x));
      if(status==="sent") sendClientPush(client,'📋 Quote Updated','Your quote has been updated. Check your portal to review the latest details.');
      if(status==="rejected") sendClientPush(client,'📋 Quote Update','Your quote status has been updated. Contact Simon on 0447 130 743 if you have any questions.');
      onDone();
    };
    return <Modal title="Edit quote" onClose={onDone}>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Client *</div>
        <select value={client} onChange={e=>setClient(e.target.value)} style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",background:"#fff",marginBottom:6}}>
          <option value="">— Select client —</option>
          {clients.sort((a,b)=>a.name.localeCompare(b.name)).map(c=><option key={c.id} value={c.name}>{c.name}{c.suburb?" — "+c.suburb:""}</option>)}
        </select>
        <input value={client} onChange={e=>setClient(e.target.value)} placeholder="Or type name..." style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
        {(()=>{const cl=clients.find(c=>c.name===client);return cl?<div style={{marginTop:6,padding:"8px 10px",background:"#f0f7eb",borderRadius:8,fontSize:12,color:"#2d5a1b",lineHeight:1.7}}>
          {cl.address&&<div>📍 {cl.address}{cl.suburb?", "+cl.suburb:""}</div>}
          {cl.phone&&<div>📱 {cl.phone}</div>}
        </div>:null;})()}
        {selectedClient && availableCredit > 0 && <div style={{marginTop:8,padding:"10px 12px",background:"#e8f5e9",border:"1px solid #a5d6a7",borderRadius:8,fontSize:12,color:"#255d27"}}>
          <div style={{fontWeight:800,marginBottom:6}}>{selectedClient.name} has ${availableCredit.toFixed(2)} credit available.</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            <button onClick={()=>applyCredit(availableCredit)} style={{background:G.green,color:"#fff",border:"none",borderRadius:7,padding:"6px 10px",fontSize:12,fontWeight:800,cursor:"pointer"}}>Use all credit</button>
            <input value={partialCredit} onChange={e=>setPartialCredit(e.target.value)} type="number" min="0" max={availableCredit} step="0.01" placeholder="Partial amount" style={{width:130,border:`1px solid ${G.border}`,borderRadius:7,padding:"6px 8px",fontSize:12,fontFamily:"inherit"}}/>
            <button onClick={()=>applyCredit(partialCredit)} style={{background:"#fff",color:"#2e7d32",border:`1px solid ${G.green}`,borderRadius:7,padding:"6px 10px",fontSize:12,fontWeight:800,cursor:"pointer"}}>Apply partial</button>
            {appliedCredit > 0 && <button onClick={()=>applyCredit(0)} style={{background:"#fce4ec",color:"#c62828",border:"none",borderRadius:7,padding:"6px 10px",fontSize:12,fontWeight:800,cursor:"pointer"}}>Remove credit</button>}
          </div>
        </div>}
      </div>
      <Field label="Status" value={status} onChange={setStatus} options={["pending","approved","sent"]}/>
      {items.map((it,i)=><div key={i} style={{background:G.bg,borderRadius:8,padding:10,marginBottom:8}}>
        <Field label="Description" value={it.description} onChange={v=>updItem(i,"description",v)}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,alignItems:"end"}}>
          <Field label="Qty" value={it.qty} onChange={v=>updItem(i,"qty",v)} type="number"/>
          <Field label="Unit" value={it.unit||""} onChange={v=>updItem(i,"unit",v)}/>
          <Field label="Rate ($)" value={it.rate} onChange={v=>updItem(i,"rate",v)} type="number"/>
          <div><div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",marginBottom:4}}>Total</div><div style={{padding:"8px 10px",fontSize:14,fontWeight:700,color:G.dark}}>${(it.total||0).toFixed(2)}</div></div>
        </div>
        {items.length>1&&<button onClick={()=>setItems(its=>its.filter((_,idx)=>idx!==i))} style={{fontSize:11,color:"#c62828",background:"none",border:"none",cursor:"pointer",padding:0}}>Remove</button>}
      </div>)}
      <button onClick={()=>setItems(its=>[...its,{description:"",qty:"1",unit:"",rate:"",total:0}])} style={{fontSize:12,color:G.green,background:"none",border:`1px dashed ${G.green}`,borderRadius:7,padding:"6px 14px",cursor:"pointer",width:"100%",marginBottom:12}}>+ Add line item</button>
      <div style={{display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:15,padding:"8px 0",borderTop:`1px solid ${G.border}`,marginBottom:10}}>
        <span>Total</span><span style={{color:G.dark}}>${grandTotal.toFixed(2)}</span>
      </div>
      <Field label="Notes" value={notes} onChange={setNotes}/>
      <BtnRow onCancel={onDone} onSave={save} saveLabel="Save changes"/>
    </Modal>;
  }

  function EditExpenseModal({expense, onDone}) {
    const [f, setF] = useState({date:expense.date||"",category:expense.category||"Fuel",supplier:expense.supplier||"",amount:expense.amount||"",notes:expense.notes||""});
    const upd = k => v => setF(p=>({...p,[k]:v}));
    const save = async () => {
      const updated = {...f, amount:parseFloat(f.amount)||0};
      await supabase.from("expenses").update(updated).eq("id",expense.id);
      setExpenses(ex=>ex.map(e=>e.id===expense.id?{...e,...updated}:e));
      onDone();
    };
    const del = async () => {
      if(!await showConfirm("Delete this expense?",{title:"Delete expense",confirmLabel:"Delete",danger:true}))return;
      await supabase.from("expenses").delete().eq("id",expense.id);
      setExpenses(ex=>ex.filter(e=>e.id!==expense.id));
      onDone();
    };
    return <Modal title="Edit expense" onClose={onDone}>
      <Field label="Date" value={f.date} onChange={upd("date")} type="date"/>
      <Field label="Category" value={f.category} onChange={upd("category")} options={["Fuel","Tools","Materials","Admin","Subcontractor","Other"]}/>
      <Field label="Supplier / description" value={f.supplier} onChange={upd("supplier")}/>
      <Field label="Amount ($)" value={f.amount} onChange={upd("amount")} type="number" required/>
      <Field label="Notes" value={f.notes} onChange={upd("notes")}/>
      <div style={{display:"flex",gap:8,justifyContent:"space-between",marginTop:12}}>
        <button onClick={del} style={{padding:"8px 14px",background:"#fce4ec",border:"none",borderRadius:8,color:"#c62828",cursor:"pointer",fontSize:13,fontWeight:600}}>Delete</button>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onDone} style={{padding:"8px 16px",border:`1px solid ${G.border}`,borderRadius:8,background:"#fff",cursor:"pointer",fontSize:13}}>Cancel</button>
          <button onClick={save} style={{padding:"8px 20px",background:G.green,color:"#fff",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:13}}>Save changes</button>
        </div>
      </div>
    </Modal>;
  }

  function EditInvoiceModal({invoice, onDone}) {
    const [f, setF] = useState({client:invoice.client||"",date:invoice.date||"",due_date:invoice.due_date||"",status:invoice.status||"sent",notes:invoice.notes||""});
    const upd = k => v => setF(p=>({...p,[k]:v}));
    const save = async () => {
      const linked = linkRecordToClient(f, f.client);
      await supabase.from("invoices").update(linked).eq("id",invoice.id);
      setInvoices(is=>is.map(x=>x.id===invoice.id?{...x,...linked}:x));
      onDone();
    };
    return <Modal title="Edit invoice" onClose={onDone}>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Client *</div>
        <select value={f.client} onChange={e=>upd("client")(e.target.value)} style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",background:"#fff",marginBottom:6}}>
          <option value="">— Select client —</option>
          {clients.sort((a,b)=>a.name.localeCompare(b.name)).map(c=><option key={c.id} value={c.name}>{c.name}{c.suburb?" — "+c.suburb:""}</option>)}
        </select>
        <input value={f.client} onChange={e=>upd("client")(e.target.value)} placeholder="Or type name..." style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
        {(()=>{const cl=clients.find(c=>c.name===f.client);return cl?<div style={{marginTop:6,padding:"8px 10px",background:"#f0f7eb",borderRadius:8,fontSize:12,color:"#2d5a1b",lineHeight:1.7}}>
          {cl.address&&<div>📍 {cl.address}{cl.suburb?", "+cl.suburb:""}</div>}
          {cl.phone&&<div>📱 {cl.phone}</div>}
        </div>:null;})()}
      </div>
      <Field label="Issue date" value={f.date} onChange={upd("date")} type="date"/>
      <Field label="Due date" value={f.due_date} onChange={upd("due_date")} type="date"/>
      <Field label="Status" value={f.status} onChange={upd("status")} options={["sent","paid","overdue"]}/>
      <Field label="Notes" value={f.notes} onChange={upd("notes")}/>
      <BtnRow onCancel={onDone} onSave={save} saveLabel="Save changes"/>
    </Modal>;
  }

  function SMSModal({onClose, prefill}) {
    const [recipient, setRecipient] = useState(prefill?.recipient||"");
    const [phone, setPhone] = useState(prefill?.phone||"");
    const [template, setTemplate] = useState("custom");
    const [message, setMessage] = useState(prefill?.message||"");
    const [sending, setSending] = useState(false);

    const handleClientSelect = (name) => {
      setRecipient(name);
      const p = getClientPhone(name);
      setPhone(p);
      if (template !== "custom") applyTemplate(template, name);
    };

    const applyTemplate = (tmpl, clientName) => {
      const name = clientName || recipient;
      let msg = "";
      if (tmpl === "quoteFollowUp") msg = SMS_TEMPLATES.quoteFollowUp(name || "there", "TBC");
      else if (tmpl === "invoiceReminder") msg = SMS_TEMPLATES.invoiceReminder(name || "there", "TBC", "the due date", "INV-XXX");
      else if (tmpl === "jobConfirmation") msg = SMS_TEMPLATES.jobConfirmation(name || "there", "your service", "");
      else if (tmpl === "paymentThankYou") msg = SMS_TEMPLATES.paymentThankYou(name || "there", "TBC");
      else if (tmpl === "reviewRequest") msg = SMS_TEMPLATES.reviewRequest(name || "there");
      else msg = "";
      setMessage(msg);
    };

    const handleTemplateChange = (tmpl) => {
      setTemplate(tmpl);
      applyTemplate(tmpl, recipient);
    };

    const handleSend = async () => {
      if (!phone) { alert("Please enter a phone number"); return; }
      if (!message.trim()) { alert("Please enter a message"); return; }
      setSending(true);
      await sendSMS(phone, message);
      setSending(false);
      onClose();
    };

    const charsLeft = 160 - message.length;
    const msgCount = Math.ceil(message.length / 160) || 1;

    return <Modal title="Send SMS" onClose={onClose}>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Client</div>
        <select value={recipient} onChange={e=>handleClientSelect(e.target.value)} style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",background:"#fff",marginBottom:6}}>
          <option value="">— Select client —</option>
          {clients.sort((a,b)=>a.name.localeCompare(b.name)).map(c=><option key={c.id} value={c.name}>{c.name}{c.phone?" — "+c.phone:""}</option>)}
        </select>
        <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Or enter phone number manually" style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
      </div>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Template</div>
        <select value={template} onChange={e=>handleTemplateChange(e.target.value)} style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",background:"#fff"}}>
          <option value="custom">Custom message</option>
          <option value="quoteFollowUp">Quote follow-up</option>
          <option value="invoiceReminder">Invoice reminder</option>
          <option value="jobConfirmation">Job confirmation</option>
          <option value="paymentThankYou">Payment thank you</option>
          <option value="reviewRequest">Review request</option>
        </select>
      </div>
      <div style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5}}>Message</div>
          <div style={{fontSize:11,color:charsLeft<20?"#c62828":G.muted}}>{message.length}/160{msgCount>1?` (${msgCount} SMS)`:""}</div>
        </div>
        <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={5} placeholder="Type your message..." style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
        {message.length>0&&<div style={{fontSize:11,color:G.muted,marginTop:3}}>~${(msgCount*0.05).toFixed(2)} per send via ClickSend</div>}
      </div>
      <BtnRow onCancel={onClose} onSave={handleSend} saveLabel={sending?"Sending…":"Send SMS"} disabled={sending}/>
    </Modal>;
  }

  function AddInvoiceModal() {
    const today = new Date().toISOString().split("T")[0];
    const due = new Date(Date.now()+14*864e5).toISOString().split("T")[0];
    const [client, setClient] = useState("");
    const [date, setDate] = useState(today);
    const [dueDate, setDueDate] = useState(due);
    const [notes, setNotes] = useState("");
    const [status, setStatus] = useState("sent");
    const [items, setItems] = useState([{description:"",qty:"1",unit:"",rate:"",total:0}]);
    const updItem = (i,k,v) => setItems(its=>its.map((it,idx)=>{
      if(idx!==i) return it;
      const u={...it,[k]:v};
      if(k==="qty"||k==="rate"||k==="multiplier") u.total=(parseFloat(k==="qty"?v:u.qty)||1)*(parseFloat(k==="rate"?v:u.rate)||0)*(parseFloat(k==="multiplier"?v:u.multiplier)||1);
      return u;
    }));
    const total = items.reduce((s,it)=>s+(it.total||0),0);
    const save = async () => {
      if (!client.trim()) return;
      const ni=linkRecordToClient({id:`INV-${Date.now()}`,quote_id:"",job_id:"",client,date,due_date:dueDate,items:items.map(it=>({description:it.description,qty:parseFloat(it.qty)||1,unit:it.unit,rate:parseFloat(it.rate)||0,total:it.total||0})),total,status,notes,portal_token:""}, client);
      await supabase.from("invoices").insert(ni);
      setInvoices(is=>[{...ni,total:Number(total)||0},...is]);
      sendClientPush(client,'📬 New Invoice','You have a new invoice for $'+total.toFixed(2)+' from SS Exterior Services. View it in your portal.');
      closeModal();
    };
    return <Modal title="New invoice" onClose={closeModal}>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Client *</div>
        <select value={client} onChange={e=>setClient(e.target.value)} style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",background:"#fff",marginBottom:6}}>
          <option value="">— Select client —</option>
          {clients.sort((a,b)=>a.name.localeCompare(b.name)).map(c=><option key={c.id} value={c.name}>{c.name}{c.suburb?" — "+c.suburb:""}</option>)}
        </select>
        <input value={client} onChange={e=>setClient(e.target.value)} placeholder="Or type name..." style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
        {(()=>{const cl=clients.find(c=>c.name===client);return cl?<div style={{marginTop:6,padding:"8px 10px",background:"#f0f7eb",borderRadius:8,fontSize:12,color:"#2d5a1b",lineHeight:1.7}}>
          {cl.address&&<div>📍 {cl.address}{cl.suburb?", "+cl.suburb:""}</div>}
          {cl.phone&&<div>📱 {cl.phone}</div>}
          {cl.email&&<div>✉️ {cl.email}</div>}
        </div>:null;})()}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <Field label="Issue date" value={date} onChange={setDate} type="date"/>
        <Field label="Due date" value={dueDate} onChange={setDueDate} type="date"/>
      </div>
      {items.map((it,i)=><div key={i} style={{background:G.bg,borderRadius:8,padding:10,marginBottom:8}}>
        <Field label="Description" value={it.description} onChange={v=>updItem(i,"description",v)}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <Field label="Qty" value={it.qty} onChange={v=>updItem(i,"qty",v)} type="number"/>
          <Field label="Rate ($)" value={it.rate} onChange={v=>updItem(i,"rate",v)} type="number"/>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",marginBottom:4}}>Multiplier</div>
            <div style={{display:"flex",gap:4}}>
              <input value={it.multiplier||"1"} onChange={e=>updItem(i,"multiplier",e.target.value)} type="number" step="0.1" min="0.1" style={{width:54,border:`1px solid ${G.border}`,borderRadius:7,padding:"7px 6px",fontSize:13,fontFamily:"inherit"}}/>
              <select onChange={e=>{if(e.target.value){const p={"Heavy debris":1.5,"Steep pitch":1.4,"Difficult access":1.3,"Hazard":1.3,"Urgency":1.2};updItem(i,"multiplier",p[e.target.value]||1);}}} style={{flex:1,border:`1px solid ${G.border}`,borderRadius:7,padding:"7px 4px",fontSize:11,fontFamily:"inherit",background:"#fff"}}>
                <option value="">×1.0</option>
                <option value="Heavy debris">Debris ×1.5</option>
                <option value="Steep pitch">Pitch ×1.4</option>
                <option value="Difficult access">Access ×1.3</option>
                <option value="Hazard">Hazard ×1.3</option>
                <option value="Urgency">Urgent ×1.2</option>
              </select>
            </div>
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
          <div style={{fontSize:12,fontWeight:700,color:"#2e7d32"}}>= ${((parseFloat(it.qty)||1)*(parseFloat(it.rate)||0)*(parseFloat(it.multiplier)||1)).toFixed(2)}</div>
          {items.length>1&&<button onClick={()=>setItems(its=>its.filter((_,idx)=>idx!==i))} style={{fontSize:11,color:"#c62828",background:"none",border:"none",cursor:"pointer"}}>Remove</button>}
        </div>
      </div>)}
      <button onClick={()=>setItems(its=>[...its,{description:"",qty:"1",unit:"",rate:"",total:0}])} style={{fontSize:12,color:G.green,background:"none",border:`1px dashed ${G.green}`,borderRadius:7,padding:"6px 14px",cursor:"pointer",width:"100%",marginBottom:12}}>+ Add line item</button>
      <div style={{display:"flex",justifyContent:"space-between",fontWeight:700,fontSize:15,padding:"8px 0",borderTop:`1px solid ${G.border}`,marginBottom:10}}>
        <span>Total</span><span style={{color:G.dark}}>${total.toFixed(2)}</span>
      </div>
      <Field label="Status" value={status} onChange={setStatus} options={["sent","paid","overdue"]}/>
      <Field label="Notes" value={notes} onChange={setNotes}/>
      <BtnRow onCancel={closeModal} onSave={save} saveLabel="Create invoice"/>
    </Modal>;
  }


  const addDaysToDate = (dateStr, days) => {
    const d = new Date(dateStr + "T12:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  };

  const freqDaysMap = {weekly:7,fortnightly:14,monthly:30,"6weekly":42,bimonthly:61,quarterly:91,"6monthly":182,annually:365,custom:91};

  const createRecurringCalendarSeries = async (rec, startDate, monthsAhead = 12) => {
    if (!startDate || !calToken) return;
    const days = rec.custom_days || parseInt(rec.customDays) || freqDaysMap[rec.frequency] || 91;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() + monthsAhead);
    const calTitle = `${rec.client} | ${rec.service} | $${(rec.revenue||0).toFixed(0)} (Recurring)`;
    let current = startDate;
    const eventIds = [];
    while (new Date(current + "T12:00:00") <= cutoff) {
      const eventId = await addToCalendar(calTitle, current, rec.notes || "Recurring job", null, "#1565c0");
      if (eventId) eventIds.push({date: current, id: eventId});
      current = addDaysToDate(current, days);
    }
    return eventIds;
  };

  // ── RECURRING JOB MODAL ─────────────────────────────────────
  function RecurringJobModal({sourceJob, onClose}) {
    const freqOptions = [
      {value:"weekly", label:"Weekly", days:7},
      {value:"fortnightly", label:"Every 2 weeks", days:14},
      {value:"monthly", label:"Monthly", days:30},
      {value:"6weekly", label:"Every 6 weeks", days:42},
      {value:"bimonthly", label:"Every 2 months", days:61},
      {value:"quarterly", label:"Quarterly (3 months)", days:91},
      {value:"6monthly", label:"Every 6 months", days:182},
      {value:"annually", label:"Annually", days:365},
      {value:"custom", label:"Custom interval…", days:null},
    ];
    const today = new Date().toISOString().split("T")[0];
    const isEditing = sourceJob?.editing;
    const [f, setF] = useState({
      client: sourceJob?.client || "",
      service: sourceJob?.service || "",
      description: sourceJob?.description || "",
      revenue: sourceJob?.revenue || "",
      hours: sourceJob?.hours || "",
      frequency: isEditing ? (sourceJob?.frequency||"quarterly") : "quarterly",
      customDays: isEditing ? (sourceJob?.custom_days||"") : "",
      next_date: isEditing ? (sourceJob?.next_date||today) : today,
      notes: sourceJob?.notes || "",
      active: isEditing ? sourceJob?.active!==false : true,
    });
    const upd = k => v => setF(p=>({...p,[k]:v}));
    const [saving, setSaving] = useState(false);

    const addDays = (dateStr, days) => {
      const d = new Date(dateStr+"T12:00:00");
      d.setDate(d.getDate()+days);
      return d.toISOString().split("T")[0];
    };

    const save = async () => {
      if(!f.client||!f.service){alert("Client and service are required");return;}
      setSaving(true);
      const calTitle = `${f.client} | ${f.service} | $${(parseFloat(f.revenue)||0).toFixed(0)} (Recurring)`;
      if(isEditing) {
        // Update existing
        const customDaysVal = f.frequency==="custom" ? (parseInt(f.customDays)||91) : null;
        const updates = linkRecordToClient({client:f.client,service:f.service,description:f.description,revenue:parseFloat(f.revenue)||0,hours:parseFloat(f.hours)||0,frequency:f.frequency,custom_days:customDaysVal,next_date:f.next_date||null,notes:f.notes,active:f.active}, f.client);
        const {error} = await supabase.from("recurring_jobs").update(updates).eq("id",sourceJob.id);
        if(error){alert("Error saving: "+error.message);setSaving(false);return;}
        setRecurringJobs(rs=>rs.map(x=>x.id===sourceJob.id?{...x,...updates}:x));
        if(f.next_date&&await showConfirm("Recreate all future Google Calendar events from the new date?",{title:"Recreate calendar?",confirmLabel:"Recreate"})) {
          alert("Recreating calendar events — this may take a moment…");
          await createRecurringCalendarSeries({...updates,id:sourceJob.id}, f.next_date, 12);
          await loadCalEvents();
          alert("Recurring job updated and calendar events recreated for the next 12 months.");
        } else {
          alert("Recurring job updated." + (f.next_date ? " Calendar events were not changed." : " (Unscheduled)"));
        }
      } else {
        const customDaysVal = f.frequency==="custom" ? (parseInt(f.customDays)||91) : null;
        const rec = linkRecordToClient({id:`REC-${Date.now()}`,client:f.client,service:f.service,description:f.description,revenue:parseFloat(f.revenue)||0,hours:parseFloat(f.hours)||0,frequency:f.frequency,custom_days:customDaysVal,next_date:f.next_date||null,notes:f.notes,active:true,source_job_id:sourceJob?.editing?null:sourceJob?.id||null,created_at:new Date().toISOString()}, f.client);
        const {error} = await supabase.from("recurring_jobs").insert(rec);
        if(error){alert("Error saving: "+error.message);setSaving(false);return;}
        setRecurringJobs(rs=>[...rs,rec]);
        if(f.next_date) {
          alert("Creating recurring events in Google Calendar — this may take a moment…");
          await createRecurringCalendarSeries(rec, f.next_date, 12);
          await loadCalEvents();
          alert(`Recurring job created! Events added to Google Calendar for the next 12 months.`);
        } else { alert("Recurring job created as unscheduled — set a next date when ready."); }
      }
      setSaving(false);
      onClose();
    };

    return <Modal title={sourceJob?.editing?"Edit recurring job":sourceJob?"Make recurring":"New recurring job"} onClose={onClose}>
      {sourceJob&&!isEditing&&<div style={{background:"#e8f5e9",border:"1px solid #a5d6a7",borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:13}}>
        <div style={{fontWeight:600,marginBottom:2}}>Creating from: {sourceJob.client}</div>
        <div style={{color:"#555"}}>{sourceJob.service} · ${sourceJob.revenue} · Original job stays as paid history</div>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <div style={{gridColumn:"1/-1"}}>
          <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",marginBottom:4}}>Client *</div>
          <select value={f.client} onChange={e=>upd("client")(e.target.value)} style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",background:"#fff"}}>
            <option value="">— Select client —</option>
            {clients.sort((a,b)=>a.name.localeCompare(b.name)).map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div style={{gridColumn:"1/-1"}}><Field label="Service *" value={f.service} onChange={upd("service")}/></div>
        <Field label="Price ($)" value={f.revenue} onChange={upd("revenue")} type="number"/>
        <Field label="Hours" value={f.hours} onChange={upd("hours")} type="number"/>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",marginBottom:4}}>Frequency *</div>
          <select value={f.frequency} onChange={e=>upd("frequency")(e.target.value)} style={{width:"100%",border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",background:"#fff"}}>
            {freqOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <Field label="Next visit date" value={f.next_date} onChange={upd("next_date")} type="date"/>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:G.muted,marginTop:4,cursor:"pointer"}}>
            <input type="checkbox" checked={!f.next_date} onChange={e=>{if(e.target.checked)upd("next_date")("");else upd("next_date")(today);}}/>
            Leave unscheduled
          </label>
        </div>
      </div>
      <Field label="Notes" value={f.notes} onChange={upd("notes")}/>
      <div style={{fontSize:12,color:G.muted,margin:"8px 0 12px"}}>
        📅 A calendar event will be created for the next visit date (if set). Leave unscheduled if the date is TBD. After logging each completed visit, the next date advances automatically.
      </div>
      <BtnRow onCancel={onClose} onSave={save} saveLabel={saving?"Saving…":isEditing?"Save changes":"Create recurring job"} disabled={saving}/>
    </Modal>;
  }

  // ── MANAGE CREDIT MODAL ──────────────────────────────────────
  function ManageCreditModal({onClose}) {
    const [credits, setCredits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(null); // client name
    const [addAmount, setAddAmount] = useState("");
    const [addNote, setAddNote] = useState("");

    useEffect(()=>{
      supabase.from("client_credits").select("*").order("total_earned",{ascending:false})
        .then(({data})=>{ setCredits(data||[]); setLoading(false); });
    },[]);

    const available = (c) => Math.max(0,(c.total_earned||0)-(c.total_used||0));

    const handleAdd = async (clientName) => {
      const amt = parseFloat(addAmount);
      if(!amt||amt<=0){alert("Enter a valid amount");return;}
      const existing = credits.find(c=>c.client_name===clientName);
      if(existing){
        const {error} = await supabase.from("client_credits")
          .update({total_earned:(existing.total_earned||0)+amt, updated_at:new Date().toISOString()})
          .eq("client_name",clientName);
        if(error){alert("Error: "+error.message);return;}
        setCredits(cs=>cs.map(c=>c.client_name===clientName?{...c,total_earned:(c.total_earned||0)+amt}:c));
      } else {
        const newRec = {id:`CC-${Date.now()}`,client_name:clientName,total_earned:amt,total_used:0};
        const {error} = await supabase.from("client_credits").insert(newRec);
        if(error){alert("Error: "+error.message);return;}
        setCredits(cs=>[...cs,newRec]);
      }
      // Log as referral for record keeping
      await supabase.from("referrals").insert({id:`REF-MANUAL-${Date.now()}`,referrer_name:clientName,referred_name:"Manual credit",status:"paid",credit_amount:amt,job_value:0});
      setAdding(null);setAddAmount("");setAddNote("");
      alert(`$${amt.toFixed(2)} credit added to ${clientName}!`);
    };

    const handleEdit = async (c) => {
      const newEarned = parseFloat(prompt(`Edit total earned for ${c.client_name} (current: $${(c.total_earned||0).toFixed(2)}):`, (c.total_earned||0).toFixed(2)));
      if(isNaN(newEarned)||newEarned<0){return;}
      const newUsed = parseFloat(prompt(`Edit total used for ${c.client_name} (current: $${(c.total_used||0).toFixed(2)}):`, (c.total_used||0).toFixed(2)));
      if(isNaN(newUsed)||newUsed<0){return;}
      const {error} = await supabase.from("client_credits").update({total_earned:newEarned,total_used:newUsed,updated_at:new Date().toISOString()}).eq("client_name",c.client_name);
      if(error){alert("Error: "+error.message);return;}
      setCredits(cs=>cs.map(x=>x.client_name===c.client_name?{...x,total_earned:newEarned,total_used:newUsed}:x));
    };

    const handleDelete = async (c) => {
      if(!await showConfirm("Delete all credit for "+c.client_name+"?",{title:"Clear credit",confirmLabel:"Delete",danger:true}))return;
      const {error} = await supabase.from("client_credits").delete().eq("client_name",c.client_name);
      if(error){alert("Error: "+error.message);return;}
      setCredits(cs=>cs.filter(x=>x.client_name!==c.client_name));
    };

    const handleMarkUsed = async (c, amount) => {
      const amt = parseFloat(prompt(`Mark credit as used for ${c.client_name} (available: $${available(c).toFixed(2)}):`, available(c).toFixed(2)));
      if(isNaN(amt)||amt<=0){return;}
      if(amt>available(c)){alert("Cannot use more than available credit");return;}
      const {error} = await supabase.from("client_credits").update({total_used:(c.total_used||0)+amt,updated_at:new Date().toISOString()}).eq("client_name",c.client_name);
      if(error){alert("Error: "+error.message);return;}
      setCredits(cs=>cs.map(x=>x.client_name===c.client_name?{...x,total_used:(x.total_used||0)+amt}:x));
      alert(`$${amt.toFixed(2)} marked as used for ${c.client_name}`);
    };

    return <Modal title="💰 Manage Client Credits" onClose={onClose}>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",marginBottom:8}}>Add credit to a client</div>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <select value={adding||""} onChange={e=>setAdding(e.target.value||null)} style={{flex:1,border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",background:"#fff"}}>
            <option value="">— Select client —</option>
            {clients.sort((a,b)=>a.name.localeCompare(b.name)).map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        {adding&&<div style={{display:"flex",gap:8}}>
          <input value={addAmount} onChange={e=>setAddAmount(e.target.value)} type="number" placeholder="Amount ($)" style={{flex:1,border:`1px solid ${G.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit"}}/>
          <button onClick={()=>handleAdd(adding)} style={{background:G.green,color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>Add</button>
        </div>}
      </div>
      <div style={{borderTop:`1px solid ${G.border}`,paddingTop:12}}>
        <div style={{fontSize:11,fontWeight:600,color:G.muted,textTransform:"uppercase",marginBottom:8}}>All client credits</div>
        {loading&&<div style={{textAlign:"center",color:G.muted,padding:16}}>Loading…</div>}
        {!loading&&credits.length===0&&<div style={{textAlign:"center",color:G.muted,padding:16,fontSize:13}}>No credits yet</div>}
        {credits.map(c=><div key={c.client_name} style={{padding:"10px 0",borderBottom:`1px solid ${G.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:"#e8f5e9",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#2e7d32",flexShrink:0}}>{(c.client_name||"?")[0].toUpperCase()}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:13}}>{c.client_name}</div>
            <div style={{fontSize:11,color:G.muted}}>Earned: ${(c.total_earned||0).toFixed(2)} · Used: ${(c.total_used||0).toFixed(2)}</div>
          </div>
          <div style={{fontWeight:800,fontSize:14,color:available(c)>0?"#2e7d32":"#888",marginRight:4}}>${available(c).toFixed(2)}</div>
          <div style={{display:"flex",gap:4}}>
            {available(c)>0&&<button onClick={()=>handleMarkUsed(c)} title="Mark as used" style={{background:"#e3f2fd",color:"#1565c0",border:"none",borderRadius:6,padding:"5px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>Use</button>}
            <button onClick={()=>handleEdit(c)} title="Edit" style={{background:"#fff8e1",color:"#e65100",border:"none",borderRadius:6,padding:"5px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>Edit</button>
            <button onClick={()=>handleDelete(c)} title="Delete" style={{background:"#fce4ec",color:"#c62828",border:"none",borderRadius:6,padding:"5px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>Del</button>
          </div>
        </div>)}
      </div>
    </Modal>;
  }

  // ── CLIENT DOCUMENTS COMPONENT ─────────────────────────────


  return (
    <>
      {modal==="addClient"   && <AddClientModal />}
      {modal==="addJob"      && <AddJobModal />}
      {modal==="addExpense"  && <AddExpenseModal />}
      {modal==="addQuote"    && <AddQuoteModal />}
      {modal==="addInvoice"  && <AddInvoiceModal />}
      {modal==="editClient"  && editItem && <EditClientModal client={editItem} onDone={()=>{setModal(null);setEditItem(null);}} />}
      {modal==="editJob"     && editItem && <EditJobModal job={editItem} onDone={()=>{setModal(null);setEditItem(null);}} />}
      {modal==="editQuote"   && editItem && <EditQuoteModal quote={editItem} onDone={()=>{setModal(null);setEditItem(null);}} />}
      {modal==="editInvoice" && editItem && <EditInvoiceModal invoice={editItem} onDone={()=>{setModal(null);setEditItem(null);}} />}
      {modal==="editExpense" && editItem && <EditExpenseModal expense={editItem} onDone={()=>{setModal(null);setEditItem(null);}} />}
      {manageCreditModal     && <ManageCreditModal onClose={()=>setManageCreditModal(false)} />}
      {recurringModal!==null && <RecurringJobModal sourceJob={recurringModal||undefined} onClose={()=>setRecurringModal(null)} />}
      {smsModal              && <SMSModal prefill={typeof smsModal==="object"?smsModal:null} onClose={()=>setSmsModal(false)} />}
    </>
  );
}
