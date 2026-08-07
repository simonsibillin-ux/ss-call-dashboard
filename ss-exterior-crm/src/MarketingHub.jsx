import { useState, useEffect, useRef } from "react";
import { useAppContext } from "../context/AppContext.jsx";
import { showConfirm, showToast } from "./utils/ui.jsx";

const G = { green:"#6DC135", dark:"#4a9020", black:"#1a1a1a", bg:"#f5f5f5", border:"#e0e0e0", muted:"#666", danger:"#c62828", dangerBg:"#fce4ec", warn:"#e65100" };

const TABS = ["overview","meta","google","organic","leads"];
const TAB_LABELS = { overview:"Overview", meta:"Meta Ads", google:"Google Ads", organic:"Organic", leads:"Leads" };
const TAB_ICONS = { overview:"⊹", meta:"◈", google:"◉", organic:"◧", leads:"◫" };

function Card({ children, style = {} }) {
  return (
    <div style={{ background:"#fff", border:`1px solid ${G.border}`, borderRadius:10, padding:"14px 16px", ...style }}>
      {children}
    </div>
  );
}

function CardLabel({ children }) {
  return <div style={{ fontSize:11, fontWeight:700, color:G.muted, textTransform:"uppercase", letterSpacing:.5, marginBottom:10 }}>{children}</div>;
}

function Pill({ color = "green", children }) {
  const colors = {
    green: { bg:"#eaf3de", text:"#3B6D11" },
    amber: { bg:"#faeeda", text:"#633806" },
    red:   { bg:"#fcebeb", text:"#791F1F" },
    gray:  { bg:"#f0f0f0", text:"#555" }
  };
  const c = colors[color] || colors.gray;
  return (
    <span style={{ fontSize:11, padding:"2px 9px", borderRadius:20, background:c.bg, color:c.text, fontWeight:600 }}>
      {children}
    </span>
  );
}

function MetricChip({ label, value, color }) {
  return (
    <div style={{ background:"#f7f7f7", borderRadius:8, padding:"10px 14px" }}>
      <div style={{ fontSize:20, fontWeight:700, color: color || G.black }}>{value}</div>
      <div style={{ fontSize:11, color:G.muted, marginTop:2 }}>{label}</div>
    </div>
  );
}

function ComingSoon({ name }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:300, gap:12 }}>
      <div style={{ fontSize:36 }}>🔜</div>
      <div style={{ fontSize:16, fontWeight:700, color:G.black }}>{name} — coming soon</div>
      <div style={{ fontSize:13, color:G.muted }}>This tab will be built once {name} campaigns are live.</div>
    </div>
  );
}

// ── Claude Chat Panel ──────────────────────────────────────────────────────
function ChatPanel({ activeTab }) {
  const [messages, setMessages] = useState([
    { role:"assistant", text:"Morning Simon. I'm monitoring your Meta Ads. Ask me anything about your campaigns or wait for my next auto-update.", time:"Auto" }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);
    const newMessages = [...messages, { role:"user", text:msg, time:new Date().toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"}) }];
    setMessages(newMessages);

    try {
      const history = newMessages
        .filter(m => m.role === "user" || m.role === "assistant")
        .slice(-10)
        .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));

      const res = await fetch("/api/meta-ads", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ action:"chat", message:msg, history: history.slice(0,-1) })
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role:"assistant",
        text: data.reply || "Sorry, couldn't get a response.",
        time: new Date().toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"})
      }]);
    } catch {
      setMessages(prev => [...prev, { role:"assistant", text:"Connection error. Try again.", time:"" }]);
    }
    setSending(false);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, minHeight:0, background:"#fff", border:`1px solid ${G.border}`, borderRadius:10, overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"10px 14px", borderBottom:`1px solid ${G.border}`, display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <div style={{ width:30, height:30, borderRadius:"50%", background:G.green, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:14, fontWeight:700 }}>C</div>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:G.black }}>Claude</div>
          <div style={{ fontSize:11, color:G.green }}>Monitoring · {TAB_LABELS[activeTab]}</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px", display:"flex", flexDirection:"column", gap:10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:"flex", flexDirection:"column", alignItems: m.role==="user"?"flex-end":"flex-start" }}>
            <div style={{
              maxWidth:"88%", fontSize:12, lineHeight:1.5, padding:"8px 11px", borderRadius:10,
              background: m.role==="user" ? G.green : "#f2f2f2",
              color: m.role==="user" ? "#fff" : G.black,
              borderBottomLeftRadius: m.role==="assistant" ? 3 : 10,
              borderBottomRightRadius: m.role==="user" ? 3 : 10,
            }}>
              {m.text}
            </div>
            {m.time && <div style={{ fontSize:10, color:G.muted, marginTop:2 }}>{m.time}</div>}
          </div>
        ))}
        {sending && (
          <div style={{ alignSelf:"flex-start" }}>
            <div style={{ background:"#f2f2f2", borderRadius:10, padding:"8px 12px", fontSize:12, color:G.muted }}>Thinking…</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding:"10px 12px", borderTop:`1px solid ${G.border}`, display:"flex", gap:8, flexShrink:0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key==="Enter" && send()}
          placeholder="Ask Claude about your ads…"
          style={{ flex:1, border:`1px solid ${G.border}`, borderRadius:8, padding:"7px 10px", fontSize:12, outline:"none", background:"#f9f9f9" }}
        />
        <button onClick={send} disabled={sending} style={{ background:G.green, color:"#fff", border:"none", borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
          Send
        </button>
      </div>
    </div>
  );
}

// ── Recommendations ────────────────────────────────────────────────────────
function RecommendationCard({ rec, onApprove, onDismiss }) {
  const [done, setDone] = useState(false);
  if (done) return null;

  const iconMap = {
    increase_budget: { icon:"↑", color:"#eaf3de", iconColor:"#3B6D11" },
    pause_campaign:  { icon:"⏸", color:"#faeeda", iconColor:"#633806" },
    exclude_demographic: { icon:"✕", color:"#fcebeb", iconColor:"#791F1F" },
    new_creative:    { icon:"✦", color:"#e8f0fe", iconColor:"#1a56cc" },
    other:           { icon:"!", color:"#faeeda", iconColor:"#633806" },
  };
  const s = iconMap[rec.type] || iconMap.other;

  return (
    <div style={{ display:"flex", gap:10, padding:"10px 0", borderBottom:`1px solid ${G.border}` }}>
      <div style={{ width:30, height:30, borderRadius:7, background:s.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:s.iconColor, flexShrink:0 }}>
        {s.icon}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:600, color:G.black }}>{rec.title}</div>
        <div style={{ fontSize:11, color:G.muted, marginTop:2 }}>{rec.detail}</div>
        {rec.impact && <div style={{ fontSize:11, color:G.green, marginTop:2 }}>→ {rec.impact}</div>}
        <div style={{ display:"flex", gap:6, marginTop:7 }}>
          <button onClick={()=>{ onApprove(rec); setDone(true); }} style={{ background:G.green, color:"#fff", border:"none", borderRadius:6, padding:"4px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
            Approve
          </button>
          <button onClick={()=>{ onDismiss(rec); setDone(true); }} style={{ background:"transparent", border:`1px solid ${G.border}`, color:G.muted, borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer" }}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Day Toggle ────────────────────────────────────────────────────────────
const DAY_OPTIONS = [7, 14, 30, 90];

function DayToggle({ days, onChange, isLive }) {
  const [customVal, setCustomVal] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const btnBase = {
    border: `1px solid ${G.border}`, borderRadius: 7, padding: "4px 12px",
    fontSize: 12, cursor: "pointer", background: "transparent", color: G.muted, fontWeight: 400
  };
  const btnActive = { ...btnBase, background: G.green, color: "#fff", border: `1px solid ${G.green}`, fontWeight: 700 };

  const applyCustom = () => {
    const n = parseInt(customVal);
    if (n > 0 && n <= 365) { onChange(n); setShowCustom(false); }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {DAY_OPTIONS.map(d => (
        <button key={d} onClick={() => { onChange(d); setShowCustom(false); }}
          style={days === d && !showCustom ? btnActive : btnBase}>
          {d}d
        </button>
      ))}
      {showCustom ? (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            type="number" value={customVal} onChange={e => setCustomVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && applyCustom()}
            placeholder="days" min={1} max={365}
            style={{ width: 60, border: `1px solid ${G.border}`, borderRadius: 7, padding: "4px 8px", fontSize: 12, outline: "none" }}
            autoFocus
          />
          <button onClick={applyCustom} style={{ ...btnBase, background: G.green, color: "#fff", border: `1px solid ${G.green}` }}>Go</button>
        </div>
      ) : (
        <button onClick={() => setShowCustom(true)}
          style={!DAY_OPTIONS.includes(days) ? btnActive : btnBase}>
          {!DAY_OPTIONS.includes(days) ? `${days}d ✕` : "Custom"}
        </button>
      )}
      {isLive && <span style={{ fontSize: 12, color: G.green, fontWeight: 600 }}>Live data</span>}
    </div>
  );
}

// ── Meta Ads Tab ──────────────────────────────────────────────────────────
function MetaAdsTab({ data, loading, days, onDaysChange, onRefresh }) {
  const [actionMsg, setActionMsg] = useState("");

  const handleApprove = async (rec) => {
    if (rec.type === "increase_budget") {
      const currentBudget = data?.campaigns?.find(c => c.id === rec.campaign_id)?.daily_budget;
      const newBudget = currentBudget ? (parseFloat(currentBudget) + 10).toFixed(2) : null;
      if (!newBudget) { setActionMsg("Couldn't find campaign budget."); return; }
      try {
        const res = await fetch("/api/meta-ads", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ action:"update_budget", campaign_id: rec.campaign_id, new_budget: newBudget })
        });
        const d = await res.json();
        setActionMsg(d.success ? `✓ Budget increased to $${newBudget}/day` : `Error: ${d.error}`);
      } catch (e) { setActionMsg("Error: " + e.message); }
    } else if (rec.type === "pause_campaign") {
      try {
        const res = await fetch("/api/meta-ads", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ action:"pause_campaign", campaign_id: rec.campaign_id })
        });
        const d = await res.json();
        setActionMsg(d.success ? `✓ Campaign paused` : `Error: ${d.error}`);
      } catch (e) { setActionMsg("Error: " + e.message); }
    } else {
      setActionMsg("✓ Noted — action logged. Follow up in Ads Manager.");
    }
  };

  const handleDismiss = (rec) => {
    setActionMsg(`Dismissed: ${rec.title}`);
    setTimeout(() => setActionMsg(""), 3000);
  };

  if (loading) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:300, flexDirection:"column", gap:12 }}>
        <div style={{ width:32, height:32, border:`3px solid ${G.green}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
        <div style={{ fontSize:13, color:G.muted }}>Pulling live data from Meta…</div>
      </div>
    );
  }

  const campaigns = data?.campaigns || [];
  const analysis = data?.analysis || {};
  const totalSpend = campaigns.reduce((s, c) => s + parseFloat(c.insights?.spend || 0), 0);
  const totalLeads = campaigns.reduce((s, c) => s + (c.leads || 0), 0);
  const avgCPL = totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : "—";
  const activeCampaigns = campaigns.filter(c => c.status === "ACTIVE").length;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* Top bar */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
        <DayToggle days={days} onChange={onDaysChange} isLive={!data?.from_cache} />
        <button onClick={onRefresh} style={{ background:"transparent", border:`1px solid ${G.border}`, borderRadius:7, padding:"5px 12px", fontSize:12, cursor:"pointer", color:G.muted }}>
          ↻ Refresh
        </button>
      </div>

      {actionMsg && (
        <div style={{ background:"#eaf3de", border:`1px solid #c0dd97`, borderRadius:8, padding:"8px 12px", fontSize:12, color:"#3B6D11" }}>
          {actionMsg}
        </div>
      )}

      {/* Metrics */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
        <MetricChip label={`Total spend (${days}d)`} value={`$${totalSpend.toFixed(0)}`} />
        <MetricChip label={`Total leads (${days}d)`} value={totalLeads} color={G.green} />
        <MetricChip label="Avg CPL" value={`$${avgCPL}`} color={avgCPL !== "—" && parseFloat(avgCPL) < 20 ? G.green : G.warn} />
        <MetricChip label="Active campaigns" value={activeCampaigns} />
      </div>

      {/* Claude summary */}
      {analysis.summary && (
        <Card style={{ borderLeft:`3px solid ${G.green}` }}>
          <div style={{ fontSize:12, color:G.black, lineHeight:1.6 }}>
            <span style={{ fontWeight:700, color:G.green }}>Claude · </span>{analysis.summary}
          </div>
        </Card>
      )}

      {/* Campaigns */}
      <Card>
        <CardLabel>Campaigns</CardLabel>
        {campaigns.length === 0 && <div style={{ fontSize:13, color:G.muted }}>No campaign data available.</div>}
        {campaigns.map(c => {
          const spend = parseFloat(c.insights?.spend || 0);
          const cpl = c.cpl ? `$${parseFloat(c.cpl).toFixed(2)}` : "—";
          const freq = c.insights?.frequency ? parseFloat(c.insights.frequency).toFixed(2) : "—";
          const pillColor = c.status === "PAUSED" ? "gray" : c.cpl && parseFloat(c.cpl) < 20 ? "green" : c.cpl && parseFloat(c.cpl) < 40 ? "amber" : "red";
          return (
            <div key={c.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid ${G.border}` }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:G.black }}>{c.name}</div>
                <div style={{ fontSize:11, color:G.muted, marginTop:2 }}>
                  ${c.daily_budget || "—"}/day · {c.leads || 0} leads · freq {freq}
                </div>
              </div>
              <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                <div style={{ fontSize:12, color:G.muted }}>CPL <span style={{ fontWeight:700, color:G.black }}>{cpl}</span></div>
                <div style={{ fontSize:12, color:G.muted }}>Spend <span style={{ fontWeight:700, color:G.black }}>${spend.toFixed(0)}</span></div>
                <Pill color={pillColor}>{c.status === "PAUSED" ? "Paused" : c.cpl && parseFloat(c.cpl) < 20 ? "Healthy" : c.cpl && parseFloat(c.cpl) < 40 ? "Watch" : "High CPL"}</Pill>
              </div>
            </div>
          );
        })}
      </Card>

      {/* Recommendations */}
      {(analysis.recommendations || []).length > 0 && (
        <Card>
          <CardLabel>Recommendations — needs your approval</CardLabel>
          {analysis.recommendations.map((rec, i) => (
            <RecommendationCard key={i} rec={rec} onApprove={handleApprove} onDismiss={handleDismiss} />
          ))}
        </Card>
      )}

      {/* Auto-actions */}
      <Card>
        <CardLabel>Auto-actions (no approval needed)</CardLabel>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {[
            "Pause ad if $50+ spend with 0 leads",
            "Flag frequency over 3.0 for creative fatigue",
            "Flag CPL under $8 as budget increase candidate"
          ].map((rule, i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:12 }}>
              <span style={{ color:G.muted }}>{rule}</span>
              <Pill color="green">On</Pill>
            </div>
          ))}
        </div>
        <div style={{ marginTop:12, paddingTop:10, borderTop:`1px solid ${G.border}`, fontSize:11, color:G.muted, textAlign:"center" }}>
          Next auto-scan in 6 hours · Data refreshes every 6h
        </div>
      </Card>
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────────
function OverviewTab({ data }) {
  const campaigns = data?.campaigns || [];
  const totalSpend = campaigns.reduce((s, c) => s + parseFloat(c.insights?.spend || 0), 0);
  const totalLeads = campaigns.reduce((s, c) => s + (c.leads || 0), 0);
  const avgCPL = totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : "—";

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <Card>
        <CardLabel>7-day snapshot — all channels</CardLabel>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
          <MetricChip label="Total ad spend" value={`$${totalSpend.toFixed(0)}`} />
          <MetricChip label="Total leads" value={totalLeads} color={G.green} />
          <MetricChip label="Blended CPL" value={avgCPL !== "—" ? `$${avgCPL}` : "—"} />
        </div>
      </Card>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
        <Card>
          <CardLabel>Meta Ads</CardLabel>
          <div style={{ fontSize:13, color:G.black }}>{campaigns.filter(c=>c.status==="ACTIVE").length} active campaigns</div>
          <div style={{ fontSize:12, color:G.muted, marginTop:4 }}>${totalSpend.toFixed(0)} spend · {totalLeads} leads</div>
          <div style={{ marginTop:8 }}><Pill color="green">Live</Pill></div>
        </Card>
        <Card>
          <CardLabel>Google Ads</CardLabel>
          <div style={{ fontSize:13, color:G.muted }}>Not connected yet</div>
          <div style={{ marginTop:8 }}><Pill color="gray">Coming soon</Pill></div>
        </Card>
        <Card>
          <CardLabel>Organic</CardLabel>
          <div style={{ fontSize:13, color:G.muted }}>Not set up yet</div>
          <div style={{ marginTop:8 }}><Pill color="gray">Coming soon</Pill></div>
        </Card>
      </div>

      {data?.analysis?.summary && (
        <Card style={{ borderLeft:`3px solid ${G.green}` }}>
          <div style={{ fontSize:12, color:G.black, lineHeight:1.6 }}>
            <span style={{ fontWeight:700, color:G.green }}>Claude · </span>{data.analysis.summary}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Leads Tab ─────────────────────────────────────────────────────────────
const AD_SOURCES = ["Meta Ads", "Google Ads", "Organic", "Referral", "Other"];

function EditLeadModal({ lead, onClose, onSave, campaigns, clients }) {
  const [form, setForm] = useState({
    client_name: lead.client_name || "",
    service: lead.service || "",
    notes: lead.notes || "",
    address: lead.address || "",
    ad_source: lead.ad_source || "",
    campaign_name: lead.campaign_name || "",
    campaign_id: lead.campaign_id || "",
  });
  const [saving, setSaving] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [linkedClient, setLinkedClient] = useState(
    lead.client_id ? clients.find(c => c.id === lead.client_id) : null
  );

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Filter campaigns by selected ad source
  const filteredCampaigns = form.ad_source === "Meta Ads"
    ? (campaigns || [])
    : [];

  const matchedClients = linkSearch.length > 1
    ? clients.filter(c =>
        (c.name || "").toLowerCase().includes(linkSearch.toLowerCase()) ||
        (c.phone || "").includes(linkSearch)
      ).slice(0, 8)
    : [];

  const handleSave = async () => {
    setSaving(true);
    await onSave(lead.id, {
      ...form,
      client_id: linkedClient ? linkedClient.id : (lead.client_id || null),
    });
    setSaving(false);
    onClose();
  };

  const inputStyle = {
    width: "100%", border: `1px solid ${G.border}`, borderRadius: 7,
    padding: "7px 10px", fontSize: 13, outline: "none", boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: G.muted, textTransform: "uppercase", marginBottom: 4, display: "block" };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480,
        maxHeight: "90vh", overflow: "auto", padding: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: G.black }}>Edit lead</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: G.muted }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Name */}
          <div>
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} value={form.client_name} onChange={e => set("client_name", e.target.value)} />
          </div>

          {/* Service */}
          <div>
            <label style={labelStyle}>Service</label>
            <input style={inputStyle} value={form.service} onChange={e => set("service", e.target.value)} />
          </div>

          {/* Address */}
          <div>
            <label style={labelStyle}>Address</label>
            <input style={inputStyle} value={form.address} onChange={e => set("address", e.target.value)} />
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>

          {/* Ad source */}
          <div>
            <label style={labelStyle}>Ad source</label>
            <select style={inputStyle} value={form.ad_source} onChange={e => { set("ad_source", e.target.value); set("campaign_name", ""); set("campaign_id", ""); }}>
              <option value="">— None —</option>
              {AD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Campaign — dynamic from Meta if source is Meta Ads, else free text */}
          {form.ad_source && (
            <div>
              <label style={labelStyle}>Campaign</label>
              {form.ad_source === "Meta Ads" && filteredCampaigns.length > 0 ? (
                <select style={inputStyle} value={form.campaign_name}
                  onChange={e => {
                    const c = filteredCampaigns.find(x => x.name === e.target.value);
                    set("campaign_name", e.target.value);
                    set("campaign_id", c ? c.id : "");
                  }}>
                  <option value="">— Select campaign —</option>
                  {filteredCampaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              ) : (
                <input style={inputStyle} placeholder="Campaign name" value={form.campaign_name} onChange={e => set("campaign_name", e.target.value)} />
              )}
            </div>
          )}

          {/* Link to existing client */}
          <div style={{ borderTop: `1px solid ${G.border}`, paddingTop: 12 }}>
            <label style={labelStyle}>Link to existing client</label>
            {linkedClient ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#eaf3de", borderRadius: 8, padding: "8px 12px" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: G.black }}>{linkedClient.name}</div>
                  <div style={{ fontSize: 11, color: G.muted }}>{linkedClient.phone} · {linkedClient.suburb}</div>
                </div>
                <button onClick={() => { setLinkedClient(null); setShowLinkSearch(false); }}
                  style={{ background: "none", border: "none", color: G.muted, cursor: "pointer", fontSize: 13 }}>✕ Unlink</button>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <input
                  style={inputStyle}
                  placeholder="Search clients by name or phone…"
                  value={linkSearch}
                  onChange={e => { setLinkSearch(e.target.value); setShowLinkSearch(true); }}
                  onFocus={() => setShowLinkSearch(true)}
                />
                {showLinkSearch && matchedClients.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, background: "#fff",
                    border: `1px solid ${G.border}`, borderRadius: 8, zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    maxHeight: 200, overflow: "auto",
                  }}>
                    {matchedClients.map(c => (
                      <div key={c.id} onClick={() => { setLinkedClient(c); setLinkSearch(""); setShowLinkSearch(false); }}
                        style={{ padding: "8px 12px", cursor: "pointer", borderBottom: `1px solid ${G.border}`, fontSize: 13 }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}
                      >
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <span style={{ color: G.muted, fontSize: 11, marginLeft: 8 }}>{c.phone} · {c.suburb}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ border: `1px solid ${G.border}`, background: "#fff", borderRadius: 7, padding: "7px 16px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ background: G.green, color: "#fff", border: "none", borderRadius: 7, padding: "7px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LeadsTab({ campaigns, clients }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingLead, setEditingLead] = useState(null);
  const [filterSource, setFilterSource] = useState("all");
  const [sbClient, setSbClient] = useState(null);

  useEffect(() => {
    import("@supabase/supabase-js").then(({ createClient }) => {
      const sb = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );
      setSbClient(sb);
      sb.from("bookings")
        .select("*")
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          setLeads(data || []);
          setLoading(false);
        });
    });
  }, []);

  const handleSave = async (id, updates) => {
    if (!sbClient) return;
    const { error } = await sbClient.from("bookings").update(updates).eq("id", id);
    if (!error) {
      setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
    }
  };

  const handleDelete = async (lead) => {
    if (!sbClient || !await showConfirm(`Delete ${lead.client_name || "this lead"}?`, { title:"Delete lead", confirmLabel:"Delete", danger:true })) return;
    const { error } = await sbClient.from("bookings").delete().eq("id", lead.id);
    if (error) return showToast("Could not delete lead: " + error.message, "error");
    setLeads(prev => prev.filter(item => item.id !== lead.id));
    showToast("Lead deleted", "success");
  };

  const filtered = leads.filter(l => {
    if (filterSource !== "all" && l.ad_source !== filterSource) return false;
    return true;
  });

  // Stats
  const total = leads.length;
  const withAttribution = leads.filter(l => l.ad_source).length;
  const linked = leads.filter(l => l.client_id).length;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: G.muted, fontSize: 13 }}>Loading leads…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        <MetricChip label="Total leads" value={total} color={G.green} />
        <MetricChip label="Ad-attributed" value={withAttribution} />
        <MetricChip label="Linked to client" value={linked} />
      </div>

      <Card>
        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
            style={{ border: `1px solid ${G.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 12, outline: "none", background: "#fff" }}>
            <option value="all">All sources</option>
            {AD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div style={{ marginLeft: "auto", fontSize: 12, color: G.muted, alignSelf: "center" }}>
            {filtered.length} of {total}
          </div>
        </div>

        <CardLabel>All leads</CardLabel>

        {filtered.length === 0 && <div style={{ fontSize: 13, color: G.muted, padding: "20px 0", textAlign: "center" }}>No leads match filters.</div>}

        {filtered.map(lead => {
          const linkedClient = lead.client_id ? clients.find(c => c.id === lead.client_id) : null;
          return (
            <div key={lead.id} style={{
              display: "flex", alignItems: "flex-start", justifyContent: "space-between",
              padding: "10px 0", borderBottom: `1px solid ${G.border}`, gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: G.black }}>{lead.client_name}</div>
                  {linkedClient && (
                    <span style={{ fontSize: 10, background: "#eaf3de", color: "#3B6D11", borderRadius: 20, padding: "1px 7px", fontWeight: 600 }}>
                      ✓ {linkedClient.name}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: G.muted, marginTop: 2 }}>
                  {lead.service}{lead.address ? ` · ${lead.address}` : ""}
                </div>
                <div style={{ fontSize: 11, color: G.muted, marginTop: 1 }}>
                  {lead.created_at ? new Date(lead.created_at).toLocaleDateString("en-AU") : ""}
                  {lead.notes ? ` · ${lead.notes}` : ""}
                </div>
                {/* Attribution tag */}
                {lead.ad_source && (
                  <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, background: "#e8f0fe", color: "#1a56cc", borderRadius: 20, padding: "1px 8px", fontWeight: 600 }}>
                      {lead.ad_source}
                    </span>
                    {lead.campaign_name && (
                      <span style={{ fontSize: 10, background: "#f0f0f0", color: G.muted, borderRadius: 20, padding: "1px 8px", fontWeight: 500 }}>
                        {lead.campaign_name}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                <button onClick={() => setEditingLead(lead)}
                  style={{ fontSize: 11, background: "#fff", border: `1px solid ${G.border}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", color: G.muted, fontWeight: 600 }}>
                  Edit
                </button>
                <button onClick={() => handleDelete(lead)}
                  style={{ fontSize: 11, background: "#fff", border: `1px solid ${G.border}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", color: G.danger, fontWeight: 600 }}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </Card>

      {editingLead && (
        <EditLeadModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onSave={handleSave}
          campaigns={campaigns}
          clients={clients}
        />
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function MarketingHub() {
  const { clients = [] } = useAppContext();
  const [activeTab, setActiveTab] = useState("overview");
  const [metaData, setMetaData] = useState(null);
  const [metaLoading, setMetaLoading] = useState(false);

  const [metaDays, setMetaDays] = useState(7);

  const fetchMetaData = async (force = false, days = metaDays) => {
    setMetaLoading(true);
    try {
      const params = new URLSearchParams();
      if (force) params.set("refresh", "true");
      params.set("days", days);
      const res = await fetch(`/api/meta-ads?${params.toString()}`);
      const data = await res.json();
      setMetaData(data);
    } catch (e) {
      console.error("Meta fetch error:", e);
    }
    setMetaLoading(false);
  };

  useEffect(() => {
    fetchMetaData();
  }, []);

  const totalSpend = (metaData?.campaigns || []).reduce((s, c) => s + parseFloat(c.insights?.spend || 0), 0);
  const totalLeads = (metaData?.campaigns || []).reduce((s, c) => s + (c.leads || 0), 0);

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, minHeight:0, overflow:"hidden", width:"100%" }}>
      {/* Page header */}
      <div style={{ background:"#fff", borderBottom:`1px solid ${G.border}`, padding:"10px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={{ fontWeight:800, fontSize:16, color:G.black }}>Marketing Hub</div>
          {/* Summary chips */}
          {!metaLoading && metaData && (
            <div style={{ display:"flex", gap:10 }}>
              <span style={{ fontSize:12, background:"#f7f7f7", borderRadius:6, padding:"3px 10px", color:G.muted }}>
                <span style={{ color:G.black, fontWeight:700 }}>${totalSpend.toFixed(0)}</span> spend ({metaDays}d)
              </span>
              <span style={{ fontSize:12, background:"#eaf3de", borderRadius:6, padding:"3px 10px", color:"#3B6D11" }}>
                <span style={{ fontWeight:700 }}>{totalLeads}</span> leads
              </span>
            </div>
          )}
        </div>
        {/* Tab nav */}
        <div style={{ display:"flex", gap:4 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              background: activeTab===t ? G.green : "transparent",
              color: activeTab===t ? "#fff" : G.muted,
              border: `1px solid ${activeTab===t ? G.green : G.border}`,
              borderRadius:7, padding:"5px 12px", fontSize:12, fontWeight:activeTab===t?700:400,
              cursor:"pointer"
            }}>
              {TAB_ICONS[t]} {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>
        {/* Left — tab content */}
        <div style={{ flex:1, overflowY:"auto", padding:20 }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

          {activeTab === "overview" && <OverviewTab data={metaData} />}
          {activeTab === "meta" && (
            <MetaAdsTab
              data={metaData}
              loading={metaLoading}
              days={metaDays}
              onDaysChange={(d) => {
                setMetaDays(d);
                setMetaData(null);
                fetchMetaData(false, d);
              }}
              onRefresh={() => fetchMetaData(true, metaDays)}
            />
          )}
          {activeTab === "google" && <ComingSoon name="Google Ads" />}
          {activeTab === "organic" && <ComingSoon name="Organic" />}
          {activeTab === "leads" && <LeadsTab campaigns={metaData?.campaigns || []} clients={clients} />}
        </div>

        {/* Right — Claude chat (always visible) */}
        <div style={{ width:280, flexShrink:0, borderLeft:`1px solid ${G.border}`, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <ChatPanel activeTab={activeTab} />
        </div>
      </div>
    </div>
  );
}
