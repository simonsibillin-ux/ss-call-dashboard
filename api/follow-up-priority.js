const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const TIMEOUT_MS = 35000;
const BATCH_SIZE = 12;
const DAILY_QUEUE_LIMIT = 10;
const rateLimit = new Map();

const CONTACT_ATTEMPT_OUTCOMES = new Set(['voicemail_left', 'sms_sent', 'email_sent', 'no_answer']);
const OUTCOME_LABELS = {
  voicemail_left:'the voicemail', sms_sent:'the SMS', email_sent:'the email', no_answer:'the unanswered call',
  spoke_thinking:'the customer is still deciding', ready_to_book:'the customer is ready to book',
  call_on_date:'the customer requested a future follow-up', customer_will_contact:'the customer will initiate contact',
  owner_handling:'the owner is handling the next step', declined:'the customer declined', do_not_contact:'the customer must not be contacted'
};

// Statewide Victorian holidays for the current planning horizon. One-off dates
// (including future AFL Grand Final Fridays) can be extended without a deploy.
const DEFAULT_VICTORIA_PUBLIC_HOLIDAYS = [
  '2026-01-01','2026-01-26','2026-03-09','2026-04-03','2026-04-04','2026-04-05','2026-04-06','2026-04-25','2026-06-08','2026-09-25','2026-11-03','2026-12-25','2026-12-28',
  '2027-01-01','2027-01-26','2027-03-08','2027-03-26','2027-03-27','2027-03-28','2027-03-29','2027-04-25','2027-06-14','2027-11-02','2027-12-27','2027-12-28'
];
const VICTORIA_PUBLIC_HOLIDAYS = new Set([...DEFAULT_VICTORIA_PUBLIC_HOLIDAYS, ...String(process.env.VICTORIA_PUBLIC_HOLIDAYS || '').split(',').map(value => value.trim()).filter(Boolean)]);

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
    const candidate = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    if (day !== 0 && day !== 6 && !VICTORIA_PUBLIC_HOLIDAYS.has(candidate)) remaining--;
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

const MONTHS = { january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };
const MONTH_PATTERN = Object.keys(MONTHS).join('|');

function isoDay(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseAustralianDates(text, now) {
  const dates = [];
  const source = String(text || '');
  for (const match of source.matchAll(/\b(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?\b/g)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = match[3] ? Number(match[3]) : Number(localIso(now).slice(0, 4));
    if (year < 100) year += 2000;
    const iso = isoDay(year, month, day);
    if (iso) dates.push({ date:dateFromIsoDay(iso), iso, raw:match[0], index:match.index, precision:'exact' });
  }
  for (const match of source.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    const iso = `${match[1]}-${match[2]}-${match[3]}`;
    const date = dateFromIsoDay(iso);
    if (date) dates.push({ date, iso, raw:match[0], index:match.index, precision:'exact' });
  }
  return dates;
}

function actionCueBefore(text, index) {
  const before = text.slice(Math.max(0, index - 70), index);
  return /(?:follow\s*up|recontact|contact|call(?:\s+(?:us\s+)?)?back|call\s+again|check\s+back|wait(?:ing)?\s+until|due(?:\s+(?:on|around|by))?|after)\s*(?:for|in|on|around|at|by|the|until|after|-|:)*\s*$/i.test(before);
}

function naturalActionDates(text, now) {
  const lower = String(text || '').toLowerCase();
  const today = localIso(now);
  const [currentYear, currentMonth] = today.split('-').map(Number);
  const found = [];
  const pushMonth = (monthName, day, index, raw, precision = 'window') => {
    const month = MONTHS[monthName];
    if (!month) return;
    let year = currentYear;
    if (month < currentMonth && currentMonth - month > 6) year++;
    const iso = isoDay(year, month, day);
    if (iso) found.push({ iso, index, raw, precision });
  };

  const ordinal = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:next\\s+month\\s*\\(\\s*)?(${MONTH_PATTERN})\\s*\\)?`, 'g');
  for (const match of lower.matchAll(ordinal)) {
    const before = lower.slice(Math.max(0, match.index - 70), match.index);
    if (actionCueBefore(lower, match.index) || /will\s+call|due|follow\s*up|recontact/.test(before)) pushMonth(match[2], Number(match[1]), match.index, match[0], 'exact');
  }

  const qualified = new RegExp(`\\b(start|beginning|mid|middle|late|end)(?:\\s+of)?\\s+(${MONTH_PATTERN})\\b`, 'g');
  for (const match of lower.matchAll(qualified)) {
    const before = lower.slice(Math.max(0, match.index - 70), match.index);
    if (!/(?:follow\s*up|recontact|contact|call|due|wait)/.test(before)) continue;
    pushMonth(match[2], /start|beginning/.test(match[1]) ? 1 : /mid|middle/.test(match[1]) ? 15 : 25, match.index, match[0]);
  }

  const named = new RegExp(`\\b(${MONTH_PATTERN})\\b`, 'g');
  for (const match of lower.matchAll(named)) {
    if (!actionCueBefore(lower, match.index)) continue;
    pushMonth(match[1], 1, match.index, match[0]);
  }

  const seasonMonths = { summer:[12,1,2], autumn:[3,4,5], winter:[6,7,8], spring:[9,10,11] };
  const compoundSpringSummer = /\bspring\s*\/\s*summer\b/.exec(lower);
  if (compoundSpringSummer) {
    const before = lower.slice(Math.max(0, compoundSpringSummer.index - 70), compoundSpringSummer.index);
    if (/(?:follow\s*up|recontact|contact|call|due|quote|around|in)\b/.test(before)) {
      if ([9,10,11,12,1,2].includes(currentMonth)) found.push({ iso:today, index:compoundSpringSummer.index, raw:compoundSpringSummer[0], precision:'window' });
      else found.push({ iso:isoDay(currentYear, 9, 1), index:compoundSpringSummer.index, raw:compoundSpringSummer[0], precision:'window' });
    }
  }
  for (const [season, months] of Object.entries(seasonMonths)) {
    if (compoundSpringSummer && (season === 'spring' || season === 'summer')) continue;
    const seasonMatch = new RegExp(`\\b${season}\\b`).exec(lower);
    if (!seasonMatch) continue;
    const before = lower.slice(Math.max(0, seasonMatch.index - 70), seasonMatch.index);
    if (!/(?:follow\s*up|recontact|contact|call|due|quote|around|in)\b/.test(before)) continue;
    if (months.includes(currentMonth)) found.push({ iso:today, index:seasonMatch.index, raw:season, precision:'window' });
    else {
      const startMonth = months[0];
      const year = startMonth < currentMonth ? currentYear + 1 : currentYear;
      found.push({ iso:isoDay(year, startMonth, 1), index:seasonMatch.index, raw:season, precision:'window' });
    }
  }
  return found;
}

function noteSignals(item, now) {
  const entries = [...(item.noteEntries || [])].filter(note => clean(note.body)).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const latestEntry = entries[0] || null;
  const text = clean(latestEntry?.body || item.legacyNotes, 2400);
  const lower = text.toLowerCase();
  const dates = parseAustralianDates(text, now);
  const today = localIso(now);
  const relativeActionDates = [];
  if (/\b(?:follow\s*up|contact|call)\b.{0,30}\btoday\b|\btoday\b.{0,30}\b(?:follow\s*up|contact|call)\b/.test(lower)) {
    relativeActionDates.push({ iso:today, index:0, raw:'today', precision:'exact' });
  } else if (/\b(?:follow\s*up|contact|call)\b.{0,30}\btomorrow\b|\btomorrow\b.{0,30}\b(?:follow\s*up|contact|call)\b/.test(lower)) {
    relativeActionDates.push({ iso:addBusinessDays(today, 1), index:0, raw:'tomorrow', precision:'exact' });
  }
  const actionDates = [...relativeActionDates, ...dates.filter(entry => actionCueBefore(lower, entry.index)), ...naturalActionDates(lower, now)];
  const futureAction = actionDates.filter(entry => compareIsoDays(entry.iso, today) > 0).sort((a, b) => a.iso.localeCompare(b.iso))[0];
  const dueAction = actionDates.filter(entry => compareIsoDays(entry.iso, today) <= 0).sort((a, b) => b.iso.localeCompare(a.iso))[0];
  const selectedActionDate = futureAction || dueAction;
  const explicitDate = selectedActionDate?.iso || '';
  const explicitDatePrecision = selectedActionDate?.precision || 'exact';
  const outcomeCode = clean(latestEntry?.outcomeCode, 40);
  const structuredNextDate = /^\d{4}-\d{2}-\d{2}$/.test(String(latestEntry?.nextContactDate || '')) ? latestEntry.nextContactDate : '';
  const doNotFollow = outcomeCode === 'do_not_contact' || /\b(?:do not|don't)\s+(?:follow\s*up|contact|call)|\bno\s+(?:further\s+)?follow\s*up\b/.test(lower);
  const customerWillInitiate = outcomeCode === 'customer_will_contact' || /\bwill\s+(?:reach out|get back|call (?:us )?back)\b/.test(lower);
  const ownerHandling = outcomeCode === 'owner_handling' || /\b(?:simon|owner)\s+(?:will|to)\s+(?:handle|address|follow\s*up)\b/.test(lower);
  const decisionPending = outcomeCode === 'spoke_thinking' || /\b(?:needs? to (?:speak|check|ask|think|discuss)|will (?:talk|speak) to|follow\s*up\s+(?:to|and)\s+(?:confirm|check|see)|follow\s*up\s+(?:needed|required))\b/.test(lower);
  const waiting = /\b(wait(?:ing)?|hold off|put off|not yet|after (?:the|their)|when (?:the|they)|will (?:call (?:us )?|get )back|will reach out|trees? (?:are|have been)|not ready)\b/.test(lower);
  const interested = outcomeCode === 'ready_to_book' || /\b(?:customer|client|he|she|they)\s+(?:is\s+)?(?:ready|keen|interested)\b|\b(?:wants?|would like|keen|happy)\s+to\s+(?:go ahead|proceed|book)\b|\b(?:agreed|confirmed)\s+to\s+(?:proceed|book)\b/.test(lower);
  // "Called" alone is intentionally not an unsuccessful attempt: it can also mean the customer called ready to proceed.
  const attempted = CONTACT_ATTEMPT_OUTCOMES.has(outcomeCode) || /\b(voicemail|voice\s*message|no answer|left (?:a )?message|text(?:ed| message)?(?: sent| left)?|sms(?: sent| left| follow.?up)|email(?:ed| sent)|messenger (?:message|follow.?up)|message sent (?:on|via) messenger)\b/.test(lower);
  const declined = outcomeCode === 'declined' || /\b(declin(?:e|ed|ing)|not interested|does not want|doesn't want|cancel(?:led)?|do not contact)\b/.test(lower);
  const consecutiveAttempts = entries.findIndex(entry => !CONTACT_ATTEMPT_OUTCOMES.has(clean(entry.outcomeCode, 40)));
  const attemptCount = outcomeCode && CONTACT_ATTEMPT_OUTCOMES.has(outcomeCode)
    ? (consecutiveAttempts < 0 ? entries.length : consecutiveAttempts)
    : (attempted ? 1 : 0);
  const excerpt = clean(text.replace(/---[^-]+---/g, ''), 180);
  return { explicitDate:structuredNextDate || explicitDate, explicitDatePrecision:structuredNextDate ? 'exact' : explicitDatePrecision,
    outcomeCode, doNotFollow, ownerHandling, customerWillInitiate, decisionPending, waiting, interested, attempted, declined, attemptCount,
    excerpt, latestEntryAt:validDate(latestEntry?.at), today };
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
  // Value ranks work inside the same timing band; it never makes a follow-up urgent.
  let score = Math.min(100, (item.kind === 'pending_quote' ? 25 : 20) + Math.min(ageDays, 30) + Math.min(inactiveDays, 20)
    + (total >= 2000 ? 20 : total >= 1000 ? 12 : total >= 500 ? 6 : 0));
  let priority = 'medium';
  let reasonCode = 'standard_follow_up';
  let recommendedDate = addBusinessDays(signals.today, 5);
  let action = item.kind === 'pending_quote' ? 'Call to confirm the quoted scope and ask whether the customer would like to book.' : 'Contact the customer and offer suitable booking dates.';
  if (signals.doNotFollow) {
    priority = 'low'; reasonCode = 'do_not_follow'; recommendedDate = '';
  } else if (signals.declined) {
    priority = 'low'; reasonCode = 'customer_declined'; recommendedDate = '';
  } else if (signals.ownerHandling) {
    priority = 'owner'; reasonCode = 'owner_handling'; recommendedDate = '';
  } else if (signals.explicitDate && compareIsoDays(signals.explicitDate, signals.today) > 0) {
    priority = 'upcoming'; reasonCode = 'explicit_future_date'; recommendedDate = signals.explicitDate;
  } else if (signals.explicitDate && signals.explicitDatePrecision === 'window') {
    priority = 'high'; reasonCode = 'follow_up_window_open'; recommendedDate = signals.today;
  } else if (signals.explicitDate) {
    priority = 'urgent'; reasonCode = 'follow_up_due'; recommendedDate = signals.today;
  } else if (signals.customerWillInitiate) {
    priority = 'low'; reasonCode = 'customer_will_initiate'; recommendedDate = '';
  } else if (signals.decisionPending) {
    priority = inactiveDays >= 5 ? 'high' : 'medium';
    reasonCode = inactiveDays >= 5 ? 'decision_follow_up_due' : 'decision_pending';
    recommendedDate = inactiveDays >= 5 ? addBusinessDays(signals.today, 2) : addBusinessDays(signals.today, 5);
  } else if (signals.waiting) {
    priority = 'low'; reasonCode = 'waiting_on_customer'; recommendedDate = '';
  } else if (signals.interested) {
    priority = 'urgent'; reasonCode = 'ready_to_book'; recommendedDate = signals.today;
  } else if (signals.attempted) {
    if (signals.attemptCount >= 3) {
      priority = 'low'; reasonCode = 'attempt_limit_reached'; recommendedDate = addBusinessDays(signals.today, 10);
    } else if (inactiveDays >= 2) {
      priority = 'high'; reasonCode = 'contact_attempt_due'; recommendedDate = addBusinessDays(signals.today, 2);
    } else {
      priority = 'medium'; reasonCode = 'contact_cooldown'; recommendedDate = addBusinessDays(localIso(effectiveActivity || now), 2);
    }
  } else if (ageDays >= 10 || inactiveDays >= 7) {
    priority = 'high'; reasonCode = 'follow_up_due_soon'; recommendedDate = addBusinessDays(signals.today, 2);
  }
  const kindLabel = item.kind === 'pending_quote' ? 'pending quote' : 'unscheduled job';
  const noteReason = signals.excerpt ? ` Notes reviewed: “${signals.excerpt}”.` : ' No existing note was found.';
  const reason = `${ageDays}-day-old ${kindLabel}${total ? ` worth $${total.toFixed(0)}` : ''}; latest note/activity is ${inactiveDays} day${inactiveDays === 1 ? '' : 's'} old.${noteReason}`;
  if (reasonCode === 'explicit_future_date') action = `Wait until ${dateFromIsoDay(signals.explicitDate).toLocaleDateString('en-AU', { timeZone:'Australia/Melbourne' })} and follow up as requested in the latest note.`;
  else if (reasonCode === 'follow_up_window_open') action = 'Follow up during the current timing window described in the latest note.';
  else if (reasonCode === 'follow_up_due') action = 'Follow up today because the date requested in the latest note is due or overdue.';
  else if (signals.doNotFollow) action = 'Do not contact the customer; keep the record suppressed unless a newer note changes this instruction.';
  else if (signals.declined) action = 'Review whether this record should remain active before making further contact.';
  else if (signals.ownerHandling) action = 'Leave this record in the owner queue; Simon is handling the next step.';
  else if (signals.customerWillInitiate) action = 'Wait for the customer to initiate contact and review this record only if a new instruction is added.';
  else if (signals.decisionPending) action = inactiveDays >= 7 ? 'Follow up on the customer’s pending decision and record the outcome.' : 'Allow the customer time to make the decision, then follow up on the recommended date.';
  else if (signals.waiting) action = 'Review the waiting condition in the notes before contacting the customer again.';
  else if (signals.interested) action = 'Contact the customer promptly—the latest note indicates buying or booking intent.';
  else if (reasonCode === 'attempt_limit_reached') action = 'Pause active chasing after three unsuccessful attempts and review again in 10 business days.';
  else if (reasonCode === 'contact_cooldown') action = `Allow the customer time to respond to ${OUTCOME_LABELS[signals.outcomeCode] || 'the latest contact attempt'} before trying again.`;
  else if (signals.attempted) action = 'Make the next contact attempt within two business days and record the outcome.';
  return { priority, score, opportunityScore:score, reasonCode, reason, recommendedAction:action, recommendedDate,
    attemptCount:signals.attemptCount, outcomeCode:signals.outcomeCode, noteExcerpt:signals.excerpt, effectiveActivityAt:effectiveActivity?.toISOString() || '' };
}

function assignDailyQueue(priorities) {
  const order = { urgent:0, high:1, medium:2, low:3, upcoming:4, owner:5 };
  const eligible = priorities.filter(row => !['low', 'upcoming', 'owner'].includes(row.priority))
    .sort((a, b) => (order[a.priority] - order[b.priority]) || compareIsoDays(a.recommendedDate, b.recommendedDate) || (b.opportunityScore - a.opportunityScore));
  const urgentCount = eligible.filter(row => row.priority === 'urgent').length;
  const queueSize = Math.max(DAILY_QUEUE_LIMIT, urgentCount);
  const positions = new Map(eligible.slice(0, queueSize).map((row, index) => [row.id, index + 1]));
  return priorities.map(row => ({ ...row, inDailyQueue:positions.has(row.id), queuePosition:positions.get(row.id) || null }));
}

function parseJson(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

const SYSTEM = `You explain sales and booking follow-ups for SS Exterior Services in Victoria, Australia.

The application's fixed business rules have already assigned each priority. Do not classify, rank, or change priority. Read the newest timestamped note first; it supersedes conflicting older notes. Use the supplied baseline reason code, note excerpt, dates, age, and value to explain the situation and recommend the next concrete action. Treat dates as Australian day/month/year and operate in the Australia/Melbourne timezone.

Return strict JSON only: {"priorities":[{"id":"exact supplied id","reason":"one concise sentence explicitly referencing the newest relevant note when one exists","recommendedAction":"one specific next action","timingAssessment":"now|soon|wait|no_contact"}]}.

Return exactly one result for every supplied item. Set timingAssessment to now for action today; soon for any dated action within this week (including a short response cooldown); wait only for a date beyond this week or customer-led contact; and no_contact for an explicit instruction not to contact. Never invent facts or urgency labels.`;

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

function timingConflict(priority, timing, reasonCode = '') {
  if (!timing) return false;
  if (priority === 'urgent') return timing === 'wait' || timing === 'no_contact';
  if (priority === 'medium' && reasonCode === 'decision_pending') return timing === 'no_contact';
  if (priority === 'high' || priority === 'medium') return timing === 'wait' || timing === 'no_contact';
  if (priority === 'upcoming') return timing === 'now' || timing === 'no_contact';
  if (priority === 'owner') return timing === 'now' || timing === 'soon';
  if (priority === 'low') return timing === 'now' || timing === 'soon';
  return false;
}

function deterministicTiming(fallback) {
  if (fallback.priority === 'urgent') return 'now';
  if (fallback.priority === 'high') return fallback.recommendedDate === localIso(new Date()) ? 'now' : 'soon';
  if (fallback.priority === 'medium') return 'soon';
  if (fallback.priority === 'upcoming') return 'wait';
  if (fallback.priority === 'owner') return 'wait';
  if (['do_not_follow', 'customer_declined'].includes(fallback.reasonCode)) return 'no_contact';
  return 'wait';
}

function mergedResult(item, fallback, ai) {
  const aiTimingAssessment = ['now', 'soon', 'wait', 'no_contact'].includes(ai?.timingAssessment) ? ai.timingAssessment : '';
  const timingAssessment = deterministicTiming(fallback);
  const priorityConflict = timingConflict(fallback.priority, aiTimingAssessment, fallback.reasonCode);
  return {
    id:item.id,
    priority:fallback.priority,
    score:fallback.score,
    reasonCode:fallback.reasonCode,
    reason:priorityConflict ? fallback.reason : clean(ai?.reason, 420) || fallback.reason,
    // Operational advice is deliberately deterministic; AI may explain but never redirect the rep.
    recommendedAction:fallback.recommendedAction,
    recommendedDate:fallback.recommendedDate,
    timingAssessment,
    aiTimingAssessment,
    priorityConflict,
    priorityConflictMessage:priorityConflict ? 'The AI interpretation disagreed with the business timing rule, so the deterministic recommendation is shown.' : '',
    noteExcerpt:fallback.noteExcerpt,
    effectiveActivityAt:fallback.effectiveActivityAt,
    opportunityScore:fallback.opportunityScore,
    attemptCount:fallback.attemptCount,
    outcomeCode:fallback.outcomeCode
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
    noteEntries:Array.isArray(raw.noteEntries) ? raw.noteEntries.slice(0, 20).map(note => ({ at:clean(note.at, 80), body:clean(note.body, 900), author:clean(note.author, 100),
      outcomeCode:clean(note.outcomeCode, 40), nextContactDate:clean(note.nextContactDate, 20) })) : []
  })).filter(item => item.id && item.clientName);
  const fallbacks = Object.fromEntries(items.map(item => [item.id, baseline(item, now)]));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!items.length || !apiKey) return res.status(200).json({ generatedAt:now.toISOString(), source:'note-aware rules', dailyQueueLimit:DAILY_QUEUE_LIMIT, priorities:assignDailyQueue(items.map(item => mergedResult(item, fallbacks[item.id]))) });

  const batches = [];
  for (let index = 0; index < items.length; index += BATCH_SIZE) batches.push(items.slice(index, index + BATCH_SIZE));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const settled = await Promise.allSettled(batches.map(batch => analyseBatch(batch, fallbacks, apiKey, now, controller.signal)));
    const retryIndexes = settled.map((result, index) => result.status === 'rejected' ? index : -1).filter(index => index >= 0);
    if (retryIndexes.length && !controller.signal.aborted) {
      const retries = await Promise.allSettled(retryIndexes.map(index => analyseBatch(batches[index], fallbacks, apiKey, now, controller.signal)));
      retries.forEach((result, retryIndex) => { if (result.status === 'fulfilled') settled[retryIndexes[retryIndex]] = result; });
    }
    const aiById = new Map();
    let successfulBatches = 0;
    settled.forEach(result => {
      if (result.status === 'fulfilled') { successfulBatches++; result.value.forEach(row => aiById.set(String(row.id), row)); }
    });
    const source = successfulBatches === batches.length ? 'ai' : successfulBatches ? 'hybrid' : 'note-aware rules';
    const failedCount = batches.length - successfulBatches;
    const warning = failedCount ? `${failedCount} AI batch${failedCount === 1 ? '' : 'es'} used note-aware fallback.` : undefined;
    const priorities = assignDailyQueue(items.map(item => mergedResult(item, fallbacks[item.id], aiById.get(item.id))));
    const priorityCounts = priorities.reduce((counts, row) => ({ ...counts, [row.priority]:(counts[row.priority] || 0) + 1 }), {});
    const reasonCounts = priorities.reduce((counts, row) => ({ ...counts, [row.reasonCode]:(counts[row.reasonCode] || 0) + 1 }), {});
    const priorityConflicts = priorities.filter(row => row.priorityConflict).length;
    console.log(JSON.stringify({ level:'info', route:'/api/follow-up-priority', items:items.length, batches:batches.length, successfulBatches, source, priorityCounts, reasonCounts, priorityConflicts, ms:Date.now() - startedAt }));
    return res.status(200).json({ generatedAt:now.toISOString(), source, warning, dailyQueueLimit:DAILY_QUEUE_LIMIT, priorities });
  } catch (error) {
    console.error(JSON.stringify({ level:'error', route:'/api/follow-up-priority', error:error.message, items:items.length, ms:Date.now() - startedAt }));
    return res.status(200).json({ generatedAt:now.toISOString(), source:'note-aware rules', warning:'AI analysis was unavailable; note-aware priorities are shown.', dailyQueueLimit:DAILY_QUEUE_LIMIT, priorities:assignDailyQueue(items.map(item => mergedResult(item, fallbacks[item.id]))) });
  } finally {
    clearTimeout(timeout);
  }
};

module.exports._test = { baseline, assignDailyQueue, addBusinessDays, noteSignals, mergedResult, deterministicTiming };
