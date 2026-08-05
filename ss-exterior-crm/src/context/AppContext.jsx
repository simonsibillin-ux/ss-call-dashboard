import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase, G, LOGO, SYSTEM, PRICE_LIST } from "../utils/constants.js";
import { parseJson, parseAllJson } from "../utils/helpers.js";
import { showToast } from "../utils/ui.jsx";
import { clientIdForName, findClientForRecord, recordBelongsToClient, supportsClientIdsIn, withClientLink } from "../utils/clientLinks.js";

const AppContext = createContext(null);
export const useAppContext = () => useContext(AppContext);

export function AppProvider({ children }) {
const [tab, setTab] = useState("dashboard");
const [clients, setClients] = useState([]);
const [jobs, setJobs] = useState([]);
const [expenses, setExpenses] = useState([]);
const [quotes, setQuotes] = useState([]);
const [invoices, setInvoices] = useState([]);
const [loading, setLoading] = useState(true);
const [calEvents, setCalEvents] = useState([]);
const [calView, setCalView] = useState("month");
const [calDate, setCalDate] = useState(new Date());
const [newEvent, setNewEvent] = useState(null);
const [calToken, setCalTokenState] = useState(() => {
  try { return localStorage.getItem("gcal_access_token") || null; } catch { return null; }
});

const setCalToken = (token) => {
  setCalTokenState(token);
  try {
    if (token) localStorage.setItem("gcal_access_token", token);
    else localStorage.removeItem("gcal_access_token");
  } catch {}
};

const getRefreshToken = () => { try { return localStorage.getItem("gcal_refresh_token") || null; } catch { return null; } };
const setRefreshToken = (t) => { try { if (t) localStorage.setItem("gcal_refresh_token", t); } catch {} };
const getTokenExpiry = () => { try { return parseInt(localStorage.getItem("gcal_token_expiry") || "0"); } catch { return 0; } };
const setTokenExpiry = (exp) => { try { localStorage.setItem("gcal_token_expiry", String(exp)); } catch {} };

const refreshAccessToken = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch("/api/google-refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const data = await res.json();
    if (data.access_token) {
      setCalToken(data.access_token);
      setTokenExpiry(Date.now() + (data.expires_in - 60) * 1000);
      return data.access_token;
    }
    return null;
  } catch { return null; }
};

const getValidToken = async () => {
  const storedToken = (() => { try { return localStorage.getItem("gcal_access_token"); } catch { return null; } })();
  if (storedToken && Date.now() < getTokenExpiry()) return storedToken;
  return await refreshAccessToken();
};
const [calLoading, setCalLoading] = useState(false);
const [search, setSearch] = useState("");
const [expandedId, setExpandedId] = useState(null);
const [moreOpen, setMoreOpen] = useState(false);
const [modal, setModal] = useState(null);
const [editItem, setEditItem] = useState(null);
const [expandedClient, setExpandedClient] = useState(null);
const [expandedJob, setExpandedJob] = useState(null);
const [jobStatusFilter, setJobStatusFilter] = useState("all");
const [quoteStatusFilter, setQuoteStatusFilter] = useState("all");
const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
const [expandedQuote, setExpandedQuote] = useState(null);
const [recurringJobs, setRecurringJobs] = useState([]);
const [messages, setMessages] = useState([]);
const [bookingRequests, setBookingRequests] = useState([]);
const [referrals, setReferrals] = useState([]);
const [unreadMessages, setUnreadMessages] = useState(0);
const [clientDocuments, setClientDocuments] = useState([]);
const [clientNotes, setClientNotes] = useState([]);
const [manageCreditModal, setManageCreditModal] = useState(false);
const [creditClients, setCreditClients] = useState([]);
const [recurringModal, setRecurringModal] = useState(null); // {job} or null for new
const [expandedInvoice, setExpandedInvoice] = useState(null);
const [expandedReceipt, setExpandedReceipt] = useState(null);
// Campaign state
const [campTab, setCampTab] = useState("sms");
const [campMessage, setCampMessage] = useState("");
const [campSubject, setCampSubject] = useState("");
const [campTemplate, setCampTemplate] = useState("Custom");
const [audienceFilter, setAudienceFilter] = useState("all");
const [suburbFilter, setSuburbFilter] = useState("");
const [statusFilter, setStatusFilter] = useState("active");
const [selectedRecipients, setSelectedRecipients] = useState([]);
const [campSending, setCampSending] = useState(false);
const [campResult, setCampResult] = useState(null);
const [brevoKey, setBrevoKey] = useState(typeof localStorage!=="undefined"?localStorage.getItem("brevo_key")||"":"");
const [brevoInput, setBrevoInput] = useState("");
const [campHtmlBody, setCampHtmlBody] = useState("");
const [aiEmailPrompt, setAiEmailPrompt] = useState("");
const [aiEmailGenerating, setAiEmailGenerating] = useState(false);
const [emailViewMode, setEmailViewMode] = useState("preview");
const [campAttachment, setCampAttachment] = useState(null);
const [campHistory, setCampHistory] = useState(()=>{try{return JSON.parse(localStorage.getItem("camp_history")||"[]");}catch{return [];}});
const [showCampHistory, setShowCampHistory] = useState(false);
const [expandedCampHist, setExpandedCampHist] = useState(null);
const [campRecipSearch, setCampRecipSearch] = useState("");
const [clientSearch, setClientSearch] = useState("");
const [jobSearch, setJobSearch] = useState("");
const [smsModal, setSmsModal] = useState(false);
const [autopilotLog, setAutopilotLog] = useState([]);
const [autopilotLogOpen, setAutopilotLogOpen] = useState(false);
const [morningBriefing, setMorningBriefing] = useState(null);
const [briefingDismissed, setBriefingDismissed] = useState(true); // starts hidden, set to false after briefing loads
const [autopilotSettings, setAutopilotSettings] = useState({
  lead_responder: true, review_request: true, invoice_chase: true, morning_briefing: true
});
const [autopilotLoading, setAutopilotLoading] = useState(false);
const [aiMessages, setAiMessages] = useState([{role:"assistant",text:"G'day! I'm your SS Exterior Services AI assistant. I know your full price list, 210+ clients, 63 jobs and your P&L. Ask me to build a quote, add a client, log a job, or draft a follow-up message."}]);
const [aiInput, setAiInput] = useState("");
const [aiLoading, setAiLoading] = useState(false);
const chatBottom = useRef(null);
  const navigateFnRef = useRef(null);

const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

useEffect(() => { chatBottom.current?.scrollIntoView({behavior:"smooth"}); }, [aiMessages]);

// Pull-to-refresh on mobile - requires 2 second hold at top
useEffect(() => {
  const mob = typeof window !== 'undefined' && window.innerWidth <= 768;
  if (!mob) return;
  // Only trigger pull-to-refresh on dashboard tab
  if (tab !== 'dashboard') return;
  let startY = 0;
  let startScrollTop = 0;
  let holdTimer = null;
  let indicator = null;

  const showIndicator = () => {
    indicator = document.createElement('div');
    indicator.innerHTML = '↓ Hold to refresh...';
    indicator.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#6DC135;color:#fff;text-align:center;padding:10px;font-size:14px;font-weight:700;z-index:9999;';
    document.body.appendChild(indicator);
  };

  const hideIndicator = () => {
    if (indicator) { indicator.remove(); indicator = null; }
  };

  const getScrollTop = (e) => {
    // Check the actual scroll container (the touched element or its scrollable parent)
    let el = e.target;
    while (el && el !== document.body) {
      if (el.scrollTop > 0) return el.scrollTop;
      el = el.parentElement;
    }
    return window.scrollY;
  };

  const onTouchStart = (e) => {
    startY = e.touches[0].clientY;
    startScrollTop = getScrollTop(e);
  };

  const onTouchMove = (e) => {
    const dy = e.touches[0].clientY - startY;
    const currentScrollTop = getScrollTop(e);
    // Only trigger if: swiping down AND scroll container is at very top
    if (dy > 80 && currentScrollTop <= 0 && startScrollTop <= 0) {
      if (!holdTimer && !indicator) {
        showIndicator();
        holdTimer = setTimeout(() => {
          if (indicator) indicator.innerHTML = '↓ Release to refresh!';
          holdTimer = setTimeout(() => {
            hideIndicator();
            window.location.reload();
          }, 500);
        }, 2000);
      }
    } else {
      // Cancel if user scrolled down before triggering
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      hideIndicator();
    }
  };

  const onTouchEnd = () => {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    hideIndicator();
  };

  window.addEventListener("touchstart", onTouchStart, {passive:true});
  window.addEventListener("touchmove", onTouchMove, {passive:true});
  window.addEventListener("touchend", onTouchEnd);
  return () => {
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    hideIndicator();
  };
}, [tab]);

useEffect(() => {
  async function loadData() {
    setLoading(true);
    const [cr, jr, er, qr, ir] = await Promise.all([
      supabase.from("clients").select("*").order("id"),
      supabase.from("jobs").select("*").order("completion_date", { ascending: false, nullsFirst: false }),
      supabase.from("expenses").select("*").order("date", { ascending: false }),
      supabase.from("quotes").select("*").order("created_at", { ascending: false }),
      supabase.from("invoices").select("*").order("created_at", { ascending: false }),
    ]);
    if (cr.data) setClients(cr.data);
    if (jr.data) setJobs(jr.data.map(j => ({...j, completionDate:j.completion_date||"", revenue:Number(j.revenue)||0, hours:Number(j.hours)||0})));
  // Load recurring jobs
  const {data:rjData} = await supabase.from("recurring_jobs").select("*").order("next_date",{ascending:true});
  if(rjData) setRecurringJobs(rjData);
  // Load client documents and notes. Notes are optional until the Supabase migration is applied.
  const [{data:docsData}, {data:notesData}] = await Promise.all([
    supabase.from("client_documents").select("*").order("uploaded_at",{ascending:false}),
    supabase.from("client_notes").select("*").order("created_at",{ascending:false}),
  ]);
  if(docsData) setClientDocuments(docsData);
  if(notesData) setClientNotes(notesData);
  // Load messages, bookings, referrals
  const [{data:msgData},{data:bkData},{data:refData}] = await Promise.all([
    supabase.from("messages").select("*").order("created_at",{ascending:false}).limit(200),
    supabase.from("bookings").select("*").order("created_at",{ascending:false}).limit(100),
    supabase.from("referrals").select("*").order("created_at",{ascending:false}),
  ]);
  if(msgData){setMessages(msgData);setUnreadMessages(msgData.filter(m=>m.sender==="client"&&!m.read).length);}
  if(bkData) setBookingRequests(bkData);
  if(refData) setReferrals(refData);
    if (er.data) setExpenses(er.data.map(e => ({...e, amount:Number(e.amount)||0})));
    if (qr.data) setQuotes(qr.data.map(q => ({...q, total:Number(q.total)||0})));
    if (ir.data) setInvoices(ir.data.map(i => ({...i, total:Number(i.total)||0})));

// Load autopilot settings from Supabase
const { data: apSettings } = await supabase.from("autopilot_settings").select("*");
if (apSettings?.length) {
  const settingsMap = { lead_responder: true, review_request: true, invoice_chase: true, morning_briefing: true };
  apSettings.forEach(s => { settingsMap[s.id] = s.enabled !== false; });
  setAutopilotSettings(settingsMap);
}

setLoading(false);
  // Generate morning briefing from loaded data
  try {
    const today = new Date().toISOString().split("T")[0];
    const dismissedDate = localStorage.getItem("briefing_dismissed_date");
    // Always regenerate if not dismissed today — ensures it shows on first load
    const since = new Date(Date.now() - 12*60*60*1000).toISOString();
    const { data: overnightLeads } = await supabase.from("bookings").select("client_name,status").gte("created_at", since);
    const { data: pendingBookings } = await supabase.from("bookings").select("id").eq("status","pending");
    const todayJobs = (jr.data||[]).filter(j=>(j.completion_date||j.completionDate||"").startsWith(today));
    const overdueInvs = (ir.data||[]).filter(i=>i.status!=="paid"&&i.due_date&&i.due_date<today);
    const pendingQts = (qr.data||[]).filter(q=>q.status==="pending");
    const lines = [];
    if(todayJobs.length) lines.push("📅 "+todayJobs.length+" job"+(todayJobs.length>1?"s":"")+" today: "+todayJobs.map(j=>j.client).join(", "));
    else lines.push("📅 No jobs scheduled today");
    if(overdueInvs.length){const tot=overdueInvs.reduce((s,i)=>s+(i.total||0),0);lines.push("⚠️ "+overdueInvs.length+" overdue invoice"+(overdueInvs.length>1?"s":"")+" — $"+tot.toLocaleString("en-AU",{maximumFractionDigits:0})+" outstanding");}
    const newLeads = (overnightLeads||[]).filter(l=>l.status==="pending");
    if(newLeads.length) lines.push("🆕 "+newLeads.length+" new lead"+(newLeads.length>1?"s":"")+" overnight: "+newLeads.map(l=>l.client_name).join(", "));
    if(pendingQts.length) lines.push("📋 "+pendingQts.length+" quote"+(pendingQts.length>1?"s":"")+" pending approval");
    if(pendingBookings?.length) lines.push("📬 "+pendingBookings.length+" booking request"+(pendingBookings.length>1?"s":"")+" in inbox");
    setMorningBriefing(lines);
    localStorage.setItem("briefing_date", today);
    // Show banner only if not dismissed today
    if(dismissedDate !== today) {
      setBriefingDismissed(false);
    } else {
      setBriefingDismissed(true);
    }
  } catch(briefErr) { console.error("Morning briefing error:", briefErr); }
  }
  loadData();
}, []);

// Auto-reload Google Calendar events on mount if credentials saved
useEffect(() => {
  const saved = localStorage.getItem("gcal_access_token");
  const refresh = localStorage.getItem("gcal_refresh_token");
  if (saved || refresh) {
    getValidToken().then(token => {
      if (token) loadCalEvents(token, new Date());
    });
  }
}, []);

const goAI = (prompt="") => { setAiInput(prompt); setTab("ai"); if(navigateFnRef.current) navigateFnRef.current("/ai"); };

const getClientEmail = (clientName) => {
  const c = findClientForRecord({ client: clientName }, clients);
  return c?.email || "";
};

const openOutlookEmail = (to, subject, body) => {
  const outlookUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(outlookUrl, "_blank");
};

const sendSMS = async (to, message) => {
  if (!to) { alert("No phone number found for this client. Please add one in their client profile."); return false; }
  try {
    const res = await fetch("/api/send-sms", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({to, message})
    });
    const data = await res.json();
    if (data.success) {
      alert("SMS sent successfully!");
      return true;
    } else {
      alert("SMS failed: " + (data.error || "Unknown error"));
      return false;
    }
  } catch(e) {
    alert("SMS error: " + e.message);
    return false;
  }
};

const getClientPhone = (clientName) => {
  const c = findClientForRecord({ client: clientName }, clients);
  return c?.phone || "";
};

const generatePortalLink = async (table, id, label) => {
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await supabase.from(table).update({ portal_token: token }).eq("id", id);
  const url = window.location.origin + "/portal.html?t=" + token;
  try { await navigator.clipboard.writeText(url); } catch(e) {}
  alert("Portal link copied!\n\n" + url + "\n\nSend this to your client to view their " + (label||"document") + ".");
  return url;
};

// ── Autopilot helpers ─────────────────────────────────
const isAutopilotOn = async (id) => {
  const { data } = await supabase.from("autopilot_settings").select("enabled").eq("id", id).single();
  return data?.enabled !== false;
};

const logAutopilotAction = async ({ automation, client_name, action, status = "success", meta = {} }) => {
  await supabase.from("autopilot_log").insert({
    automation, client_name, action, status, meta,
    created_at: new Date().toISOString()
  });
};


const generateMorningBriefing = (jobs, invoices, quotes, bookings) => {
  const today = new Date().toISOString().split("T")[0];
  const lastShown = localStorage.getItem("briefing_date");
  if (lastShown === today) return; // already shown today
  if (!await_disabled) {} // just a marker

  const todayJobs = jobs.filter(j => (j.completion_date || j.completionDate || "") === today);
  const overdueInvoices = invoices.filter(i => i.status !== "paid" && i.due_date && i.due_date < today);
  const pendingQuotes = quotes.filter(q => q.status === "pending");
  const pendingBookings = bookings ? bookings.filter(b => b.status === "pending") : [];

  const lines = [];
  if (todayJobs.length) lines.push(`📅 ${todayJobs.length} job${todayJobs.length > 1 ? "s" : ""} today: ${todayJobs.map(j => j.client).join(", ")}`);
  else lines.push("📅 No jobs scheduled today");
  if (overdueInvoices.length) {
    const total = overdueInvoices.reduce((s, i) => s + (i.total || 0), 0);
    lines.push(`⚠️ ${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? "s" : ""} — $${total.toLocaleString("en-AU", {maximumFractionDigits:0})} outstanding`);
  }
  if (pendingQuotes.length) lines.push(`📋 ${pendingQuotes.length} quote${pendingQuotes.length > 1 ? "s" : ""} pending approval`);
  if (pendingBookings.length) lines.push(`📬 ${pendingBookings.length} booking request${pendingBookings.length > 1 ? "s" : ""} in inbox`);

  setMorningBriefing(lines);
  localStorage.setItem("briefing_date", today);
};

const sendReviewSms = async (clientName) => {
  try {
    if (!await isAutopilotOn("review_request")) return;
    const cl = findClientForRecord({ client: clientName }, clients);
    if (!cl?.phone) {
      await logAutopilotAction({ automation:"review_request", client_name:clientName, action:"Review request skipped — no phone", status:"skipped" });
      return;
    }
    const fn = clientName.trim().split(" ")[0];
    const msg = `Hi ${fn}, thanks so much for having me out today! If you are happy with the work I would really appreciate a quick Google review — it means the world to a small local business. https://ss-exterior-crm.vercel.app/review Thanks, Simon.`;
    const res = await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: cl.phone, message: msg })
    });
    const data = await res.json();
    const st = data.success ? "success" : "failed";
    await logAutopilotAction({ automation:"review_request", client_name:clientName, action:`Review request SMS sent to ${cl.phone}`, status:st, meta:{ phone: cl.phone } });
  } catch(e) {
    console.error("sendReviewSms error:", e);
    await logAutopilotAction({ automation:"review_request", client_name:clientName, action:`Review request error: ${e.message}`, status:"failed" });
  }
};
// ── End autopilot helpers ──────────────────────────────

const sendClientPush = async (clientName, title, body) => {
  try {
    const cl = findClientForRecord({ client: clientName }, clients);
    if(!cl?.push_subscription) { console.log("No push subscription for:", clientName); return; }
    if(!cl?.portal_token) { console.log("No portal token for:", clientName); return; }
    const res = await fetch("/api/push-notify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscription:cl.push_subscription,title,body,data:{url:window.location.origin+"/portal.html?t="+cl.portal_token}})});
    const data = await res.json();
    if(!res.ok) console.error("Push API error:", data);
    else console.log("Push sent to", clientName, ":", title);
  } catch(e){ console.error("Push failed:",e.message); }
};

const generateClientPortalLink = async (client) => {
  // Reuse existing token if already set — never overwrite a working link
  let token = client.portal_token;
  if (!token) {
    token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    await supabase.from("clients").update({ portal_token: token }).eq("id", client.id);
    setClients(cs => cs.map(c => c.id === client.id ? {...c, portal_token: token} : c));
  }
  const url = window.location.origin + "/portal.html?t=" + token;
  try { await navigator.clipboard.writeText(url); } catch(e) {}
  return url;
};

const shareClientPortal = async (client) => {
  const url = await generateClientPortalLink(client);
  const phone = client.phone;
  const msg = "Hi " + client.name.split(" ")[0] + ", here is your SS Exterior Services client portal where you can view your quotes, invoices, receipts and request new services: " + url + " - Simon";
  setSmsModal({phone, message: msg, recipient: client.name});
};

const SMS_TEMPLATES = {
  quoteFollowUp: (client, amount) => `Hi ${(client||"").split(" ")[0]}, just following up on your quote from SS Exterior Services for ${amount}. Happy to answer any questions! Reply or call 0447 130 743. Simon`,
  invoiceReminder: (client, amount, dueDate, invId) => `Hi ${(client||"").split(" ")[0]}, friendly reminder that invoice ${invId} for ${amount} is due ${dueDate}. BSB: 063-698, Acc: 10348025, Ref: ${invId}. Simon`,
  jobConfirmation: (client, service) => `Hi ${(client||"").split(" ")[0]}, confirming your ${(service||"").split(/[-+()@]/)[0].trim()} booking! We'll see you then! Questions? Call 0447 130 743. Simon`,
  paymentThankYou: (client, amount) => `Hi ${(client||"").split(" ")[0]}, thank you for your payment of ${amount}! Great doing business with you. We'd love a review — search SS Exterior Services on Google or Facebook! Simon`,
  reviewRequest: (client) => `Hi ${(client||"").split(" ")[0]}, hope you're happy with our work! We'd love a Google review — just search SS Exterior Services on Google or Facebook. Thanks! Simon`,
  custom: () => ""
};

const signInGoogle = () => {
  const popup = window.open("/api/google-auth", "google-auth", "width=500,height=600,scrollbars=yes");
  const handler = (e) => {
    if (e.data?.type === "google_tokens") {
      window.removeEventListener("message", handler);
      const { access_token, refresh_token, expires_in } = e.data;
      setCalToken(access_token);
      if (refresh_token) setRefreshToken(refresh_token);
      setTokenExpiry(Date.now() + (expires_in - 60) * 1000);
      loadCalEvents(access_token);
    } else if (e.data?.type === "google_error") {
      window.removeEventListener("message", handler);
      alert("Google sign-in failed: " + e.data.error);
    }
  };
  window.addEventListener("message", handler);
};

const loadCalEvents = async (token, around) => {
  setCalLoading(true);
  try {
    let t = token || await getValidToken();
    if (!t) { setCalLoading(false); return; }
    const base = around || new Date();
    const start = new Date(base.getFullYear(), base.getMonth()-1, 1).toISOString();
    const end = new Date(base.getFullYear(), base.getMonth()+2, 1).toISOString();
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime&maxResults=200`,{headers:{Authorization:`Bearer ${t}`}});
    const data = await res.json();
    if (data.error?.code === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        const res2 = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime&maxResults=200`,{headers:{Authorization:`Bearer ${newToken}`}});
        const data2 = await res2.json();
        const normalEvents2 = data2.items||[];
        try {
          const unschRes2 = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=2099-01-01T00:00:00Z&timeMax=2099-01-03T00:00:00Z&singleEvents=true&maxResults=100`,{headers:{Authorization:`Bearer ${newToken}`}});
          const unschData2 = await unschRes2.json();
          setCalEvents([...normalEvents2, ...(unschData2.items||[])]);
        } catch {
          setCalEvents(normalEvents2);
        }
      } else {
        setCalToken(null);
        setCalEvents([]);
      }
    } else {
      const normalEvents = data.items||[];
      // Also fetch unscheduled events (stored at 2099-01-01) so they survive refresh
      try {
        const unschStart = "2099-01-01T00:00:00Z";
        const unschEnd = "2099-01-03T00:00:00Z";
        const unschRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${unschStart}&timeMax=${unschEnd}&singleEvents=true&maxResults=100`,{headers:{Authorization:`Bearer ${t}`}});
        const unschData = await unschRes.json();
        const unschEvents = unschData.items||[];
        console.log("[loadCalEvents] normal:", normalEvents.length, "unsch:", unschEvents.length);
        setCalEvents([...normalEvents, ...unschEvents]);
      } catch(e) {
        console.log("[loadCalEvents] 2099 fetch error:", e.message);
        setCalEvents(normalEvents);
      }
    }
  } catch(e) { console.error(e); }
  setCalLoading(false);
};

const addToCalendar = async (title, date, description, endDate, color) => {
  const storedToken = (() => { try { return localStorage.getItem("gcal_access_token"); } catch { return null; } })();
  const tokenExpiry = (() => { try { return parseInt(localStorage.getItem("gcal_token_expiry") || "0"); } catch { return 0; } })();
  const t = storedToken && Date.now() < tokenExpiry ? storedToken : await (async () => {
    const refresh = (() => { try { return localStorage.getItem("gcal_refresh_token"); } catch { return null; } })();
    if (!refresh) return null;
    try {
      const r = await fetch("/api/google-refresh", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({refresh_token:refresh}) });
      const d = await r.json();
      if (d.access_token) {
        try { localStorage.setItem("gcal_access_token", d.access_token); localStorage.setItem("gcal_token_expiry", String(Date.now() + (d.expires_in - 60) * 1000)); } catch {}
        return d.access_token;
      }
      return null;
    } catch { return null; }
  })();
  if (!t) {
    showToast("Google Calendar not connected — sign in via the Calendar tab", "warn");
    return null;
  }
  const d = date||new Date().toISOString().split("T")[0];
  const colorMap = {"#6DC135":"2","#1565c0":"9","#c62828":"11","#f57f17":"6","#6a1b9a":"3","#00838f":"7","#555":"8"};
  const event = {
    summary: title,
    description: description||"",
    start:{date:d},
    end:{date:endDate||d},
    ...(color && colorMap[color] ? {colorId: colorMap[color]} : {})
  };
  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events",{
      method:"POST",
      headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},
      body:JSON.stringify(event)
    });
    const data = await res.json();
    if (data.id) {
      setCalEvents(ev=>[...ev, data]);
      return data.id;
    } else {
      showToast("Calendar API error: " + (data?.error?.message || JSON.stringify(data).slice(0,80)), "error");
      return null;
    }
  } catch(e) {
    showToast("Calendar fetch error: " + e.message, "error");
    return null;
  }
};

const deleteCalEvent = async (eventId) => {
  const t = await getValidToken();
  if (!t) return;
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,{
    method:"DELETE",
    headers:{Authorization:`Bearer ${t}`}
  });
  setCalEvents(ev=>ev.filter(e=>e.id!==eventId));
};

const updateCalEvent = async (eventId, updates) => {
  const t = await getValidToken();
  if (!t) return;
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,{
    method:"PATCH",
    headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},
    body:JSON.stringify(updates)
  });
  const data = await res.json();
  setCalEvents(ev=>ev.map(e=>e.id===eventId?data:e));
  // Sync job date if this event matches a job
  const newDate = data.start?.date || (data.start?.dateTime||"").split("T")[0];
  const title = (data.summary||"").toLowerCase();
  const matchedJob = jobs.find(j=>j.client&&title.includes(j.client.toLowerCase()));
  if (newDate === "2099-01-01") {
    // Marked unscheduled — clear the job's completion_date so it appears in unscheduled list
    if (matchedJob) {
      await supabase.from("jobs").update({completion_date:""}).eq("id",matchedJob.id);
      setJobs(js=>js.map(j=>j.id===matchedJob.id?{...j,completion_date:"",completionDate:""}:j));
    }
  } else if (newDate) {
    if(matchedJob && (matchedJob.completionDate||matchedJob.completion_date) !== newDate) {
      await supabase.from("jobs").update({completion_date:newDate}).eq("id",matchedJob.id);
      setJobs(js=>js.map(j=>j.id===matchedJob.id?{...j,completion_date:newDate,completionDate:newDate}:j));
    }
  }
};

const getEventDate = (ev) => {
  const d = ev.start?.date||ev.start?.dateTime;
  return d ? new Date(d) : null;
};
const closeModal = () => setModal(null);
const toggle = (id) => setExpandedId(p => p===id ? null : id);

const totalRevenue = jobs.filter(j=>j.status==="Paid").reduce((s,j)=>s+(j.revenue||0),0);
const totalExpenses = expenses.reduce((s,e)=>s+(e.amount||0),0);
const netProfit = totalRevenue - totalExpenses;
const supportsClientIds = supportsClientIdsIn([...jobs, ...quotes, ...invoices, ...recurringJobs, ...messages, ...bookingRequests, ...clientDocuments]);
const getClientByRecord = (record) => findClientForRecord(record, clients);
const getClientIdForName = (name) => clientIdForName(name, clients);
const belongsToClient = (record, client) => recordBelongsToClient(record, client);
const linkRecordToClient = (record, clientOrName, nameField = "client") => {
  const client = typeof clientOrName === "string" ? findClientForRecord({ [nameField]: clientOrName }, clients) : clientOrName;
  return withClientLink(record, client, supportsClientIds, nameField);
};

const filterItems = (arr, fields) => {
  if (!search.trim()) return arr;
  const q = search.toLowerCase();
  return arr.filter(item => fields.some(f => (String(item[f]||"")).toLowerCase().includes(q)));
};

const handleAiSend = async () => {
  if (!aiInput.trim() || aiLoading) return;
  const msg = aiInput.trim(); setAiInput("");
  setAiMessages(m=>[...m,{role:"user",text:msg}]);
  setAiLoading(true);
  try {
    const history = [...aiMessages,{role:"user",text:msg}];
    // Build live reporting context
    const paidJ = jobs.filter(j=>j.status==="Paid"&&j.revenue>0);
    const aiTotalRev = paidJ.reduce((s,j)=>s+(j.revenue||0),0);
    const aiTotalExp = expenses.reduce((s,e)=>s+(e.amount||0),0);
    const aiClientRev = {};
    paidJ.forEach(j=>{ aiClientRev[j.client]=(aiClientRev[j.client]||0)+(j.revenue||0); });
    const aiTopClients = Object.entries(aiClientRev).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,r])=>`${n}: $${r.toFixed(0)}`).join(", ");
    const aiSvcRev = {};
    paidJ.forEach(j=>{ const s=(j.service||"Other").split(/[+&,]/)[0].trim(); aiSvcRev[s]=(aiSvcRev[s]||0)+(j.revenue||0); });
    const aiTopSvcs = Object.entries(aiSvcRev).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([s,r])=>`${s}: $${r.toFixed(0)}`).join(", ");
    const aiNow = new Date();
    const aiThisMonKey = aiNow.getFullYear()+"-"+String(aiNow.getMonth()+1).padStart(2,"0");
    const aiLastMonKey = aiNow.getFullYear()+"-"+String(aiNow.getMonth()).padStart(2,"0");
    const aiThisMon = paidJ.filter(j=>(j.completionDate||j.completion_date||"").startsWith(aiThisMonKey)).reduce((s,j)=>s+(j.revenue||0),0);
    const aiLastMon = paidJ.filter(j=>(j.completionDate||j.completion_date||"").startsWith(aiLastMonKey)).reduce((s,j)=>s+(j.revenue||0),0);
    const aiUnpaid = invoices.filter(i=>i.status!=="paid").reduce((s,i)=>s+(i.total||0),0);
    const aiRecentJobs = [...paidJ].sort((a,b)=>(b.completionDate||"").localeCompare(a.completionDate||"")).slice(0,10).map(j=>`${j.client} (${j.service||"?"}) $${j.revenue} on ${j.completionDate||j.completion_date}`).join("; ");
    const today = new Date().toISOString().split("T")[0];
    const due14 = new Date(Date.now()+14*864e5).toISOString().split("T")[0];
    const calcTotal = (items=[]) => items.reduce((sum,it)=>sum+(parseFloat(it.qty)||1)*(parseFloat(it.rate)||0)*(parseFloat(it.multiplier)||1),0);

    const fixDate = (d) => (!d||d==="TODAY_DATE"||d==="TODAYS_DATE"||d==="TODAY")?today:(d==="DUE_DATE"?due14:d);

    const liveContext = [
      "",
      "LIVE BUSINESS DATA (today: " + aiNow.toLocaleDateString("en-AU") + "):",
      "- Total revenue (paid jobs): $" + aiTotalRev.toFixed(2),
      "- Total expenses: $" + aiTotalExp.toFixed(2),
      "- Net profit: $" + (aiTotalRev - aiTotalExp).toFixed(2),
      "- This month revenue: $" + aiThisMon.toFixed(2),
      "- Last month revenue: $" + aiLastMon.toFixed(2),
      "- Total paid jobs: " + paidJ.length,
      "- Avg job value: $" + (paidJ.length ? (aiTotalRev / paidJ.length).toFixed(2) : "0"),
      "- Outstanding invoices: $" + aiUnpaid.toFixed(2),
      "- Quote conversion: " + (quotes.length ? Math.round(quotes.filter(q => q.status === "approved").length / quotes.length * 100) : 0) + "%",
      "- Top 5 clients by revenue: " + aiTopClients,
      "- Top 5 services by revenue: " + aiTopSvcs,
      "- Recent jobs: " + aiRecentJobs,
      "Use this data to answer any questions about revenue, clients, services, or business performance.",
      "",
      "CURRENT RECORDS (use IDs when editing):",
      "Jobs (last 20): " + jobs.slice(0,20).map(j=>`[${j.id}] ${j.client} - ${j.service} $${j.revenue} ${j.status} ${j.completionDate||j.completion_date||""}`).join(" | "),
      "Quotes (last 10): " + quotes.slice(0,10).map(q=>`[${q.id}] ${q.client} $${q.total} ${q.status}`).join(" | "),
      "Invoices (last 10): " + invoices.slice(0,10).map(i=>`[${i.id}] ${i.client} $${i.total} ${i.status}`).join(" | "),
      "Expenses (last 10): " + expenses.slice(0,10).map(e=>`[${e.id}] ${e.date} ${e.category} $${e.amount}`).join(" | "),
      "Clients (first 30): " + clients.slice(0,30).map(c=>`[${c.id}] ${c.name} ${c.phone||""}`).join(" | "),
      "Recurring jobs: " + recurringJobs.map(r=>`[${r.id}] ${r.client} ${r.service} ${r.frequency} next:${r.next_date||"TBD"}`).join(" | "),
      "TODAY=" + today + " DUE_DATE=" + new Date(Date.now()+14*864e5).toISOString().split("T")[0]
    ].join("\n");
    const res = await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:1000,system:SYSTEM+liveContext,messages:history.map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.text}))})});
    const data = await res.json();
    const raw = data.content?.map(b=>b.text||"").join("") || "Sorry, something went wrong.";
    const clean = raw.replace(/<json>[\s\S]*?<\/json>/g,"").trim();
    const allParsed = parseAllJson(raw);
    const parsed = allParsed[0] || null;
    let lastTab = null;
    const acts = [];
    for (const p of allParsed) {
      if (p.type==="quote") {
        const nq=linkRecordToClient({id:`Q-${Date.now()}`,client:p.client,date:today,total:p.total||0,status:"pending",items:p.items||[],notes:p.notes||""}, p.client);
        await supabase.from("quotes").insert(nq);
        setQuotes(q=>[nq,...q]); lastTab="quotes";
        sendClientPush(nq.client,'📋 New Quote Ready','A quote of $'+Number(nq.total||0).toFixed(2)+' is ready for you to review and approve in your portal.');
      } else if (p.type==="client") {
        const nc={id:`C-NEW-${Date.now()}`,name:p.name,phone:p.phone||"",email:p.email||"",address:p.address||"",suburb:p.suburb||"",notes:p.notes||"",status:"active",source:"new"};
        await supabase.from("clients").insert(nc);
        setClients(c=>[nc,...c]); lastTab="clients";
      } else if (p.type==="recurring_job") {
        const rec=linkRecordToClient({id:`REC-${Date.now()}`,client:p.client||"",service:p.service||"",description:p.description||"",revenue:parseFloat(p.revenue)||0,hours:parseFloat(p.hours)||0,frequency:p.frequency||"quarterly",next_date:fixDate(p.next_date)||today,notes:p.notes||"",active:true,source_job_id:null,created_at:new Date().toISOString()}, p.client);
        await supabase.from("recurring_jobs").insert(rec);
        setRecurringJobs(rs=>[...rs,rec]);
        if(calToken&&rec.next_date) await addToCalendar(`${rec.client} | ${rec.service} | $${rec.revenue.toFixed(0)} (Recurring)`,rec.next_date,rec.notes||"",null,"#1565c0");
        lastTab="jobs";
      } else if (p.type==="job") {
        const cd = fixDate(p.completion_date);
        const nj=linkRecordToClient({id:`J-NEW-${Date.now()}`,client:p.client||"",service:p.service||p.description||"",description:p.description||"",status:p.status||"Active",revenue:parseFloat(p.revenue)||0,hours:parseFloat(p.hours)||0,completion_date:cd,notes:p.notes||""}, p.client);
        await supabase.from("jobs").insert(nj);
        setJobs(j=>[{...nj,completionDate:cd,revenue:parseFloat(p.revenue)||0},...j]);
        if (calToken && cd) (async ()=>{const calC=clients.find(c=>c.name===p.client)||{};const calTitle=[p.client,calC.phone,calC.address,p.service,parseFloat(p.revenue)>0?`$${parseFloat(p.revenue).toFixed(0)}`:""].filter(Boolean).join(" | ");await addToCalendar(calTitle,cd,`Service: ${p.service||""}\nPrice: $${p.revenue||0}\nAddress: ${calC.address||""}\nPhone: ${calC.phone||""}`);})();
        lastTab="jobs";
      } else if (p.type==="invoice") {
        const d = fixDate(p.date);
        const due = fixDate(p.due_date)||due14;
        const ni = linkRecordToClient({id:`INV-${Date.now()}`,quote_id:"",job_id:p.job_id||"",client:p.client||"",date:d,due_date:due,items:p.items||[],total:p.total||0,status:"sent",notes:p.notes||""}, p.client);
        await supabase.from("invoices").insert(ni);
        setInvoices(i=>[{...ni,total:Number(ni.total)||0},...i]);
        // Do NOT create a client record when creating an invoice
        if (p.job_id) {
          await supabase.from("jobs").update({status:"Invoiced"}).eq("id",p.job_id);
          setJobs(jb=>jb.map(x=>x.id===p.job_id?{...x,status:"Invoiced"}:x));
        }
        lastTab="invoices";
      } else if (p.type==="pnl"||p.type==="expense") {
        const amt=Math.abs(p.amount||0);
        if (p.category==="income") {
          const nj=linkRecordToClient({id:`J-NEW-${Date.now()}`,client:p.client||"",service:p.description,description:p.description,status:"Paid",revenue:amt,hours:0,completion_date:p.date||today,notes:""}, p.client);
          await supabase.from("jobs").insert(nj);
          setJobs(j=>[{...nj,completionDate:nj.completion_date,revenue:amt},...j]);
        } else {
          const ne={id:`E-NEW-${Date.now()}`,date:fixDate(p.date),category:p.description||p.category||"Other",supplier:p.supplier||"",amount:amt};
          await supabase.from("expenses").insert(ne);
          setExpenses(e=>[{...ne,amount:amt},...e]);
        }
        lastTab="p&l";
      }
    }
    // Handle delete
    for (const p of allParsed.filter(p=>p.type==="delete")) {
      const entity = p.entity;
      const id = p.id;
      const name = (p.name||"").toLowerCase();
      if (entity==="expense") {
        const toDelete = id ? expenses.find(e=>e.id===id) : expenses.find(e=>(e.category||"").toLowerCase().includes(name)||(e.supplier||"").toLowerCase().includes(name));
        if (toDelete) { await supabase.from("expenses").delete().eq("id",toDelete.id); setExpenses(ex=>ex.filter(e=>e.id!==toDelete.id)); }
      } else if (entity==="job") {
        const toDelete = id ? jobs.find(j=>j.id===id) : jobs.find(j=>(j.client||"").toLowerCase().includes(name)||(j.service||"").toLowerCase().includes(name));
        if (toDelete) { await supabase.from("jobs").delete().eq("id",toDelete.id); setJobs(jb=>jb.filter(j=>j.id!==toDelete.id)); }
      } else if (entity==="client") {
        const toDelete = id ? clients.find(c=>c.id===id) : clients.find(c=>(c.name||"").toLowerCase().includes(name));
        if (toDelete) { await supabase.from("clients").delete().eq("id",toDelete.id); setClients(cl=>cl.filter(c=>c.id!==toDelete.id)); }
      } else if (entity==="quote") {
        const toDelete = id ? quotes.find(q=>q.id===id) : quotes.find(q=>(q.client||"").toLowerCase().includes(name));
        if (toDelete) { await supabase.from("quotes").delete().eq("id",toDelete.id); setQuotes(qs=>qs.filter(q=>q.id!==toDelete.id)); }
      } else if (entity==="invoice") {
        const toDelete = id ? invoices.find(i=>i.id===id) : invoices.find(i=>(i.client||"").toLowerCase().includes(name));
        if (toDelete) { await supabase.from("invoices").delete().eq("id",toDelete.id); setInvoices(is=>is.filter(i=>i.id!==toDelete.id)); }
      }
    }
    // Handle edit_expense
    for (const p of allParsed.filter(p=>["edit_expense","edit_job","edit_client","edit_quote","edit_invoice","edit_recurring"].includes(p.type))) {

    if (p.type==="edit_expense") {
      const toEdit = p.id ? expenses.find(e=>e.id===p.id)
        : expenses.find(e=>(e.supplier||"").toLowerCase().includes((p.supplier||p.name||"").toLowerCase())||(e.category||"").toLowerCase().includes((p.category||"").toLowerCase()));
      if (!toEdit) { acts.push(`Could not find expense to edit`); }
      else {
        const upd = {date:fixDate(p.date)||toEdit.date,category:p.category||toEdit.category,supplier:p.supplier!==undefined?p.supplier:toEdit.supplier,amount:p.amount!==undefined?parseFloat(p.amount):toEdit.amount};
        const {error} = await supabase.from("expenses").update(upd).eq("id",toEdit.id);
        if(error) acts.push(`Error updating expense: ${error.message}`);
        else { setExpenses(ex=>ex.map(e=>e.id===toEdit.id?{...e,...upd}:e)); acts.push(`Updated expense: ${upd.category} $${upd.amount}`); }
      }
    }

    if (p.type==="edit_job") {
      const toEdit = p.id ? jobs.find(j=>j.id===p.id)
        : jobs.find(j=>j.client&&p.client&&j.client.toLowerCase().includes(p.client.toLowerCase()));
      if (!toEdit) { acts.push(`Could not find job for: ${p.client||p.id||"unknown"}`); }
      else {
        const upd = {};
        if(p.service!==undefined) upd.service=p.service;
        if(p.description!==undefined) upd.description=p.description;
        if(p.status!==undefined) upd.status=p.status;
        if(p.revenue!==undefined) upd.revenue=parseFloat(p.revenue)||0;
        if(p.hours!==undefined) upd.hours=parseFloat(p.hours)||0;
        if(p.completion_date!==undefined) upd.completion_date=fixDate(p.completion_date)||null;
        if(p.notes!==undefined) upd.notes=p.notes;
        if(p.client!==undefined) upd.client=p.client;
        const {error} = await supabase.from("jobs").update(upd).eq("id",toEdit.id);
        if(error) acts.push(`Error updating job: ${error.message}`);
        else { setJobs(js=>js.map(j=>j.id===toEdit.id?{...j,...upd,completionDate:upd.completion_date??j.completionDate}:j)); acts.push(`Updated job for ${toEdit.client}: ${Object.keys(upd).join(", ")}`); lastTab="jobs"; }
      }
    }

    if (p.type==="edit_client") {
      const toEdit = p.id ? clients.find(c=>c.id===p.id)
        : clients.find(c=>c.name&&p.name&&c.name.toLowerCase().includes(p.name.toLowerCase()));
      if (!toEdit) { acts.push(`Could not find client: ${p.name||p.id||"unknown"}`); }
      else {
        const upd = {};
        if(p.name!==undefined) upd.name=p.name;
        if(p.phone!==undefined) upd.phone=p.phone;
        if(p.email!==undefined) upd.email=p.email;
        if(p.address!==undefined) upd.address=p.address;
        if(p.suburb!==undefined) upd.suburb=p.suburb;
        if(p.notes!==undefined) upd.notes=p.notes;
        if(p.status!==undefined) upd.status=p.status;
        const {error} = await supabase.from("clients").update(upd).eq("id",toEdit.id);
        if(error) acts.push(`Error updating client: ${error.message}`);
        else { setClients(cs=>cs.map(c=>c.id===toEdit.id?{...c,...upd}:c)); acts.push(`Updated client ${toEdit.name}: ${Object.keys(upd).join(", ")}`); lastTab="clients"; }
      }
    }

    if (p.type==="edit_quote") {
      const toEdit = p.id ? quotes.find(q=>q.id===p.id)
        : quotes.find(q=>q.client&&p.client&&q.client.toLowerCase().includes(p.client.toLowerCase()));
      if (!toEdit) { acts.push(`Could not find quote: ${p.client||p.id||"unknown"}`); }
      else {
        const upd = {};
        if(p.client!==undefined) upd.client=p.client;
        if(p.items!==undefined) { upd.items=p.items; upd.total=calcTotal(p.items); }
        else if(p.total!==undefined) upd.total=parseFloat(p.total)||0;
        if(p.status!==undefined) upd.status=p.status;
        if(p.notes!==undefined) upd.notes=p.notes;
        const {error} = await supabase.from("quotes").update(upd).eq("id",toEdit.id);
        if(error) acts.push(`Error updating quote: ${error.message}`);
        else { setQuotes(qs=>qs.map(q=>q.id===toEdit.id?{...q,...upd}:q)); acts.push(`Updated quote ${toEdit.id} for ${toEdit.client}`); lastTab="quotes"; }
      }
    }

    if (p.type==="edit_invoice") {
      const toEdit = p.id ? invoices.find(i=>i.id===p.id)
        : invoices.find(i=>i.client&&p.client&&i.client.toLowerCase().includes(p.client.toLowerCase()));
      if (!toEdit) { acts.push(`Could not find invoice: ${p.client||p.id||"unknown"}`); }
      else {
        const upd = {};
        if(p.client!==undefined) upd.client=p.client;
        if(p.items!==undefined) { upd.items=p.items; upd.total=calcTotal(p.items); }
        else if(p.total!==undefined) upd.total=parseFloat(p.total)||0;
        if(p.status!==undefined) upd.status=p.status;
        if(p.due_date!==undefined) upd.due_date=fixDate(p.due_date)||toEdit.due_date;
        if(p.notes!==undefined) upd.notes=p.notes;
        const {error} = await supabase.from("invoices").update(upd).eq("id",toEdit.id);
        if(error) acts.push(`Error updating invoice: ${error.message}`);
        else { setInvoices(is=>is.map(i=>i.id===toEdit.id?{...i,...upd}:i)); acts.push(`Updated invoice ${toEdit.id} for ${toEdit.client}`); lastTab="invoices"; }
      }
    }

    if (p.type==="edit_recurring") {
      const toEdit = p.id ? recurringJobs.find(r=>r.id===p.id)
        : recurringJobs.find(r=>r.client&&p.client&&r.client.toLowerCase().includes(p.client.toLowerCase()));
      if (!toEdit) { acts.push(`Could not find recurring job: ${p.client||p.id||"unknown"}`); }
      else {
        const upd = {};
        if(p.service!==undefined) upd.service=p.service;
        if(p.revenue!==undefined) upd.revenue=parseFloat(p.revenue)||0;
        if(p.frequency!==undefined) upd.frequency=p.frequency;
        if(p.next_date!==undefined) upd.next_date=fixDate(p.next_date)||null;
        if(p.notes!==undefined) upd.notes=p.notes;
        if(p.active!==undefined) upd.active=p.active;
        const {error} = await supabase.from("recurring_jobs").update(upd).eq("id",toEdit.id);
        if(error) acts.push(`Error updating recurring job: ${error.message}`);
        else { setRecurringJobs(rs=>rs.map(r=>r.id===toEdit.id?{...r,...upd}:r)); acts.push(`Updated recurring job for ${toEdit.client}`); lastTab="jobs"; }
      }
    }

    }
    const actsText = acts.length ? "\n\n" + acts.join("\n") : "";
    const displayText = (clean||"Done!") + actsText;
    setAiMessages(m=>[...m,{role:"assistant",text:displayText,parsed}]);
    if (lastTab) setTimeout(()=>{ setTab(lastTab); if(navigateFnRef.current) navigateFnRef.current("/"+(lastTab==="dashboard"?"":lastTab)); },600);
  } catch(err) { setAiMessages(m=>[...m,{role:"assistant",text:"Error: "+(err?.message||"Connection failed. Check ANTHROPIC_API_KEY in Vercel environment variables.")}]); }
  setAiLoading(false);
};

const isCreditLine = (item) => item?.is_credit || String(item?.description || "").toLowerCase().includes("client credit");
const creditAmountForClient = (items = [], client) => {
  if (!client) return 0;
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
  return findClientForRecord({ client: clientName }, clients);
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
const finalizeQuoteCredit = async (quote) => {
  const client = findCreditClient(quote?.client, quote?.items || []);
  const amount = creditAmountForClient(quote?.items || [], client);
  if (!client || amount <= 0) return;
  const record = await fetchCreditRecord(client);
  await writeCreditTotals(client, record, {
    total_earned: Number(record?.total_earned ?? (Number(client.referral_credit || 0) + amount)),
    total_used: Number(record?.total_used || 0) + amount,
    total_reserved: Math.max(0, Number(record?.total_reserved || 0) - amount),
  });
};
const releaseQuoteCredit = async (quote) => {
  const client = findCreditClient(quote?.client, quote?.items || []);
  const amount = creditAmountForClient(quote?.items || [], client);
  if (!client || amount <= 0) return;
  const record = await fetchCreditRecord(client);
  await writeCreditTotals(client, record, {
    total_earned: Number(record?.total_earned ?? (Number(client.referral_credit || 0) + amount)),
    total_used: Number(record?.total_used || 0),
    total_reserved: Math.max(0, Number(record?.total_reserved || 0) - amount),
  });
};

const approveQuote = async (id) => {
  try {
  const q = quotes.find(x=>x.id===id);
  if (!q) return;
  await finalizeQuoteCredit(q);
  await supabase.from("quotes").update({status:"approved"}).eq("id",id);
  setQuotes(qs=>qs.map(x=>x.id===id?{...x,status:"approved"}:x));
  const today = new Date().toISOString().split("T")[0];
  const nj = {
    id:`J-${Date.now()}`,
    client:q.client,
    ...(q.client_id ? { client_id: q.client_id } : {}),
    service:(q.items||[]).map(it=>it.description).filter(Boolean).join(" + ")||"Service",
    description:`From quote ${q.id}`,
    status:"Active",
    revenue:q.total||0,
    hours:0,
    completion_date:today,
    notes:`Quote ${q.id} approved — $${(q.total||0).toFixed(2)}`
  };
  await supabase.from("jobs").insert(nj);
  setJobs(j=>[{...nj,completionDate:today,revenue:q.total||0},...j]);
  // Read token directly from localStorage — avoids stale closure on calToken state
  const freshToken = (() => { try { return localStorage.getItem("gcal_access_token"); } catch { return null; } })();
  const tokenExpiry = (() => { try { return parseInt(localStorage.getItem("gcal_token_expiry") || "0"); } catch { return 0; } })();
  const validToken = freshToken && Date.now() < tokenExpiry ? freshToken : null;
  console.log("[approveQuote] freshToken:", !!freshToken, "tokenExpiry:", tokenExpiry, "now:", Date.now(), "validToken:", !!validToken);
  if (validToken) {
    const calC = clients.find(c=>c.name===q.client)||{};
    const calTitle = [q.client, calC.phone, calC.address, (q.items||[]).map(it=>it.description).join(", "), `$${(q.total||0).toFixed(2)}`].filter(Boolean).join(" | ");
    const calDesc = `Quote: ${q.id}\nTotal: $${(q.total||0).toFixed(2)}\nServices: ${(q.items||[]).map(it=>it.description).join(", ")}\nAddress: ${calC.address||""}\nPhone: ${calC.phone||""}`;
    console.log("[approveQuote] calling addToCalendar with title:", calTitle.slice(0,50));
    const eventId = await addToCalendar(calTitle, new Date().toISOString().split("T")[0], calDesc);
    console.log("[approveQuote] addToCalendar returned:", eventId);
    setTimeout(() => loadCalEvents(validToken, new Date()), 1500);
  }
  } catch(err) { console.error("[approveQuote] ERROR:", err?.message, err); }
};
const rejectQuote = async (id) => {
  const q = quotes.find(x=>x.id===id);
  if (!q) return;
  await releaseQuoteCredit(q);
  await supabase.from("quotes").update({status:"rejected"}).eq("id",id);
  setQuotes(qs=>qs.map(x=>x.id===id?{...x,status:"rejected"}:x));
};
const deleteQuote = async (id) => {
  const q = quotes.find(x=>x.id===id);
  if (q) await releaseQuoteCredit(q);
  await supabase.from("quotes").delete().eq("id",id);
  setQuotes(qs=>qs.filter(x=>x.id!==id));
  setExpandedId(null);
};

const convertToInvoice = async (q) => {
  await finalizeQuoteCredit(q);
  const inv={id:`INV-${Date.now()}`,quote_id:q.id,client:q.client,...(q.client_id ? { client_id: q.client_id } : {}),date:new Date().toISOString().split("T")[0],due_date:new Date(Date.now()+14*864e5).toISOString().split("T")[0],items:q.items||[],total:q.total||0,status:"sent",notes:q.notes||""};
  await supabase.from("invoices").insert(inv).then(()=>{}).catch(()=>{});
  setInvoices(i=>[inv,...i]); setTab("invoices"); setTimeout(()=>{ if(navigateFnRef.current) navigateFnRef.current("/invoices"); },100);
};


  // ── NAV CONFIG ─────────────────────────────────────────────────
const NAV = ["dashboard","calendar","clients","jobs","quotes","invoices","inbox","p&l","finance","reports","receipts","campaigns","ai","autopilot"];
const LABELS = {dashboard:"Dashboard",calendar:"Calendar",clients:"Clients",jobs:"Jobs",quotes:"Quotes",invoices:"Invoices",inbox:"Inbox","p&l":"P&L",finance:"Finance Hub",reports:"Reports",receipts:"Receipts",campaigns:"Campaigns",ai:"AI Assistant",autopilot:"Autopilot"};


// Bottom nav icons
const NAV_ICONS = {
  dashboard:"⊞", reports:"▦", ai:"◈", calendar:"◷", clients:"◉", jobs:"◧",
  quotes:"◨", invoices:"◪", receipts:"◫", "p&l":"$", finance:"💰", campaigns:"📣", inbox:"📬"
};
// Mobile shows only key tabs in bottom nav
const MOBILE_NAV = ["dashboard","clients","jobs","ai","more"];
const MOBILE_LABELS = {dashboard:"Home",clients:"Clients",jobs:"Jobs",ai:"AI",more:"More"};
const MOBILE_ICONS = {dashboard:"⊞",clients:"◉",jobs:"◧",ai:"◈",more:"⋯"};



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

  const value = {
    // Core data
    supabase, LOGO, G,
    clients, setClients,
    jobs, setJobs,
    expenses, setExpenses,
    quotes, setQuotes,
    invoices, setInvoices,
    recurringJobs, setRecurringJobs,
    messages, setMessages,
    bookingRequests, setBookingRequests,
    referrals, setReferrals,
    clientDocuments, setClientDocuments,
    clientNotes, setClientNotes,
    creditClients, setCreditClients,
    // UI state
    loading,
    tab, setTab,
    search, setSearch,
    expandedId, setExpandedId,
    moreOpen, setMoreOpen,
    modal, setModal,
    editItem, setEditItem,
    expandedClient, setExpandedClient,
    expandedJob, setExpandedJob,
    expandedQuote, setExpandedQuote,
    expandedInvoice, setExpandedInvoice,
    expandedReceipt, setExpandedReceipt,
    jobStatusFilter, setJobStatusFilter,
    quoteStatusFilter, setQuoteStatusFilter,
    invoiceStatusFilter, setInvoiceStatusFilter,
    manageCreditModal, setManageCreditModal,
    recurringModal, setRecurringModal,
    smsModal, setSmsModal,
    unreadMessages, setUnreadMessages,
    // Calendar
    calEvents, setCalEvents,
    calView, setCalView,
    calDate, setCalDate,
    newEvent, setNewEvent,
    calToken, calLoading,
    signInGoogle, loadCalEvents, addToCalendar, deleteCalEvent, updateCalEvent, getValidToken,
    // Campaign
    campTab, setCampTab,
    campMessage, setCampMessage,
    campSubject, setCampSubject,
    campTemplate, setCampTemplate,
    audienceFilter, setAudienceFilter,
    suburbFilter, setSuburbFilter,
    statusFilter, setStatusFilter,
    selectedRecipients, setSelectedRecipients,
    campSending, setCampSending,
    campResult, setCampResult,
    brevoKey, setBrevoKey,
    brevoInput, setBrevoInput,
    campHtmlBody, setCampHtmlBody,
    aiEmailPrompt, setAiEmailPrompt,
    aiEmailGenerating, setAiEmailGenerating,
    emailViewMode, setEmailViewMode,
    campAttachment, setCampAttachment,
    campHistory, setCampHistory,
    showCampHistory, setShowCampHistory,
    expandedCampHist, setExpandedCampHist,
    campRecipSearch, setCampRecipSearch,
    clientSearch, setClientSearch,
    jobSearch, setJobSearch,
    // AI
    aiMessages, setAiMessages,
    aiInput, setAiInput,
    aiLoading, setAiLoading,
    chatBottom,
    // Autopilot
    autopilotLog, setAutopilotLog,
    autopilotLogOpen, setAutopilotLogOpen,
    autopilotSettings, setAutopilotSettings,
    autopilotLoading, setAutopilotLoading,
    morningBriefing, setMorningBriefing,
    briefingDismissed, setBriefingDismissed,
    // Helpers
    sendSMS,
    sendClientPush,
    sendReviewSms,
    generateClientPortalLink,
    shareClientPortal,
    isAutopilotOn,
    logAutopilotAction,
    SMS_TEMPLATES,
    // App helpers
    generatePortalLink, getClientEmail, getClientPhone,
    openOutlookEmail,
    approveQuote, rejectQuote, deleteQuote, generateMorningBriefing, createRecurringCalendarSeries,
    supportsClientIds, getClientByRecord, getClientIdForName, belongsToClient, linkRecordToClient,
    // Computed
    totalRevenue, totalExpenses, netProfit,
    isMobile,
    goAI,
    navigateFnRef,
    getEventDate,
    handleAiSend,
    // Nav
    NAV, LABELS, NAV_ICONS, MOBILE_NAV, MOBILE_LABELS, MOBILE_ICONS,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
