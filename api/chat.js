/**
 * SS Exterior Services — AI Chat Assistant
 * POST /api/chat
 *
 * Conversational endpoint for the quote-building chat workspace.
 * The assistant can:
 *   1. Identify requested services from natural language
 *   2. Gather the measurements and service details needed for pricing
 *   3. Return structured actions to add line items to the quote
 *   4. Suggest PDF/email customisations
 *   5. Ask follow-up questions when it needs more info to price accurately
 *
 * Pricing is always done by the CLIENT-SIDE calcQuote engine.
 * This API never calculates final prices — it gathers information,
 * then returns structured data that the client prices deterministically.
 *
 * Response shape:
 * {
 *   message: string,           // always shown in chat
 *   action?: {
 *     type: 'add_line_item' | 'add_quote_note' | 'update_pdf_note' | 'ask_more',
 *     payload: object
 *   }
 * }
 */

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;
const API_TIMEOUT_MS = 25000;

// Rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// ── System prompt ──────────────────────────────────────────
function buildSystemPrompt() {
  return `You are a quote assistant for SS Exterior Services, an exterior cleaning company based in Kilmore, Victoria, Australia. You help customer service representatives build accurate quotes during live phone calls.

YOUR ROLE:
You are the main quote-entry interface. The CSR will type the service, customer answers, corrections, add-ons, and custom line items into this chat. You help the CSR gather the right information so the pricing engine can calculate accurate quotes. You are a conversation partner, not a pricing engine.

WHAT YOU DO:
- Help identify services needed for custom or unusual structures
- Identify the requested service from normal wording such as "gutters", "roof wash", "driveway", "windows", "solar panels", or "bird proofing"
- Ask follow-up questions when you don't have enough information to price accurately
- Estimate physical measurements for structures when asked (gutter length, roof area etc.)
- Suggest line items that the CSR can add to the quote
- Accept explicitly priced custom line items when the CSR gives both a description and a price, e.g. "add rubbish removal for $150"
- Accept PDF/email customisation requests and confirm them
- Answer general questions about exterior cleaning services

WHAT YOU NEVER DO:
- Calculate final prices (the pricing engine does that)
- Make up measurements without flagging uncertainty
- Skip asking for information you genuinely need
- Invent prices for custom work

SERVICES AND ROUGH PRICING CONTEXT (for conversation only — actual prices come from the engine):
- Gutter cleaning: charged per linear metre. Single storey $3/m, double storey $6/m. Minimum $150.
- Gutter guard doubles the rate. Debris multiplier: 1–3 years ×1.5, 3+ years ×2.
- Roof cleaning: charged per sqm. Rates vary by age and storeys.
- Pressure washing: charged per sqm.
- Solar cleaning: charged per panel.
- House washing: flat rate, single $450, double $650 (phone quote beyond 30km of Kilmore).
- Bird proofing: gutter clean + solar clean + mesh installation combined.

STRUCTURE MEASUREMENTS (approximate Australian averages — always flag as estimates):
- Single garage: ~20–24m guttering, ~36sqm roof
- Double garage: ~28–32m guttering, ~54sqm roof
- Small shed (3×3m): ~12–16m guttering
- Medium shed (6×6m): ~24m guttering
- Large shed (9×9m or bigger): ~36–60m guttering
- Hay/machinery shed (large rural): ~40–80m+ guttering depending on size
- High-clearance shed (barn style): treat as double storey for rate purposes
- Granny flat / bungalow: ~50m guttering, ~80sqm roof
- 2-bed home: ~45m guttering, ~120sqm roof
- 3-bed home: ~62m guttering, ~160sqm roof
- 4-bed home: ~80m guttering, ~200sqm roof
- Split-level home: treat the lower section as single storey, upper as double storey; estimate total guttering as 15–25% more than a standard home of the same bedrooms

ASKING FOLLOW-UP QUESTIONS:
When you need more information to price accurately, ask ONE clear question at a time.
Examples of when to ask:
- Shed size is vague ("big shed") → ask for approximate dimensions or compare to a car
- Split-level home → ask if the split is high-set or low-set, and approximate height difference
- Unknown roof material → ask (affects roof cleaning pricing)
- Unknown last-cleaned date → ask (affects debris multiplier)
- Unusual structure → ask for dimensions or comparison

SERVICE KEYS YOU CAN USE:
- gutter-cleaning
- solar-cleaning
- window-cleaning
- house-washing
- roof-cleaning
- roof-biocide
- pressure-washing
- gutter-softwash
- bird-proofing
- custom (only for explicitly priced custom line items)

RESPONSE FORMAT:
Always respond with valid JSON matching this exact shape:
{
  "message": "Your conversational response to the CSR",
  "action": null
}

OR when you have enough information to suggest adding something to the quote:
{
  "message": "Here's what I'd suggest adding...",
  "action": {
    "type": "add_line_item",
    "payload": {
      "name": "Display name for this line item (e.g. 'Hay Shed — Gutter Cleaning')",
      "serviceKey": "gutter-cleaning",
      "requiresConfirm": true,
      "estimateNote": "Gutter length estimated at 40m based on large rural shed description",
      "gutterMetresEstimate": 40,
      "storeys": "double",
      "gutterGuard": false,
      "lastCleaned": "3+ years ago / never",
      "total": null,
      "lines": [
        { "label": "Hay Shed (est. 40m, double storey, 3+ years)", "value": "~40m" }
      ]
    }
  }
}

For roof cleaning line items:
{
  "action": {
    "type": "add_line_item",
    "payload": {
      "name": "Workshop — Roof Cleaning",
      "serviceKey": "roof-cleaning",
      "requiresConfirm": true,
      "estimateNote": "220sqm estimated for 4-bed split level with upper double storey section",
      "roofSqmEstimate": 220,
      "storeys": "double",
      "roofMaterial": "Colorbond",
      "roofAge": "14",
      "biocide": false,
      "total": null
    }
  }
}

For pressure washing:
{
  "action": {
    "type": "add_line_item",
    "payload": {
      "name": "Rear Patio — Pressure Washing",
      "serviceKey": "pressure-washing",
      "areaSqmEstimate": 60,
      "lastWash": "3+ years ago / never done",
      "biocide": false,
      "total": null
    }
  }
}

For solar cleaning:
{
  "action": {
    "type": "add_line_item",
    "payload": {
      "name": "Garage Roof — Solar Cleaning",
      "serviceKey": "solar-cleaning",
      "panelCount": 6,
      "storeys": "single",
      "lastCleaned": "2–4 years ago",
      "difficultAccess": false,
      "total": null
    }
  }
}

For PDF/email notes:
{
  "message": "Got it, I'll add that note.",
  "action": {
    "type": "update_pdf_note",
    "payload": { "text": "Access via rear gate only — call ahead to confirm." }
  }
}

For explicitly priced custom line items:
{
  "message": "Got it — I can add that custom line item.",
  "action": {
    "type": "add_line_item",
    "payload": {
      "name": "Rubbish Removal",
      "serviceKey": "custom",
      "requiresConfirm": true,
      "note": "Custom line item described by the rep",
      "total": 150,
      "lines": [
        { "label": "Custom line item", "value": "$150.00" }
      ]
    }
  }
}

IMPORTANT NOTES ON LINE ITEMS:
- For normal service line items, set "total": null — the CLIENT calculates the actual price using the pricing engine
- For serviceKey "custom", include a numeric total ONLY when the CSR explicitly stated the price
- Include the physical measurements (gutterMetresEstimate, storeys, gutterGuard, lastCleaned etc.) so the client can pass them to calcQuote
- If you're not confident in an estimate, say so in the message and set requiresConfirm: true
- For custom structures, always provide your best estimate with uncertainty noted

IMPORTANT NOTES ON MEASUREMENTS:
- Always flag estimates as estimates
- If the CSR gives you actual dimensions, use them
- If the structure is unusual, explain your reasoning
- Never pretend to have precision you don't have

Respond ONLY with valid JSON. No text outside the JSON object.`;
}

// ── Main handler ───────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // CORS
  const origin = req.headers.origin || '';
  const allowedOrigins = ['https://ss-exterior-crm.vercel.app', 'http://localhost:3000', 'http://localhost:5500', 'null'];
  if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server configuration error', message: 'API key not set.' });

  // Rate limiting
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) return res.status(429).json({ error: 'Too many requests', message: 'Please wait a moment.' });

  // Parse body
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch(e) { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { history, context } = body || {};
  if (!Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ error: 'history is required' });
  }

  // Validate history shape
  const safeHistory = history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20); // cap at last 20 messages

  if (safeHistory.length === 0) return res.status(400).json({ error: 'No valid messages in history' });

  // Build user message with context
  const lastMessage = safeHistory[safeHistory.length - 1];
  if (lastMessage.role !== 'user') return res.status(400).json({ error: 'Last message must be from user' });

  // Inject context into the system prompt or as a system turn
  const contextSummary = buildContextSummary(context);
  const systemPrompt = buildSystemPrompt() + (contextSummary ? `\n\nCURRENT QUOTE STATE:\n${contextSummary}` : '');

  // Call Anthropic
  let rawText;
  try {
    rawText = await callAnthropicWithTimeout({ apiKey, systemPrompt, messages: safeHistory });
  } catch(err) {
    if (err.name === 'TimeoutError') return res.status(504).json({ message: 'The assistant timed out. Please try again.' });
    console.error('[chat] Anthropic error:', err.message);
    return res.status(502).json({ message: 'Something went wrong. Please try again.' });
  }

  // Parse response
  let parsed;
  try {
    const trimmed = rawText.trim();
    // Strip markdown fences if present
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;
    parsed = JSON.parse(jsonStr);
  } catch(e) {
    // If JSON parse fails, return the raw text as a plain message
    console.warn('[chat] JSON parse failed, returning raw:', rawText.slice(0, 100));
    return res.status(200).json({ message: rawText.replace(/```[a-z]*\n?/g, '').trim(), action: null });
  }

  // Validate and sanitise response
  const response = {
    message: typeof parsed.message === 'string' ? parsed.message : 'I had trouble with that. Could you rephrase?',
    action: null
  };

  if (parsed.action && typeof parsed.action === 'object') {
    const { type, payload } = parsed.action;
    const validTypes = ['add_line_item', 'add_quote_note', 'update_pdf_note', 'ask_more'];
    if (validTypes.includes(type) && payload) {
      // Strip any financial fields the AI should never set
      if (type === 'add_line_item') {
        // total must be null — pricing is done client-side
        payload.total = null;
        payload.requiresConfirm = true; // always require confirm
      }
      response.action = { type, payload };
    }
  }

  return res.status(200).json(response);
};

// ── Context builder ────────────────────────────────────────
function buildContextSummary(context) {
  if (!context) return '';
  const lines = [];
  if (context.client?.name) lines.push(`Client: ${context.client.name}`);
  if (context.client?.suburb) lines.push(`Suburb: ${context.client.suburb} (travel: $${context.client.travel || 0})`);
  if (context.quoteItems?.length) {
    lines.push('Items already in quote:');
    context.quoteItems.forEach(i => lines.push(`  - ${i.name}: $${i.total}`));
  }
  if (context.currentServices?.length) {
    lines.push('Service currently being quoted:');
    context.currentServices.forEach(s => lines.push(`  - ${s.serviceKey}`));
  }
  return lines.join('\n');
}

// ── Anthropic call ─────────────────────────────────────────
async function callAnthropicWithTimeout({ apiKey, systemPrompt, messages }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const err = new Error(`Anthropic ${response.status}`);
      err.status = response.status;
      throw err;
    }
    const data = await response.json();
    const textBlock = data.content?.find(b => b.type === 'text');
    if (!textBlock?.text) throw new Error('No text in response');
    return textBlock.text;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Rate limiting ──────────────────────────────────────────
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}
