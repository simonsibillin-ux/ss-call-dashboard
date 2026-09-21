const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const TIMEOUT_MS = 25000;
const PRIORITIES = new Set(['urgent', 'high', 'medium', 'low', 'upcoming']);
const rateLimit = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 20;

function clean(value, max = 1200) {
  return String(value || '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(value, now) {
  const date = validDate(value);
  return date ? Math.max(0, Math.floor((now - date) / 86400000)) : 0;
}

function baseline(item, now) {
  const ageDays = daysSince(item.createdAt || item.recordDate, now);
  const inactiveDays = daysSince(item.latestActivityAt || item.createdAt || item.recordDate, now);
  const total = Math.max(0, Number(item.total) || 0);
  const due = validDate(item.scheduledDate);
  const dueDays = due ? Math.ceil((due - now) / 86400000) : null;
  let score = item.kind === 'pending_quote' ? 35 : item.kind === 'unscheduled_job' ? 30 : 25;

  if (ageDays >= 14) score += 24;
  else if (ageDays >= 7) score += 17;
  else if (ageDays >= 3) score += 9;
  if (inactiveDays >= 7) score += 20;
  else if (inactiveDays >= 3) score += 11;
  if (total >= 2000) score += 18;
  else if (total >= 1000) score += 12;
  else if (total >= 500) score += 6;
  if (dueDays !== null && dueDays < 0) score += Math.min(30, 18 + Math.abs(dueDays) * 2);
  if (dueDays === 0) score += 18;

  let priority = score >= 80 ? 'urgent' : score >= 60 ? 'high' : score >= 40 ? 'medium' : 'low';
  if (dueDays !== null && dueDays > 2) priority = 'upcoming';
  const kindLabel = item.kind === 'pending_quote' ? 'pending quote' : item.kind === 'unscheduled_job' ? 'unscheduled job' : 'scheduled callback';
  const valueText = total ? ` worth $${total.toFixed(0)}` : '';
  const reason = `${ageDays}-day-old ${kindLabel}${valueText}; latest recorded activity was ${inactiveDays} day${inactiveDays === 1 ? '' : 's'} ago.`;
  const action = item.kind === 'pending_quote'
    ? 'Call to confirm the quoted scope, answer objections, and ask to book a date.'
    : item.kind === 'unscheduled_job'
      ? 'Contact the customer and offer the next suitable booking dates.'
      : dueDays !== null && dueDays < 0 ? 'Complete the overdue callback today.' : 'Complete the scheduled callback and record the outcome.';
  return { priority, score, reason, recommendedAction: action, recommendedDate: item.scheduledDate || new Date(now).toISOString().slice(0, 10) };
}

function parseJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientKey = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const rateNow = Date.now();
  const currentRate = rateLimit.get(clientKey);
  if (!currentRate || rateNow - currentRate.startedAt >= RATE_LIMIT_WINDOW_MS) rateLimit.set(clientKey, { startedAt:rateNow, count:1 });
  else if (++currentRate.count > RATE_LIMIT_MAX) return res.status(429).json({ error:'Too many priority refreshes. Please wait a minute.' });

  const now = new Date();
  const rawItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 100) : [];
  const items = rawItems.map(raw => ({
    id: clean(raw.id, 180),
    kind: ['pending_quote', 'unscheduled_job', 'scheduled_followup'].includes(raw.kind) ? raw.kind : 'scheduled_followup',
    clientName: clean(raw.clientName, 160),
    services: Array.isArray(raw.services) ? raw.services.slice(0, 12).map(value => clean(value, 180)).filter(Boolean) : [],
    total: Number(raw.total) || 0,
    createdAt: clean(raw.createdAt, 80),
    recordDate: clean(raw.recordDate, 80),
    scheduledDate: clean(raw.scheduledDate, 80),
    latestActivityAt: clean(raw.latestActivityAt, 80),
    legacyNotes: clean(raw.legacyNotes, 1600),
    noteEntries: Array.isArray(raw.noteEntries) ? raw.noteEntries.slice(0, 12).map(note => ({
      at: clean(note.at, 80), body: clean(note.body, 600), author: clean(note.author, 100)
    })) : []
  })).filter(item => item.id && item.clientName);

  const fallbacks = Object.fromEntries(items.map(item => [item.id, baseline(item, now)]));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!items.length || !apiKey) {
    return res.status(200).json({ generatedAt: now.toISOString(), source: 'rules', priorities: items.map(item => ({ id:item.id, ...fallbacks[item.id] })) });
  }

  const system = `You prioritise sales and booking follow-ups for SS Exterior Services in Victoria, Australia.

Review every supplied pending quote, unscheduled job, and scheduled callback. Use quote/job age, value, explicit promises, scheduled dates, the latest timestamped activity, and the meaning of the notes. Dates may appear inside legacy free-text notes in Australian day/month/year order. A recent "left voicemail" note still needs another attempt, while a recent note explicitly saying to wait until a future date should become upcoming. Never invent customer facts.

Return strict JSON only: {"priorities":[{"id":"exact supplied id","priority":"urgent|high|medium|low|upcoming","reason":"one concise sentence","recommendedAction":"one specific next action","recommendedDate":"YYYY-MM-DD or empty string"}]}.

Return exactly one result for every supplied item. Urgent means action today due to overdue commitment, strong buying signal, or unusually valuable stale opportunity. High means action within 1-2 business days. Medium means this week. Low means no immediate signal. Upcoming means an explicit future contact date has not arrived. The deterministic baseline is guidance, not a command.`;

  const aiInput = items.map(item => ({ ...item, baseline: fallbacks[item.id] }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:MODEL, max_tokens:4000, system, messages:[{ role:'user', content:JSON.stringify({ today:now.toISOString().slice(0, 10), items:aiInput }) }] }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Anthropic ${response.status}`);
    const data = await response.json();
    const parsed = parseJson(data.content?.find(block => block.type === 'text')?.text);
    const aiById = new Map((parsed?.priorities || []).map(row => [String(row.id), row]));
    const priorities = items.map(item => {
      const fallback = fallbacks[item.id];
      const ai = aiById.get(item.id) || {};
      return {
        id: item.id,
        priority: PRIORITIES.has(ai.priority) ? ai.priority : fallback.priority,
        score: fallback.score,
        reason: clean(ai.reason, 320) || fallback.reason,
        recommendedAction: clean(ai.recommendedAction, 360) || fallback.recommendedAction,
        recommendedDate: /^\d{4}-\d{2}-\d{2}$/.test(ai.recommendedDate || '') ? ai.recommendedDate : fallback.recommendedDate
      };
    });
    return res.status(200).json({ generatedAt: now.toISOString(), source:'ai', priorities });
  } catch (error) {
    console.error('[follow-up-priority]', error.message);
    return res.status(200).json({ generatedAt:now.toISOString(), source:'rules', warning:'AI analysis was unavailable; showing rules-based priorities.', priorities:items.map(item => ({ id:item.id, ...fallbacks[item.id] })) });
  } finally {
    clearTimeout(timeout);
  }
};
