const crypto = require('node:crypto');

module.exports = async function handler(req, res) {
  setJsonHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Use POST.' });
  }

  const setupToken = process.env.EBAY_SETUP_TOKEN;
  const suppliedToken = getSuppliedToken(req);

  if (!setupToken || !safeEqual(suppliedToken, setupToken)) {
    return res.status(401).json({ ok: false, error: 'eBay setup token required.' });
  }

  const upstreamUrl = process.env.AEGIS_WEB_APP_URL;
  const upstreamAccess = process.env.AEGIS_WEB_ACCESS_KEY;

  if (!upstreamUrl || !upstreamAccess) {
    return res.status(500).json({ ok: false, error: 'AEGIS upstream is not configured.' });
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    return res.status(400).json({ ok: false, error: 'Request body must be valid JSON.' });
  }

  const forwardedPayload = {
    ...payload,
    action: 'saveEbayAppConfig',
    confirmed: true,
    access: upstreamAccess
  };

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forwardedPayload),
      redirect: 'follow'
    });
    const text = await upstreamResponse.text();
    const data = text ? parseJsonOrText(text) : {};

    return res.status(upstreamResponse.ok ? 200 : upstreamResponse.status).json({
      ok: upstreamResponse.ok && data && data.ok !== false,
      upstreamStatus: upstreamResponse.status,
      result: data && data.result ? data.result : data
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
};

function setJsonHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Setup-Token');
}

function getSuppliedToken(req) {
  const authorization = String(req.headers.authorization || '');
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return (
    authorization.trim() ||
    String(req.headers['x-setup-token'] || '').trim()
  );
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return { ...req.body };
  }

  if (typeof req.body === 'string') {
    return req.body.trim() ? JSON.parse(req.body) : {};
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  return rawBody ? JSON.parse(rawBody) : {};
}

function parseJsonOrText(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { text };
  }
}
