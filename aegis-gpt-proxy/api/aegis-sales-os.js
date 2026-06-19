const crypto = require('node:crypto');

const WRITE_ACTIONS = new Set([
  'createEnquiry',
  'createMarketplaceEnquiry',
  'updateSalesLead',
  'createSheetTab',
  'insertSheetRows',
  'saveSheetRows',
  'saveSheetCells',
  'splitMultiCompanyCells',
  'saveDatabaseRows',
  'logEmailActivity',
  'moveDatabaseRowsToCampaign',
  'draftCampaignRows',
  'scheduleCampaignRows',
  'sendCampaignEmailBatch',
  'sendDueCampaignEmails',
  'saveMarketplaceItem',
  'importEbayListings',
  'publishMarketplaceListing',
  'publishEbayListing',
  'saveEbayAppConfig',
  'publishLinkedInPost',
  'importLinkedInPostHistory',
  'saveLinkedInAppConfig',
  'saveStockItem',
  'updateStockItem',
  'updateStockImages',
  'deleteStockItem',
  'uploadImage',
  'sendEmail',
  'sendWhatsApp',
  'scanIndustryRadar',
  'saveIndustryRadarItem',
  'updateIndustryRadarItem',
  'draftIndustryPosts',
  'saveContentItem',
  'saveContentScheduleItems',
  'updateContentItem',
  'scheduleIndustryContent',
  'syncGmailEnquiries',
  'importGmailThreadAsEnquiry',
  'installGmailSyncTrigger',
  'createGmailReplyDraft',
  'sendGmailReply'
]);

const ACTION_ALIASES = new Map([
  ['getIntegrationStatus', 'getIntegrationStatus'],
  ['getLinkedInPostHistory', 'getLinkedInPostHistory'],
  ['readLinkedInPostHistory', 'getLinkedInPostHistory'],
  ['getLinkedInHistory', 'getLinkedInPostHistory'],
  ['readLinkedInHistory', 'getLinkedInPostHistory'],
  ['getLinkedInProfile', 'getLinkedInProfile'],
  ['readLinkedInProfile', 'getLinkedInProfile'],
  ['importLinkedInPostHistory', 'importLinkedInPostHistory'],
  ['saveLinkedInPostHistory', 'importLinkedInPostHistory'],
  ['getDatabaseContext', 'getDatabaseContext'],
  ['readDatabaseContext', 'getDatabaseContext'],
  ['getCompanyDatabase', 'getDatabaseContext'],
  ['readCompanyDatabase', 'getDatabaseContext'],
  ['getDatabaseEmailRecords', 'getDatabaseContext'],
  ['findDatabaseEmailRecords', 'getDatabaseContext'],
  ['getWorkbookSchema', 'getWorkbookSchema'],
  ['readWorkbookSchema', 'getWorkbookSchema'],
  ['listWorkbookTabs', 'getWorkbookSchema'],
  ['listSheets', 'getWorkbookSchema'],
  ['createTab', 'createSheetTab'],
  ['createSheet', 'createSheetTab'],
  ['createSheetTab', 'createSheetTab'],
  ['insertSheetRows', 'insertSheetRows'],
  ['insertRows', 'insertSheetRows'],
  ['insertRowsBefore', 'insertSheetRows'],
  ['insertTabRows', 'insertSheetRows'],
  ['moveRowsDown', 'insertSheetRows'],
  ['saveSheetRows', 'saveSheetRows'],
  ['updateSheetRows', 'saveSheetRows'],
  ['appendSheetRows', 'saveSheetRows'],
  ['editSheetRows', 'saveSheetRows'],
  ['saveTabRows', 'saveSheetRows'],
  ['updateTabRows', 'saveSheetRows'],
  ['saveSheetCells', 'saveSheetCells'],
  ['updateSheetCells', 'saveSheetCells'],
  ['editSheetCells', 'saveSheetCells'],
  ['writeSheetCells', 'saveSheetCells'],
  ['findMultiCompanyCells', 'findMultiCompanyCells'],
  ['scanMultiCompanyCells', 'findMultiCompanyCells'],
  ['splitMultiCompanyCells', 'splitMultiCompanyCells'],
  ['splitCompanyCells', 'splitMultiCompanyCells'],
  ['separateCompanies', 'splitMultiCompanyCells'],
  ['updateDatabaseRows', 'saveDatabaseRows'],
  ['saveDatabaseUpdates', 'saveDatabaseRows'],
  ['enrichDatabaseRows', 'saveDatabaseRows'],
  ['saveCompanyResearch', 'saveDatabaseRows'],
  ['logEmailSent', 'logEmailActivity'],
  ['logSentEmail', 'logEmailActivity'],
  ['recordEmailActivity', 'logEmailActivity'],
  ['recordSentEmail', 'logEmailActivity'],
  ['saveEmailActivity', 'logEmailActivity'],
  ['getCampaignEmailContext', 'getCampaignEmailContext'],
  ['readCampaignEmailContext', 'getCampaignEmailContext'],
  ['showCampaignEmailStatus', 'getCampaignEmailContext'],
  ['moveDatabaseRowsToCampaign', 'moveDatabaseRowsToCampaign'],
  ['moveCompaniesToCampaign', 'moveDatabaseRowsToCampaign'],
  ['draftCampaignRows', 'draftCampaignRows'],
  ['draftCampaignEmails', 'draftCampaignRows'],
  ['scheduleCampaignRows', 'scheduleCampaignRows'],
  ['scheduleCampaignEmails', 'scheduleCampaignRows'],
  ['sendCampaignEmailBatch', 'sendCampaignEmailBatch'],
  ['sendFirstCampaignEmails', 'sendCampaignEmailBatch'],
  ['sendDueCampaignEmails', 'sendDueCampaignEmails'],
  ['getIndustryRadar', 'getState'],
  ['readIndustryRadar', 'getState'],
  ['showIndustryRadar', 'getState'],
  ['getIndustryRadarState', 'getState'],
  ['getContentSchedule', 'getState'],
  ['readContentSchedule', 'getState'],
  ['showContentSchedule', 'getState'],
  ['getSocialMediaSchedule', 'getState'],
  ['readSocialMediaSchedule', 'getState'],
  ['showSocialMediaSchedule', 'getState'],
  ['createSocialMediaSchedule', 'saveContentScheduleItems'],
  ['writeSocialMediaSchedule', 'saveContentScheduleItems'],
  ['saveSocialMediaSchedule', 'saveContentScheduleItems'],
  ['createContentSchedule', 'saveContentScheduleItems'],
  ['writeContentSchedule', 'saveContentScheduleItems'],
  ['scheduleSocialPosts', 'saveContentScheduleItems'],
  ['saveSocialPost', 'saveContentItem'],
  ['createSocialPost', 'saveContentItem'],
  ['saveLinkedInPost', 'saveContentItem'],
  ['createLinkedInPost', 'saveContentItem'],
  ['scheduleRadarDrafts', 'scheduleIndustryContent'],
  ['scheduleIndustryRadarPosts', 'scheduleIndustryContent'],
  ['createScheduleFromIndustryRadar', 'scheduleIndustryContent'],
  ['saveIndustrySignal', 'saveIndustryRadarItem'],
  ['saveIndustryArticle', 'saveIndustryRadarItem'],
  ['updateIndustrySignal', 'updateIndustryRadarItem'],
  ['draftLinkedInPostsFromRadar', 'draftIndustryPosts'],
  ['prepareMarketplaceListing', 'publishMarketplaceListing'],
  ['prepareEbayListing', 'publishMarketplaceListing'],
  ['prepareFacebookListing', 'publishMarketplaceListing'],
  ['readEbayListings', 'getEbayListings'],
  ['listEbayListings', 'getEbayListings'],
  ['showEbayListings', 'getEbayListings'],
  ['syncEbayListings', 'importEbayListings'],
  ['importCurrentEbayListings', 'importEbayListings'],
  ['importEbayLiveListings', 'importEbayListings'],
  ['publishEbayStock', 'publishEbayListing'],
  ['publishEbayMarketplaceListing', 'publishEbayListing'],
  ['listOnEbay', 'publishEbayListing'],
  ['connectEbay', 'saveEbayAppConfig'],
  ['saveEbayConfig', 'saveEbayAppConfig'],
  ['saveEbayCredentials', 'saveEbayAppConfig'],
  ['postToLinkedIn', 'publishLinkedInPost'],
  ['publishLinkedInContent', 'publishLinkedInPost'],
  ['publishLinkedInStockPost', 'publishLinkedInPost'],
  ['postStockToLinkedIn', 'publishLinkedInPost'],
  ['createStockListing', 'saveStockItem'],
  ['createStockItem', 'saveStockItem'],
  ['addStockListing', 'saveStockItem'],
  ['addStockItem', 'saveStockItem'],
  ['createListing', 'saveStockItem'],
  ['addListing', 'saveStockItem'],
  ['saveStockListing', 'saveStockItem'],
  ['editStockItem', 'updateStockItem'],
  ['editStockListing', 'updateStockItem'],
  ['updateStockListing', 'updateStockItem'],
  ['removeStockItem', 'deleteStockItem'],
  ['removeStockListing', 'deleteStockItem'],
  ['deleteStockListing', 'deleteStockItem']
]);

const READ_VIEW_ALIASES = new Map([
  ['getIndustryRadar', 'industry'],
  ['readIndustryRadar', 'industry'],
  ['showIndustryRadar', 'industry'],
  ['getIndustryRadarState', 'industry'],
  ['getContentSchedule', 'content'],
  ['readContentSchedule', 'content'],
  ['showContentSchedule', 'content'],
  ['getSocialMediaSchedule', 'content'],
  ['readSocialMediaSchedule', 'content'],
  ['showSocialMediaSchedule', 'content']
]);

const READ_ACTIONS = new Set([
  'getState',
  'getIntegrationStatus',
  'getLinkedInPostHistory',
  'getLinkedInProfile',
  'getWorkbookSchema',
  'findMultiCompanyCells',
  'getDatabaseContext',
  'getCampaignEmailContext',
  'diagnoseGmailEnquiries',
  'getGmailSyncStatus',
  'listGmailThreads',
  'getGmailThread',
  'extractBusinessWebsiteContacts',
  'searchGoogleMapsBusinesses',
  'buildMarketplaceListingPackage',
  'getEbayListings',
  'exportMarketplaceFeed'
]);

async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Use POST for AEGIS Sales OS actions.' });
  }

  const upstreamUrl = requiredEnv('AEGIS_WEB_APP_URL');
  const upstreamAccess = requiredEnv('AEGIS_WEB_ACCESS_KEY');
  const proxyTokens = getProxyTokens();

  const suppliedToken = getSuppliedToken(req);
  if (!proxyTokens.some(token => safeEqual(suppliedToken, token))) {
    return res.status(401).json({ ok: false, error: 'AEGIS GPT proxy authentication required.' });
  }

  let payload;
  try {
    const queryPayload = req.query && typeof req.query === 'object' ? { ...req.query } : {};
    const bodyPayload = req.method === 'GET' ? {} : await readJsonBody(req);
    payload = { ...queryPayload, ...bodyPayload };
  } catch (error) {
    return res.status(400).json({ ok: false, error: 'Request body must be valid JSON.' });
  }

  const requestedAction = String(payload.action || 'getState').trim();
  const action = ACTION_ALIASES.get(requestedAction) || requestedAction;
  if (!READ_ACTIONS.has(action) && !WRITE_ACTIONS.has(action)) {
    return res.status(400).json({ ok: false, error: `Unknown AEGIS action: ${requestedAction || 'blank'}` });
  }

  if (WRITE_ACTIONS.has(action) && payload.confirmed !== true) {
    return res.status(409).json({
      ok: false,
      error: 'Write actions require confirmed=true after the user explicitly approves the change.'
    });
  }

  const forwardedPayload = stripProxyOnlyFields(payload);
  applyActionDefaults(forwardedPayload, requestedAction, action);
  forwardedPayload.action = action;
  normalizeStockPayload(forwardedPayload);
  normalizeSendEmailPayload(forwardedPayload);
  normalizeGmailReplyPayload(forwardedPayload);
  normalizeIndustryPayload(forwardedPayload);
  normalizeContentPayload(forwardedPayload);
  forwardedPayload.access = upstreamAccess;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(forwardedPayload),
      redirect: 'follow'
    });

    const text = await upstreamResponse.text();
    const data = parseJsonOrText(text);

    return res
      .status(upstreamResponse.ok ? 200 : upstreamResponse.status)
      .json(buildProxyResponse({
        upstreamOk: upstreamResponse.ok,
        upstreamStatus: upstreamResponse.status,
        requestedAction,
        action,
        data
      }));
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

module.exports = handler;
module.exports.config = {
  maxDuration: 30
};

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key, X-AEGIS-Proxy-Token');
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function getProxyTokens() {
  const tokens = [
    process.env.AEGIS_GPT_PROXY_TOKEN,
    process.env.AEGIS_WEB_ACCESS_KEY,
    ...(process.env.AEGIS_GPT_PROXY_TOKENS || '').split(',')
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean);

  if (!tokens.length) {
    throw new Error('AEGIS_GPT_PROXY_TOKEN is not configured.');
  }

  return tokens;
}

function getSuppliedToken(req) {
  const authorization = String(req.headers.authorization || '');
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return (
    authorization.trim() ||
    String(req.headers['x-api-key'] || '').trim() ||
    String(req.headers['x-aegis-proxy-token'] || '').trim()
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

function stripProxyOnlyFields(payload) {
  const cleanPayload = { ...payload };
  delete cleanPayload.access;
  delete cleanPayload.key;
  delete cleanPayload.aegis;
  delete cleanPayload.proxyToken;
  delete cleanPayload.confirmed;
  return cleanPayload;
}

function applyActionDefaults(payload, requestedAction, action) {
  if (!payload.view && action === 'getState' && READ_VIEW_ALIASES.has(requestedAction)) {
    payload.view = READ_VIEW_ALIASES.get(requestedAction);
  }

  if (requestedAction === 'getDatabaseEmailRecords' || requestedAction === 'findDatabaseEmailRecords') {
    payload.withEmailOnly = true;
    if (!payload.limit) payload.limit = 100;
  }
}

function buildProxyResponse({ upstreamOk, upstreamStatus, requestedAction, action, data }) {
  const ok = upstreamOk && data && data.ok !== false;
  const body = {
    ok,
    proxied: true,
    upstreamStatus,
    requestedAction,
    action
  };

  const normalised = normaliseUpstreamResult(data);
  if (normalised.state) {
    body.view = normalised.view;
    Object.assign(body, compactStateForGpt(normalised.state, normalised.view));
  } else if (normalised.result !== undefined) {
    body.result = normalised.result;
  }

  return body;
}

function normaliseUpstreamResult(data) {
  if (!data || typeof data !== 'object') {
    return { result: data };
  }

  const result = data.result !== undefined ? data.result : data;
  const state = result && result.data && typeof result.data === 'object' ? result.data : null;
  const view = result && result.view ? result.view : undefined;

  return {
    result,
    state,
    view
  };
}

function compactStateForGpt(state, view) {
  const arrayLimit = view === 'database' ? 25 : 100;
  const compact = {};

  Object.entries(state).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      compact[key] = value.slice(0, arrayLimit);
      compact[`${key}Count`] = value.length;
      if (value.length > arrayLimit) {
        compact[`${key}Truncated`] = true;
        compact[`${key}Note`] = view === 'database'
          ? `Showing first ${arrayLimit} of ${value.length}. For database searching/filtering, call /api/database with query, sourceSheet, withEmailOnly, and limit. For rows with emails, call /api/database/email-records.`
          : `Showing first ${arrayLimit} of ${value.length}. Ask for a specific search/filter instead of loading the full ${view || 'view'} dataset.`;
      }
      return;
    }

    if (value === null || value === undefined) return;

    if (typeof value !== 'object' || key === 'stats' || key.endsWith('Stats')) {
      compact[key] = value;
    }
  });

  if (view === 'industry') {
    compact.note = 'Industry Radar is sector news/signals and LinkedIn/content angles. It is not the company/prospect database.';
  }

  if (view === 'content') {
    compact.note = 'Content Schedule contains planned, drafted, approved, and posted social content. Use saveContentScheduleItems or updateContentItem for approved schedule changes.';
  }

  return compact;
}

function normalizeGmailReplyPayload(payload) {
  if (!payload || (payload.action !== 'createGmailReplyDraft' && payload.action !== 'sendGmailReply')) {
    return;
  }

  const nested = payload.reply || payload.email;
  const to = firstEmailAddress(
    payload.to,
    payload.email,
    payload.emailAddress,
    payload.email_address,
    payload.emailTo,
    payload.email_to,
    payload.recipient,
    payload.recipientEmail,
    payload.recipient_email,
    payload.recipientEmailAddress,
    payload.recipient_email_address,
    payload.customerEmail,
    payload.customer_email,
    payload.contactEmail,
    payload.contact_email,
    payload.leadEmail,
    payload.lead_email,
    payload.recipients,
    nested,
    nested && nested.to,
    nested && nested.email,
    nested && nested.emailAddress,
    nested && nested.email_address,
    nested && nested.emailTo,
    nested && nested.email_to,
    nested && nested.recipient,
    nested && nested.recipientEmail,
    nested && nested.recipient_email,
    nested && nested.recipientEmailAddress,
    nested && nested.recipient_email_address,
    nested && nested.customerEmail,
    nested && nested.customer_email,
    nested && nested.contactEmail,
    nested && nested.contact_email,
    nested && nested.leadEmail,
    nested && nested.lead_email,
    nested && nested.recipients,
    payload.contact,
    payload.customer,
    payload.lead,
    payload.company,
    payload.item,
    payload.row
  );
  const candidateBody =
    payload.body ||
    payload.message ||
    payload.replyBody ||
    payload.draftBody ||
    payload.replyText ||
    payload.enquiryText ||
    payload.text ||
    payload.content;

  if (candidateBody && !payload.body) {
    payload.body = candidateBody;
  }

  if (nested && typeof nested === 'object') {
    const nestedBody =
      nested.body ||
      nested.message ||
      nested.replyBody ||
      nested.draftBody ||
      nested.replyText ||
      nested.enquiryText ||
      nested.text ||
      nested.content;

    if (nestedBody && !nested.body) {
      nested.body = nestedBody;
    }

    if (!payload.subject && (nested.subject || nested.emailSubject)) {
      payload.subject = cleanString(nested.subject || nested.emailSubject);
    }
  }

  if (to && !payload.to) {
    payload.to = to;
  }
}

function normalizeSendEmailPayload(payload) {
  if (!payload || payload.action !== 'sendEmail') {
    return;
  }

  const nested = payload.email && typeof payload.email === 'object' ? payload.email : {};
  const to = firstEmailAddress(
    payload.to,
    payload.email,
    payload.emailAddress,
    payload.email_address,
    payload.emailTo,
    payload.email_to,
    payload.recipient,
    payload.recipientEmail,
    payload.recipient_email,
    payload.recipientEmailAddress,
    payload.recipient_email_address,
    payload.customerEmail,
    payload.customer_email,
    payload.contactEmail,
    payload.contact_email,
    payload.leadEmail,
    payload.lead_email,
    payload.recipients,
    nested.to,
    nested.email,
    nested.emailAddress,
    nested.email_address,
    nested.emailTo,
    nested.email_to,
    nested.recipient,
    nested.recipientEmail,
    nested.recipient_email,
    nested.recipientEmailAddress,
    nested.recipient_email_address,
    nested.customerEmail,
    nested.customer_email,
    nested.contactEmail,
    nested.contact_email,
    nested.leadEmail,
    nested.lead_email,
    nested.recipients,
    payload.contact,
    payload.customer,
    payload.lead,
    payload.company,
    nested.contact,
    nested.customer,
    nested.lead,
    nested.company,
    payload.item,
    payload.row
  );
  const body =
    payload.body ||
    payload.message ||
    payload.text ||
    payload.content ||
    nested.body ||
    nested.message ||
    nested.text ||
    nested.content ||
    nested.emailBody;

  payload.to = to;
  payload.subject = cleanString(payload.subject || nested.subject || nested.emailSubject);
  payload.body = cleanString(body);
  payload.name = cleanString(payload.name || payload.fromName || nested.name || nested.fromName) || payload.name;

  if (payload.draftOnly === undefined && nested.draftOnly !== undefined) {
    payload.draftOnly = nested.draftOnly;
  }

  if (!payload.mode && nested.mode) {
    payload.mode = nested.mode;
  }
}

function firstEmailAddress(...values) {
  for (const value of values) {
    const email = extractEmailAddress(value);
    if (email) return email;
  }
  return '';
}

function extractEmailAddress(value, depth = 0) {
  if (value == null || depth > 3) return '';

  if (typeof value === 'string' || typeof value === 'number') {
    const match = String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0].trim() : '';
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const email = extractEmailAddress(item, depth + 1);
      if (email) return email;
    }
    return '';
  }

  if (typeof value === 'object') {
    const likelyKeys = [
      'email',
      'emailAddress',
      'email_address',
      'address',
      'to',
      'recipient',
      'recipientEmail',
      'recipient_email',
      'recipientEmailAddress',
      'recipient_email_address',
      'customerEmail',
      'customer_email',
      'contactEmail',
      'contact_email',
      'leadEmail',
      'lead_email',
      'mail'
    ];

    for (const key of likelyKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const email = extractEmailAddress(value[key], depth + 1);
        if (email) return email;
      }
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      if (/email|mail|recipient|contact|customer|lead|to|address/i.test(key)) {
        const email = extractEmailAddress(nestedValue, depth + 1);
        if (email) return email;
      }
    }
  }

  return '';
}

function normalizeIndustryPayload(payload) {
  if (!payload || (payload.action !== 'saveIndustryRadarItem' && payload.action !== 'updateIndustryRadarItem')) {
    return;
  }

  if (!payload.item && !payload.article) {
    const item = pickFields(payload, [
      'id',
      'source',
      'title',
      'headline',
      'name',
      'url',
      'link',
      'publishedAt',
      'published',
      'date',
      'summary',
      'description',
      'tags',
      'relevance',
      'score',
      'angle',
      'aegisAngle',
      'status',
      'linkedinDraft',
      'postDraft',
      'draft',
      'targetAudience',
      'engagementTargets',
      'notes'
    ]);
    if (Object.keys(item).length) payload.item = item;
  }

  if (payload.action === 'updateIndustryRadarItem') {
    payload.itemId = cleanString(payload.itemId || payload.industryItemId || payload.id || payload.item?.id);
    if (!payload.updates) payload.updates = payload.item || payload.article || {};
  }
}

function normalizeContentPayload(payload) {
  if (!payload || ![
    'saveContentItem',
    'saveContentScheduleItems',
    'updateContentItem',
    'scheduleIndustryContent'
  ].includes(payload.action)) {
    return;
  }

  if (payload.action === 'scheduleIndustryContent') {
    if (!payload.options) {
      payload.options = pickFields(payload, [
        'count',
        'itemId',
        'itemIds',
        'platform',
        'startDate',
        'scheduledFor',
        'status',
        'owner',
        'cta',
        'allowDuplicates',
        'pillar'
      ]);
    }
    return;
  }

  if (payload.action === 'saveContentScheduleItems') {
    if (!payload.items && !payload.posts && !payload.schedule) {
      const single = payload.content || payload.item || payload.post || topLevelContentItem(payload);
      if (Array.isArray(single)) {
        payload.items = single;
      } else if (single && Object.keys(single).length) {
        payload.items = [single];
      }
    }
    return;
  }

  if (payload.action === 'saveContentItem') {
    if (!payload.content) {
      payload.content = payload.item || payload.post || topLevelContentItem(payload);
    }
    return;
  }

  if (payload.action === 'updateContentItem') {
    payload.contentId = cleanString(payload.contentId || payload.itemId || payload.id || payload.content?.id || payload.item?.id);
    if (!payload.updates) {
      payload.updates = payload.content || payload.item || payload.post || topLevelContentItem(payload);
    }
  }
}

function topLevelContentItem(payload) {
  return pickFields(payload, [
    'id',
    'contentId',
    'scheduledFor',
    'scheduledAt',
    'date',
    'platform',
    'pillar',
    'contentPillar',
    'status',
    'title',
    'headline',
    'name',
    'postDraft',
    'linkedinDraft',
    'body',
    'copy',
    'message',
    'sourceType',
    'sourceId',
    'industryItemId',
    'sourceTitle',
    'articleTitle',
    'sourceUrl',
    'articleUrl',
    'url',
    'link',
    'tags',
    'theme',
    'themes',
    'targetAudience',
    'audience',
    'cta',
    'callToAction',
    'assetUrl',
    'imageUrl',
    'mediaUrl',
    'postedUrl',
    'liveUrl',
    'postUrl',
    'owner',
    'notes'
  ]);
}

function pickFields(source, fields) {
  return fields.reduce((out, field) => {
    if (source && Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined && source[field] !== null && source[field] !== '') {
      out[field] = source[field];
    }
    return out;
  }, {});
}

function normalizeStockPayload(payload) {
  if (!payload || (payload.action !== 'saveStockItem' && payload.action !== 'updateStockItem')) {
    return;
  }

  const source = payload.item || payload.stock || payload.listing || payload.truck || payload.vehicle || payload.equipment || payload;
  const title = cleanString(source.title || source.name || source.truckTitle || source.listingTitle);
  const parsed = parseStockTitle(title);
  const images = source.galleryImages || source.images || source.gallery || source.imageUrls || source.photos;
  const item = {
    ...source,
    id: cleanString(source.id || source.stockId || source.truckId || source.sku),
    category: cleanString(source.category || source.stockCategory || source.kind) || inferStockCategory(source),
    status: cleanString(source.status || source.stockStatus || source.availability) || 'in-stock',
    featured: cleanString(source.featured || source.isFeatured),
    brand: cleanString(source.brand || source.make || source.manufacturer || parsed.brand),
    model: cleanString(source.model || source.modelName || parsed.model || title),
    type: cleanString(source.type || source.machineType || source.equipmentType || source.productType),
    power: cleanString(source.power || source.drive || source.energy),
    capacity: cleanString(source.capacity || source.loadCapacity || source.liftCapacity),
    liftHeight: cleanString(source.liftHeight || source.lift || source.maxLiftHeight),
    year: cleanString(source.year || source.manufactureYear),
    hours: cleanString(source.hours || source.operatingHours),
    mast: cleanString(source.mast || source.mastType),
    tyres: cleanString(source.tyres || source.tires),
    battery: cleanString(source.battery || source.batterySpec),
    fuel: cleanString(source.fuel || source.fuelType),
    price: cleanString(source.price || source.askingPrice || source.salePrice),
    vat: cleanString(source.vat || source.vatStatus),
    description: cleanString(source.description || source.listingDescription || source.details),
    bullets: source.bullets || source.features || source.keyFeatures,
    imageMain: cleanString(source.imageMain || source.mainImage || source.image || source.photo || (Array.isArray(images) ? images[0] : '')),
    galleryImages: images,
    sortOrder: cleanString(source.sortOrder || source.order)
  };

  payload.item = item;

  if (payload.action === 'updateStockItem') {
    payload.updates = item;
    payload.stockId = cleanString(payload.stockId || payload.truckId || payload.id || item.id);
  }
}

function parseStockTitle(title) {
  const value = cleanString(title);
  if (!value) return { brand: '', model: '' };
  const parts = value.split(/\s+/);
  if (parts.length < 2) return { brand: '', model: value };
  return { brand: parts[0], model: parts.slice(1).join(' ') };
}

function inferStockCategory(source) {
  const text = [
    source.category,
    source.type,
    source.machineType,
    source.equipmentType,
    source.productType,
    source.title,
    source.name,
    source.description
  ].map(cleanString).join(' ').toLowerCase();

  if (text.includes('construction') || text.includes('excavator') || text.includes('digger') || text.includes('dumper')) return 'construction';
  if (text.includes('agric') || text.includes('tractor') || text.includes('telehandler')) return 'agricultural';
  if (text.includes('commercial') || text.includes('vehicle') || text.includes('van') || text.includes('tipper')) return 'commercial-vehicles';
  if (text.includes('plant') || text.includes('equipment') || text.includes('generator') || text.includes('compressor')) return 'plant-equipment';
  if (text.includes('industrial') || text.includes('warehouse')) return 'industrial';
  if (text.includes('pallet')) return 'pallet-truck';
  if (text.includes('forklift')) return 'forklift-truck';
  return '';
}

function cleanString(value) {
  return String(value == null ? '' : value).trim();
}

function parseJsonOrText(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text };
  }
}
