import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/aaronberesford/Desktop/AEGIS/aegis-gpt-proxy';
const teamId = 'team_GBmgD7pqwqfC81QYB9qxCDr1';
const projectName = 'aegis-gpt-proxy';
const authPath = `${process.env.HOME}/Library/Application Support/com.vercel.cli/auth.json`;
const vercelCliClientId = 'cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp';
let auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
let token = auth.token;

if (!token) {
  throw new Error('Vercel CLI token was not found.');
}

async function refreshVercelToken() {
  if (!auth.refreshToken) {
    throw new Error('Vercel refresh token was not found.');
  }

  const response = await fetch('https://api.vercel.com/login/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: auth.refreshToken,
      client_id: vercelCliClientId
    })
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok || !(data.access_token || data.token)) {
    throw new Error(`Vercel token refresh failed: ${text}`);
  }

  const expiresIn = Number(data.expires_in || data.expiresIn || 3600);
  auth = {
    ...auth,
    token: data.access_token || data.token,
    refreshToken: data.refresh_token || data.refreshToken || auth.refreshToken,
    expiresAt: Date.now() + Math.max(60, expiresIn - 30) * 1000
  };
  token = auth.token;
  fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
}

if (auth.expiresAt && Number(auth.expiresAt) < Date.now() + 60_000) {
  await refreshVercelToken();
}

const files = [
  'package.json',
  'vercel.json',
  'openapi.yaml',
  'openapi-gpt.yaml',
  'api/aegis-sales-os.js',
  'api/linkedin/callback.js'
].map(file => ({
  file,
  data: fs.readFileSync(path.join(root, file)).toString('base64'),
  encoding: 'base64'
}));

async function vercel(pathname, options = {}) {
  const { __retriedAfterRefresh, ...fetchOptions } = options;
  const url = new URL(`https://api.vercel.com${pathname}`);
  url.searchParams.set('teamId', teamId);
  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(fetchOptions.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    if (!__retriedAfterRefresh && response.status === 403 && text.includes('invalidToken')) {
      await refreshVercelToken();
      return vercel(pathname, { ...options, __retriedAfterRefresh: true });
    }
    throw new Error(`${options.method || 'GET'} ${pathname} failed: ${text}`);
  }
  return data;
}

const deployment = await vercel('/v13/deployments', {
  method: 'POST',
  body: JSON.stringify({
    name: projectName,
    project: projectName,
    target: 'production',
    files,
    projectSettings: {
      framework: null,
      installCommand: null,
      buildCommand: null,
      outputDirectory: null
    },
    meta: {
      source: 'codex-local-update',
      note: 'AEGIS GPT proxy schema and action update'
    }
  })
});

let current = deployment;
for (let i = 0; i < 60; i++) {
  if (current.readyState === 'READY' || current.readyState === 'ERROR' || current.readyState === 'CANCELED') break;
  await new Promise(resolve => setTimeout(resolve, 2000));
  current = await vercel(`/v13/deployments/${deployment.id}`);
}

console.log(JSON.stringify({
  ok: current.readyState === 'READY',
  id: deployment.id,
  readyState: current.readyState,
  url: `https://${current.url || deployment.url}`,
  alias: current.alias || deployment.alias || []
}, null, 2));

if (current.readyState !== 'READY') {
  process.exitCode = 1;
}
