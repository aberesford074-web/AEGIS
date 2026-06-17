const crypto = require('node:crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'GET') {
    const challengeCode = String((req.query && req.query.challenge_code) || '').trim();
    if (!challengeCode) {
      return res.status(400).json({
        ok: false,
        error: 'Missing challenge_code.'
      });
    }

    const verificationToken = process.env.EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN;
    if (!isValidVerificationToken(verificationToken)) {
      return res.status(500).json({
        ok: false,
        error: 'EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN is not configured correctly.'
      });
    }

    const endpoint = getEndpointUrl(req);
    const challengeResponse = crypto
      .createHash('sha256')
      .update(challengeCode)
      .update(verificationToken)
      .update(endpoint)
      .digest('hex');

    return res.status(200).json({ challengeResponse });
  }

  if (req.method === 'POST') {
    return res.status(200).json({
      ok: true,
      received: true
    });
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return res.status(405).json({
    ok: false,
    error: 'Use GET for eBay endpoint verification or POST for notifications.'
  });
};

function isValidVerificationToken(value) {
  return /^[A-Za-z0-9_-]{32,80}$/.test(String(value || ''));
}

function getEndpointUrl(req) {
  if (process.env.EBAY_ACCOUNT_DELETION_ENDPOINT) {
    return process.env.EBAY_ACCOUNT_DELETION_ENDPOINT;
  }

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const path = String(req.url || '/api/ebay/account-deletion').split('?')[0];
  return `${proto}://${host}${path}`;
}
