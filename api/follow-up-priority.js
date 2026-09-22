const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const TIMEOUT_MS = 24000;
const BATCH_SIZE = 12;
const PRIORITIES = new Set(['urgent', 'high', 'medium', 'low', 'upcoming']);
const rateLimit = new Map();

function clean(value, max = 1200) {
  return String(value || '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseAustralianDates(text, now) {
  const dates = [];
  const source = String(text || '');
  for (const match of source.matchAll(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/g)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = match[3] ? Number(match[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    const date = new Date(year, month - 1, day, 12);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) dates.push({ date, raw:match[0], index:match.index });
  }
  for (const match of source.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    if (!Number.isNaN(date.getTime())) dates.push({ date, raw:match[0], index:match.index });
  }
  return dates;
}

function noteSignals(item, now) {
  const text = [item.legacyNotes, ...(item.noteEntries || []).map(note => `${note.at || ''} ${note.body || ''}`)].filter(Boolean).join(' | ');
  const lower = text.toLowerCase();
  const dates = parseAustralianDates(text, now);
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const latestPast = dates.filter(entry => entry.date <= endToday).sort((a, b) => b.date - a.date)[0]?.date || null;
  const futureEntries = dates.filter(entry => entry.date > endToday).filter(entry => {
    const nearby = lower.slice(Math.max(0, entry.index - 55), entry.index + entry.raw.length + 55);
    return /follow|call|contact|after|until|wait|check|book|available|back/.test(nearby);
  }).sort((a, b) => a.date - b.date);
  const nextDate = futureEntries[0]?.date || null;
  const waiting = /\b(wait(?:ing)?|hold off|not yet|after (?:the|their)|when (?:the|they)|will (?:call|get) back|trees? (?:are|have been)|not ready)\b/.test(lower);
  const interested = /\b(ready|keen|interested|go ahead|proceed|book(?:ing)?|accept(?:ed)?|approved)\b/.test(lower);
  const attempted = /\b(voicemail|no answer|left (?:a )?message|text(?:ed| sent)|email(?:ed| sent)|called)\b/.test(lower);
  const excerpt = clean(text.replace(/---[^-]+---/g, ''), 180);
  return { latestPast, nextDate, waiting, interested, attempted, excerpt };
}

function daysSince(value, now) {
  const date = value instanceof Date ? value : validDate(value);
  return date ? Math.max(0, Math.floor((now - date) / 86400000)) : 0;
}

function baseline(item, now) {
  const signals = noteSignals(item, now);
  const created = validDate(item.createdAt || item.recordDate);
  const structuredActivity = validDate(item.latestActivityAt);
  const effectiveActivity = [structuredActivity, signals.latestPast].filter(Boolean).sort((a, b) => b - a)[0] || created;
  const ageDays = daysSince(created, now);
  const inactiveDays = daysSince(effectiveActivity, now);
  const total = Math.max(0, Number(item.total) || 0);
  let score = item.kind === 'pending_quote' ? 35 : 30;
  if (ageDays >= 14) score += 24; else if (ageDays >= 7) score += 17; else if (ageDays >= 3) score += 9;
  if (inactiveDays >= 7) score += 20; else if (inactiveDays >= 3) score += 11;
  if (total >= 2000) score += 18; else if (total >= 1000) score += 12; else if (total >= 500) score += 6;
  if (signals.interested) score += 18;
  if (signals.attempted && inactiveDays >= 2) score += 7;
  if (signals.waiting && !signals.nextDate) score -= 12;

  let priority = score >= 80 ? 'urgent' : score >= 60 ? 'high' : score >= 40 ? 'medium' : 'low';
  let recommendedDate = localIso(now);
  if (signals.nextDate) { priority = 'upcoming'; recommendedDate = localIso(signals.nextDate); }
  const kindLabel = item.kind === 'pending_quote' ? 'pending quote' : 'unscheduled job';
  const noteReason = signals.excerpt ? ` Notes reviewed: “${signals.excerpt}”.` : ' No existing note was found.';
  const reason = `${ageDays}-day-old ${kindLabel}${total ? ` worth $${total.toFixed(0)}` : ''}; latest note/activity is ${inactiveDays} day${inactiveDays === 1 ? '' : 's'} old.${noteReason}`;
  let action = item.kind === 'pending_quote' ? 'Call to confirm the quoted scope and ask to book a date.' : 'Contact the customer and offer suitable booking dates.';
  if (signals.nextDate) action = `Wait until ${signals.nextDate.toLocaleDateString('en-AU')} and follow up as requested in the notes.`;
  else if (signals.interested) action = 'Contact the customer promptly—the notes indicate buying or booking intent.';
  else if (signals.attempted) action = 'Make the next contact attempt and record the outcome as a new timestamped note.';
  else if (signals.waiting) action = 'Review the waiting condition in the notes before contacting the customer again.';
  return { priority, score, reason, recommendedAction:action, recommendedDate, noteExcerpt:signals.excerpt, effectiveActivityAt:effectiveActivity?.toISOString() || '' };
}

function parseJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

const SYSTEM = `You prioritise sales and booking follow-ups for SS Exterior Services in Victoria, Australia.

The notes are the most important context. Read every legacy note and timestamped note entry before ranking. Treat dates in free text as Australian day/month/year. Respect instructions such as "call after", "waiting until", "will call us back", or a future follow-up date. A recent voicemail still needs another attempt; an interested or ready customer should rise in priority. Use age and value only after note meaning.

Return strict JSON only: {"priorities":[{"id":"exact supplied id","priority":"urgent|high|medium|low|upcoming","reason":"one concise sentence explicitly referencing the relevant note when one exists","recommendedAction":"one specific next action","recommendedDate":"YYYY-MM-DD or empty string"}]}.

Return exactly one result for every supplied item. Urgent means action today. High means 1-2 business days. Medium means this week. Low means no immediate signal. Upcoming means an explicit future contact date has not arrived. Never invent facts.`;

async function analyseBatch(batch, fallbacks, apiKey, now, signal) {
  const input = batch.map(item => ({ ...item, baseline:fallbacks[item.id] }));
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
    body:JSON.stringify({ model:MODEL, max_tokens:2200, system:SYSTEM, messages:[{ role:'user', content:JSON.stringify({ today:localIso(now), items:input }) }] }),
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
    priority:PRIORITIES.has(ai?.priority) ? ai.priority : fallback.priority,
    score:fallback.score,
    reason:clean(ai?.reason, 420) || fallback.reason,
    recommendedAction:clean(ai?.recommendedAction, 420) || fallback.recommendedAction,
    recommendedDate:/^\d{4}-\d{2}-\d{2}$/.test(ai?.recommendedDate || '') ? ai.recommendedDate : fallback.recommendedDate,
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
    console.log(JSON.stringify({ level:'info', route:'/api/follow-up-priority', items:items.length, batches:batches.length, successfulBatches, source, ms:Date.now() - startedAt }));
    return res.status(200).json({ generatedAt:now.toISOString(), source, warning, priorities:items.map(item => mergedResult(item, fallbacks[item.id], aiById.get(item.id))) });
  } catch (error) {
    console.error(JSON.stringify({ level:'error', route:'/api/follow-up-priority', error:error.message, items:items.length, ms:Date.now() - startedAt }));
    return res.status(200).json({ generatedAt:now.toISOString(), source:'note-aware rules', warning:'AI analysis was unavailable; note-aware priorities are shown.', priorities:items.map(item => mergedResult(item, fallbacks[item.id])) });
  } finally {
    clearTimeout(timeout);
  }
};
