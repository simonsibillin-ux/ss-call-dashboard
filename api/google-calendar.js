const CRM_CALENDAR_URL = 'https://ss-exterior-crm.vercel.app/api/google-calendar';

export default async function handler(req, res) {
  try {
    const query = new URLSearchParams();
    if (req.query?.status === '1') query.set('status', '1');
    if (typeof req.query?.path === 'string') query.set('path', req.query.path);
    const upstream = await fetch(`${CRM_CALENDAR_URL}?${query.toString()}`, {
      method: req.method,
      headers: req.body ? { 'Content-Type': 'application/json' } : {},
      body: ['GET','HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    });
    const body = await upstream.text();
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status);
    if (!body) return res.end();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(body);
  } catch (error) {
    console.error('[google-calendar-proxy]', error.message);
    return res.status(502).json({ error: 'The shared calendar service is unavailable.' });
  }
}
