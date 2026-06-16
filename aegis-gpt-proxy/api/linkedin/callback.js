module.exports = function handler(req, res) {
  const upstreamUrl = process.env.AEGIS_WEB_APP_URL;
  const upstreamAccess = process.env.AEGIS_WEB_ACCESS_KEY;

  if (!upstreamUrl || !upstreamAccess) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('AEGIS LinkedIn callback is not configured.');
    return;
  }

  const target = new URL(upstreamUrl);
  const query = req.query || {};

  [
    'code',
    'state',
    'error',
    'error_description',
    'error_uri'
  ].forEach(key => {
    if (query[key]) target.searchParams.set(key, String(query[key]));
  });

  target.searchParams.set('access', upstreamAccess);

  res.statusCode = 302;
  res.setHeader('Location', target.toString());
  res.end();
};
