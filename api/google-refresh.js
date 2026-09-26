const CRM_REFRESH_URL = 'https://ss-exterior-crm.vercel.app/api/google-refresh';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token.trim() : '';
  if (!refreshToken || refreshToken.length > 4096) {
    return res.status(400).json({ error: 'A valid refresh token is required' });
  }

  try {
    const upstream = await fetch(CRM_REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(body);
  } catch (error) {
    console.error('[google-refresh] Upstream request failed:', error.message);
    return res.status(502).json({ error: 'Google Calendar token refresh is temporarily unavailable' });
  }
};
