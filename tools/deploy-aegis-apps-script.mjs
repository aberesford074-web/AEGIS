import fs from 'node:fs';

const cwd = '/Users/aaronberesford/Desktop/AEGIS';
const scriptId = '1uE77ISzrv_JuDbQV8LF3JAWmIMvhHtHcdBwQhXtX8W6-LpS_EKnE7CuK';
const deploymentId = 'AKfycbwjOW4G0ydKkxw7KH3YOpQHWcvz9Fxw1S8i-rVYFGM0GC6WmwjzXtDbBh1YnApexRsO';
const description = process.argv.slice(2).join(' ') || 'AEGIS Sales OS update';
const clasp = JSON.parse(fs.readFileSync(`${process.env.HOME}/.clasprc.json`, 'utf8'));
const claspAuth = clasp.tokens && clasp.tokens.default ? clasp.tokens.default : clasp;

async function refreshAccessToken() {
  const settings = claspAuth.oauth2ClientSettings || {};
  const token = claspAuth.token || claspAuth;
  const body = new URLSearchParams({
    client_id: settings.clientId || settings.client_id || claspAuth.client_id,
    client_secret: settings.clientSecret || settings.client_secret || claspAuth.client_secret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token'
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`OAuth refresh failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

async function appsScriptRequest(accessToken, path, options = {}) {
  const response = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${text}`);
  }
  return data;
}

const accessToken = await refreshAccessToken();
const content = await appsScriptRequest(accessToken, '/content');
const files = content.files.map(file => {
  if (file.name === 'Code') {
    return {
      name: 'Code',
      type: 'SERVER_JS',
      source: fs.readFileSync(`${cwd}/google-sheets-webhook.gs`, 'utf8')
    };
  }
  if (file.name === 'Index') {
    return {
      name: 'Index',
      type: 'HTML',
      source: fs.readFileSync(`${cwd}/apps-script/index.html`, 'utf8')
    };
  }
  if (file.name === 'appsscript') {
    return {
      name: 'appsscript',
      type: 'JSON',
      source: fs.readFileSync(`${cwd}/apps-script/appsscript.json`, 'utf8')
    };
  }
  return file;
});

await appsScriptRequest(accessToken, '/content', {
  method: 'PUT',
  body: JSON.stringify({ files })
});

const version = await appsScriptRequest(accessToken, '/versions', {
  method: 'POST',
  body: JSON.stringify({ description })
});

await appsScriptRequest(accessToken, `/deployments/${deploymentId}`, {
  method: 'PUT',
  body: JSON.stringify({
    deploymentConfig: {
      versionNumber: version.versionNumber,
      manifestFileName: 'appsscript',
      description: 'AEGIS Sales OS live web app'
    }
  })
});

console.log(JSON.stringify({
  ok: true,
  versionNumber: version.versionNumber,
  description
}, null, 2));
