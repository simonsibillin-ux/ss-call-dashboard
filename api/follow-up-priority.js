const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const TIMEOUT_MS = 24000;
const BATCH_SIZE = 12;
const rateLimit = new Map();

function clean(value, max = 1200) {
  return String(value || '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localIso(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Australia/Melbourne', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]:part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateFromIsoDay(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function compareIsoDays(left, right) {
  return String(left || '').localeCompare(String(right || ''));
}

function addBusinessDays(isoDay, amount) {
  const date = dateFromIsoDay(isoDay);
  if (!date) return isoDay;
  let remaining = amount;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parseAustralianDates(text, now) {
  const dates = [];
  const source = String(text || '');
  for (const match of source.matchAll(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/g)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = match[3] ? Number(match[3]) : Number(localIso(now).slice(0, 4));
    if (year < 100) year += 2000;
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) dates.push({ date, iso:`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, raw:match[0], index:match.index });
  }
  for (const match of source.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const iso = `${match[1]}-${match[2]}-${match[3]}`;
    const date = dateFromIsoDay(iso);
    if (date) dates.push({ date, iso, raw:match[0], index:match.index });
  }
  return dates;
}

function noteSignals(item, now) {
  const entries = [...(item.noteEntries || [])].filter(note => clean(note.body)).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const latestEntry = entries[0] || null;
  const text = clean(latestEntry?.body || item.legacyNotes, 2400);
  const lower = text.toLowerCase();
  const dates = parseAustralianDates(text, now);
  const today = localIso(now);
  const actionDates = dates.filter(entry => {
    const nearby = lower.slice(Math.max(0, entry.index - 55), entry.index + entry.raw.length + 55);
    return /follow|call|contact|after|until|wait|check|book|available|back/.test(nearby);
  });
  const futureAction = actionDates.filter(entry => compareIsoDays(entry.iso, today) > 0).sort((a, b) => a.iso.localeCompare(b.iso))[0];
  const dueAction = actionDates.filter(entry => compareIsoDays(entry.iso, today) <= 0).sort((a, b) => b.iso.localeCompare(a.iso))[0];
  const explicitDate = (futureAction || dueAction)?.iso || '';
  const waiting = /\b(wait(?:ing)?|hold off|not yet|after (?:the|their)|when (?:the|they)|will (?:call (?:us )?|get )back|needs? to (?:speak|check|ask|think|discuss)|trees? (?:are|have been)|not ready)\b/.test(lower);
  const interested = /\b(ready|keen|interested|go ahead|proceed|book(?:ing)?|accept(?:ed)?|approved)\b/.test(lower);
  const attempted = /\b(voicemail|no answer|left (?:a )?message|text(?:ed| sent)|email(?:ed| sent)|called)\b/.test(lower);
  const declined = /\b(declin(?:e|ed|ing)|not interested|does not want|doesn't want|cancel(?:led)?|do not contact)\b/.test(lower);
  const excerpt = clean(text.replace(/---[^-]+---/g, ''), 180);
  return { explicitDate, waiting, interested, attempted, declined, excerpt, latestEntryAt:validDate(latestEntry?.at), today };
}

function daysSince(value, now) {
  const date = value instanceof Date ? value : validDate(value);
  if (!date) return 0;
  const currentDay = dateFromIsoDay(localIso(now));
  const valueDay = dateFromIsoDay(localIso(date));
  return Math.max(0, Math.round((currentDay - valueDay) / 86400000));
}

function baseline(item, now) {
  const signals = noteSignals(item, now);
  const created = validDate(item.createdAt || item.recordDate);
  const structuredActivity = validDate(item.latestActivityAt);
  const effectiveActivity = [structuredActivity, signals.latestEntryAt].filter(Boolean).sort((a, b) => b - a)[0] || created;
  const ageDays = daysSince(created, now);
  const inactiveDays = daysSince(effectiveActivity, now);
  const total = Math.max(0, Number(item.total) || 0);
  let score = item.kind === 'pending_quote' ? 35 : 30;
  if (ageDays >= 14) score += 24; else if (ageDays >= 7) score += 17; else if (ageDays >= 3) score += 9;
  if (inactiveDays >= 7) score += 20; else if (inactiveDays >= 3) score += 11;
  if (total >= 2000) score += 18; else if (total >= 1000) score += 12; else if (total >= 500) score += 6;
  if (signals.interested) score += 18;
  if (signals.attempted && inactiveDays >= 2) score += 7;
  if (signals.waiting && !signals.explicitDate) score -= 12;

  let priority = score >= 80 ? 'urgent' : score >= 60 ? 'high' : score >= 40 ? 'medium' : 'low';
  let reasonCode = 'score_based';
  let recommendedDate = signals.today;
  if (signals.explicitDate && compareIsoDays(signals.explicitDate, signals.today) > 0) {
    priority = 'upcoming'; reasonCode = 'explicit_future_date'; recommendedDate = signals.explicitDate;
  } else if (signals.explicitDate) {
    priority = 'urgent'; reasonCode = 'follow_up_due'; recommendedDate = signals.today;
  } else if (signals.declined) {
    priority = 'low'; reasonCode = 'customer_declined'; recommendedDate = '';
  } else if (signals.waiting) {
    priority = 'low'; reasonCode = 'waiting_on_customer'; recommendedDate = '';
  } else if (signals.interested) {
    priority = 'urgent'; reasonCode = 'ready_to_book'; recommendedDate = signals.today;
  } else if (signals.attempted) {
    priority = inactiveDays >= 2 ? 'high' : 'medium'; reasonCode = 'contact_attempted'; recommendedDate = addBusinessDays(signals.today, inactiveDays >= 2 ? 1 : 2);
  } else if (priority === 'urgent') reasonCode = 'aged_high_value';
  else if (priority === 'high') reasonCode = 'follow_up_due_soon';
  else if (priority === 'medium') reasonCode = 'follow_up_this_week';
  else reasonCode = 'no_immediate_signal';
  const kindLabel = item.kind === 'pending_quote' ? 'pending quote' : 'unscheduled job';
  const noteReason = signals.excerpt ? ` Notes reviewed: “${signals.excerpt}”.` : ' No existing note was found.';
  const reason = `${ageDays}-day-old ${kindLabel}${total ? ` worth $${total.toFixed(0)}` : ''}; latest note/activity is ${inactiveDays} day${inactiveDays === 1 ? '' : 's'} old.${noteReason}`;
  let action = item.kind === 'pending_quote' ? 'Call to confirm the quoted scope and ask to book a date.' : 'Contact the customer and offer suitable booking dates.';
  if (reasonCode === 'explicit_future_date') action = `Wait until ${dateFromIsoDay(signals.explicitDate).toLocaleDateString('en-AU', { timeZone:'Australia/Melbourne' })} and follow up as requested in the latest note.`;
  else if (reasonCode === 'follow_up_due') action = 'Follow up today because the date requested in the latest note is due or overdue.';
  else if (signals.declined) action = 'Review whether this record should remain active before making further contact.';
  else if (signals.waiting) action = 'Review the waiting condition in the notes before contacting the customer again.';
  else if (signals.interested) action = 'Contact the customer promptly—the latest note indicates buying or booking intent.';
  else if (signals.attempted) action = 'Make the next contact attempt and record the outcome as a new timestamped note.';
  return { priority, score, reasonCode, reason, recommendedAction:action, recommendedDate, noteExcerpt:signals.excerpt, effectiveActivityAt:effectiveActivity?.toISOString() || '' };
}

function parseJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

const SYSTEM = `You explain sales and booking follow-ups for SS Exterior Services in Victoria, Australia.

The application's fixed business rules have already assigned each priority. Do not classify, rank, or change priority. Read the newest timestamped note first; it supersedes conflicting older notes. Use the supplied baseline reason code, note excerpt, dates, age, and value to explain the situation and recommend the next concrete action. Treat dates as Australian day/month/year and operate in the Australia/Melbourne timezone.

Return strict JSON only: {"priorities":[{"id":"exact supplied id","reason":"one concise sentence explicitly referencing the newest relevant note when one exists","recommendedAction":"one specific next action"}]}.

Return exactly one result for every supplied item. Never invent facts or urgency labels.`;

async function analyseBatch(batch, fallbacks, apiKey, now, signal) {
  const input = batch.map(item => ({ ...item, baseline:fallbacks[item.id] }));
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
    body:JSON.stringify({ model:MODEL, max_tokens:2200, temperature:0, system:SYSTEM, messages:[{ role:'user', content:JSON.stringify({ today:localIso(now), timezone:'Australia/Melbourne', items:input }) }] }),
    signal
  });
  if (!response.ok) throw new Error(`Anthropic ${response.status}`);
  const data = await response.json();
  const parsed = parseJson(data.content?.find(block => block.type === 'text')?.text);
  if (!Array.isArray(parsed?.priorities)) throw new Error('Invalid AI priority JSON');
  return parsed.priorities;
}

function mergedResult(item, fallback, ai) {
  return {
    id:item.id,
    priority:fallback.priority,
    score:fallback.score,
    reasonCode:fallback.reasonCode,
    reason:clean(ai?.reason, 420) || fallback.reason,
    recommendedAction:clean(ai?.recommendedAction, 420) || fallback.recommendedAction,
    recommendedDate:fallback.recommendedDate,
    noteExcerpt:fallback.noteExcerpt,
    effectiveActivityAt:fallback.effectiveActivityAt
  };
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });
  const clientKey = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const rateNow = Date.now();
  const currentRate = rateLimit.get(clientKey);
  if (!currentRate || rateNow - currentRate.startedAt >= 60000) rateLimit.set(clientKey, { startedAt:rateNow, count:1 });
  else if (++currentRate.count > 20) return res.status(429).json({ error:'Too many priority refreshes. Please wait a minute.' });

  const now = new Date();
  const rawItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 100) : [];
  const items = rawItems.map(raw => ({
    id:clean(raw.id, 180), kind:['pending_quote', 'unscheduled_job'].includes(raw.kind) ? raw.kind : 'unscheduled_job',
    clientName:clean(raw.clientName, 160), services:Array.isArray(raw.services) ? raw.services.slice(0, 12).map(value => clean(value, 180)).filter(Boolean) : [],
    total:Number(raw.total) || 0, createdAt:clean(raw.createdAt, 80), recordDate:clean(raw.recordDate, 80), latestActivityAt:clean(raw.latestActivityAt, 80),
    legacyNotes:clean(raw.legacyNotes, 2400),
    noteEntries:Array.isArray(raw.noteEntries) ? raw.noteEntries.slice(0, 20).map(note => ({ at:clean(note.at, 80), body:clean(note.body, 900), author:clean(note.author, 100) })) : []
  })).filter(item => item.id && item.clientName);
  const fallbacks = Object.fromEntries(items.map(item => [item.id, baseline(item, now)]));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!items.length || !apiKey) return res.status(200).json({ generatedAt:now.toISOString(), source:'note-aware rules', priorities:items.map(item => mergedResult(item, fallbacks[item.id])) });

  const batches = [];
  for (let index = 0; index < items.length; index += BATCH_SIZE) batches.push(items.slice(index, index + BATCH_SIZE));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const settled = await Promise.allSettled(batches.map(batch => analyseBatch(batch, fallbacks, apiKey, now, controller.signal)));
    const aiById = new Map();
    let successfulBatches = 0;
    settled.forEach(result => {
      if (result.status === 'fulfilled') { successfulBatches++; result.value.forEach(row => aiById.set(String(row.id), row)); }
    });
    const source = successfulBatches === batches.length ? 'ai' : successfulBatches ? 'hybrid' : 'note-aware rules';
    const failedCount = batches.length - successfulBatches;
    const warning = failedCount ? `${failedCount} AI batch${failedCount === 1 ? '' : 'es'} used note-aware fallback.` : undefined;
    const priorities = items.map(item => mergedResult(item, fallbacks[item.id], aiById.get(item.id)));
    const priorityCounts = priorities.reduce((counts, row) => ({ ...counts, [row.priority]:(counts[row.priority] || 0) + 1 }), {});
    const reasonCounts = priorities.reduce((counts, row) => ({ ...counts, [row.reasonCode]:(counts[row.reasonCode] || 0) + 1 }), {});
    console.log(JSON.stringify({ level:'info', route:'/api/follow-up-priority', items:items.length, batches:batches.length, successfulBatches, source, priorityCounts, reasonCounts, ms:Date.now() - startedAt }));
    return res.status(200).json({ generatedAt:now.toISOString(), source, warning, priorities });
  } catch (error) {
    console.error(JSON.stringify({ level:'error', route:'/api/follow-up-priority', error:error.message, items:items.length, ms:Date.now() - startedAt }));
    return res.status(200).json({ generatedAt:now.toISOString(), source:'note-aware rules', warning:'AI analysis was unavailable; note-aware priorities are shown.', priorities:items.map(item => mergedResult(item, fallbacks[item.id])) });
  } finally {
    clearTimeout(timeout);
  }
};
