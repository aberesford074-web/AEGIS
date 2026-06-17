module.exports = function handler(req, res) {
  const query = req.query || {};
  const code = query.code ? String(query.code) : '';
  const state = query.state ? String(query.state) : '';
  const error = query.error ? String(query.error) : '';
  const errorDescription = query.error_description ? String(query.error_description) : '';

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AEGIS eBay OAuth Callback</title>
    <style>
      body {
        margin: 0;
        background: #050606;
        color: #fff;
        font-family: Arial, Helvetica, sans-serif;
      }
      main {
        max-width: 820px;
        margin: 0 auto;
        padding: 72px 24px;
      }
      h1 {
        margin: 0 0 18px;
        font-size: clamp(40px, 7vw, 82px);
        line-height: 0.95;
        text-transform: uppercase;
      }
      p {
        color: rgba(255, 255, 255, 0.72);
        font-size: 18px;
        line-height: 1.6;
      }
      code, textarea {
        box-sizing: border-box;
        width: 100%;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: #101214;
        color: #fff;
        font: 15px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      textarea {
        min-height: 160px;
        padding: 16px;
      }
      .status {
        display: inline-block;
        margin-bottom: 22px;
        color: #f28a12;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
    </style>
  </head>
  <body>
    <main>
      <span class="status">${escapeHtml(error ? 'eBay sign-in issue' : 'eBay sign-in returned')}</span>
      <h1>${escapeHtml(error ? 'Could not connect eBay.' : 'Copy this code.')}</h1>
      ${error
        ? `<p>eBay returned an error: <strong>${escapeHtml(error)}</strong></p><p>${escapeHtml(errorDescription || 'No further detail was provided.')}</p>`
        : `<p>Send this code back to Codex so it can be exchanged for a secure refresh token.</p><textarea readonly>${escapeHtml(code)}</textarea>`}
      ${state ? `<p>State: <code>${escapeHtml(state)}</code></p>` : ''}
    </main>
  </body>
</html>`);
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
