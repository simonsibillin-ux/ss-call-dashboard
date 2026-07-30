async function sendPushToClient(supabase, clientName, title, body, url) {
  try {
    const { data: client } = await supabase.from("clients").select("push_subscription").eq("name", clientName).single();
    if (!client?.push_subscription) return;
    const sub = JSON.parse(client.push_subscription);
    const vapidPublic = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublic || !vapidPrivate) return;
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails("mailto:ssexteriorservices@outlook.com", vapidPublic, vapidPrivate);
    await webpush.sendNotification(sub, JSON.stringify({ title, body, icon: "/logo.png", data: { url } }));
  } catch(e) { console.error("Push failed:", e.message); }
}

async function insertWithClientFallback(supabase, table, payload) {
  const { error } = await supabase.from(table).insert(payload);
  if (!error) return { error: null };
  if (payload.client_id && /client_id|column/i.test(error.message || "")) {
    const { client_id, ...withoutClientId } = payload;
    return supabase.from(table).insert(withoutClientId);
  }
  return { error };
}

export default async function handler(req, res) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "No token" });

  // ── GET: load full client portal data ────────────────────────
  if (req.method === "GET") {
    try {
    const { data: client } = await supabase.from("clients").select("*").eq("portal_token", token).single();

    if (client) {
      const safe = async (fn) => { try { const r = await fn(); return r; } catch(e) { return { data: null, error: e }; } };
      const linkedMany = async (table, nameColumn, orderColumn, opts = {}) => {
        const byId = client.id ? await safe(() => {
          let q = supabase.from(table).select("*").eq("client_id", client.id);
          if (opts.eq) Object.entries(opts.eq).forEach(([k, v]) => { q = q.eq(k, v); });
          if (orderColumn) q = q.order(orderColumn, opts.order || { ascending: false });
          if (opts.limit) q = q.limit(opts.limit);
          return q;
        }) : { data: null };
        if (byId.data?.length) return byId;
        return safe(() => {
          let q = supabase.from(table).select("*").eq(nameColumn, client.name);
          if (opts.eq) Object.entries(opts.eq).forEach(([k, v]) => { q = q.eq(k, v); });
          if (orderColumn) q = q.order(orderColumn, opts.order || { ascending: false });
          if (opts.limit) q = q.limit(opts.limit);
          return q;
        });
      };
      const linkedSingle = async (table, nameColumn) => {
        const byId = client.id ? await safe(() => supabase.from(table).select("*").eq("client_id", client.id).single()) : { data: null };
        return byId.data ? byId : safe(() => supabase.from(table).select("*").eq(nameColumn, client.name).single());
      };
      const [quotesRes, invoicesRes, jobsRes, recurringRes, messagesRes, bookingsRes, creditsRes, referralsRes, propRes, docsRes] = await Promise.all([
        linkedMany("quotes", "client", "date"),
        linkedMany("invoices", "client", "date"),
        linkedMany("jobs", "client", "completion_date", { order: { ascending: false, nullsFirst: false } }),
        linkedMany("recurring_jobs", "client", "next_date", { eq: { active: true }, order: { ascending: true } }),
        linkedMany("messages", "client_name", "created_at", { order: { ascending: true } }),
        linkedMany("bookings", "client_name", "created_at", { limit: 5 }),
        linkedSingle("client_credits", "client_name"),
        safe(()=>supabase.from("referrals").select("*").eq("referrer_name", client.name).order("created_at", { ascending: false })),
        safe(()=>supabase.from("property_notes").select("*").eq("client_name", client.name).single()),
        linkedMany("client_documents", "client_name", "uploaded_at", { eq: { show_on_portal: true } }),
      ]);

      // Mark messages from client as read
      await supabase.from("messages").update({ read: true }).eq("client_name", client.name).eq("sender", "client");

      return res.json({
        type: "client",
        data: client,
        quotes: quotesRes.data || [],
        invoices: invoicesRes.data || [],
        jobs: jobsRes.data || [],
        recurringJobs: recurringRes.data || [],
        messages: messagesRes.data || [],
        bookings: bookingsRes.data || [],
        credits: creditsRes.data || { total_earned: 0, total_used: 0 },
        referrals: referralsRes.data || [],
        propertyNotes: propRes.data || null,
        documents: docsRes.data || [],
      });
    }

    // Single quote/invoice token fallback
    const { data: quote } = await supabase.from("quotes").select("*").eq("portal_token", token).single();
    if (quote) return res.json({ type: "quote", data: quote });
    const { data: invoice } = await supabase.from("invoices").select("*").eq("portal_token", token).single();
    if (invoice) return res.json({ type: "invoice", data: invoice });

    // Log what token was tried for debugging
    console.log("Portal 404 - token tried:", token?.slice(0,10)+"...");
    return res.status(404).json({ error: "Portal link not found. This link may have expired or been regenerated. Please ask Simon for a new portal link." });
    } catch(e) {
      console.error("Portal GET error:", e.message, e.stack);
      return res.status(500).json({ error: "Server error: " + e.message });
    }
  }

  // ── POST: handle all client actions ──────────────────────────
  if (req.method === "POST") {
    const { action, type, id, data } = req.body;

    // Quote approval/rejection
    if (action === "approve" && type === "quote") {
      await supabase.from("quotes").update({ status: "approved" }).eq("id", id);
      return res.json({ success: true });
    }
    if (action === "reject" && type === "quote") {
      await supabase.from("quotes").update({ status: "rejected" }).eq("id", id);
      return res.json({ success: true });
    }

    // Send message from client
    if (action === "sendMessage") {
      const { data: client } = await supabase.from("clients").select("id").eq("portal_token", token).single();
      const msg = { client_name: data.clientName, ...(client?.id ? { client_id: client.id } : {}), portal_token: token, sender: "client", text: data.text, read: false };
      const { error } = await insertWithClientFallback(supabase, "messages", msg);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    // Simon sends message to client from CRM
    if (action === "simonMessage") {
      const { data: client } = await supabase.from("clients").select("id").eq("portal_token", token).single();
      const msg = { client_name: data.clientName, ...(client?.id ? { client_id: client.id } : {}), portal_token: "", sender: "simon", text: data.text, read: false };
      await insertWithClientFallback(supabase, "messages", msg);
      await sendPushToClient(supabase, data.clientName, "💬 Message from Simon", data.text, `portal.html?t=${token}`);
      return res.json({ success: true });
    }

    // Booking request
    if (action === "bookingRequest") {
      const { data: client } = await supabase.from("clients").select("id").eq("portal_token", token).single();
      const booking = {
        id: `BK-${Date.now()}`,
        client_name: data.clientName,
        ...(client?.id ? { client_id: client.id } : {}),
        portal_token: token,
        service: data.service,
        preferred_date: data.preferredDate || null,
        time_window: data.timeWindow || "",
        notes: data.notes || "",
        address: data.address || "",
        status: "pending"
      };
      const { error } = await supabase.from("bookings").insert(booking);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    // Referral submission
    if (action === "submitReferral") {
      const referral = {
        id: `REF-${Date.now()}`,
        referrer_name: data.referrerName,
        referred_name: data.referredName,
        referred_phone: data.referredPhone || "",
        referred_email: data.referredEmail || "",
        status: "pending"
      };
      const { error } = await supabase.from("referrals").insert(referral);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ success: true });
    }

    // Update property notes
    if (action === "updatePropertyNotes") {
      const { data: existing } = await supabase.from("property_notes").select("id").eq("client_name", data.clientName).single();
      if (existing) {
        await supabase.from("property_notes").update({ ...data, updated_at: new Date().toISOString() }).eq("client_name", data.clientName);
      } else {
        await supabase.from("property_notes").insert({ ...data, id: `PN-${Date.now()}` });
      }
      return res.json({ success: true });
    }

    // Save push subscription
    if (action === "savePushSubscription") {
      await supabase.from("clients").update({ push_subscription: data.subscription }).eq("portal_token", token);
      return res.json({ success: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  res.status(405).end();
}
