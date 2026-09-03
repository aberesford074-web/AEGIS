const connectionTypes = ['aegis_built', 'wordpress', 'custom', 'stock_feed', 'none'];

export function normaliseEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('A valid customer portal email is required.');
    error.statusCode = 400;
    throw error;
  }
  return email;
}

export function normaliseWebsiteConnectionType(value) {
  const type = String(value || 'none').trim().toLowerCase();
  if (!connectionTypes.includes(type)) {
    const error = new Error('Choose a valid website connection type.');
    error.statusCode = 400;
    throw error;
  }
  return type;
}

export function normaliseWebsiteURL(value, type = 'none') {
  const raw = String(value || '').trim();
  if (!raw) {
    if (['wordpress', 'custom'].includes(type)) {
      const error = new Error('A website URL is required for this connection type.');
      error.statusCode = 400;
      throw error;
    }
    return null;
  }
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.origin;
  } catch {
    const error = new Error('Enter a complete website URL beginning with https:// or http://.');
    error.statusCode = 400;
    throw error;
  }
}

export function initialWebsiteStatus(type) {
  return type === 'none' ? 'not_started' : 'awaiting_access';
}

export function portalReadiness({
  invitationStatus,
  websiteConnectionType,
  websiteConnectionStatus,
  billingRequired = false,
  billingStatus = 'not_started'
}) {
  const emailReady = invitationStatus === 'accepted';
  const websiteRequired = websiteConnectionType !== 'none';
  const websiteReady = !websiteRequired || websiteConnectionStatus === 'connected';
  const billingReady = !billingRequired || ['active', 'trialing'].includes(String(billingStatus || '').toLowerCase());
  return {
    emailReady,
    websiteRequired,
    websiteReady,
    billingRequired,
    billingReady,
    canActivate: emailReady && websiteReady && billingReady
  };
}

export function portalBaseURL(value = process.env.APP_URL) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
  } catch {}
  return 'https://dealer.aegis-allterrain.co.uk';
}

export async function verifyWebsiteConnection({ type, websiteURL, publicSlug, fetcher = fetch }) {
  const checkedAt = new Date().toISOString();
  if (type === 'none') {
    return { status: 'not_started', checkedAt, error: null, note: 'No website connection has been selected.' };
  }

  if (type === 'stock_feed') {
    const feedURL = `${portalBaseURL()}/api/machines?publicOrg=${encodeURIComponent(publicSlug)}`;
    const response = await fetcher(feedURL, { method: 'GET', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { status: 'failed', checkedAt, error: `The AEGIS stock feed returned HTTP ${response.status}.`, note: null, feedURL };
    return { status: 'connected', checkedAt, error: null, note: 'The private workspace and public stock feed are ready.', feedURL };
  }

  if (!websiteURL) {
    return { status: 'awaiting_access', checkedAt, error: null, note: 'Add the website address before AEGIS can test the connection.' };
  }

  try {
    if (type === 'wordpress') {
      const endpoint = `${websiteURL.replace(/\/$/, '')}/wp-json/`;
      const response = await fetcher(endpoint, { method: 'GET', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) return { status: 'failed', checkedAt, error: `WordPress API returned HTTP ${response.status}.`, note: null };
      return { status: 'awaiting_access', checkedAt, error: null, note: 'WordPress was detected. Publishing access still needs a WordPress application password or AEGIS plugin.' };
    }

    const response = await fetcher(websiteURL, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { status: 'failed', checkedAt, error: `The website returned HTTP ${response.status}.`, note: null };
    if (type === 'aegis_built') {
      return { status: 'connected', checkedAt, error: null, note: 'The AEGIS-managed website is reachable and linked to this workspace.' };
    }
    return { status: 'awaiting_access', checkedAt, error: null, note: 'The website is reachable. Add its publishing API details before marking it connected.' };
  } catch (error) {
    return { status: 'failed', checkedAt, error: `AEGIS could not reach the website: ${error.message}`, note: null };
  }
}
