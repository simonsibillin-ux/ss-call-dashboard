const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const TIMEOUT_MS = 20000;

function clean(value, max = 1200) {
  return String(value || '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI service is not configured' });

  const input = req.body || {};
  const context = {
    type: input.type === 'unscheduled_job' ? 'unscheduled job' : 'quote',
    clientName: clean(input.clientName, 120),
    suburb: clean(input.suburb, 160),
    services: Array.isArray(input.services) ? input.services.slice(0, 12).map(value => clean(value, 180)).filter(Boolean) : [],
    total: Number.isFinite(Number(input.total)) ? Number(input.total).toFixed(2) : '',
    notes: clean(input.notes),
    inclusions: Array.isArray(input.inclusions) ? input.inclusions.slice(0, 30).map(value => clean(value, 220)).filter(Boolean) : [],
    disclaimers: Array.isArray(input.disclaimers) ? input.disclaimers.slice(0, 20).map(value => clean(value, 220)).filter(Boolean) : [],
  };

  const system = `You write short, natural phone closing scripts for customer service representatives at SS Exterior Services in Victoria, Australia.

Use only the supplied job or quote facts. Never invent scope, timing, discounts, guarantees, measurements or customer concerns. Mention the relevant service, total when supplied, the most useful inclusions, and any important disclaimer naturally. For an unscheduled job, focus on re-engaging the customer and booking a suitable date. For a new or pending quote, confirm the scope and ask confidently whether they would like to proceed and choose a date.

Write 70-130 words in conversational Australian English. Address the client by first name when supplied. Do not use headings, bullet points, placeholders, quotation marks or commentary. Return only the words the CSR should say.`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({model:MODEL,max_tokens:260,system,messages:[{role:'user',content:JSON.stringify(context)}]}),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Anthropic ${response.status}`);
    const data = await response.json();
    const script = clean(data.content?.find(block => block.type === 'text')?.text, 2000);
    if (!script) throw new Error('No script returned');
    return res.status(200).json({ script });
  } catch (error) {
    console.error('[closing-script]', error.message);
    return res.status(error.name === 'AbortError' ? 504 : 502).json({ error: 'Could not generate a closing script' });
  } finally {
    clearTimeout(timeout);
  }
};
