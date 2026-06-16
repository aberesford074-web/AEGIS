/************************************************************
 * AI Email Campaign Tool for Google Sheets
 *
 * Main campaign sheet expected:
 * "AI Campaign - A Calls"
 *
 * Database workflow:
 * - Work calls inside source database tabs: A, B, C, Domestic, etc.
 * - Select the rows you worked on.
 * - Run: AI Email Tool > Move Selected Database Rows to Campaign + Draft
 * - Rows with valid emails are copied into the campaign tab.
 * - Moved rows are deleted from the source database tab immediately.
 * - Rows without valid emails stay in the database tab.
 *
 * Scheduling workflow:
 * - Draft campaign rows first.
 * - Select campaign rows.
 * - Run: AI Email Tool > Schedule Selected Campaign Rows
 * - Run once: AI Email Tool > Install 15-Min Scheduled Sender
 * - The script checks due rows every 15 minutes.
 * - If a reply is detected, follow-ups stop automatically.
 *
 * Uses OpenAI Responses API:
 * https://api.openai.com/v1/responses
 *
 * IMPORTANT:
 * - Do NOT hardcode your OpenAI API key in this file.
 * - Use: AI Email Tool > Set OpenAI Config
 * - This stores the key in Script Properties.
 ************************************************************/

const AEGIS_WORKBOOK_ID = '1gdL5hFBBuuAu_J_5rspcL-OfxC6DCj-5v7snztSbzrc';
const AEGIS_WEB_ACCESS_PROPERTY = 'AEGIS_WEB_ACCESS_KEY';
const AEGIS_DEFAULT_WEB_ACCESS_KEY = '';
const GOOGLE_MAPS_API_KEY_PROPERTY = 'GOOGLE_MAPS_API_KEY';

const CONFIG = {
  SHEET_NAME: 'AI Campaign - A Calls',
  HEADER_ROW: 22,
  FIRST_LEAD_ROW: 23,

  // Campaign columns
  COL_ROW_ID: 1,           // A
  COL_COMPANY: 2,          // B
  COL_CONTACT: 3,          // C
  COL_EMAIL: 4,            // D
  COL_NOTE: 5,             // E
  COL_SEGMENT: 6,          // F
  COL_ACTION: 7,           // G
  COL_SUBJECT: 8,          // H
  COL_INITIAL_EMAIL: 9,    // I
  COL_FOLLOWUP_1: 10,      // J
  COL_FOLLOWUP_2: 11,      // K
  COL_CALL_SCRIPT: 12,     // L
  COL_API_CONTEXT: 13,     // M

  // Draft helper columns
  COL_STATUS: 14,          // N
  COL_LAST_GENERATED: 15,  // O
  COL_GMAIL_DRAFT_ID: 16,  // P
  COL_ERROR: 17,           // Q

  // Send sequence / scheduling columns
  COL_SEQUENCE_STATUS: 18, // R
  COL_NEXT_SEND_AT: 19,    // S
  COL_LAST_SENT_STEP: 20,  // T
  COL_LAST_SENT_AT: 21,    // U
  COL_GMAIL_THREAD_ID: 22, // V
  COL_REPLY_RECEIVED: 23,  // W
  COL_STOP_SEQUENCE: 24,   // X
  COL_LAST_REPLY_AT: 25,   // Y
  COL_SEND_ERROR: 26       // Z
};

function getAegisWorkbook_() {
  return SpreadsheetApp.openById(AEGIS_WORKBOOK_ID);
}

const DATABASE_CONFIG = {
  HEADER_ROW: 1,

  // Sheets never treated as source database sheets.
  EXCLUDED_SHEETS: [
    'AI Campaign - A Calls',
    'AI Opportunities',
    'Forklift Enquiries',
    'Forklift Stock',
    'Forklift Media',
    'Forklift Listings',
    'Email Activity',
    'Industry Radar Sources',
    'Industry Radar',
    'Content Schedule'
  ],

  // These are searched in the selected source sheet header row.
  HEADER_ALIASES: {
    rowId: ['row id', 'source row', 'id'],
    company: ['company', 'company name', 'business', 'business name'],
    email: ['email', 'email address', 'e-mail', 'e-mail address'],
    contact: ['contact', 'contact name', 'decision maker', 'decision-maker'],
    director: ['director', 'director name'],
    spokeTo: ['spoke to', 'spoke with'],
    notes: [
      'notes',
      'note',
      'general notes',
      'call outcome',
      'call outcome / note',
      'call notes'
    ],
    nextAction: [
      'next action',
      'recommended action',
      'action',
      'follow up',
      'follow-up'
    ],
    international: ['international'],
    domestic: ['domestic'],
    pallets: ['pallets'],
    phone: ['phone', 'phone number', 'telephone', 'mobile'],
    postcode: ['post code', 'postcode', 'zip'],
    address: ['address'],
    website: ['website', 'web site', 'site', 'url', 'website url'],
    linkedIn: ['linkedin', 'linkedin url', 'linkedin page', 'linkedin company page'],
    sourceUrl: ['source url', 'source', 'research source', 'verified source'],
    confidence: ['confidence', 'confidence level', 'research confidence']
  }
};

const EMAIL_ACTIVITY_CONFIG = {
  SHEET_NAME: 'Email Activity',
  HEADER_ROW: 1,
  FIRST_ROW: 2,
  HEADERS: [
    'Logged At',
    'Direction',
    'Status',
    'Company',
    'Contact',
    'Email',
    'Subject',
    'Information About',
    'Product / Stock',
    'Campaign Step',
    'Summary',
    'Gmail Thread ID',
    'Gmail Message ID',
    'Sent At',
    'Next Follow-Up At',
    'Next Action',
    'Source',
    'Database Sheet',
    'Database Row',
    'Notes'
  ]
};

const OPPORTUNITY_CONFIG = {
  SHEET_NAME: 'AI Opportunities',
  HEADER_ROW: 1,
  FIRST_ROW: 2,

  COL_ID: 1,
  COL_CAMPAIGN_ROW: 2,
  COL_SOURCE_ROW: 3,
  COL_COMPANY: 4,
  COL_CONTACT: 5,
  COL_EMAIL: 6,
  COL_STAGE: 7,
  COL_CLASSIFICATION: 8,
  COL_LAST_REPLY_AT: 9,
  COL_LAST_REPLY_FROM: 10,
  COL_LAST_REPLY_TEXT: 11,
  COL_AI_REPLY_DRAFT: 12,
  COL_GMAIL_DRAFT_ID: 13,
  COL_NEXT_ACTION: 14,
  COL_OWNER_NOTES: 15,
  COL_GMAIL_THREAD_ID: 16,
  COL_CAMPAIGN_SUBJECT: 17,
  COL_ORIGINAL_EMAIL: 18,
  COL_CREATED_AT: 19,
  COL_UPDATED_AT: 20,
  COL_ERROR: 21
};

const ENQUIRY_CONFIG = {
  SHEET_NAME: 'Forklift Enquiries',
  HEADER_ROW: 1,
  FIRST_ROW: 2,

  COL_ID: 1,
  COL_CREATED_AT: 2,
  COL_UPDATED_AT: 3,
  COL_SOURCE: 4,
  COL_STAGE: 5,
  COL_CUSTOMER: 6,
  COL_COMPANY: 7,
  COL_PHONE: 8,
  COL_EMAIL: 9,
  COL_LOCATION: 10,
  COL_INTERESTED_TRUCK: 11,
  COL_BUDGET: 12,
  COL_ENQUIRY_TEXT: 13,
  COL_NEXT_ACTION: 14,
  COL_OWNER_NOTES: 15,
  COL_LAST_CONTACTED_AT: 16,
  COL_PRIORITY: 17,
  COL_GMAIL_THREAD_ID: 18,
  COL_ERROR: 19
};

const STOCK_CONFIG = {
  SHEET_NAME: 'Forklift Stock',
  HEADER_ROW: 1,
  FIRST_ROW: 2,

  HEADERS: [
    'ID',
    'Category',
    'Status',
    'Featured',
    'Brand',
    'Model',
    'Type',
    'Power',
    'Capacity',
    'Lift Height',
    'Year',
    'Hours',
    'Mast',
    'Tyres',
    'Battery',
    'Fuel',
    'Price',
    'VAT',
    'Description',
    'Bullets',
    'Image Main',
    'Gallery Images',
    'Sort Order',
    'Updated At'
  ],

  COL_ID: 1,
  COL_CATEGORY: 2,
  COL_STATUS: 3,
  COL_FEATURED: 4,
  COL_BRAND: 5,
  COL_MODEL: 6,
  COL_TYPE: 7,
  COL_POWER: 8,
  COL_CAPACITY: 9,
  COL_LIFT_HEIGHT: 10,
  COL_YEAR: 11,
  COL_HOURS: 12,
  COL_MAST: 13,
  COL_TYRES: 14,
  COL_BATTERY: 15,
  COL_FUEL: 16,
  COL_PRICE: 17,
  COL_VAT: 18,
  COL_DESCRIPTION: 19,
  COL_BULLETS: 20,
  COL_IMAGE_MAIN: 21,
  COL_GALLERY_IMAGES: 22,
  COL_SORT_ORDER: 23,
  COL_UPDATED_AT: 24
};

const MARKETPLACE_CONFIG = {
  SHEET_NAME: 'Forklift Listings',
  HEADER_ROW: 1,
  FIRST_ROW: 2,

  HEADERS: [
    'Truck ID',
    'Website Status',
    'Website URL',
    'eBay Status',
    'eBay URL',
    'Facebook Status',
    'Facebook URL',
    'WhatsApp Status',
    'Google Ads Status',
    'Google Ads URL',
    'Last Refreshed',
    'Next Action',
    'Enquiries',
    'Notes',
    'Updated At',
    'LinkedIn Status',
    'LinkedIn URL',
    'Google Business Status',
    'Google Business URL',
    'Gumtree Status',
    'Gumtree URL'
  ],

  COL_TRUCK_ID: 1,
  COL_WEBSITE_STATUS: 2,
  COL_WEBSITE_URL: 3,
  COL_EBAY_STATUS: 4,
  COL_EBAY_URL: 5,
  COL_FACEBOOK_STATUS: 6,
  COL_FACEBOOK_URL: 7,
  COL_WHATSAPP_STATUS: 8,
  COL_GOOGLE_ADS_STATUS: 9,
  COL_GOOGLE_ADS_URL: 10,
  COL_LAST_REFRESHED: 11,
  COL_NEXT_ACTION: 12,
  COL_ENQUIRIES: 13,
  COL_NOTES: 14,
  COL_UPDATED_AT: 15,
  COL_LINKEDIN_STATUS: 16,
  COL_LINKEDIN_URL: 17,
  COL_GOOGLE_BUSINESS_STATUS: 18,
  COL_GOOGLE_BUSINESS_URL: 19,
  COL_GUMTREE_STATUS: 20,
  COL_GUMTREE_URL: 21
};

const INDUSTRY_SOURCE_CONFIG = {
  SHEET_NAME: 'Industry Radar Sources',
  HEADER_ROW: 1,
  FIRST_ROW: 2,
  HEADERS: [
    'Source',
    'Website',
    'RSS URL',
    'Search Query',
    'Default Tags',
    'Active',
    'Notes',
    'Last Scanned',
    'Last Error',
    'Updated At'
  ],
  COL_SOURCE: 1,
  COL_WEBSITE: 2,
  COL_RSS_URL: 3,
  COL_SEARCH_QUERY: 4,
  COL_DEFAULT_TAGS: 5,
  COL_ACTIVE: 6,
  COL_NOTES: 7,
  COL_LAST_SCANNED: 8,
  COL_LAST_ERROR: 9,
  COL_UPDATED_AT: 10
};

const INDUSTRY_RADAR_CONFIG = {
  SHEET_NAME: 'Industry Radar',
  HEADER_ROW: 1,
  FIRST_ROW: 2,
  HEADERS: [
    'ID',
    'Source',
    'Title',
    'URL',
    'Published At',
    'Summary',
    'Tags',
    'Relevance',
    'AEGIS Angle',
    'Status',
    'LinkedIn Draft',
    'Target Audience',
    'Engagement Targets',
    'Notes',
    'Saved At',
    'Updated At'
  ],
  COL_ID: 1,
  COL_SOURCE: 2,
  COL_TITLE: 3,
  COL_URL: 4,
  COL_PUBLISHED_AT: 5,
  COL_SUMMARY: 6,
  COL_TAGS: 7,
  COL_RELEVANCE: 8,
  COL_ANGLE: 9,
  COL_STATUS: 10,
  COL_LINKEDIN_DRAFT: 11,
  COL_TARGET_AUDIENCE: 12,
  COL_ENGAGEMENT_TARGETS: 13,
  COL_NOTES: 14,
  COL_SAVED_AT: 15,
  COL_UPDATED_AT: 16
};

const CONTENT_SCHEDULE_CONFIG = {
  SHEET_NAME: 'Content Schedule',
  HEADER_ROW: 1,
  FIRST_ROW: 2,
  HEADERS: [
    'ID',
    'Scheduled For',
    'Platform',
    'Pillar',
    'Status',
    'Title',
    'Post Draft',
    'Source Type',
    'Source ID',
    'Source Title',
    'Source URL',
    'Tags',
    'Target Audience',
    'CTA',
    'Asset URL',
    'Posted URL',
    'Owner',
    'Notes',
    'Created At',
    'Updated At'
  ],
  COL_ID: 1,
  COL_SCHEDULED_FOR: 2,
  COL_PLATFORM: 3,
  COL_PILLAR: 4,
  COL_STATUS: 5,
  COL_TITLE: 6,
  COL_POST_DRAFT: 7,
  COL_SOURCE_TYPE: 8,
  COL_SOURCE_ID: 9,
  COL_SOURCE_TITLE: 10,
  COL_SOURCE_URL: 11,
  COL_TAGS: 12,
  COL_TARGET_AUDIENCE: 13,
  COL_CTA: 14,
  COL_ASSET_URL: 15,
  COL_POSTED_URL: 16,
  COL_OWNER: 17,
  COL_NOTES: 18,
  COL_CREATED_AT: 19,
  COL_UPDATED_AT: 20
};

const DEFAULT_INDUSTRY_RADAR_SOURCES = [
  {
    source: 'Forkliftaction',
    website: 'https://www.forkliftaction.com/news/',
    searchQuery: 'site:forkliftaction.com forklift material handling warehouse equipment',
    defaultTags: 'forklifts|material handling|industry news',
    notes: 'Global forklift and materials handling news.'
  },
  {
    source: 'UKMHA',
    website: 'https://ukmha.org.uk/',
    searchQuery: 'site:ukmha.org.uk forklift safety material handling training warehouse',
    defaultTags: 'forklifts|safety|UK market',
    notes: 'UK Material Handling Association updates.'
  },
  {
    source: 'Materials Handling World',
    website: 'https://www.mhwmagazine.co.uk/',
    rssUrl: 'https://www.mhwmagazine.co.uk/feed/',
    searchQuery: 'site:mhwmagazine.co.uk forklift warehouse automation material handling',
    defaultTags: 'material handling|warehouse|forklifts',
    notes: 'UK materials handling trade publication.'
  },
  {
    source: 'Logistics Manager',
    website: 'https://www.logisticsmanager.com/intralogistics/materials-handling/',
    searchQuery: 'site:logisticsmanager.com intralogistics materials handling forklift warehouse automation',
    defaultTags: 'warehousing|automation|logistics',
    notes: 'UK logistics and intralogistics news.'
  },
  {
    source: 'SHD Logistics',
    website: 'https://www.shdlogistics.com/',
    searchQuery: 'site:shdlogistics.com warehouse automation forklift material handling logistics',
    defaultTags: 'warehousing|automation|logistics',
    notes: 'Warehouse and logistics operations coverage.'
  },
  {
    source: 'IMHX',
    website: 'https://www.imhx.net/',
    searchQuery: 'site:imhx.net forklift warehouse automation material handling intralogistics',
    defaultTags: 'events|automation|material handling',
    notes: 'UK material handling and warehouse event updates.'
  },
  {
    source: 'iVT International',
    website: 'https://www.ivtinternational.com/',
    searchQuery: 'site:ivtinternational.com industrial vehicle electric forklift battery off-highway equipment',
    defaultTags: 'industrial vehicles|batteries|equipment tech',
    notes: 'Industrial vehicle technology and off-highway equipment.'
  },
  {
    source: 'Modern Materials Handling',
    website: 'https://www.mmh.com/',
    searchQuery: 'site:mmh.com forklift warehouse automation material handling batteries safety',
    defaultTags: 'automation|warehousing|material handling',
    notes: 'US material handling and warehouse automation coverage.'
  }
];

/************************************************************
 * Menu
 ************************************************************/

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('AI Email Tool')
    .addItem('Set OpenAI Config', 'setOpenAIConfig')
    .addItem('Set LinkedIn App Config', 'setLinkedInAppConfig')
    .addItem('Set Calendar Booking Link', 'setCalendarBookingLink')
    .addItem('Authorize Calendar Access', 'authorizeCalendarAccess')
    .addItem('Check Config', 'checkOpenAIConfig')
    .addSeparator()
    .addItem('Move Selected Database Rows to Campaign', 'moveSelectedDatabaseRowsToCampaign')
    .addItem('Move Selected Database Rows to Campaign + Draft', 'moveSelectedDatabaseRowsToCampaignAndDraft')
    .addSeparator()
    .addItem('Draft Selected Campaign Row', 'draftSelectedRow')
    .addItem('Force Regenerate Selected Campaign Row', 'forceRegenerateSelectedRow')
    .addItem('Draft All Eligible Campaign Rows', 'draftAllEligibleRows')
    .addSeparator()
    .addItem('Schedule Selected Campaign Rows', 'scheduleSelectedCampaignRows')
    .addItem('Install 15-Min Scheduled Sender', 'installScheduledSenderTrigger')
    .addItem('Install Gmail Enquiry Auto-Sync', 'installGmailEnquirySyncTrigger')
    .addItem('Sync Gmail Enquiries Now', 'autoSyncGmailEnquiries')
    .addItem('Send Due Campaign Emails Now', 'sendDueCampaignEmails')
    .addItem('Check Replies + Pause Sequences', 'checkRepliesAndPauseSequences')
    .addSeparator()
    .addItem('Create Gmail Draft for Selected Campaign Row', 'createGmailDraftForSelectedRow')
    .addItem('Create Gmail Drafts for All Ready Rows', 'createGmailDraftsForAllReadyRows')
    .addToUi();
}

/************************************************************
 * Secure config setup
 ************************************************************/

function setOpenAIConfig() {
  const ui = SpreadsheetApp.getUi();

  const keyPrompt = ui.prompt(
    'Set OpenAI API Key',
    'Paste your NEW rotated OpenAI API key. It will be stored in Script Properties, not in the sheet or code.',
    ui.ButtonSet.OK_CANCEL
  );

  if (keyPrompt.getSelectedButton() !== ui.Button.OK) return;

  const apiKey = keyPrompt.getResponseText().trim();

  if (!apiKey || !apiKey.startsWith('sk-')) {
    ui.alert('That does not look like an OpenAI API key. Please try again.');
    return;
  }

  const modelPrompt = ui.prompt(
    'Set OpenAI Model',
    'Enter model name. Example: gpt-5-mini',
    ui.ButtonSet.OK_CANCEL
  );

  if (modelPrompt.getSelectedButton() !== ui.Button.OK) return;

  const model = modelPrompt.getResponseText().trim() || 'gpt-5-mini';

  PropertiesService.getScriptProperties().setProperties({
    OPENAI_API_KEY: apiKey,
    OPENAI_MODEL: model
  });

  ui.alert('OpenAI config saved securely in Script Properties.');
}

function checkOpenAIConfig() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('OPENAI_API_KEY');
  const model = props.getProperty('OPENAI_MODEL');
  const bookingLink = props.getProperty('CALENDAR_BOOKING_LINK');

  SpreadsheetApp.getUi().alert(
    [
      apiKey ? 'OPENAI_API_KEY: set' : 'OPENAI_API_KEY: missing',
      model ? `OPENAI_MODEL: ${model}` : 'OPENAI_MODEL: missing',
      bookingLink ? `CALENDAR_BOOKING_LINK: ${bookingLink}` : 'CALENDAR_BOOKING_LINK: missing'
    ].join('\n')
  );
}

function setCalendarBookingLink() {
  const ui = SpreadsheetApp.getUi();
  const current = PropertiesService.getScriptProperties().getProperty('CALENDAR_BOOKING_LINK') || '';
  const prompt = ui.prompt(
    'Set Calendar Booking Link',
    `Paste your Google Calendar appointment schedule / booking link.${current ? `\n\nCurrent: ${current}` : ''}`,
    ui.ButtonSet.OK_CANCEL
  );

  if (prompt.getSelectedButton() !== ui.Button.OK) return;

  const url = clean_(prompt.getResponseText());

  if (url && !/^https?:\/\/\S+$/i.test(url)) {
    ui.alert('That does not look like a valid booking URL. It should start with https://');
    return;
  }

  PropertiesService.getScriptProperties().setProperty('CALENDAR_BOOKING_LINK', url);
  ui.alert(url ? 'Calendar booking link saved.' : 'Calendar booking link cleared.');
}

function setLinkedInAppConfig() {
  const ui = SpreadsheetApp.getUi();
  const idPrompt = ui.prompt(
    'Set LinkedIn Client ID',
    'Paste the Client ID from your LinkedIn Developer app. Do not paste this into chat.',
    ui.ButtonSet.OK_CANCEL
  );

  if (idPrompt.getSelectedButton() !== ui.Button.OK) return;

  const secretPrompt = ui.prompt(
    'Set LinkedIn Client Secret',
    'Paste the Client Secret from your LinkedIn Developer app. It will be stored in Script Properties.',
    ui.ButtonSet.OK_CANCEL
  );

  if (secretPrompt.getSelectedButton() !== ui.Button.OK) return;

  const result = webAppSaveLinkedInAppConfig({
    clientId: idPrompt.getResponseText(),
    clientSecret: secretPrompt.getResponseText()
  });

  ui.alert(
    'LinkedIn app saved.\n\nAdd this Authorized Redirect URL in the LinkedIn app Auth tab:\n\n' +
    result.redirectUri +
    '\n\nThen open this to connect:\n\n' +
    result.connectUrl
  );
}

function authorizeCalendarAccess() {
  const ui = SpreadsheetApp.getUi();
  const calendar = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const upcomingEvents = calendar.getEvents(now, addDays_(now, 7));

  ui.alert(
    [
      'Calendar access is authorised.',
      `Calendar: ${calendar.getName()}`,
      `Upcoming events in next 7 days: ${upcomingEvents.length}`,
      'You can now refresh the AEGIS web app Calendar page.'
    ].join('\n')
  );
}

function getCalendarBookingLink_() {
  return clean_(PropertiesService.getScriptProperties().getProperty('CALENDAR_BOOKING_LINK'));
}

/************************************************************
 * Database row move workflow
 ************************************************************/

function moveSelectedDatabaseRowsToCampaign() {
  moveSelectedDatabaseRows_(false);
}

function moveSelectedDatabaseRowsToCampaignAndDraft() {
  moveSelectedDatabaseRows_(true);
}

function moveSelectedDatabaseRows_(alsoDraft) {
  const ss = getAegisWorkbook_();
  const ui = SpreadsheetApp.getUi();
  const sourceSheet = ss.getActiveSheet();
  const campaignSheet = getCampaignSheet_();

  ensureCampaignHeaders_(campaignSheet);
  ensureHelperHeaders_(campaignSheet);

  if (sourceSheet.getName() === CONFIG.SHEET_NAME) {
    ui.alert('Run this from a database/source tab, not from the campaign tab.');
    return;
  }

  if (DATABASE_CONFIG.EXCLUDED_SHEETS.indexOf(sourceSheet.getName()) !== -1) {
    ui.alert(`This sheet is excluded from database moves: ${sourceSheet.getName()}`);
    return;
  }

  const selectedRows = getSelectedRowNumbers_(sourceSheet);

  if (!selectedRows.length) {
    ui.alert('Select one or more database rows first.');
    return;
  }

  const headerMap = getHeaderMap_(sourceSheet);
  const moveItems = [];
  const skippedNoEmail = [];
  const skippedBlankCompany = [];

  selectedRows.forEach(row => {
    if (row <= DATABASE_CONFIG.HEADER_ROW) return;

    const lead = buildLeadFromDatabaseRow_(sourceSheet, row, headerMap);

    if (!lead.company) {
      skippedBlankCompany.push(row);
      return;
    }

    if (!lead.email || !isValidEmail_(lead.email)) {
      skippedNoEmail.push(row);
      return;
    }

    moveItems.push({
      sourceRow: row,
      campaignRowValues: buildCampaignRowValues_(lead)
    });
  });

  if (!moveItems.length) {
    ui.alert(
      [
        'No selected rows with valid emails were moved.',
        skippedNoEmail.length ? `Rows without valid emails left in database: ${skippedNoEmail.join(', ')}` : '',
        skippedBlankCompany.length ? `Blank/no-company rows skipped: ${skippedBlankCompany.join(', ')}` : ''
      ].filter(Boolean).join('\n')
    );
    return;
  }

  const campaignStartRow = reserveCampaignRows_(campaignSheet, moveItems.length);
  const values = moveItems.map(item => item.campaignRowValues);

  campaignSheet
    .getRange(campaignStartRow, 1, values.length, CONFIG.COL_SEND_ERROR)
    .setValues(values);

  formatMovedCampaignRows_(campaignSheet, campaignStartRow, values.length);

  // Commit the campaign write first.
  SpreadsheetApp.flush();

  // Critical fix: delete from source BEFORE AI drafting.
  // This prevents duplicates if AI drafting times out or errors.
  const rowsToDelete = moveItems
    .map(item => item.sourceRow)
    .sort((a, b) => b - a);

  deleteRowsBottomUp_(sourceSheet, rowsToDelete);

  SpreadsheetApp.flush();

  let drafted = 0;
  let draftErrors = 0;

  if (alsoDraft) {
    for (let i = 0; i < values.length; i++) {
      const campaignRow = campaignStartRow + i;
      const ok = draftLeadRow_(campaignSheet, campaignRow, false);

      if (ok) drafted++;
      else draftErrors++;

      Utilities.sleep(300);
    }
  } else {
    for (let i = 0; i < values.length; i++) {
      writeStatus_(campaignSheet, campaignStartRow + i, 'Moved - ready for AI draft', '');
    }
  }

  ui.alert(
    [
      'Move complete.',
      `Moved to campaign: ${moveItems.length}`,
      `Deleted from ${sourceSheet.getName()}: ${moveItems.length}`,
      skippedNoEmail.length ? `Left in database - no valid email: ${skippedNoEmail.length}` : '',
      skippedBlankCompany.length ? `Skipped blank/no-company rows: ${skippedBlankCompany.length}` : '',
      alsoDraft ? `AI drafted: ${drafted}` : '',
      alsoDraft ? `AI draft errors: ${draftErrors}` : ''
    ].filter(Boolean).join('\n')
  );
}

function deleteRowsBottomUp_(sheet, rowsToDelete) {
  if (!rowsToDelete.length) return;

  const rows = [...new Set(rowsToDelete)]
    .filter(row => row > DATABASE_CONFIG.HEADER_ROW)
    .sort((a, b) => b - a);

  rows.forEach(row => {
    sheet.deleteRow(row);
  });
}

function getSelectedRowNumbers_(sheet) {
  const selection = sheet.getActiveRangeList();
  const rows = {};

  if (selection) {
    selection.getRanges().forEach(range => {
      const startRow = range.getRow();
      const rowCount = range.getNumRows();

      for (let r = startRow; r < startRow + rowCount; r++) {
        rows[r] = true;
      }
    });
  } else {
    const range = sheet.getActiveRange();

    if (range) {
      const startRow = range.getRow();
      const rowCount = range.getNumRows();

      for (let r = startRow; r < startRow + rowCount; r++) {
        rows[r] = true;
      }
    }
  }

  return Object.keys(rows)
    .map(Number)
    .sort((a, b) => a - b);
}

function getHeaderMap_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet
    .getRange(DATABASE_CONFIG.HEADER_ROW, 1, 1, lastCol)
    .getValues()[0]
    .map(value => normaliseHeader_(value));

  const map = {};

  Object.keys(DATABASE_CONFIG.HEADER_ALIASES).forEach(key => {
    const aliases = DATABASE_CONFIG.HEADER_ALIASES[key];

    for (let i = 0; i < headers.length; i++) {
      if (!headers[i]) continue;

      if (aliases.indexOf(headers[i]) !== -1) {
        map[key] = i + 1;
        break;
      }
    }
  });

  return map;
}

function buildLeadFromDatabaseRow_(sheet, row, headerMap) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const rowValues = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  const sheetName = sheet.getName();

  const company = firstClean_([
    getByHeader_(rowValues, headerMap.company),
    rowValues[1]
  ]);

  const email = detectEmailFromDatabaseRow_(rowValues, headerMap);

  const contact = firstClean_([
    getByHeader_(rowValues, headerMap.contact),
    getByHeader_(rowValues, headerMap.director),
    getByHeader_(rowValues, headerMap.spokeTo)
  ]);

  const spokeTo = clean_(getByHeader_(rowValues, headerMap.spokeTo));
  const notes = clean_(getByHeader_(rowValues, headerMap.notes));
  const nextAction = clean_(getByHeader_(rowValues, headerMap.nextAction));

  const international = clean_(getByHeader_(rowValues, headerMap.international));
  const domestic = clean_(getByHeader_(rowValues, headerMap.domestic));
  const pallets = clean_(getByHeader_(rowValues, headerMap.pallets));

  const phone = clean_(getByHeader_(rowValues, headerMap.phone));
  const postcode = clean_(getByHeader_(rowValues, headerMap.postcode));
  const address = clean_(getByHeader_(rowValues, headerMap.address));

  const rowIdValue = clean_(getByHeader_(rowValues, headerMap.rowId));
  const sourceRef = rowIdValue
    ? `${sheetName}!${rowIdValue}`
    : `${sheetName}!${row}`;

  const noteParts = [];

  if (spokeTo) noteParts.push(`Spoke to: ${spokeTo}`);
  if (notes) noteParts.push(notes);
  if (nextAction) noteParts.push(`Next action: ${nextAction}`);
  if (international) noteParts.push(`International: ${international}`);
  if (domestic) noteParts.push(`Domestic: ${domestic}`);
  if (pallets) noteParts.push(`Pallets: ${pallets}`);

  const note = noteParts.join(' | ');

  const segment = classifyLeadSegment_({
    email,
    note,
    nextAction,
    international,
    domestic,
    pallets
  });

  const action = nextAction || recommendAction_({
    email,
    note,
    segment
  });

  const apiContext = buildApiContext_({
    company,
    contact,
    email,
    note,
    segment,
    action,
    phone,
    postcode,
    address,
    sourceRef
  });

  return {
    sourceRef,
    company,
    contact,
    email,
    note,
    segment,
    action,
    apiContext
  };
}

function buildCampaignRowValues_(lead) {
  return [
    lead.sourceRef || '',
    lead.company || '',
    lead.contact || '',
    lead.email || '',
    lead.note || '',
    lead.segment || '',
    lead.action || '',
    '',
    '',
    '',
    '',
    '',
    lead.apiContext || '',
    'Moved - ready for AI draft',
    new Date(),
    '',
    '',
    'Not scheduled',
    '',
    0,
    '',
    '',
    'No',
    'No',
    '',
    ''
  ];
}

function reserveCampaignRows_(sheet, rowsNeeded) {
  const firstLeadRow = CONFIG.FIRST_LEAD_ROW;
  const lastRow = Math.max(sheet.getLastRow(), CONFIG.HEADER_ROW);

  const values = sheet
    .getRange(firstLeadRow, 1, Math.max(lastRow - firstLeadRow + 1, 1), CONFIG.COL_SEND_ERROR)
    .getValues();

  let lastLeadOffset = -1;
  let docsStartOffset = -1;

  for (let i = 0; i < values.length; i++) {
    const row = values[i];

    const sourceRef = clean_(row[CONFIG.COL_ROW_ID - 1]);
    const company = clean_(row[CONFIG.COL_COMPANY - 1]);
    const email = clean_(row[CONFIG.COL_EMAIL - 1]);
    const apiContext = clean_(row[CONFIG.COL_API_CONTEXT - 1]);
    const status = clean_(row[CONFIG.COL_STATUS - 1]);

    const looksLikeCampaignLead = Boolean(company && (sourceRef || email || apiContext || status));

    if (looksLikeCampaignLead) {
      lastLeadOffset = i;
      continue;
    }

    const anyValue = row.some(value => clean_(value));

    if (lastLeadOffset >= 0 && anyValue) {
      docsStartOffset = i;
      break;
    }
  }

  const appendStartRow = firstLeadRow + lastLeadOffset + 1;

  if (docsStartOffset === -1) {
    return appendStartRow;
  }

  const docsStartRow = firstLeadRow + docsStartOffset;
  const blankRowsBeforeDocs = docsStartRow - appendStartRow;
  const rowsToInsert = Math.max(rowsNeeded - blankRowsBeforeDocs, 0);

  if (rowsToInsert > 0) {
    sheet.insertRowsBefore(docsStartRow, rowsToInsert);
  }

  return appendStartRow;
}

function formatMovedCampaignRows_(sheet, startRow, rowCount) {
  const range = sheet.getRange(startRow, 1, rowCount, CONFIG.COL_SEND_ERROR);

  range
    .setVerticalAlignment('top')
    .setWrap(true);

  sheet.setColumnWidth(CONFIG.COL_SUBJECT, 220);
  sheet.setColumnWidth(CONFIG.COL_INITIAL_EMAIL, 420);
  sheet.setColumnWidth(CONFIG.COL_FOLLOWUP_1, 360);
  sheet.setColumnWidth(CONFIG.COL_FOLLOWUP_2, 360);
  sheet.setColumnWidth(CONFIG.COL_CALL_SCRIPT, 360);
  sheet.setColumnWidth(CONFIG.COL_API_CONTEXT, 420);
  sheet.setColumnWidth(CONFIG.COL_ERROR, 420);
  sheet.setColumnWidth(CONFIG.COL_SEQUENCE_STATUS, 150);
  sheet.setColumnWidth(CONFIG.COL_NEXT_SEND_AT, 160);
  sheet.setColumnWidth(CONFIG.COL_LAST_SENT_STEP, 130);
  sheet.setColumnWidth(CONFIG.COL_LAST_SENT_AT, 160);
  sheet.setColumnWidth(CONFIG.COL_GMAIL_THREAD_ID, 220);
  sheet.setColumnWidth(CONFIG.COL_REPLY_RECEIVED, 130);
  sheet.setColumnWidth(CONFIG.COL_STOP_SEQUENCE, 130);
  sheet.setColumnWidth(CONFIG.COL_LAST_REPLY_AT, 160);
  sheet.setColumnWidth(CONFIG.COL_SEND_ERROR, 320);

  sheet
    .getRange(startRow, CONFIG.COL_EMAIL, rowCount, 1)
    .setFontColor('#0070C0');

  sheet
    .getRange(startRow, CONFIG.COL_STATUS, rowCount, 1)
    .setFontColor('#7030A0')
    .setFontWeight('bold');
}

function detectEmailFromDatabaseRow_(rowValues, headerMap) {
  const headerEmail = clean_(getByHeader_(rowValues, headerMap.email));
  const headerEmailExtracted = extractEmail_(headerEmail);

  if (headerEmailExtracted) {
    return headerEmailExtracted;
  }

  // Fallback: scan the whole selected row for the first valid-looking email.
  for (let i = 0; i < rowValues.length; i++) {
    const possibleEmail = extractEmail_(rowValues[i]);

    if (possibleEmail) {
      return possibleEmail;
    }
  }

  return '';
}

function classifyLeadSegment_(lead) {
  const combined = [
    lead.note,
    lead.nextAction,
    lead.international,
    lead.domestic,
    lead.pallets
  ].join(' ').toLowerCase();

  if (combined.includes('not interested')) return 'Suppress / low priority';
  if (combined.includes('suppress')) return 'Suppress / low priority';
  if (combined.includes('number not working')) return 'Invalid phone / email found';
  if (combined.includes('send email')) return 'Ready - send email and call back';
  if (combined.includes('call back')) return 'Callback - email available';
  if (combined.includes('follow')) return 'Follow-up - email available';

  return lead.email ? 'Ready - email available' : 'Needs enrichment';
}

function recommendAction_(lead) {
  const combined = [lead.note, lead.segment].join(' ').toLowerCase();

  if (combined.includes('not interested') || combined.includes('suppress')) {
    return 'Do not send campaign unless they explicitly ask to revisit';
  }

  if (lead.email) {
    return 'Send intro email, then call back';
  }

  return 'Research correct contact and email first';
}

function buildApiContext_(lead) {
  return [
    `Source: ${lead.sourceRef || 'Unknown'}.`,
    `Company: ${lead.company || 'Unknown'}.`,
    `Contact: ${lead.contact || 'Unknown'}.`,
    `Email: ${lead.email || 'Missing'}.`,
    lead.phone ? `Phone: ${lead.phone}.` : '',
    lead.postcode ? `Postcode: ${lead.postcode}.` : '',
    lead.address ? `Address: ${lead.address}.` : '',
    `Note: ${lead.note || 'None'}.`,
    `Segment: ${lead.segment || 'None'}.`,
    `Goal: ${lead.action || 'Send intro email and call back'}.`,
    'Product: £80 WhatsApp email assistant plus optional integrations.'
  ].filter(Boolean).join(' ');
}

/************************************************************
 * Drafting actions
 ************************************************************/

function draftSelectedRow() {
  const sheet = getCampaignSheet_();

  ensureCampaignHeaders_(sheet);
  ensureHelperHeaders_(sheet);

  const row = sheet.getActiveCell().getRow();

  if (row < CONFIG.FIRST_LEAD_ROW) {
    SpreadsheetApp.getUi().alert('Select a campaign lead row first.');
    return;
  }

  draftLeadRow_(sheet, row, false);
}

function forceRegenerateSelectedRow() {
  const sheet = getCampaignSheet_();

  ensureCampaignHeaders_(sheet);
  ensureHelperHeaders_(sheet);

  const row = sheet.getActiveCell().getRow();

  if (row < CONFIG.FIRST_LEAD_ROW) {
    SpreadsheetApp.getUi().alert('Select a campaign lead row first.');
    return;
  }

  const gmailDraftId = clean_(sheet.getRange(row, CONFIG.COL_GMAIL_DRAFT_ID).getValue());
  const threadId = clean_(sheet.getRange(row, CONFIG.COL_GMAIL_THREAD_ID).getValue());

  if (gmailDraftId || threadId) {
    const response = SpreadsheetApp.getUi().alert(
      'Existing Gmail activity found',
      'This row already has a Gmail Draft ID or Thread ID. Regenerating may make the sheet different from Gmail. Continue?',
      SpreadsheetApp.getUi().ButtonSet.YES_NO
    );

    if (response !== SpreadsheetApp.getUi().Button.YES) return;
  }

  draftLeadRow_(sheet, row, true);
}

function draftAllEligibleRows() {
  const sheet = getCampaignSheet_();

  ensureCampaignHeaders_(sheet);
  ensureHelperHeaders_(sheet);

  const lastRow = sheet.getLastRow();

  let drafted = 0;
  let skipped = 0;
  let suppressed = 0;
  let errors = 0;

  for (let row = CONFIG.FIRST_LEAD_ROW; row <= lastRow; row++) {
    const lead = getLeadFromRow_(sheet, row);

    if (!lead.company) {
      skipped++;
      continue;
    }

    if (isAlreadyDrafted_(sheet, row)) {
      skipped++;
      continue;
    }

    if (shouldSuppressLead_(lead)) {
      writeStatus_(sheet, row, 'Suppressed - not drafted', '');
      suppressed++;
      continue;
    }

    if (!lead.email || !isValidEmail_(lead.email)) {
      writeStatus_(sheet, row, 'No email draft - missing or invalid email', '');
      skipped++;
      continue;
    }

    const ok = draftLeadRow_(sheet, row, false);

    if (ok) drafted++;
    else errors++;

    Utilities.sleep(300);
  }

  SpreadsheetApp.getUi().alert(
    [
      'Drafting complete.',
      `Drafted: ${drafted}`,
      `Skipped already drafted/blank/no email: ${skipped}`,
      `Suppressed: ${suppressed}`,
      `Errors: ${errors}`
    ].join('\n')
  );
}

function draftLeadRow_(sheet, row, forceRegenerate) {
  try {
    const lead = getLeadFromRow_(sheet, row);

    // Caching/check: prevents API spend and protects reviewed drafts.
    if (!forceRegenerate && isAlreadyDrafted_(sheet, row)) {
      return true;
    }

    if (!lead.company) {
      writeStatus_(sheet, row, 'Skipped - no company', '');
      return true;
    }

    if (!lead.email || !isValidEmail_(lead.email)) {
      writeStatus_(sheet, row, 'No email draft - missing or invalid email', '');
      return true;
    }

    if (shouldSuppressLead_(lead)) {
      writeStatus_(sheet, row, 'Suppressed - not interested / invalid', '');
      return true;
    }

    const result = callOpenAIForEmailDraft_(lead);

    sheet.getRange(row, CONFIG.COL_SUBJECT).setValue(result.subject || '');
    sheet.getRange(row, CONFIG.COL_INITIAL_EMAIL).setValue(result.initial_email || '');
    sheet.getRange(row, CONFIG.COL_FOLLOWUP_1).setValue(result.follow_up_1 || '');
    sheet.getRange(row, CONFIG.COL_FOLLOWUP_2).setValue(result.follow_up_2 || '');
    sheet.getRange(row, CONFIG.COL_CALL_SCRIPT).setValue(result.call_script || '');

    writeStatus_(sheet, row, forceRegenerate ? 'Regenerated' : 'Drafted locally - ready for review', '');

    return true;
  } catch (err) {
    writeStatus_(sheet, row, 'Error', String(err.message || err));
    return false;
  }
}

/************************************************************
 * Gmail draft actions — creates drafts only, does NOT send
 ************************************************************/

function createGmailDraftForSelectedRow() {
  const sheet = getCampaignSheet_();

  ensureCampaignHeaders_(sheet);
  ensureHelperHeaders_(sheet);

  const row = sheet.getActiveCell().getRow();

  if (row < CONFIG.FIRST_LEAD_ROW) {
    SpreadsheetApp.getUi().alert('Select a campaign lead row first.');
    return;
  }

  createGmailDraftForRow_(sheet, row);
}

function createGmailDraftsForAllReadyRows() {
  const sheet = getCampaignSheet_();

  ensureCampaignHeaders_(sheet);
  ensureHelperHeaders_(sheet);

  const lastRow = sheet.getLastRow();

  let created = 0;
  let skipped = 0;

  for (let row = CONFIG.FIRST_LEAD_ROW; row <= lastRow; row++) {
    const lead = getLeadFromRow_(sheet, row);

    if (!lead.company || !lead.email || !isValidEmail_(lead.email)) {
      skipped++;
      continue;
    }

    if (shouldSuppressLead_(lead)) {
      skipped++;
      continue;
    }

    if (hasGmailDraft_(sheet, row)) {
      skipped++;
      continue;
    }

    const subject = clean_(sheet.getRange(row, CONFIG.COL_SUBJECT).getValue());
    const body = clean_(sheet.getRange(row, CONFIG.COL_INITIAL_EMAIL).getValue());

    if (!subject || !body) {
      skipped++;
      continue;
    }

    const ok = createGmailDraftForRow_(sheet, row);

    if (ok) created++;
    else skipped++;

    Utilities.sleep(200);
  }

  SpreadsheetApp.getUi().alert(
    [
      'Gmail draft creation complete.',
      `Created: ${created}`,
      `Skipped: ${skipped}`
    ].join('\n')
  );
}

function createGmailDraftForRow_(sheet, row) {
  try {
    const lead = getLeadFromRow_(sheet, row);
    const subject = clean_(sheet.getRange(row, CONFIG.COL_SUBJECT).getValue());
    const body = clean_(sheet.getRange(row, CONFIG.COL_INITIAL_EMAIL).getValue());

    if (!lead.email || !isValidEmail_(lead.email)) {
      writeStatus_(sheet, row, 'No Gmail draft - missing or invalid email', '');
      return false;
    }

    if (!subject || !body) {
      writeStatus_(sheet, row, 'No Gmail draft - missing subject/body', '');
      return false;
    }

    if (shouldSuppressLead_(lead)) {
      writeStatus_(sheet, row, 'No Gmail draft - suppressed', '');
      return false;
    }

    if (hasGmailDraft_(sheet, row)) {
      writeStatus_(sheet, row, 'Skipped - Gmail draft already exists', '');
      return true;
    }

    const draft = GmailApp.createDraft(
      lead.email,
      subject,
      body,
      {
        name: 'Aaron'
      }
    );

    sheet.getRange(row, CONFIG.COL_GMAIL_DRAFT_ID).setValue(draft.getId());
    writeStatus_(sheet, row, 'Gmail draft created', '');

    return true;
  } catch (err) {
    writeStatus_(sheet, row, 'Gmail draft error', String(err.message || err));
    return false;
  }
}

/************************************************************
 * Scheduling + reply safety
 ************************************************************/

function scheduleSelectedCampaignRows() {
  const sheet = getCampaignSheet_();

  ensureCampaignHeaders_(sheet);
  ensureHelperHeaders_(sheet);

  const ui = SpreadsheetApp.getUi();

  const selectedRows = getSelectedRowNumbers_(sheet)
    .filter(row => row >= CONFIG.FIRST_LEAD_ROW);

  if (!selectedRows.length) {
    ui.alert('Select one or more campaign rows first.');
    return;
  }

  const prompt = ui.prompt(
    'Schedule selected rows',
    'Enter first send date/time as YYYY-MM-DD HH:MM, e.g. 2026-05-14 09:30',
    ui.ButtonSet.OK_CANCEL
  );

  if (prompt.getSelectedButton() !== ui.Button.OK) return;

  const sendAt = parseScheduleDate_(prompt.getResponseText());

  if (!sendAt) {
    ui.alert('Could not understand that date/time. Use YYYY-MM-DD HH:MM, e.g. 2026-05-14 09:30.');
    return;
  }

  let scheduled = 0;
  let skipped = 0;

  selectedRows.forEach(row => {
    const lead = getLeadFromRow_(sheet, row);
    const subject = clean_(sheet.getRange(row, CONFIG.COL_SUBJECT).getValue());
    const body = clean_(sheet.getRange(row, CONFIG.COL_INITIAL_EMAIL).getValue());

    if (!lead.company || !lead.email || !isValidEmail_(lead.email) || !subject || !body) {
      skipped++;
      return;
    }

    if (shouldSuppressLead_(lead)) {
      skipped++;
      sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Suppressed');
      sheet.getRange(row, CONFIG.COL_STOP_SEQUENCE).setValue('Yes');
      return;
    }

    sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Active');
    sheet.getRange(row, CONFIG.COL_NEXT_SEND_AT).setValue(sendAt);
    sheet.getRange(row, CONFIG.COL_LAST_SENT_STEP).setValue(0);
    sheet.getRange(row, CONFIG.COL_REPLY_RECEIVED).setValue('No');
    sheet.getRange(row, CONFIG.COL_STOP_SEQUENCE).setValue('No');
    sheet.getRange(row, CONFIG.COL_SEND_ERROR).setValue('');

    scheduled++;
  });

  ui.alert(
    [
      'Scheduling complete.',
      `Scheduled: ${scheduled}`,
      `Skipped missing email/subject/body/suppressed: ${skipped}`,
      'Make sure the 15-minute scheduled sender trigger is installed.'
    ].join('\n')
  );
}

function installScheduledSenderTrigger() {
  deleteTriggersForFunction_('sendDueCampaignEmails');

  ScriptApp
    .newTrigger('sendDueCampaignEmails')
    .timeBased()
    .everyMinutes(15)
    .create();

  SpreadsheetApp.getUi().alert(
    'Scheduled sender installed. It will check due campaign rows roughly every 15 minutes.'
  );
}

function installGmailEnquirySyncTrigger() {
  deleteTriggersForFunction_('autoSyncGmailEnquiries');
  deleteTriggersForFunction_('autoHourlyGmailBackendSync');

  const trigger = ScriptApp
    .newTrigger('autoHourlyGmailBackendSync')
    .timeBased()
    .everyHours(1)
    .create();

  const result = {
    ok: true,
    handler: 'autoHourlyGmailBackendSync',
    triggerId: trigger.getUniqueId ? trigger.getUniqueId() : '',
    intervalMinutes: 60
  };

  try {
    SpreadsheetApp.getUi().alert(
      'Hourly Gmail backend sync installed. It will import buyer enquiries and flag missed business emails roughly every hour.'
    );
  } catch (err) {}

  return result;
}

function autoSyncGmailEnquiries() {
  return autoHourlyGmailBackendSync();
}

function autoHourlyGmailBackendSync() {
  const buyerEnquirySync = syncGmailEnquiries_({
    days: 14,
    includeBusinessInbox: false,
    importAmbiguousBusiness: false,
    limitPerQuery: 20,
    maxThreads: 50
  });

  const broadInboxCheck = syncGmailEnquiries_({
    days: 3,
    includeBusinessInbox: true,
    importAmbiguousBusiness: true,
    limitPerQuery: 20,
    maxThreads: 50
  });

  clearWebAppStateCache_(['enquiries', 'sales']);

  return {
    ok: true,
    ranAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy HH:mm'),
    buyerEnquirySync,
    broadInboxCheck
  };
}

function webAppGetGmailSyncStatus() {
  const triggers = ScriptApp
    .getProjectTriggers()
    .filter(trigger => {
      const handler = trigger.getHandlerFunction && trigger.getHandlerFunction();
      return handler === 'autoSyncGmailEnquiries' || handler === 'autoHourlyGmailBackendSync';
    })
    .map(trigger => ({
      handler: trigger.getHandlerFunction(),
      eventType: trigger.getEventType ? String(trigger.getEventType()) : '',
      source: trigger.getTriggerSource ? String(trigger.getTriggerSource()) : '',
      triggerId: trigger.getUniqueId ? trigger.getUniqueId() : ''
    }));

  return {
    ok: true,
    installed: triggers.length > 0,
    count: triggers.length,
    intervalMinutes: triggers.length ? 60 : null,
    triggers
  };
}

function webAppListGmailThreads(options) {
  const values = options || {};
  const days = Math.max(1, Math.min(Number(values.days) || 14, 365));
  const limit = Math.max(1, Math.min(Number(values.limit || values.maxThreads) || 10, 25));
  const query = clean_(values.query) || `newer_than:${days}d in:inbox -in:sent -in:trash -in:spam -category:promotions -category:social`;
  const threads = GmailApp.search(query, 0, limit);

  return {
    ok: true,
    query,
    count: threads.length,
    threads: threads.map(thread => buildGmailThreadSummary_(thread))
  };
}

function webAppGetGmailThread(threadId) {
  const id = clean_(threadId);

  if (!id) {
    throw new Error('Gmail thread ID is required.');
  }

  const thread = GmailApp.getThreadById(id);
  GmailApp.refreshThread(thread);

  return buildGmailThreadDetail_(thread);
}

function webAppSearchGoogleMapsBusinesses(options) {
  const values = options || {};
  const textQuery = clean_(values.textQuery || values.query || values.search || values.keyword);
  const apiKey = getGoogleMapsApiKey_();

  if (!textQuery) {
    throw new Error('Google Maps business search needs a text query.');
  }

  if (!apiKey) {
    throw new Error('Missing GOOGLE_MAPS_API_KEY in Script Properties.');
  }

  const pageSize = Math.max(1, Math.min(Number(values.limit || values.maxResultCount || values.pageSize) || 5, 20));
  const minRating = values.minRating === undefined || values.minRating === null || values.minRating === ''
    ? null
    : Math.max(0, Math.min(Number(values.minRating) || 0, 5));
  const includedType = clean_(values.includedType || values.type || values.placeType).toLowerCase();
  const rankPreference = clean_(values.rankPreference || values.rank || '').toUpperCase();
  const regionCode = clean_(values.regionCode || values.country || '').toUpperCase();
  const languageCode = clean_(values.languageCode || values.language || 'en-GB');
  const locationText = clean_(values.location || values.locationText || values.area || values.near);
  const fullQuery = locationText && !textQuery.toLowerCase().includes(locationText.toLowerCase())
    ? `${textQuery} in ${locationText}`
    : textQuery;

  const requestBody = {
    textQuery: fullQuery,
    languageCode,
    pageSize,
    includePureServiceAreaBusinesses: values.includeServiceAreaBusinesses === true
  };

  if (regionCode) requestBody.regionCode = regionCode;
  if (includedType) requestBody.includedType = includedType;
  if (minRating !== null) requestBody.minRating = minRating;
  if (rankPreference === 'DISTANCE' || rankPreference === 'RELEVANCE') {
    requestBody.rankPreference = rankPreference;
  }
  if (values.openNow === true) {
    requestBody.openNow = true;
  }

  const endpoint = 'https://places.googleapis.com/v1/places:searchText';
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.businessStatus',
    'places.primaryType',
    'places.primaryTypeDisplayName',
    'places.nationalPhoneNumber',
    'places.internationalPhoneNumber',
    'places.websiteUri',
    'places.googleMapsUri',
    'places.rating',
    'places.userRatingCount'
  ].join(',');

  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Google Places API error ${statusCode}: ${responseText}`);
  }

  const data = JSON.parse(responseText || '{}');
  const places = Array.isArray(data.places) ? data.places : [];
  const includeEmail = values.includeEmail === true || values.enrichWebsiteContacts === true;

  return {
    ok: true,
    query: fullQuery,
    requestedLimit: pageSize,
    returnedCount: places.length,
    nextPageToken: clean_(data.nextPageToken),
    businesses: places.map(place => {
      const website = clean_(place.websiteUri);
      const contactData = includeEmail && website ? extractBusinessWebsiteContacts_({ website }) : null;

      return {
        placeId: clean_(place.id),
        name: clean_(place.displayName && place.displayName.text),
        primaryType: clean_(place.primaryType),
        primaryTypeLabel: clean_(place.primaryTypeDisplayName && place.primaryTypeDisplayName.text),
        address: clean_(place.formattedAddress),
        phone: clean_(place.nationalPhoneNumber || place.internationalPhoneNumber),
        website,
        rating: place.rating || '',
        reviewCount: place.userRatingCount || 0,
        status: clean_(place.businessStatus),
        googleMapsUrl: clean_(place.googleMapsUri),
        emails: contactData ? contactData.emails : [],
        contactPages: contactData ? contactData.contactPages : []
      };
    })
  };
}

function webAppExtractBusinessWebsiteContacts(options) {
  return extractBusinessWebsiteContacts_(options || {});
}

function webAppCreateGmailReplyDraft(payload) {
  const values = payload || {};
  const replyPayload = values.reply && typeof values.reply === 'object' ? values.reply : {};
  const emailPayload = values.email && typeof values.email === 'object' ? values.email : {};
  const threadId = clean_(values.threadId || values.gmailThreadId);
  const body = getGmailReplyBody_(values);
  let to = firstEmailAddress_(
    values.to,
    values.email,
    values.recipient,
    values.recipientEmail,
    values.recipientEmailAddress,
    values.customerEmail,
    values.contactEmail,
    values.leadEmail,
    values.recipients,
    replyPayload,
    emailPayload,
    values.contact,
    values.customer,
    values.lead,
    values.company,
    values.item,
    values.row
  );
  let subject = clean_(values.subject || replyPayload.subject || emailPayload.subject || replyPayload.emailSubject || emailPayload.emailSubject);

  if (!body) {
    throw new Error('Reply draft needs a message body.');
  }

  if (threadId) {
    const thread = GmailApp.getThreadById(threadId);
    const detail = buildGmailThreadDetail_(thread);
    const latestInbound = getLatestInboundMessageFromThread_(thread);
    to = to || (latestInbound && latestInbound.sender && latestInbound.sender.email) || detail.latestSender.email;
    subject = subject || `Re: ${detail.subject.replace(/^Re:\s*/i, '')}`;
  }

  if (!to || !isValidEmail_(to)) {
    throw new Error('Reply draft needs a valid recipient email address.');
  }

  if (!subject) {
    subject = 'Re: AEGIS enquiry';
  }

  const draft = GmailApp.createDraft(to, subject, body, {
    name: clean_(values.fromName) || 'Aaron'
  });

  markGmailThreadResponseInSalesOs_(threadId, 'Needs Review', 'Gmail reply draft created');

  return {
    ok: true,
    draftOnly: true,
    draftId: draft.getId(),
    threadId,
    to,
    subject
  };
}

function webAppSendGmailReply(payload) {
  const values = payload || {};
  const replyPayload = values.reply && typeof values.reply === 'object' ? values.reply : {};
  const emailPayload = values.email && typeof values.email === 'object' ? values.email : {};
  const threadId = clean_(values.threadId || values.gmailThreadId);
  const body = getGmailReplyBody_(values);
  let to = firstEmailAddress_(
    values.to,
    values.email,
    values.recipient,
    values.recipientEmail,
    values.recipientEmailAddress,
    values.customerEmail,
    values.contactEmail,
    values.leadEmail,
    values.recipients,
    replyPayload,
    emailPayload,
    values.contact,
    values.customer,
    values.lead,
    values.company,
    values.item,
    values.row
  );
  let subject = clean_(values.subject || replyPayload.subject || emailPayload.subject || replyPayload.emailSubject || emailPayload.emailSubject);

  if (!body) {
    throw new Error('Send reply needs a message body.');
  }

  if (threadId) {
    const thread = GmailApp.getThreadById(threadId);
    const detail = buildGmailThreadDetail_(thread);
    thread.reply(body, {
      name: clean_(values.fromName) || 'Aaron'
    });

    markGmailThreadResponseInSalesOs_(threadId, 'Reply Sent', 'Gmail reply sent');

    return {
      ok: true,
      sent: true,
      threadId,
      subject: detail.subject
    };
  }

  if (!to || !isValidEmail_(to)) {
    throw new Error('Send reply needs a Gmail thread ID or valid recipient email address.');
  }

  subject = subject || 'Re: AEGIS enquiry';
  GmailApp.sendEmail(to, subject, body, {
    name: clean_(values.fromName) || 'Aaron'
  });

  return {
    ok: true,
    sent: true,
    to,
    subject
  };
}

function getGmailReplyBody_(values) {
  const source = values || {};
  return clean_(
    source.body ||
    source.message ||
    source.replyBody ||
    source.draftBody ||
    source.replyText ||
    source.enquiryText ||
    source.text ||
    source.content
  );
}

function extractBusinessWebsiteContacts_(options) {
  const website = clean_(options.website || options.url || options.websiteUri);

  if (!website) {
    throw new Error('Business website URL is required.');
  }

  const startUrl = normaliseWebsiteUrl_(website);
  const visited = {};
  const queue = [startUrl];
  const pages = [];
  const emails = {};
  const contactPages = {};
  const maxPages = Math.max(1, Math.min(Number(options.maxPages) || 3, 5));
  const host = getUrlHost_(startUrl);

  while (queue.length && pages.length < maxPages) {
    const currentUrl = queue.shift();
    if (!currentUrl || visited[currentUrl]) continue;
    visited[currentUrl] = true;

    const page = fetchWebsitePage_(currentUrl);
    if (!page.ok) continue;

    pages.push({
      url: currentUrl,
      title: extractHtmlTitle_(page.html),
      statusCode: page.statusCode
    });

    extractEmailsFromText_(page.text).forEach(email => {
      emails[email.toLowerCase()] = email;
    });

    findLikelyContactLinks_(page.html, currentUrl, host).forEach(link => {
      if (!visited[link] && queue.indexOf(link) === -1 && queue.length + pages.length < maxPages + 2) {
        queue.push(link);
      }
      contactPages[link] = link;
    });
  }

  return {
    ok: true,
    website: startUrl,
    emails: Object.keys(emails).map(key => emails[key]).slice(0, 10),
    contactPages: Object.keys(contactPages).slice(0, 10),
    pagesScanned: pages
  };
}

function normaliseWebsiteUrl_(value) {
  let url = clean_(value);
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

function getUrlHost_(url) {
  const match = clean_(url).match(/^https?:\/\/([^\/?#]+)/i);
  return match ? match[1].toLowerCase() : '';
}

function fetchWebsitePage_(url) {
  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AEGIS Sales OS; +https://aegis-allterrain.co.uk)'
      }
    });
    const statusCode = response.getResponseCode();
    const html = response.getContentText() || '';
    return {
      ok: statusCode >= 200 && statusCode < 400,
      statusCode,
      html,
      text: stripHtml_(html)
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 0,
      html: '',
      text: '',
      error: error && error.message ? error.message : String(error)
    };
  }
}

function stripHtml_(html) {
  return clean_(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
  );
}

function extractHtmlTitle_(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return clean_(match ? match[1] : '');
}

function extractEmailsFromText_(text) {
  const matches = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  const blocked = [
    'example.com',
    'example.org',
    'email.com',
    'domain.com',
    'sentry.io',
    'wix.com'
  ];

  return [...new Set(matches
    .map(item => clean_(item))
    .filter(Boolean)
    .filter(email => blocked.every(domain => !email.toLowerCase().endsWith('@' + domain)))
  )];
}

function findLikelyContactLinks_(html, baseUrl, host) {
  const links = [];
  const regex = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = regex.exec(String(html || '')))) {
    const href = clean_(match[1]);
    const label = clean_(stripHtml_(match[2])).toLowerCase();
    const haystack = `${href} ${label}`.toLowerCase();

    if (!/contact|about|team|get in touch|enquiry|enquiries/i.test(haystack)) continue;

    const absolute = resolveUrl_(baseUrl, href);
    if (!absolute) continue;
    if (getUrlHost_(absolute) !== host) continue;
    links.push(absolute);
  }

  return [...new Set(links)].slice(0, 5);
}

function resolveUrl_(baseUrl, href) {
  const value = clean_(href);
  if (!value) return '';
  if (/^mailto:/i.test(value) || /^tel:/i.test(value) || /^javascript:/i.test(value)) return '';
  if (/^https?:\/\//i.test(value)) return value;

  const base = clean_(baseUrl);
  const originMatch = base.match(/^(https?:\/\/[^\/?#]+)/i);
  const origin = originMatch ? originMatch[1] : '';

  if (!origin) return '';
  if (value.startsWith('/')) return origin + value;

  return base.replace(/\/[^\/?#]*([?#].*)?$/, '/') + value;
}

function buildGmailThreadSummary_(thread) {
  GmailApp.refreshThread(thread);

  const messages = thread.getMessages();
  const latest = messages[messages.length - 1];
  const latestBody = latest ? trimReplyText_(latest.getPlainBody ? latest.getPlainBody() : latest.getBody()) : '';

  return {
    threadId: thread.getId(),
    subject: clean_(thread.getFirstMessageSubject ? thread.getFirstMessageSubject() : (latest && latest.getSubject())),
    messageCount: messages.length,
    latestFrom: latest ? clean_(latest.getFrom()) : '',
    latestSender: latest ? parseEmailSender_(latest.getFrom()) : {},
    latestDate: latest ? latest.getDate() : '',
    snippet: shortenForSheet_(latestBody, 350),
    unread: thread.isUnread ? thread.isUnread() : false,
    important: thread.isImportant ? thread.isImportant() : false
  };
}

function buildGmailThreadDetail_(thread) {
  GmailApp.refreshThread(thread);

  const messages = thread.getMessages();
  const latest = messages[messages.length - 1];

  return {
    ok: true,
    threadId: thread.getId(),
    subject: clean_(thread.getFirstMessageSubject ? thread.getFirstMessageSubject() : (latest && latest.getSubject())),
    messageCount: messages.length,
    latestSender: latest ? parseEmailSender_(latest.getFrom()) : {},
    messages: messages.slice(-12).map(message => {
      const body = trimReplyText_(message.getPlainBody ? message.getPlainBody() : message.getBody());
      return {
        id: message.getId ? message.getId() : '',
        date: message.getDate(),
        from: clean_(message.getFrom()),
        sender: parseEmailSender_(message.getFrom()),
        to: clean_(message.getTo ? message.getTo() : ''),
        subject: clean_(message.getSubject ? message.getSubject() : ''),
        bodyExcerpt: shortenForSheet_(body, 1200)
      };
    })
  };
}

function getLatestInboundMessageFromThread_(thread) {
  GmailApp.refreshThread(thread);

  const messages = thread.getMessages();
  const myEmails = getMyEmailAddresses_();

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const from = String(message.getFrom() || '').toLowerCase();

    if (!isFromMe_(from, myEmails)) {
      return {
        message,
        sender: parseEmailSender_(message.getFrom()),
        date: message.getDate()
      };
    }
  }

  if (!messages.length) return null;

  const fallback = messages[messages.length - 1];
  return {
    message: fallback,
    sender: parseEmailSender_(fallback.getFrom()),
    date: fallback.getDate()
  };
}

function markGmailThreadResponseInSalesOs_(threadId, stage, note) {
  const id = clean_(threadId);

  if (!id) return;

  markEnquiryThreadResponse_(id, stage, note);
  markOpportunityThreadResponse_(id, stage, note);
}

function markEnquiryThreadResponse_(threadId, stage, note) {
  const sheet = getEnquirySheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < ENQUIRY_CONFIG.FIRST_ROW) return false;

  const ids = sheet
    .getRange(ENQUIRY_CONFIG.FIRST_ROW, ENQUIRY_CONFIG.COL_GMAIL_THREAD_ID, lastRow - ENQUIRY_CONFIG.FIRST_ROW + 1, 1)
    .getValues();

  for (let i = 0; i < ids.length; i++) {
    if (clean_(ids[i][0]) !== threadId) continue;

    const row = ENQUIRY_CONFIG.FIRST_ROW + i;
    const existingNotes = clean_(sheet.getRange(row, ENQUIRY_CONFIG.COL_OWNER_NOTES).getValue());
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy HH:mm');

    sheet.getRange(row, ENQUIRY_CONFIG.COL_STAGE).setValue(stage);
    sheet.getRange(row, ENQUIRY_CONFIG.COL_LAST_CONTACTED_AT).setValue(new Date());
    sheet.getRange(row, ENQUIRY_CONFIG.COL_OWNER_NOTES).setValue([existingNotes, `${note} on ${stamp}`].filter(Boolean).join('\n'));
    sheet.getRange(row, ENQUIRY_CONFIG.COL_UPDATED_AT).setValue(new Date());
    clearWebAppStateCache_(['enquiries', 'sales']);
    return true;
  }

  return false;
}

function markOpportunityThreadResponse_(threadId, stage, note) {
  const sheet = getOpportunitySheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < OPPORTUNITY_CONFIG.FIRST_ROW) return false;

  const values = sheet
    .getRange(OPPORTUNITY_CONFIG.FIRST_ROW, OPPORTUNITY_CONFIG.COL_GMAIL_THREAD_ID, lastRow - OPPORTUNITY_CONFIG.FIRST_ROW + 1, 1)
    .getValues();

  for (let i = 0; i < values.length; i++) {
    if (clean_(values[i][0]) !== threadId) continue;

    const row = OPPORTUNITY_CONFIG.FIRST_ROW + i;
    const existingNotes = clean_(sheet.getRange(row, OPPORTUNITY_CONFIG.COL_OWNER_NOTES).getValue());
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy HH:mm');

    sheet.getRange(row, OPPORTUNITY_CONFIG.COL_STAGE).setValue(stage);
    sheet.getRange(row, OPPORTUNITY_CONFIG.COL_OWNER_NOTES).setValue([existingNotes, `${note} on ${stamp}`].filter(Boolean).join('\n'));
    sheet.getRange(row, OPPORTUNITY_CONFIG.COL_UPDATED_AT).setValue(new Date());
    clearWebAppStateCache_(['opportunities', 'sales', 'calendar']);
    return true;
  }

  return false;
}

function sendDueCampaignEmails() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    return;
  }

  try {
    const sheet = getCampaignSheet_();

    ensureCampaignHeaders_(sheet);
    ensureHelperHeaders_(sheet);

    const now = new Date();
    const lastRow = sheet.getLastRow();

    for (let row = CONFIG.FIRST_LEAD_ROW; row <= lastRow; row++) {
      const lead = getLeadFromRow_(sheet, row);

      if (!lead.company || !lead.email || !isValidEmail_(lead.email)) continue;

      const sequenceStatus = clean_(sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).getValue()).toLowerCase();
      const replyReceived = clean_(sheet.getRange(row, CONFIG.COL_REPLY_RECEIVED).getValue()).toLowerCase();
      const stopSequence = clean_(sheet.getRange(row, CONFIG.COL_STOP_SEQUENCE).getValue()).toLowerCase();
      const nextSendAt = sheet.getRange(row, CONFIG.COL_NEXT_SEND_AT).getValue();

      if (stopSequence === 'yes') continue;
      if (replyReceived === 'yes') continue;
      if (sequenceStatus.includes('replied')) continue;
      if (sequenceStatus.includes('stopped')) continue;
      if (sequenceStatus.includes('complete')) continue;
      if (!(nextSendAt instanceof Date)) continue;
      if (nextSendAt > now) continue;

      // Safety check immediately before sending.
      if (checkRepliesForRow_(sheet, row)) continue;

      const lastStep = Number(sheet.getRange(row, CONFIG.COL_LAST_SENT_STEP).getValue()) || 0;
      const nextStep = lastStep + 1;

      if (nextStep > 3) {
        sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Completed');
        sheet.getRange(row, CONFIG.COL_NEXT_SEND_AT).setValue('');
        continue;
      }

      const content = getEmailStepContent_(sheet, row, nextStep);

      if (!content.body || (nextStep === 1 && !content.subject)) {
        sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Send blocked - missing content');
        sheet.getRange(row, CONFIG.COL_SEND_ERROR).setValue(`Missing subject/body for step ${nextStep}`);
        continue;
      }

      try {
        sendCampaignStep_(sheet, row, lead, nextStep, content, now);
      } catch (err) {
        sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Send error');
        sheet.getRange(row, CONFIG.COL_SEND_ERROR).setValue(String(err.message || err));
      }

      Utilities.sleep(500);
    }
  } finally {
    lock.releaseLock();
  }
}

function sendCampaignStep_(sheet, row, lead, step, content, now) {
  let threadId = clean_(sheet.getRange(row, CONFIG.COL_GMAIL_THREAD_ID).getValue());

  if (step === 1 || !threadId) {
    const draft = GmailApp.createDraft(
      lead.email,
      content.subject,
      content.body,
      {
        name: 'Aaron'
      }
    );

    const sentMessage = draft.send();
    threadId = sentMessage.getThread().getId();

    sheet.getRange(row, CONFIG.COL_GMAIL_THREAD_ID).setValue(threadId);
  } else {
    const thread = GmailApp.getThreadById(threadId);

    thread.reply(content.body, {
      name: 'Aaron'
    });
  }

  const nextSendAt = getNextSendDate_(now, step);

  sheet.getRange(row, CONFIG.COL_LAST_SENT_STEP).setValue(step);
  sheet.getRange(row, CONFIG.COL_LAST_SENT_AT).setValue(now);
  sheet.getRange(row, CONFIG.COL_SEND_ERROR).setValue('');

  if (step === 1) {
    sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Initial sent');
  } else if (step === 2) {
    sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Follow-up 1 sent');
  } else if (step === 3) {
    sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Follow-up 2 sent');
  }

  if (nextSendAt) {
    sheet.getRange(row, CONFIG.COL_NEXT_SEND_AT).setValue(nextSendAt);
  } else {
    sheet.getRange(row, CONFIG.COL_NEXT_SEND_AT).setValue('');
    sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Completed');
  }
}

function getEmailStepContent_(sheet, row, step) {
  const subject = clean_(sheet.getRange(row, CONFIG.COL_SUBJECT).getValue());

  if (step === 1) {
    return {
      subject: subject,
      body: clean_(sheet.getRange(row, CONFIG.COL_INITIAL_EMAIL).getValue())
    };
  }

  if (step === 2) {
    return {
      subject: subject ? `Re: ${subject}` : '',
      body: clean_(sheet.getRange(row, CONFIG.COL_FOLLOWUP_1).getValue())
    };
  }

  if (step === 3) {
    return {
      subject: subject ? `Re: ${subject}` : '',
      body: clean_(sheet.getRange(row, CONFIG.COL_FOLLOWUP_2).getValue())
    };
  }

  return {
    subject: '',
    body: ''
  };
}

function getNextSendDate_(now, stepJustSent) {
  if (stepJustSent === 1) {
    return addDays_(now, 3);
  }

  if (stepJustSent === 2) {
    return addDays_(now, 5);
  }

  return '';
}

function addDays_(date, days) {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + days);
  return newDate;
}

function checkRepliesAndPauseSequences() {
  const sheet = getCampaignSheet_();
  const lastRow = sheet.getLastRow();

  let paused = 0;

  for (let row = CONFIG.FIRST_LEAD_ROW; row <= lastRow; row++) {
    const didPause = checkRepliesForRow_(sheet, row);

    if (didPause) paused++;

    Utilities.sleep(100);
  }

  SpreadsheetApp.getUi().alert(`Reply check complete. Paused sequences: ${paused}`);
}

function checkRepliesForRow_(sheet, row) {
  const threadId = clean_(sheet.getRange(row, CONFIG.COL_GMAIL_THREAD_ID).getValue());

  if (!threadId) return false;

  const alreadyReplied = clean_(sheet.getRange(row, CONFIG.COL_REPLY_RECEIVED).getValue()).toLowerCase();

  if (alreadyReplied === 'yes') {
    const existingReply = getLatestInboundReplyForRow_(sheet, row);
    if (existingReply) {
      upsertOpportunityFromCampaignRow_(sheet, row, existingReply);
    }
    return true;
  }

  const reply = getLatestInboundReplyForRow_(sheet, row);

  if (!reply) return false;

  sheet.getRange(row, CONFIG.COL_REPLY_RECEIVED).setValue('Yes');
  sheet.getRange(row, CONFIG.COL_STOP_SEQUENCE).setValue('Yes');
  sheet.getRange(row, CONFIG.COL_LAST_REPLY_AT).setValue(reply.date);
  sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Replied - sequence paused');
  sheet.getRange(row, CONFIG.COL_NEXT_SEND_AT).setValue('');

  upsertOpportunityFromCampaignRow_(sheet, row, reply);

  return true;
}

function getLatestInboundReplyForRow_(sheet, row) {
  const threadId = clean_(sheet.getRange(row, CONFIG.COL_GMAIL_THREAD_ID).getValue());

  const lastSentAt = sheet.getRange(row, CONFIG.COL_LAST_SENT_AT).getValue();
  const threshold = lastSentAt instanceof Date ? lastSentAt : new Date(0);

  let thread;

  try {
    thread = GmailApp.getThreadById(threadId);
  } catch (err) {
    sheet.getRange(row, CONFIG.COL_SEND_ERROR).setValue(`Could not check thread: ${String(err.message || err)}`);
    return null;
  }

  GmailApp.refreshThread(thread);

  const messages = thread.getMessages();
  const myEmails = getMyEmailAddresses_();
  let latestReply = null;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const messageDate = message.getDate();
    const from = String(message.getFrom() || '').toLowerCase();

    if (messageDate > threshold && !isFromMe_(from, myEmails)) {
      latestReply = {
        date: messageDate,
        from: String(message.getFrom() || ''),
        text: trimReplyText_(message.getPlainBody ? message.getPlainBody() : message.getBody())
      };
    }
  }

  return latestReply;
}

function trimReplyText_(value) {
  const text = clean_(value)
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const cutMarkers = [
    '\nOn ',
    '\nFrom:',
    '\nSent:',
    '\n-----Original Message-----'
  ];

  let cutAt = text.length;

  cutMarkers.forEach(marker => {
    const index = text.indexOf(marker);
    if (index > 0 && index < cutAt) cutAt = index;
  });

  return text.slice(0, cutAt).trim().slice(0, 5000);
}

function getMyEmailAddresses_() {
  const emails = [];

  try {
    const activeEmail = Session.getActiveUser().getEmail();

    if (activeEmail) emails.push(activeEmail.toLowerCase());
  } catch (err) {}

  try {
    GmailApp.getAliases().forEach(alias => {
      if (alias) emails.push(String(alias).toLowerCase());
    });
  } catch (err) {}

  return [...new Set(emails)];
}

function isFromMe_(fromText, myEmails) {
  const lowerFrom = String(fromText || '').toLowerCase();

  if (!myEmails.length) {
    return false;
  }

  return myEmails.some(email => lowerFrom.includes(email));
}

function parseScheduleDate_(value) {
  const text = clean_(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  const date = new Date(year, month, day, hour, minute, 0, 0);

  if (isNaN(date.getTime())) return null;

  return date;
}

function deleteTriggersForFunction_(functionName) {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction && trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/************************************************************
 * Opportunities / reply workflow
 ************************************************************/

function getOpportunitySheet_() {
  const ss = getAegisWorkbook_();
  let sheet = ss.getSheetByName(OPPORTUNITY_CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(OPPORTUNITY_CONFIG.SHEET_NAME);
  }

  ensureOpportunityHeaders_(sheet);
  return sheet;
}

function ensureOpportunityHeaders_(sheet) {
  const headers = [[
    'Opportunity ID',
    'Campaign Row',
    'Source Row',
    'Company',
    'Contact',
    'Email',
    'Stage',
    'Classification',
    'Last Reply At',
    'Last Reply From',
    'Last Reply Text',
    'AI Reply Draft',
    'Gmail Draft ID',
    'Next Action',
    'Owner Notes',
    'Gmail Thread ID',
    'Campaign Subject',
    'Original Email',
    'Created At',
    'Updated At',
    'Error'
  ]];

  sheet
    .getRange(OPPORTUNITY_CONFIG.HEADER_ROW, 1, 1, OPPORTUNITY_CONFIG.COL_ERROR)
    .setValues(headers)
    .setFontWeight('bold')
    .setBackground('#202331')
    .setFontColor('#FFFFFF')
    .setWrap(true);

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(OPPORTUNITY_CONFIG.COL_ID, 170);
  sheet.setColumnWidth(OPPORTUNITY_CONFIG.COL_COMPANY, 230);
  sheet.setColumnWidth(OPPORTUNITY_CONFIG.COL_STAGE, 150);
  sheet.setColumnWidth(OPPORTUNITY_CONFIG.COL_CLASSIFICATION, 170);
  sheet.setColumnWidth(OPPORTUNITY_CONFIG.COL_LAST_REPLY_TEXT, 420);
  sheet.setColumnWidth(OPPORTUNITY_CONFIG.COL_AI_REPLY_DRAFT, 420);
  sheet.setColumnWidth(OPPORTUNITY_CONFIG.COL_NEXT_ACTION, 260);
  sheet.setColumnWidth(OPPORTUNITY_CONFIG.COL_OWNER_NOTES, 260);
  sheet.setColumnWidth(OPPORTUNITY_CONFIG.COL_ERROR, 300);
}

function syncRepliesToOpportunities_() {
  const sheet = getCampaignSheet_();
  const lastRow = sheet.getLastRow();
  let synced = 0;

  for (let row = CONFIG.FIRST_LEAD_ROW; row <= lastRow; row++) {
    const threadId = clean_(sheet.getRange(row, CONFIG.COL_GMAIL_THREAD_ID).getValue());
    if (!threadId) continue;

    const wasReplied = clean_(sheet.getRange(row, CONFIG.COL_REPLY_RECEIVED).getValue()).toLowerCase() === 'yes';
    const didReply = checkRepliesForRow_(sheet, row);

    if (didReply || wasReplied) synced++;
    Utilities.sleep(100);
  }

  return synced;
}

function upsertOpportunityFromCampaignRow_(campaignSheet, campaignRow, reply) {
  const lead = getLeadFromRow_(campaignSheet, campaignRow);
  const threadId = clean_(campaignSheet.getRange(campaignRow, CONFIG.COL_GMAIL_THREAD_ID).getValue());

  if (!lead.company || !threadId) return '';

  const sheet = getOpportunitySheet_();
  const opportunityId = buildOpportunityId_(threadId, campaignRow);
  const row = findOpportunityRow_(sheet, opportunityId, threadId, campaignRow) || Math.max(sheet.getLastRow() + 1, OPPORTUNITY_CONFIG.FIRST_ROW);
  const now = new Date();
  const existingCreatedAt = row >= OPPORTUNITY_CONFIG.FIRST_ROW
    ? sheet.getRange(row, OPPORTUNITY_CONFIG.COL_CREATED_AT).getValue()
    : '';
  const existingStage = clean_(sheet.getRange(row, OPPORTUNITY_CONFIG.COL_STAGE).getValue()) || 'New Reply';
  const existingDraft = clean_(sheet.getRange(row, OPPORTUNITY_CONFIG.COL_AI_REPLY_DRAFT).getValue());
  const existingGmailDraft = clean_(sheet.getRange(row, OPPORTUNITY_CONFIG.COL_GMAIL_DRAFT_ID).getValue());
  const existingClassification = clean_(sheet.getRange(row, OPPORTUNITY_CONFIG.COL_CLASSIFICATION).getValue());
  const existingNextAction = clean_(sheet.getRange(row, OPPORTUNITY_CONFIG.COL_NEXT_ACTION).getValue());
  const existingOwnerNotes = clean_(sheet.getRange(row, OPPORTUNITY_CONFIG.COL_OWNER_NOTES).getValue());

  const values = [[
    opportunityId,
    campaignRow,
    lead.sourceRow || '',
    lead.company || '',
    lead.contact || '',
    lead.email || '',
    existingStage,
    existingClassification,
    reply && reply.date ? reply.date : '',
    reply && reply.from ? reply.from : '',
    reply && reply.text ? reply.text : '',
    existingDraft,
    existingGmailDraft,
    existingNextAction,
    existingOwnerNotes,
    threadId,
    clean_(campaignSheet.getRange(campaignRow, CONFIG.COL_SUBJECT).getValue()),
    clean_(campaignSheet.getRange(campaignRow, CONFIG.COL_INITIAL_EMAIL).getValue()),
    existingCreatedAt instanceof Date ? existingCreatedAt : now,
    now,
    ''
  ]];

  sheet
    .getRange(row, 1, 1, OPPORTUNITY_CONFIG.COL_ERROR)
    .setValues(values)
    .setVerticalAlignment('top')
    .setWrap(true);

  return opportunityId;
}

function buildOpportunityId_(threadId, campaignRow) {
  return `OPP-${String(campaignRow)}-${String(threadId).slice(-8)}`;
}

function findOpportunityRow_(sheet, opportunityId, threadId, campaignRow) {
  const lastRow = sheet.getLastRow();
  if (lastRow < OPPORTUNITY_CONFIG.FIRST_ROW) return 0;

  const values = sheet
    .getRange(OPPORTUNITY_CONFIG.FIRST_ROW, 1, lastRow - OPPORTUNITY_CONFIG.FIRST_ROW + 1, OPPORTUNITY_CONFIG.COL_GMAIL_THREAD_ID)
    .getValues();

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const id = clean_(row[OPPORTUNITY_CONFIG.COL_ID - 1]);
    const existingThreadId = clean_(row[OPPORTUNITY_CONFIG.COL_GMAIL_THREAD_ID - 1]);
    const existingCampaignRow = Number(row[OPPORTUNITY_CONFIG.COL_CAMPAIGN_ROW - 1]);

    if (
      (opportunityId && id === opportunityId) ||
      (threadId && existingThreadId === threadId) ||
      (campaignRow && existingCampaignRow === Number(campaignRow))
    ) {
      return OPPORTUNITY_CONFIG.FIRST_ROW + i;
    }
  }

  return 0;
}

function getOpportunityById_(opportunityId) {
  const sheet = getOpportunitySheet_();
  const row = findOpportunityRow_(sheet, clean_(opportunityId), '', 0);

  if (!row) {
    throw new Error('Opportunity not found.');
  }

  return {
    sheet,
    row,
    opportunity: buildWebOpportunity_(sheet.getRange(row, 1, 1, OPPORTUNITY_CONFIG.COL_ERROR).getValues()[0])
  };
}

function buildWebOpportunity_(r) {
  return {
    id: clean_(r[OPPORTUNITY_CONFIG.COL_ID - 1]),
    campaignRow: Number(r[OPPORTUNITY_CONFIG.COL_CAMPAIGN_ROW - 1]) || 0,
    sourceRow: clean_(r[OPPORTUNITY_CONFIG.COL_SOURCE_ROW - 1]),
    company: clean_(r[OPPORTUNITY_CONFIG.COL_COMPANY - 1]),
    contact: clean_(r[OPPORTUNITY_CONFIG.COL_CONTACT - 1]),
    email: clean_(r[OPPORTUNITY_CONFIG.COL_EMAIL - 1]),
    stage: clean_(r[OPPORTUNITY_CONFIG.COL_STAGE - 1]),
    classification: clean_(r[OPPORTUNITY_CONFIG.COL_CLASSIFICATION - 1]),
    lastReplyAt: formatWebDate_(r[OPPORTUNITY_CONFIG.COL_LAST_REPLY_AT - 1]),
    lastReplyFrom: clean_(r[OPPORTUNITY_CONFIG.COL_LAST_REPLY_FROM - 1]),
    lastReplyText: clean_(r[OPPORTUNITY_CONFIG.COL_LAST_REPLY_TEXT - 1]),
    aiReplyDraft: clean_(r[OPPORTUNITY_CONFIG.COL_AI_REPLY_DRAFT - 1]),
    gmailDraftId: clean_(r[OPPORTUNITY_CONFIG.COL_GMAIL_DRAFT_ID - 1]),
    nextAction: clean_(r[OPPORTUNITY_CONFIG.COL_NEXT_ACTION - 1]),
    ownerNotes: clean_(r[OPPORTUNITY_CONFIG.COL_OWNER_NOTES - 1]),
    gmailThreadId: clean_(r[OPPORTUNITY_CONFIG.COL_GMAIL_THREAD_ID - 1]),
    campaignSubject: clean_(r[OPPORTUNITY_CONFIG.COL_CAMPAIGN_SUBJECT - 1]),
    originalEmail: clean_(r[OPPORTUNITY_CONFIG.COL_ORIGINAL_EMAIL - 1]),
    createdAt: formatWebDate_(r[OPPORTUNITY_CONFIG.COL_CREATED_AT - 1]),
    updatedAt: formatWebDate_(r[OPPORTUNITY_CONFIG.COL_UPDATED_AT - 1]),
    error: clean_(r[OPPORTUNITY_CONFIG.COL_ERROR - 1])
  };
}

/************************************************************
 * OpenAI API call
 ************************************************************/

function callOpenAIForEmailDraft_(lead) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('OPENAI_API_KEY');
  const model = props.getProperty('OPENAI_MODEL') || 'gpt-5-mini';

  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY. Use AI Email Tool > Set OpenAI Config.');
  }

  const endpoint = 'https://api.openai.com/v1/responses';

  const instructions = `
You are an expert B2B email copywriter for a small automation business.

Seller:
- Name: Aaron

Product:
- Flagship product: WhatsApp Email Assistant
- Price: £80
- It scans incoming emails
- Sends concise email summaries to WhatsApp
- Creates reply drafts
- User can approve/send, regenerate, or edit before sending
- Optional extra-cost services: CRM integrations, calendar integrations, workflow automations, and manual task automation
- Offer: free discovery call to understand current workflow, current tools, manual admin, and automation opportunities

Writing rules:
- Use UK English.
- Keep the emails short, clear, practical, and friendly.
- Avoid hype.
- Do not overpromise.
- Do not pretend Aaron spoke to the decision maker unless the notes say so.
- If the note says "not interested", recommend suppression rather than pushing.
- If email/contact is missing, create a call/research recommendation rather than a full email.
- Return only valid JSON matching the requested schema.
`;

  const userInput = `
Create campaign copy for this lead.

Lead details:
Company: ${lead.company}
Contact: ${lead.contact || 'Unknown'}
Email: ${lead.email || 'Missing'}
Call outcome / note: ${lead.note || 'None'}
Segment: ${lead.segment || 'None'}
Recommended action: ${lead.action || 'None'}
API prompt context: ${lead.apiContext || 'None'}

Return JSON only with exactly these keys:
{
  "subject": "string",
  "initial_email": "string",
  "follow_up_1": "string",
  "follow_up_2": "string",
  "call_script": "string",
  "status_recommendation": "string"
}
`;

  const payload = {
    model: model,
    instructions: instructions,
    input: userInput,
    text: {
      format: {
        type: 'json_schema',
        name: 'email_campaign_draft',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            subject: { type: 'string' },
            initial_email: { type: 'string' },
            follow_up_1: { type: 'string' },
            follow_up_2: { type: 'string' },
            call_script: { type: 'string' },
            status_recommendation: { type: 'string' }
          },
          required: [
            'subject',
            'initial_email',
            'follow_up_1',
            'follow_up_2',
            'call_script',
            'status_recommendation'
          ]
        }
      }
    }
  };

  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`OpenAI API error ${statusCode}: ${responseText}`);
  }

  const data = JSON.parse(responseText);
  const outputText = extractOpenAIText_(data);

  if (!outputText) {
    throw new Error('OpenAI returned no text output.');
  }

  try {
    return JSON.parse(outputText);
  } catch (err) {
    throw new Error(`Could not parse OpenAI JSON output: ${outputText}`);
  }
}

function callOpenAIForReplyDraft_(opportunity) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('OPENAI_API_KEY');
  const model = props.getProperty('OPENAI_MODEL') || 'gpt-5-mini';
  const bookingLink = getCalendarBookingLink_();

  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY. Use AI Email Tool > Set OpenAI Config.');
  }

  const endpoint = 'https://api.openai.com/v1/responses';

  const instructions = `
You are Aaron's B2B sales reply assistant for AEGIS Automations.

Your job:
- Read the prospect's inbound reply.
- Draft a short, natural reply that Aaron can approve before sending.
- Move the conversation toward the next useful action, usually a discovery call, extra details, or a polite close.

Writing rules:
- Use UK English.
- Sound like a practical human founder, not a marketing blast.
- Do not overpromise.
- Do not invent details.
- If the reply is not interested, recommend closing or nurture rather than pushing.
- If they ask a question, answer it directly before suggesting a next step.
- If a meeting, call, demo, appointment, or specific time is being discussed, include the booking link naturally.
- Do not include the booking link when the prospect has not shown enough intent or when it would feel pushy.
- Return only valid JSON matching the requested schema.
`;

  const userInput = `
Create an approved-review reply draft for this opportunity.

Company: ${opportunity.company}
Contact: ${opportunity.contact || 'Unknown'}
Email: ${opportunity.email || 'Unknown'}
Current stage: ${opportunity.stage || 'New Reply'}
Campaign subject: ${opportunity.campaignSubject || 'Unknown'}
Original email Aaron sent:
${opportunity.originalEmail || 'Unknown'}

Prospect reply:
${opportunity.lastReplyText || 'No reply text captured'}

Owner notes:
${opportunity.ownerNotes || 'None'}

Calendar booking link:
${bookingLink || 'No booking link configured'}

Return JSON only with exactly these keys:
{
  "classification": "string",
  "reply_draft": "string",
  "next_action": "string",
  "stage_recommendation": "string"
}
`;

  const payload = {
    model: model,
    instructions: instructions,
    input: userInput,
    text: {
      format: {
        type: 'json_schema',
        name: 'opportunity_reply_draft',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            classification: { type: 'string' },
            reply_draft: { type: 'string' },
            next_action: { type: 'string' },
            stage_recommendation: { type: 'string' }
          },
          required: [
            'classification',
            'reply_draft',
            'next_action',
            'stage_recommendation'
          ]
        }
      }
    }
  };

  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`OpenAI API error ${statusCode}: ${responseText}`);
  }

  const data = JSON.parse(responseText);
  const outputText = extractOpenAIText_(data);

  if (!outputText) {
    throw new Error('OpenAI returned no text output.');
  }

  try {
    return JSON.parse(outputText);
  } catch (err) {
    throw new Error(`Could not parse OpenAI JSON output: ${outputText}`);
  }
}

/************************************************************
 * Campaign sheet helpers
 ************************************************************/

function getCampaignSheet_() {
  const sheet = getAegisWorkbook_().getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    throw new Error(`Sheet not found: ${CONFIG.SHEET_NAME}`);
  }

  return sheet;
}

function ensureCampaignHeaders_(sheet) {
  const headers = [[
    'Source Row',
    'Company',
    'Contact',
    'Email',
    'Call Outcome / Note',
    'Segment',
    'Recommended Action',
    'Subject',
    'Initial Email Draft',
    'Follow-up 1',
    'Follow-up 2',
    'Call Script / Next Step',
    'API Prompt Context',
    'Draft Status',
    'Last Generated',
    'Gmail Draft ID',
    'Error',
    'Sequence Status',
    'Next Send At',
    'Last Sent Step',
    'Last Sent At',
    'Gmail Thread ID',
    'Reply Received',
    'Stop Sequence',
    'Last Reply At',
    'Send Error'
  ]];

  sheet.getRange(CONFIG.HEADER_ROW, 1, 1, CONFIG.COL_SEND_ERROR).setValues(headers);

  sheet
    .getRange(CONFIG.HEADER_ROW, 1, 1, CONFIG.COL_SEND_ERROR)
    .setFontWeight('bold')
    .setBackground('#1D2330')
    .setFontColor('#FFFFFF')
    .setWrap(true);

  sheet.setColumnWidth(CONFIG.COL_SEQUENCE_STATUS, 150);
  sheet.setColumnWidth(CONFIG.COL_NEXT_SEND_AT, 160);
  sheet.setColumnWidth(CONFIG.COL_LAST_SENT_STEP, 130);
  sheet.setColumnWidth(CONFIG.COL_LAST_SENT_AT, 160);
  sheet.setColumnWidth(CONFIG.COL_GMAIL_THREAD_ID, 220);
  sheet.setColumnWidth(CONFIG.COL_REPLY_RECEIVED, 130);
  sheet.setColumnWidth(CONFIG.COL_STOP_SEQUENCE, 130);
  sheet.setColumnWidth(CONFIG.COL_LAST_REPLY_AT, 160);
  sheet.setColumnWidth(CONFIG.COL_SEND_ERROR, 320);
}

function ensureHelperHeaders_(sheet) {
  const headers = [[
    'Draft Status',
    'Last Generated',
    'Gmail Draft ID',
    'Error'
  ]];

  sheet.getRange(CONFIG.HEADER_ROW, CONFIG.COL_STATUS, 1, 4).setValues(headers);

  sheet
    .getRange(CONFIG.HEADER_ROW, CONFIG.COL_STATUS, 1, 4)
    .setFontWeight('bold')
    .setBackground('#5E4B8B')
    .setFontColor('#FFFFFF');

  sheet.setColumnWidth(CONFIG.COL_STATUS, 180);
  sheet.setColumnWidth(CONFIG.COL_LAST_GENERATED, 160);
  sheet.setColumnWidth(CONFIG.COL_GMAIL_DRAFT_ID, 220);
  sheet.setColumnWidth(CONFIG.COL_ERROR, 420);
}

function getLeadFromRow_(sheet, row) {
  return {
    row: row,
    sourceRow: sheet.getRange(row, CONFIG.COL_ROW_ID).getValue(),
    company: clean_(sheet.getRange(row, CONFIG.COL_COMPANY).getValue()),
    contact: clean_(sheet.getRange(row, CONFIG.COL_CONTACT).getValue()),
    email: clean_(sheet.getRange(row, CONFIG.COL_EMAIL).getValue()),
    note: clean_(sheet.getRange(row, CONFIG.COL_NOTE).getValue()),
    segment: clean_(sheet.getRange(row, CONFIG.COL_SEGMENT).getValue()),
    action: clean_(sheet.getRange(row, CONFIG.COL_ACTION).getValue()),
    apiContext: clean_(sheet.getRange(row, CONFIG.COL_API_CONTEXT).getValue())
  };
}

function shouldSuppressLead_(lead) {
  const combined = [
    lead.note,
    lead.segment,
    lead.action,
    lead.apiContext
  ].join(' ').toLowerCase();

  if (combined.includes('not interested')) return true;
  if (combined.includes('suppress')) return true;
  if (combined.includes('do not send')) return true;
  if (combined.includes('do not contact')) return true;
  if (combined.includes('unsubscribe')) return true;

  return false;
}

function isAlreadyDrafted_(sheet, row) {
  const status = clean_(sheet.getRange(row, CONFIG.COL_STATUS).getValue()).toLowerCase();

  if (status.includes('drafted')) return true;
  if (status.includes('ready for review')) return true;
  if (status.includes('regenerated')) return true;
  if (status.includes('gmail draft created')) return true;

  const subject = clean_(sheet.getRange(row, CONFIG.COL_SUBJECT).getValue());
  const body = clean_(sheet.getRange(row, CONFIG.COL_INITIAL_EMAIL).getValue());

  // Extra safety: if both subject and body already exist, do not overwrite them.
  if (subject && body) return true;

  return false;
}

function hasGmailDraft_(sheet, row) {
  const draftId = clean_(sheet.getRange(row, CONFIG.COL_GMAIL_DRAFT_ID).getValue());
  return Boolean(draftId);
}

function writeStatus_(sheet, row, status, errorMessage) {
  sheet.getRange(row, CONFIG.COL_STATUS).setValue(status);
  sheet.getRange(row, CONFIG.COL_LAST_GENERATED).setValue(new Date());
  sheet.getRange(row, CONFIG.COL_ERROR).setValue(errorMessage || '');
}

/************************************************************
 * Generic helpers
 ************************************************************/

function getByHeader_(rowValues, colNumber) {
  if (!colNumber) return '';
  return rowValues[colNumber - 1];
}

function firstClean_(values) {
  for (let i = 0; i < values.length; i++) {
    const value = clean_(values[i]);

    if (value) return value;
  }

  return '';
}

function clean_(value) {
  return String(value || '').trim();
}

function normaliseHeader_(value) {
  return clean_(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractEmail_(value) {
  const text = clean_(value);
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].trim() : '';
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean_(email));
}

/************************************************************
 * OpenAI response parsing
 ************************************************************/

function extractOpenAIText_(data) {
  if (data.output_text) {
    return data.output_text;
  }

  if (!data.output || !Array.isArray(data.output)) {
    return '';
  }

  const chunks = [];

  data.output.forEach(item => {
    if (!item.content || !Array.isArray(item.content)) return;

    item.content.forEach(content => {
      if (content.type === 'output_text' && content.text) {
        chunks.push(content.text);
      }

      if (content.type === 'text' && content.text) {
        chunks.push(content.text);
      }
    });
  });

  return chunks.join('\n').trim();
}

/************************************************************
 * Forklift enquiry workflow
 ************************************************************/

function getEnquirySheet_() {
  const ss = getAegisWorkbook_();
  let sheet = ss.getSheetByName(ENQUIRY_CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(ENQUIRY_CONFIG.SHEET_NAME);
  }

  ensureEnquiryHeaders_(sheet);
  return sheet;
}

function ensureEnquiryHeaders_(sheet) {
  const headers = [[
    'Enquiry ID',
    'Created At',
    'Updated At',
    'Source',
    'Stage',
    'Customer',
    'Company',
    'Phone',
    'Email',
    'Location',
    'Interested Truck',
    'Budget',
    'Enquiry Text',
    'Next Action',
    'Owner Notes',
    'Last Contacted At',
    'Priority',
    'Gmail Thread ID',
    'Error'
  ]];

  sheet.getRange(ENQUIRY_CONFIG.HEADER_ROW, 1, 1, ENQUIRY_CONFIG.COL_ERROR).setValues(headers);
  sheet
    .getRange(ENQUIRY_CONFIG.HEADER_ROW, 1, 1, ENQUIRY_CONFIG.COL_ERROR)
    .setFontWeight('bold')
    .setBackground('#1D2330')
    .setFontColor('#FFFFFF')
    .setWrap(true);

  [
    [ENQUIRY_CONFIG.COL_ID, 150],
    [ENQUIRY_CONFIG.COL_SOURCE, 140],
    [ENQUIRY_CONFIG.COL_STAGE, 150],
    [ENQUIRY_CONFIG.COL_CUSTOMER, 170],
    [ENQUIRY_CONFIG.COL_COMPANY, 190],
    [ENQUIRY_CONFIG.COL_PHONE, 140],
    [ENQUIRY_CONFIG.COL_EMAIL, 220],
    [ENQUIRY_CONFIG.COL_INTERESTED_TRUCK, 240],
    [ENQUIRY_CONFIG.COL_ENQUIRY_TEXT, 360],
    [ENQUIRY_CONFIG.COL_NEXT_ACTION, 260],
    [ENQUIRY_CONFIG.COL_OWNER_NOTES, 300],
    [ENQUIRY_CONFIG.COL_GMAIL_THREAD_ID, 220]
  ].forEach(([col, width]) => sheet.setColumnWidth(col, width));
}

function buildWebEnquiry_(r, rowNumber) {
  return {
    rowNumber,
    id: clean_(r[ENQUIRY_CONFIG.COL_ID - 1]),
    createdAt: formatWebDate_(r[ENQUIRY_CONFIG.COL_CREATED_AT - 1]),
    updatedAt: formatWebDate_(r[ENQUIRY_CONFIG.COL_UPDATED_AT - 1]),
    source: clean_(r[ENQUIRY_CONFIG.COL_SOURCE - 1]),
    stage: clean_(r[ENQUIRY_CONFIG.COL_STAGE - 1]),
    customer: clean_(r[ENQUIRY_CONFIG.COL_CUSTOMER - 1]),
    company: clean_(r[ENQUIRY_CONFIG.COL_COMPANY - 1]),
    phone: clean_(r[ENQUIRY_CONFIG.COL_PHONE - 1]),
    email: clean_(r[ENQUIRY_CONFIG.COL_EMAIL - 1]),
    location: clean_(r[ENQUIRY_CONFIG.COL_LOCATION - 1]),
    interestedTruck: clean_(r[ENQUIRY_CONFIG.COL_INTERESTED_TRUCK - 1]),
    budget: clean_(r[ENQUIRY_CONFIG.COL_BUDGET - 1]),
    enquiryText: clean_(r[ENQUIRY_CONFIG.COL_ENQUIRY_TEXT - 1]),
    nextAction: clean_(r[ENQUIRY_CONFIG.COL_NEXT_ACTION - 1]),
    ownerNotes: clean_(r[ENQUIRY_CONFIG.COL_OWNER_NOTES - 1]),
    lastContactedAt: formatWebDate_(r[ENQUIRY_CONFIG.COL_LAST_CONTACTED_AT - 1]),
    priority: clean_(r[ENQUIRY_CONFIG.COL_PRIORITY - 1]),
    gmailThreadId: clean_(r[ENQUIRY_CONFIG.COL_GMAIL_THREAD_ID - 1]),
    error: clean_(r[ENQUIRY_CONFIG.COL_ERROR - 1])
  };
}

function buildEnquiryStats_(enquiries) {
  return {
    total: enquiries.length,
    newLead: enquiries.filter(e => e.stage === 'New Enquiry').length,
    needsReply: enquiries.filter(e => e.stage === 'Needs Reply').length,
    viewing: enquiries.filter(e => e.stage === 'Viewing Booked').length,
    quoted: enquiries.filter(e => e.stage === 'Quote Sent').length,
    won: enquiries.filter(e => e.stage === 'Won').length
  };
}

/************************************************************
 * Forklift Pro stock workflow
 ************************************************************/

function getStockSheet_() {
  const ss = getAegisWorkbook_();
  let sheet = ss.getSheetByName(STOCK_CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(STOCK_CONFIG.SHEET_NAME);
  }

  ensureStockHeaders_(sheet);
  return sheet;
}

function ensureStockHeaders_(sheet) {
  sheet
    .getRange(STOCK_CONFIG.HEADER_ROW, 1, 1, STOCK_CONFIG.HEADERS.length)
    .setValues([STOCK_CONFIG.HEADERS])
    .setFontWeight('bold')
    .setBackground('#1D2330')
    .setFontColor('#FFFFFF')
    .setWrap(true);

  [
    [STOCK_CONFIG.COL_ID, 150],
    [STOCK_CONFIG.COL_CATEGORY, 140],
    [STOCK_CONFIG.COL_STATUS, 130],
    [STOCK_CONFIG.COL_BRAND, 150],
    [STOCK_CONFIG.COL_MODEL, 170],
    [STOCK_CONFIG.COL_TYPE, 190],
    [STOCK_CONFIG.COL_CAPACITY, 130],
    [STOCK_CONFIG.COL_PRICE, 110],
    [STOCK_CONFIG.COL_DESCRIPTION, 360],
    [STOCK_CONFIG.COL_BULLETS, 320],
    [STOCK_CONFIG.COL_IMAGE_MAIN, 260],
    [STOCK_CONFIG.COL_GALLERY_IMAGES, 320]
  ].forEach(([col, width]) => sheet.setColumnWidth(col, width));
}

function buildWebStockItem_(r, rowNumber) {
  return {
    rowNumber,
    id: clean_(r[STOCK_CONFIG.COL_ID - 1]),
    category: clean_(r[STOCK_CONFIG.COL_CATEGORY - 1]),
    status: clean_(r[STOCK_CONFIG.COL_STATUS - 1]),
    featured: clean_(r[STOCK_CONFIG.COL_FEATURED - 1]),
    brand: clean_(r[STOCK_CONFIG.COL_BRAND - 1]),
    model: clean_(r[STOCK_CONFIG.COL_MODEL - 1]),
    type: clean_(r[STOCK_CONFIG.COL_TYPE - 1]),
    power: clean_(r[STOCK_CONFIG.COL_POWER - 1]),
    capacity: clean_(r[STOCK_CONFIG.COL_CAPACITY - 1]),
    liftHeight: clean_(r[STOCK_CONFIG.COL_LIFT_HEIGHT - 1]),
    year: clean_(r[STOCK_CONFIG.COL_YEAR - 1]),
    hours: clean_(r[STOCK_CONFIG.COL_HOURS - 1]),
    mast: clean_(r[STOCK_CONFIG.COL_MAST - 1]),
    tyres: clean_(r[STOCK_CONFIG.COL_TYRES - 1]),
    battery: clean_(r[STOCK_CONFIG.COL_BATTERY - 1]),
    fuel: clean_(r[STOCK_CONFIG.COL_FUEL - 1]),
    price: clean_(r[STOCK_CONFIG.COL_PRICE - 1]),
    vat: clean_(r[STOCK_CONFIG.COL_VAT - 1]),
    description: clean_(r[STOCK_CONFIG.COL_DESCRIPTION - 1]),
    bullets: clean_(r[STOCK_CONFIG.COL_BULLETS - 1]),
    imageMain: clean_(r[STOCK_CONFIG.COL_IMAGE_MAIN - 1]),
    galleryImages: clean_(r[STOCK_CONFIG.COL_GALLERY_IMAGES - 1]),
    sortOrder: clean_(r[STOCK_CONFIG.COL_SORT_ORDER - 1]),
    updatedAt: formatWebDate_(r[STOCK_CONFIG.COL_UPDATED_AT - 1])
  };
}

function buildStockStats_(items) {
  return {
    total: items.length,
    inStock: items.filter(item => ['in stock', 'in-stock'].indexOf(normaliseHeader_(item.status)) !== -1).length,
    featured: items.filter(item => normaliseHeader_(item.featured) === 'yes').length,
    palletTrucks: items.filter(item => normaliseHeader_(item.category).indexOf('pallet') !== -1).length,
    forklifts: items.filter(item => normaliseHeader_(item.category).indexOf('forklift') !== -1).length
  };
}

function stockItemToRow_(item, existing) {
  const now = new Date();
  const source = item || {};
  const current = existing || {};
  const id = clean_(source.id) || clean_(current.id) || stockSlug_(`${source.brand || ''} ${source.model || ''}`) || `truck-${Utilities.getUuid().slice(0, 8)}`;

  return [
    id,
    clean_(source.category) || clean_(current.category) || 'forklift-truck',
    clean_(source.status) || clean_(current.status) || 'in-stock',
    clean_(source.featured) || clean_(current.featured) || 'No',
    clean_(source.brand),
    clean_(source.model),
    clean_(source.type),
    clean_(source.power),
    clean_(source.capacity),
    clean_(source.liftHeight),
    clean_(source.year),
    clean_(source.hours),
    clean_(source.mast),
    clean_(source.tyres),
    clean_(source.battery),
    clean_(source.fuel),
    clean_(source.price),
    clean_(source.vat),
    clean_(source.description),
    clean_(source.bullets),
    clean_(source.imageMain),
    normaliseStockListField_(source.galleryImages),
    clean_(source.sortOrder),
    now
  ];
}

function normaliseStockListField_(value) {
  return clean_(value)
    .split(/\n|,|\|/)
    .map(part => clean_(part))
    .filter(Boolean)
    .join('|');
}

function webAppNormaliseStockImages_() {
  const result = normaliseStockImageLinks_();
  return ContentService
    .createTextOutput(JSON.stringify(result, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function normaliseStockImageLinks_() {
  const sheet = getStockSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < STOCK_CONFIG.FIRST_ROW) {
    return { ok: true, updatedRows: 0 };
  }

  const rowCount = lastRow - STOCK_CONFIG.FIRST_ROW + 1;
  const range = sheet.getRange(
    STOCK_CONFIG.FIRST_ROW,
    STOCK_CONFIG.COL_IMAGE_MAIN,
    rowCount,
    STOCK_CONFIG.COL_GALLERY_IMAGES - STOCK_CONFIG.COL_IMAGE_MAIN + 1
  );
  const values = range.getValues();
  let updatedRows = 0;

  const nextValues = values.map(row => {
    const nextRow = [
      normalisePublicDriveImageUrl_(row[0]),
      normalisePublicDriveImageUrl_(row[1])
    ];

    if (nextRow[0] !== row[0] || nextRow[1] !== row[1]) {
      updatedRows += 1;
    }

    return nextRow;
  });

  if (updatedRows) {
    range.setValues(nextValues);
    clearWebAppStateCache_(['stock']);
  }

  return { ok: true, updatedRows };
}

function normalisePublicDriveImageUrl_(value) {
  return clean_(value).replace(
    /https:\/\/drive\.google\.com\/(?:uc\?[^|\n,]*\bid=([^|\n,&#]+)|open\?[^|\n,]*\bid=([^|\n,&#]+)|file\/d\/([^/|\n,&#]+)[^|\n,]*)/g,
    (match, ucId, openId, fileId) => buildPublicDriveImageUrl_(decodeURIComponent(ucId || openId || fileId || ''))
  );
}

function stockSlug_(value) {
  return clean_(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/************************************************************
 * Marketplace listing workflow
 ************************************************************/

function getMarketplaceSheet_() {
  const ss = getAegisWorkbook_();
  let sheet = ss.getSheetByName(MARKETPLACE_CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(MARKETPLACE_CONFIG.SHEET_NAME);
  }

  ensureMarketplaceHeaders_(sheet);
  return sheet;
}

function ensureMarketplaceHeaders_(sheet) {
  sheet
    .getRange(MARKETPLACE_CONFIG.HEADER_ROW, 1, 1, MARKETPLACE_CONFIG.HEADERS.length)
    .setValues([MARKETPLACE_CONFIG.HEADERS])
    .setFontWeight('bold')
    .setBackground('#1D2330')
    .setFontColor('#FFFFFF')
    .setWrap(true);

  [
    [MARKETPLACE_CONFIG.COL_TRUCK_ID, 160],
    [MARKETPLACE_CONFIG.COL_WEBSITE_STATUS, 130],
    [MARKETPLACE_CONFIG.COL_WEBSITE_URL, 260],
    [MARKETPLACE_CONFIG.COL_EBAY_STATUS, 130],
    [MARKETPLACE_CONFIG.COL_EBAY_URL, 260],
    [MARKETPLACE_CONFIG.COL_FACEBOOK_STATUS, 140],
    [MARKETPLACE_CONFIG.COL_FACEBOOK_URL, 260],
    [MARKETPLACE_CONFIG.COL_WHATSAPP_STATUS, 150],
    [MARKETPLACE_CONFIG.COL_GOOGLE_ADS_STATUS, 150],
    [MARKETPLACE_CONFIG.COL_GOOGLE_ADS_URL, 260],
    [MARKETPLACE_CONFIG.COL_LAST_REFRESHED, 150],
    [MARKETPLACE_CONFIG.COL_NEXT_ACTION, 260],
    [MARKETPLACE_CONFIG.COL_ENQUIRIES, 100],
    [MARKETPLACE_CONFIG.COL_NOTES, 320],
    [MARKETPLACE_CONFIG.COL_LINKEDIN_STATUS, 140],
    [MARKETPLACE_CONFIG.COL_LINKEDIN_URL, 260],
    [MARKETPLACE_CONFIG.COL_GOOGLE_BUSINESS_STATUS, 160],
    [MARKETPLACE_CONFIG.COL_GOOGLE_BUSINESS_URL, 260],
    [MARKETPLACE_CONFIG.COL_GUMTREE_STATUS, 140],
    [MARKETPLACE_CONFIG.COL_GUMTREE_URL, 260]
  ].forEach(([col, width]) => sheet.setColumnWidth(col, width));
}

function seedMarketplaceRowsForStock_(sheet, stockItems, existingByTruckId) {
  const rows = [];

  stockItems.forEach(stock => {
    const truckId = clean_(stock.id);
    if (!truckId || existingByTruckId[truckId]) return;

    rows.push(marketplaceItemToRow_({
      truckId,
      websiteStatus: stock.status ? 'Live' : 'Needs Listing',
      ebayStatus: 'Needs Listing',
      facebookStatus: 'Needs Listing',
      linkedinStatus: 'Needs Post',
      googleBusinessStatus: 'Needs Post',
      gumtreeStatus: 'Needs Listing',
      whatsappStatus: 'Ready',
      googleAdsStatus: 'Not Running',
      nextAction: 'Create eBay, Facebook, LinkedIn, Google Business, and Gumtree listings',
      enquiries: '',
      notes: ''
    }, null));
  });

  if (rows.length) {
    const row = Math.max(sheet.getLastRow() + 1, MARKETPLACE_CONFIG.FIRST_ROW);
    sheet.getRange(row, 1, rows.length, MARKETPLACE_CONFIG.HEADERS.length).setValues(rows);
  }
}

function buildWebMarketplaceItem_(r, rowNumber, stockById, enquiryCounts) {
  const truckId = clean_(r[MARKETPLACE_CONFIG.COL_TRUCK_ID - 1]);
  const stock = stockById[truckId] || {};
  const counts = (enquiryCounts && enquiryCounts[truckId]) || {};

  return {
    rowNumber,
    truckId,
    truckTitle: [stock.brand, stock.model].filter(Boolean).join(' ') || truckId,
    category: clean_(stock.category),
    stockStatus: clean_(stock.status),
    price: clean_(stock.price),
    vat: clean_(stock.vat),
    imageMain: clean_(stock.imageMain),
    websiteStatus: clean_(r[MARKETPLACE_CONFIG.COL_WEBSITE_STATUS - 1]) || 'Needs Listing',
    websiteUrl: clean_(r[MARKETPLACE_CONFIG.COL_WEBSITE_URL - 1]),
    ebayStatus: clean_(r[MARKETPLACE_CONFIG.COL_EBAY_STATUS - 1]) || 'Needs Listing',
    ebayUrl: clean_(r[MARKETPLACE_CONFIG.COL_EBAY_URL - 1]),
    facebookStatus: clean_(r[MARKETPLACE_CONFIG.COL_FACEBOOK_STATUS - 1]) || 'Needs Listing',
    facebookUrl: clean_(r[MARKETPLACE_CONFIG.COL_FACEBOOK_URL - 1]),
    whatsappStatus: clean_(r[MARKETPLACE_CONFIG.COL_WHATSAPP_STATUS - 1]) || 'Ready',
    googleAdsStatus: clean_(r[MARKETPLACE_CONFIG.COL_GOOGLE_ADS_STATUS - 1]) || 'Not Running',
    googleAdsUrl: clean_(r[MARKETPLACE_CONFIG.COL_GOOGLE_ADS_URL - 1]),
    lastRefreshed: formatWebDate_(r[MARKETPLACE_CONFIG.COL_LAST_REFRESHED - 1]),
    nextAction: clean_(r[MARKETPLACE_CONFIG.COL_NEXT_ACTION - 1]),
    enquiries: clean_(r[MARKETPLACE_CONFIG.COL_ENQUIRIES - 1]),
    autoEnquiries: Number(counts.total) || 0,
    websiteEnquiries: Number(counts.website) || 0,
    ebayEnquiries: Number(counts.ebay) || 0,
    facebookEnquiries: Number(counts.facebook) || 0,
    linkedinEnquiries: Number(counts.linkedin) || 0,
    googleBusinessEnquiries: Number(counts.googleBusiness) || 0,
    gumtreeEnquiries: Number(counts.gumtree) || 0,
    whatsappEnquiries: Number(counts.whatsapp) || 0,
    otherEnquiries: Number(counts.other) || 0,
    lastEnquiryAt: clean_(counts.lastAt),
    notes: clean_(r[MARKETPLACE_CONFIG.COL_NOTES - 1]),
    updatedAt: formatWebDate_(r[MARKETPLACE_CONFIG.COL_UPDATED_AT - 1]),
    linkedinStatus: clean_(r[MARKETPLACE_CONFIG.COL_LINKEDIN_STATUS - 1]) || 'Needs Post',
    linkedinUrl: clean_(r[MARKETPLACE_CONFIG.COL_LINKEDIN_URL - 1]),
    googleBusinessStatus: clean_(r[MARKETPLACE_CONFIG.COL_GOOGLE_BUSINESS_STATUS - 1]) || 'Needs Post',
    googleBusinessUrl: clean_(r[MARKETPLACE_CONFIG.COL_GOOGLE_BUSINESS_URL - 1]),
    gumtreeStatus: clean_(r[MARKETPLACE_CONFIG.COL_GUMTREE_STATUS - 1]) || 'Needs Listing',
    gumtreeUrl: clean_(r[MARKETPLACE_CONFIG.COL_GUMTREE_URL - 1])
  };
}

function marketplaceItemToRow_(item, existing) {
  const source = item || {};
  const current = existing || {};

  return [
    clean_(source.truckId) || clean_(current.truckId),
    clean_(source.websiteStatus) || clean_(current.websiteStatus) || 'Needs Listing',
    clean_(source.websiteUrl) || clean_(current.websiteUrl),
    clean_(source.ebayStatus) || clean_(current.ebayStatus) || 'Needs Listing',
    clean_(source.ebayUrl) || clean_(current.ebayUrl),
    clean_(source.facebookStatus) || clean_(current.facebookStatus) || 'Needs Listing',
    clean_(source.facebookUrl) || clean_(current.facebookUrl),
    clean_(source.whatsappStatus) || clean_(current.whatsappStatus) || 'Ready',
    clean_(source.googleAdsStatus) || clean_(current.googleAdsStatus) || 'Not Running',
    clean_(source.googleAdsUrl) || clean_(current.googleAdsUrl),
    clean_(source.lastRefreshed) || clean_(current.lastRefreshed),
    clean_(source.nextAction) || clean_(current.nextAction),
    clean_(source.enquiries) || clean_(current.enquiries),
    clean_(source.notes) || clean_(current.notes),
    new Date(),
    clean_(source.linkedinStatus) || clean_(current.linkedinStatus) || 'Needs Post',
    clean_(source.linkedinUrl) || clean_(current.linkedinUrl),
    clean_(source.googleBusinessStatus) || clean_(current.googleBusinessStatus) || 'Needs Post',
    clean_(source.googleBusinessUrl) || clean_(current.googleBusinessUrl),
    clean_(source.gumtreeStatus) || clean_(current.gumtreeStatus) || 'Needs Listing',
    clean_(source.gumtreeUrl) || clean_(current.gumtreeUrl)
  ];
}

function buildMarketplaceStats_(items) {
  const live = value => normaliseSalesText_(value) === 'live';
  const missing = value => {
    const clean = normaliseSalesText_(value);
    return !clean || clean.indexOf('need') === 0 || clean === 'draft';
  };
  const now = new Date().getTime();

  return {
    total: items.length,
    websiteLive: items.filter(item => live(item.websiteStatus)).length,
    ebayLive: items.filter(item => live(item.ebayStatus)).length,
    facebookLive: items.filter(item => live(item.facebookStatus)).length,
    linkedinLive: items.filter(item => live(item.linkedinStatus)).length,
    googleBusinessLive: items.filter(item => live(item.googleBusinessStatus)).length,
    gumtreeLive: items.filter(item => live(item.gumtreeStatus)).length,
    socialLive: items.filter(item => live(item.facebookStatus) || live(item.linkedinStatus) || live(item.googleBusinessStatus)).length,
    needsListing: items.filter(item => missing(item.websiteStatus) || missing(item.ebayStatus) || missing(item.facebookStatus) || missing(item.linkedinStatus) || missing(item.googleBusinessStatus) || missing(item.gumtreeStatus)).length,
    enquiries: items.reduce((sum, item) => sum + (Number(item.autoEnquiries) || 0), 0),
    websiteEnquiries: items.reduce((sum, item) => sum + (Number(item.websiteEnquiries) || 0), 0),
    ebayEnquiries: items.reduce((sum, item) => sum + (Number(item.ebayEnquiries) || 0), 0),
    facebookEnquiries: items.reduce((sum, item) => sum + (Number(item.facebookEnquiries) || 0), 0),
    whatsappEnquiries: items.reduce((sum, item) => sum + (Number(item.whatsappEnquiries) || 0), 0),
    refreshDue: items.filter(item => {
      const last = parseWebDateForRefresh_(item.lastRefreshed);
      if (!last) return true;
      return now - last.getTime() > 1000 * 60 * 60 * 24 * 7;
    }).length
  };
}

function parseWebDateForRefresh_(value) {
  const text = clean_(value);
  if (!text) return null;
  const date = new Date(text);
  return isNaN(date.getTime()) ? null : date;
}

/************************************************************
 * Industry Radar workflow
 ************************************************************/

function getIndustrySourcesSheet_() {
  const ss = getAegisWorkbook_();
  let sheet = ss.getSheetByName(INDUSTRY_SOURCE_CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(INDUSTRY_SOURCE_CONFIG.SHEET_NAME);
  }

  ensureIndustrySourceHeaders_(sheet);
  seedDefaultIndustrySources_(sheet);
  return sheet;
}

function ensureIndustrySourceHeaders_(sheet) {
  sheet
    .getRange(INDUSTRY_SOURCE_CONFIG.HEADER_ROW, 1, 1, INDUSTRY_SOURCE_CONFIG.HEADERS.length)
    .setValues([INDUSTRY_SOURCE_CONFIG.HEADERS])
    .setFontWeight('bold')
    .setBackground('#1D2330')
    .setFontColor('#FFFFFF')
    .setWrap(true);

  [
    [INDUSTRY_SOURCE_CONFIG.COL_SOURCE, 190],
    [INDUSTRY_SOURCE_CONFIG.COL_WEBSITE, 280],
    [INDUSTRY_SOURCE_CONFIG.COL_RSS_URL, 300],
    [INDUSTRY_SOURCE_CONFIG.COL_SEARCH_QUERY, 360],
    [INDUSTRY_SOURCE_CONFIG.COL_DEFAULT_TAGS, 240],
    [INDUSTRY_SOURCE_CONFIG.COL_ACTIVE, 90],
    [INDUSTRY_SOURCE_CONFIG.COL_NOTES, 320],
    [INDUSTRY_SOURCE_CONFIG.COL_LAST_SCANNED, 160],
    [INDUSTRY_SOURCE_CONFIG.COL_LAST_ERROR, 280]
  ].forEach(([col, width]) => sheet.setColumnWidth(col, width));
}

function seedDefaultIndustrySources_(sheet) {
  const lastRow = sheet.getLastRow();
  const existing = {};

  if (lastRow >= INDUSTRY_SOURCE_CONFIG.FIRST_ROW) {
    sheet
      .getRange(
        INDUSTRY_SOURCE_CONFIG.FIRST_ROW,
        INDUSTRY_SOURCE_CONFIG.COL_SOURCE,
        lastRow - INDUSTRY_SOURCE_CONFIG.FIRST_ROW + 1,
        1
      )
      .getValues()
      .forEach(row => {
        const name = normaliseHeader_(row[0]);
        if (name) existing[name] = true;
      });
  }

  const rows = DEFAULT_INDUSTRY_RADAR_SOURCES
    .filter(source => !existing[normaliseHeader_(source.source)])
    .map(source => [
      source.source,
      source.website,
      source.rssUrl || '',
      source.searchQuery || '',
      source.defaultTags || '',
      'Yes',
      source.notes || '',
      '',
      '',
      new Date()
    ]);

  if (rows.length) {
    const targetRow = Math.max(sheet.getLastRow() + 1, INDUSTRY_SOURCE_CONFIG.FIRST_ROW);
    sheet.getRange(targetRow, 1, rows.length, INDUSTRY_SOURCE_CONFIG.HEADERS.length).setValues(rows);
  }
}

function getIndustryRadarSheet_() {
  const ss = getAegisWorkbook_();
  let sheet = ss.getSheetByName(INDUSTRY_RADAR_CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(INDUSTRY_RADAR_CONFIG.SHEET_NAME);
  }

  ensureIndustryRadarHeaders_(sheet);
  return sheet;
}

function ensureIndustryRadarHeaders_(sheet) {
  sheet
    .getRange(INDUSTRY_RADAR_CONFIG.HEADER_ROW, 1, 1, INDUSTRY_RADAR_CONFIG.HEADERS.length)
    .setValues([INDUSTRY_RADAR_CONFIG.HEADERS])
    .setFontWeight('bold')
    .setBackground('#1D2330')
    .setFontColor('#FFFFFF')
    .setWrap(true);

  [
    [INDUSTRY_RADAR_CONFIG.COL_ID, 170],
    [INDUSTRY_RADAR_CONFIG.COL_SOURCE, 170],
    [INDUSTRY_RADAR_CONFIG.COL_TITLE, 360],
    [INDUSTRY_RADAR_CONFIG.COL_URL, 360],
    [INDUSTRY_RADAR_CONFIG.COL_PUBLISHED_AT, 160],
    [INDUSTRY_RADAR_CONFIG.COL_SUMMARY, 360],
    [INDUSTRY_RADAR_CONFIG.COL_TAGS, 240],
    [INDUSTRY_RADAR_CONFIG.COL_RELEVANCE, 100],
    [INDUSTRY_RADAR_CONFIG.COL_ANGLE, 320],
    [INDUSTRY_RADAR_CONFIG.COL_STATUS, 120],
    [INDUSTRY_RADAR_CONFIG.COL_LINKEDIN_DRAFT, 420],
    [INDUSTRY_RADAR_CONFIG.COL_TARGET_AUDIENCE, 260],
    [INDUSTRY_RADAR_CONFIG.COL_ENGAGEMENT_TARGETS, 320],
    [INDUSTRY_RADAR_CONFIG.COL_NOTES, 320]
  ].forEach(([col, width]) => sheet.setColumnWidth(col, width));
}

function webAppGetIndustryRadarState() {
  return cachedWebAppState_('industry', buildWebAppIndustryRadarState_);
}

function buildWebAppIndustryRadarState_() {
  const sources = readIndustrySources_();
  const items = readIndustryRadarItems_();
  items.sort((a, b) => {
    const scoreDiff = (Number(b.relevance) || 0) - (Number(a.relevance) || 0);
    if (scoreDiff) return scoreDiff;
    return `${b.publishedAt || b.savedAt}`.localeCompare(`${a.publishedAt || a.savedAt}`);
  });

  return {
    sources,
    items,
    stats: buildIndustryRadarStats_(items, sources),
    updatedAt: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd MMM yyyy HH:mm'
    )
  };
}

function readIndustrySources_() {
  const sheet = getIndustrySourcesSheet_();
  const lastRow = sheet.getLastRow();
  const sources = [];

  if (lastRow < INDUSTRY_SOURCE_CONFIG.FIRST_ROW) return sources;

  const values = sheet
    .getRange(
      INDUSTRY_SOURCE_CONFIG.FIRST_ROW,
      1,
      lastRow - INDUSTRY_SOURCE_CONFIG.FIRST_ROW + 1,
      INDUSTRY_SOURCE_CONFIG.HEADERS.length
    )
    .getValues();

  values.forEach((r, i) => {
    const source = clean_(r[INDUSTRY_SOURCE_CONFIG.COL_SOURCE - 1]);
    if (!source) return;
    sources.push({
      rowNumber: INDUSTRY_SOURCE_CONFIG.FIRST_ROW + i,
      source,
      website: clean_(r[INDUSTRY_SOURCE_CONFIG.COL_WEBSITE - 1]),
      rssUrl: clean_(r[INDUSTRY_SOURCE_CONFIG.COL_RSS_URL - 1]),
      searchQuery: clean_(r[INDUSTRY_SOURCE_CONFIG.COL_SEARCH_QUERY - 1]),
      defaultTags: clean_(r[INDUSTRY_SOURCE_CONFIG.COL_DEFAULT_TAGS - 1]),
      active: clean_(r[INDUSTRY_SOURCE_CONFIG.COL_ACTIVE - 1]) || 'Yes',
      notes: clean_(r[INDUSTRY_SOURCE_CONFIG.COL_NOTES - 1]),
      lastScanned: formatWebDate_(r[INDUSTRY_SOURCE_CONFIG.COL_LAST_SCANNED - 1]),
      lastError: clean_(r[INDUSTRY_SOURCE_CONFIG.COL_LAST_ERROR - 1]),
      updatedAt: formatWebDate_(r[INDUSTRY_SOURCE_CONFIG.COL_UPDATED_AT - 1])
    });
  });

  return sources;
}

function readIndustryRadarItems_() {
  const sheet = getIndustryRadarSheet_();
  const lastRow = sheet.getLastRow();
  const items = [];

  if (lastRow < INDUSTRY_RADAR_CONFIG.FIRST_ROW) return items;

  const values = sheet
    .getRange(
      INDUSTRY_RADAR_CONFIG.FIRST_ROW,
      1,
      lastRow - INDUSTRY_RADAR_CONFIG.FIRST_ROW + 1,
      INDUSTRY_RADAR_CONFIG.HEADERS.length
    )
    .getValues();

  values.forEach((r, i) => {
    const item = buildWebIndustryRadarItem_(r, INDUSTRY_RADAR_CONFIG.FIRST_ROW + i);
    if (item.id || item.url || item.title) items.push(item);
  });

  return items;
}

function buildWebIndustryRadarItem_(r, rowNumber) {
  return {
    rowNumber,
    id: clean_(r[INDUSTRY_RADAR_CONFIG.COL_ID - 1]),
    source: clean_(r[INDUSTRY_RADAR_CONFIG.COL_SOURCE - 1]),
    title: clean_(r[INDUSTRY_RADAR_CONFIG.COL_TITLE - 1]),
    url: clean_(r[INDUSTRY_RADAR_CONFIG.COL_URL - 1]),
    publishedAt: formatWebDate_(r[INDUSTRY_RADAR_CONFIG.COL_PUBLISHED_AT - 1]),
    summary: clean_(r[INDUSTRY_RADAR_CONFIG.COL_SUMMARY - 1]),
    tags: clean_(r[INDUSTRY_RADAR_CONFIG.COL_TAGS - 1]),
    relevance: Number(r[INDUSTRY_RADAR_CONFIG.COL_RELEVANCE - 1]) || 0,
    angle: clean_(r[INDUSTRY_RADAR_CONFIG.COL_ANGLE - 1]),
    status: clean_(r[INDUSTRY_RADAR_CONFIG.COL_STATUS - 1]) || 'New',
    linkedinDraft: clean_(r[INDUSTRY_RADAR_CONFIG.COL_LINKEDIN_DRAFT - 1]),
    targetAudience: clean_(r[INDUSTRY_RADAR_CONFIG.COL_TARGET_AUDIENCE - 1]),
    engagementTargets: clean_(r[INDUSTRY_RADAR_CONFIG.COL_ENGAGEMENT_TARGETS - 1]),
    notes: clean_(r[INDUSTRY_RADAR_CONFIG.COL_NOTES - 1]),
    savedAt: formatWebDate_(r[INDUSTRY_RADAR_CONFIG.COL_SAVED_AT - 1]),
    updatedAt: formatWebDate_(r[INDUSTRY_RADAR_CONFIG.COL_UPDATED_AT - 1])
  };
}

function buildIndustryRadarStats_(items, sources) {
  const status = value => normaliseSalesText_(value);
  return {
    total: items.length,
    sources: (sources || []).filter(source => normaliseSalesText_(source.active) !== 'no').length,
    newItems: items.filter(item => status(item.status) === 'new').length,
    drafted: items.filter(item => status(item.status).indexOf('draft') >= 0 || clean_(item.linkedinDraft)).length,
    approved: items.filter(item => status(item.status) === 'approved').length,
    posted: items.filter(item => status(item.status) === 'posted').length,
    highRelevance: items.filter(item => Number(item.relevance) >= 70).length,
    roughTerrain: items.filter(item => normaliseSalesText_(item.tags).indexOf('rough terrain') >= 0 || normaliseSalesText_(item.tags).indexOf('yard') >= 0).length
  };
}

function webAppScanIndustryRadar(options) {
  const settings = options || {};
  const sources = readIndustrySources_()
    .filter(source => normaliseSalesText_(source.active) !== 'no')
    .slice(0, Math.max(1, Number(settings.sourceLimit) || 8));
  const existing = buildIndustryExistingUrlMap_();
  const sheet = getIndustryRadarSheet_();
  const rows = [];
  const errors = [];
  let scanned = 0;

  sources.forEach(source => {
    try {
      const fetched = fetchIndustryItemsForSource_(source, Math.max(1, Number(settings.limitPerSource) || 5));
      scanned += fetched.length;
      fetched.forEach(raw => {
        const urlKey = normaliseIndustryUrl_(raw.url);
        if (!urlKey || existing[urlKey]) return;

        const item = normaliseIndustryRadarInput_(Object.assign({}, raw, {
          source: source.source,
          tags: mergeIndustryTags_(source.defaultTags, raw.tags),
          status: 'New'
        }));
        existing[urlKey] = true;
        rows.push(industryRadarItemToRow_(item, null));
      });
      updateIndustrySourceScanStatus_(source.rowNumber, '', new Date());
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      errors.push(`${source.source}: ${message}`);
      updateIndustrySourceScanStatus_(source.rowNumber, message, new Date());
    }
  });

  if (rows.length) {
    const targetRow = Math.max(sheet.getLastRow() + 1, INDUSTRY_RADAR_CONFIG.FIRST_ROW);
    sheet.getRange(targetRow, 1, rows.length, INDUSTRY_RADAR_CONFIG.HEADERS.length).setValues(rows);
    sheet.getRange(targetRow, 1, rows.length, INDUSTRY_RADAR_CONFIG.HEADERS.length).setVerticalAlignment('top').setWrap(true);
  }

  SpreadsheetApp.flush();
  clearWebAppStateCache_(['industry']);

  return {
    ok: true,
    scanned,
    imported: rows.length,
    skipped: Math.max(0, scanned - rows.length),
    errors
  };
}

function fetchIndustryItemsForSource_(source, limit) {
  const rssUrl = clean_(source.rssUrl) || googleNewsRssUrl_(source.searchQuery || source.source);
  const response = UrlFetchApp.fetch(rssUrl, {
    followRedirects: true,
    muteHttpExceptions: true,
    headers: {
      'User-Agent': 'AEGIS Sales OS Industry Radar'
    }
  });
  const code = response.getResponseCode();

  if (code < 200 || code >= 300) {
    throw new Error(`feed returned HTTP ${code}`);
  }

  const items = parseIndustryFeed_(response.getContentText());
  return items.slice(0, limit);
}

function googleNewsRssUrl_(query) {
  const cleanQuery = clean_(query) || 'forklift material handling warehouse automation';
  return `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQuery)}&hl=en-GB&gl=GB&ceid=GB:en`;
}

function parseIndustryFeed_(xmlText) {
  const doc = XmlService.parse(xmlText);
  const root = doc.getRootElement();
  const channel = childNamed_(root, 'channel') || root;
  const entries = childrenNamed_(channel, 'item').concat(childrenNamed_(channel, 'entry'));

  return entries.map(entry => {
    const title = childText_(entry, 'title');
    const link = childText_(entry, 'link') || linkHref_(entry);
    const summary = stripHtml_(childText_(entry, 'description') || childText_(entry, 'summary') || childText_(entry, 'content'));
    const published = childText_(entry, 'pubDate') || childText_(entry, 'published') || childText_(entry, 'updated');
    return {
      title,
      url: normaliseGoogleNewsUrl_(link),
      publishedAt: published,
      summary,
      tags: inferIndustryTags_(`${title} ${summary}`)
    };
  }).filter(item => clean_(item.title) && clean_(item.url));
}

function childNamed_(element, name) {
  const target = String(name || '').toLowerCase();
  return (element.getChildren() || []).find(child => child.getName().toLowerCase() === target) || null;
}

function childrenNamed_(element, name) {
  const target = String(name || '').toLowerCase();
  return (element.getChildren() || []).filter(child => child.getName().toLowerCase() === target);
}

function childText_(element, name) {
  const child = childNamed_(element, name);
  return child ? clean_(child.getText()) : '';
}

function linkHref_(entry) {
  const link = childNamed_(entry, 'link');
  if (!link) return '';
  const href = link.getAttribute('href');
  return href ? clean_(href.getValue()) : clean_(link.getText());
}

function normaliseGoogleNewsUrl_(url) {
  const value = clean_(url);
  if (!value) return '';

  const match = value.match(/[?&]url=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch (error) {}
  }

  return value;
}

function stripHtml_(value) {
  return clean_(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .slice(0, 900);
}

function normaliseIndustryUrl_(url) {
  return clean_(url).replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
}

function buildIndustryExistingUrlMap_() {
  const map = {};
  readIndustryRadarItems_().forEach(item => {
    const key = normaliseIndustryUrl_(item.url);
    if (key) map[key] = true;
  });
  return map;
}

function updateIndustrySourceScanStatus_(rowNumber, error, scannedAt) {
  if (!rowNumber) return;
  const sheet = getIndustrySourcesSheet_();
  sheet.getRange(rowNumber, INDUSTRY_SOURCE_CONFIG.COL_LAST_SCANNED).setValue(scannedAt || new Date());
  sheet.getRange(rowNumber, INDUSTRY_SOURCE_CONFIG.COL_LAST_ERROR).setValue(clean_(error));
  sheet.getRange(rowNumber, INDUSTRY_SOURCE_CONFIG.COL_UPDATED_AT).setValue(new Date());
}

function webAppSaveIndustryRadarItem(item) {
  const sheet = getIndustryRadarSheet_();
  const incoming = normaliseIndustryRadarInput_(item || {});
  const existing = findIndustryRadarItem_(incoming.id, incoming.url);
  const targetRow = existing.rowNumber || Math.max(sheet.getLastRow() + 1, INDUSTRY_RADAR_CONFIG.FIRST_ROW);

  if (!incoming.title && !incoming.url) {
    throw new Error('Add at least a title or URL before saving an industry radar item.');
  }

  sheet.getRange(targetRow, 1, 1, INDUSTRY_RADAR_CONFIG.HEADERS.length).setValues([industryRadarItemToRow_(incoming, existing.item)]);
  sheet.getRange(targetRow, 1, 1, INDUSTRY_RADAR_CONFIG.HEADERS.length).setVerticalAlignment('top').setWrap(true);
  SpreadsheetApp.flush();
  clearWebAppStateCache_(['industry']);

  return {
    ok: true,
    id: incoming.id || (existing.item && existing.item.id),
    rowNumber: targetRow
  };
}

function webAppUpdateIndustryRadarItem(id, updates) {
  const found = findIndustryRadarItem_(id || (updates && updates.id), updates && updates.url);
  if (!found.rowNumber) {
    throw new Error('Industry radar item not found.');
  }

  const next = normaliseIndustryRadarInput_(Object.assign({}, found.item, updates || {}, { id: found.item.id }));
  getIndustryRadarSheet().getRange(found.rowNumber, 1, 1, INDUSTRY_RADAR_CONFIG.HEADERS.length).setValues([industryRadarItemToRow_(next, found.item)]);
  SpreadsheetApp.flush();
  clearWebAppStateCache_(['industry']);

  return {
    ok: true,
    id: next.id,
    rowNumber: found.rowNumber
  };
}

function getIndustryRadarSheet() {
  return getIndustryRadarSheet_();
}

function normaliseIndustryRadarInput_(payload) {
  const source = payload || {};
  const title = clean_(source.title || source.headline || source.name);
  const url = clean_(source.url || source.link);
  const text = [title, source.summary, source.notes, source.tags].map(clean_).join(' ');
  const tags = mergeIndustryTags_(source.tags || source.defaultTags, inferIndustryTags_(text));
  const relevance = Number(source.relevance || source.score) || scoreIndustryRadarItem_(text, tags);
  const angle = clean_(source.angle || source.aegisAngle) || buildIndustryAngle_(title, tags, source.summary);

  return Object.assign({}, source, {
    id: clean_(source.id) || industryItemId_(url || title),
    source: clean_(source.source),
    title,
    url,
    publishedAt: clean_(source.publishedAt || source.published || source.date),
    summary: stripHtml_(source.summary || source.description || ''),
    tags,
    relevance,
    angle,
    status: clean_(source.status) || 'New',
    linkedinDraft: clean_(source.linkedinDraft || source.postDraft || source.draft),
    targetAudience: clean_(source.targetAudience) || industryTargetAudience_(tags),
    engagementTargets: clean_(source.engagementTargets) || industryEngagementTargets_(tags),
    notes: clean_(source.notes)
  });
}

function industryRadarItemToRow_(item, existing) {
  const source = item || {};
  const current = existing || {};
  const now = new Date();

  return [
    clean_(source.id) || clean_(current.id) || industryItemId_(source.url || source.title),
    clean_(source.source) || clean_(current.source),
    clean_(source.title) || clean_(current.title),
    clean_(source.url) || clean_(current.url),
    parseIndustryDate_(source.publishedAt) || clean_(source.publishedAt) || clean_(current.publishedAt),
    clean_(source.summary) || clean_(current.summary),
    clean_(source.tags) || clean_(current.tags),
    Number(source.relevance) || Number(current.relevance) || 0,
    clean_(source.angle) || clean_(current.angle),
    clean_(source.status) || clean_(current.status) || 'New',
    clean_(source.linkedinDraft) || clean_(current.linkedinDraft),
    clean_(source.targetAudience) || clean_(current.targetAudience),
    clean_(source.engagementTargets) || clean_(current.engagementTargets),
    clean_(source.notes) || clean_(current.notes),
    current.savedAt || now,
    now
  ];
}

function parseIndustryDate_(value) {
  const text = clean_(value);
  if (!text) return '';
  const date = new Date(text);
  return isNaN(date.getTime()) ? '' : date;
}

function findIndustryRadarItem_(id, url) {
  const sheet = getIndustryRadarSheet_();
  const lastRow = sheet.getLastRow();
  const cleanId = clean_(id);
  const cleanUrl = normaliseIndustryUrl_(url);

  if (lastRow < INDUSTRY_RADAR_CONFIG.FIRST_ROW) {
    return { rowNumber: 0, item: null };
  }

  const values = sheet
    .getRange(
      INDUSTRY_RADAR_CONFIG.FIRST_ROW,
      1,
      lastRow - INDUSTRY_RADAR_CONFIG.FIRST_ROW + 1,
      INDUSTRY_RADAR_CONFIG.HEADERS.length
    )
    .getValues();

  for (let i = 0; i < values.length; i++) {
    const item = buildWebIndustryRadarItem_(values[i], INDUSTRY_RADAR_CONFIG.FIRST_ROW + i);
    if ((cleanId && item.id === cleanId) || (cleanUrl && normaliseIndustryUrl_(item.url) === cleanUrl)) {
      return {
        rowNumber: INDUSTRY_RADAR_CONFIG.FIRST_ROW + i,
        item
      };
    }
  }

  return { rowNumber: 0, item: null };
}

function industryItemId_(seed) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, clean_(seed) || Utilities.getUuid());
  return 'IR-' + digest.slice(0, 5).map(byte => (`0${(byte & 0xff).toString(16)}`).slice(-2)).join('').toUpperCase();
}

function inferIndustryTags_(value) {
  const text = normaliseSalesText_(value);
  const tags = [];
  const add = tag => {
    if (tags.indexOf(tag) === -1) tags.push(tag);
  };

  if (/forklift|lift truck|counterbalance|reach truck/.test(text)) add('forklifts');
  if (/pallet truck|pallet mover|pump truck/.test(text)) add('pallet trucks');
  if (/rough terrain|all terrain|yard|gravel|outdoor|site/.test(text)) add('rough terrain');
  if (/automation|robot|agv|amr|autonomous|intralogistics/.test(text)) add('automation');
  if (/battery|lithium|charging|electric|hydrogen/.test(text)) add('batteries');
  if (/safety|training|accident|compliance|operator/.test(text)) add('safety');
  if (/warehouse|warehousing|fulfilment|fulfillment|distribution/.test(text)) add('warehousing');
  if (/logistics|supply chain|3pl|transport/.test(text)) add('logistics');
  if (/construction|builders merchant|merchant|agri|farm|recycling/.test(text)) add('yard operations');
  if (/used|second hand|pre-owned|rental|hire/.test(text)) add('used equipment');

  return tags.join('|');
}

function mergeIndustryTags_(left, right) {
  const tags = {};
  [left, right].forEach(value => {
    clean_(value)
      .split(/\n|,|;|\|/)
      .map(tag => clean_(tag))
      .filter(Boolean)
      .forEach(tag => {
        tags[tag.toLowerCase()] = tag;
      });
  });
  return Object.keys(tags).map(key => tags[key]).join('|');
}

function scoreIndustryRadarItem_(text, tags) {
  const value = normaliseSalesText_(`${text} ${tags}`);
  let score = 35;
  [
    ['rough terrain', 30],
    ['all terrain', 30],
    ['pallet truck', 22],
    ['forklift', 18],
    ['material handling', 16],
    ['warehouse', 12],
    ['automation', 10],
    ['battery', 10],
    ['safety', 8],
    ['yard', 16],
    ['construction', 12],
    ['builders merchant', 14]
  ].forEach(([term, points]) => {
    if (value.indexOf(term) >= 0) score += points;
  });
  return Math.max(0, Math.min(100, score));
}

function buildIndustryAngle_(title, tags, summary) {
  const text = normaliseSalesText_(`${title} ${tags} ${summary}`);
  if (text.indexOf('rough terrain') >= 0 || text.indexOf('yard') >= 0) {
    return 'Use this to explain why material handling outside perfect warehouse floors still needs practical equipment, not just automation hype.';
  }
  if (text.indexOf('automation') >= 0 || text.indexOf('robot') >= 0) {
    return 'Use this to contrast advanced automation with the practical handling problems many SMEs still need to solve first.';
  }
  if (text.indexOf('battery') >= 0 || text.indexOf('electric') >= 0) {
    return 'Use this to build authority around electric handling equipment, battery choices, uptime, and total cost of ownership.';
  }
  if (text.indexOf('safety') >= 0) {
    return 'Use this to talk about safer pallet and forklift movement, operator confidence, and avoiding preventable site incidents.';
  }
  return 'Use this as a practical AEGIS industry take: what it means for operators buying or running industrial equipment.';
}

function industryTargetAudience_(tags) {
  const text = normaliseSalesText_(tags);
  if (text.indexOf('rough terrain') >= 0 || text.indexOf('yard') >= 0) return 'Yard managers, builders merchants, farm suppliers, construction suppliers, warehouse managers';
  if (text.indexOf('automation') >= 0) return 'Warehouse managers, operations directors, logistics managers, 3PL owners';
  if (text.indexOf('safety') >= 0) return 'Operations managers, site managers, health and safety leads, forklift supervisors';
  return 'Warehouse managers, operations managers, logistics managers, business owners';
}

function industryEngagementTargets_(tags) {
  const text = normaliseSalesText_(tags);
  const targets = ['warehouse managers', 'operations managers', 'logistics managers'];
  if (text.indexOf('rough terrain') >= 0 || text.indexOf('yard') >= 0) targets.push('builders merchants', 'yard managers', 'farm suppliers');
  if (text.indexOf('automation') >= 0) targets.push('3PL operators', 'warehouse automation consultants');
  if (text.indexOf('safety') >= 0) targets.push('health and safety managers', 'training providers');
  return targets.join('|');
}

function webAppDraftIndustryPosts(options) {
  const settings = options || {};
  const count = Math.max(1, Math.min(5, Number(settings.count) || 3));
  const sheet = getIndustryRadarSheet_();
  const items = readIndustryRadarItems_()
    .filter(item => clean_(settings.itemId) ? item.id === clean_(settings.itemId) : normaliseSalesText_(item.status) !== 'posted')
    .sort((a, b) => (Number(b.relevance) || 0) - (Number(a.relevance) || 0))
    .slice(0, count);
  const posts = [];

  items.forEach((item, index) => {
    const draft = clean_(item.linkedinDraft) || buildIndustryLinkedInDraft_(item, index);
    const found = findIndustryRadarItem_(item.id, item.url);
    if (found.rowNumber) {
      const next = Object.assign({}, item, {
        linkedinDraft: draft,
        status: normaliseSalesText_(item.status) === 'approved' ? item.status : 'Drafted'
      });
      sheet.getRange(found.rowNumber, 1, 1, INDUSTRY_RADAR_CONFIG.HEADERS.length).setValues([industryRadarItemToRow_(next, item)]);
    }
    posts.push(Object.assign({}, item, { linkedinDraft: draft, status: 'Drafted' }));
  });

  SpreadsheetApp.flush();
  clearWebAppStateCache_(['industry']);

  return {
    ok: true,
    drafted: posts.length,
    posts
  };
}

function buildIndustryLinkedInDraft_(item, index) {
  const hooks = [
    'Most warehouse tech conversations jump straight to automation. But a lot of operators still lose time on simpler movement problems.',
    'One thing I keep noticing in industrial equipment: the biggest gains are not always the most complicated ones.',
    'A useful signal from the material handling sector this week: practical handling problems are still where a lot of cost hides.'
  ];
  const hook = hooks[index % hooks.length];
  const tags = clean_(item.tags).split(/\|/).filter(Boolean).slice(0, 4).join(', ');

  return [
    hook,
    '',
    item.title ? `Industry signal: ${item.title}` : '',
    item.summary ? `What matters: ${serverShorten_(item.summary, 260)}` : '',
    '',
    item.angle || buildIndustryAngle_(item.title, item.tags, item.summary),
    '',
    'For AEGIS, this is exactly the kind of gap we care about: equipment that helps teams move materials reliably in real operating environments, not just on perfect warehouse floors.',
    '',
    tags ? `Themes: ${tags}` : '',
    item.url ? `Source: ${item.url}` : ''
  ].filter(Boolean).join('\n');
}

/************************************************************
 * Content Schedule workflow
 ************************************************************/

function getContentScheduleSheet_() {
  const ss = getAegisWorkbook_();
  let sheet = ss.getSheetByName(CONTENT_SCHEDULE_CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONTENT_SCHEDULE_CONFIG.SHEET_NAME);
  }

  ensureContentScheduleHeaders_(sheet);
  return sheet;
}

function ensureContentScheduleHeaders_(sheet) {
  sheet
    .getRange(CONTENT_SCHEDULE_CONFIG.HEADER_ROW, 1, 1, CONTENT_SCHEDULE_CONFIG.HEADERS.length)
    .setValues([CONTENT_SCHEDULE_CONFIG.HEADERS])
    .setFontWeight('bold')
    .setBackground('#1D2330')
    .setFontColor('#FFFFFF')
    .setWrap(true);

  [
    [CONTENT_SCHEDULE_CONFIG.COL_ID, 170],
    [CONTENT_SCHEDULE_CONFIG.COL_SCHEDULED_FOR, 160],
    [CONTENT_SCHEDULE_CONFIG.COL_PLATFORM, 120],
    [CONTENT_SCHEDULE_CONFIG.COL_PILLAR, 190],
    [CONTENT_SCHEDULE_CONFIG.COL_STATUS, 120],
    [CONTENT_SCHEDULE_CONFIG.COL_TITLE, 320],
    [CONTENT_SCHEDULE_CONFIG.COL_POST_DRAFT, 460],
    [CONTENT_SCHEDULE_CONFIG.COL_SOURCE_TYPE, 150],
    [CONTENT_SCHEDULE_CONFIG.COL_SOURCE_ID, 160],
    [CONTENT_SCHEDULE_CONFIG.COL_SOURCE_TITLE, 320],
    [CONTENT_SCHEDULE_CONFIG.COL_SOURCE_URL, 340],
    [CONTENT_SCHEDULE_CONFIG.COL_TAGS, 240],
    [CONTENT_SCHEDULE_CONFIG.COL_TARGET_AUDIENCE, 280],
    [CONTENT_SCHEDULE_CONFIG.COL_CTA, 260],
    [CONTENT_SCHEDULE_CONFIG.COL_ASSET_URL, 260],
    [CONTENT_SCHEDULE_CONFIG.COL_POSTED_URL, 260],
    [CONTENT_SCHEDULE_CONFIG.COL_OWNER, 120],
    [CONTENT_SCHEDULE_CONFIG.COL_NOTES, 320]
  ].forEach(([col, width]) => sheet.setColumnWidth(col, width));
}

function webAppGetContentScheduleState() {
  return cachedWebAppState_('content', buildWebAppContentScheduleState_);
}

function buildWebAppContentScheduleState_() {
  const items = readContentScheduleItems_();
  const radarItems = readIndustryRadarItems_();
  items.sort(contentScheduleSort_);
  const history = buildLinkedInPostHistory_(items);

  return {
    items,
    history,
    radarItems,
    stats: buildContentScheduleStats_(items),
    historyStats: buildLinkedInHistoryStats_(history),
    updatedAt: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd MMM yyyy HH:mm'
    )
  };
}

function webAppGetLinkedInPostHistory(options) {
  const settings = options || {};
  const limit = Math.max(1, Math.min(250, Number(settings.limit) || 100));
  const history = buildLinkedInPostHistory_(readContentScheduleItems_()).slice(0, limit);

  return {
    ok: true,
    items: history,
    count: history.length,
    stats: buildLinkedInHistoryStats_(history)
  };
}

function webAppImportLinkedInPostHistory(items) {
  const rows = Array.isArray(items) ? items : [items];
  const saved = rows
    .filter(Boolean)
    .map(item => webAppSaveContentItem(Object.assign({}, item, {
      platform: clean_(item.platform) || 'LinkedIn',
      status: clean_(item.status) || 'Posted',
      sourceType: clean_(item.sourceType) || 'LinkedIn Profile History',
      title: clean_(item.title || item.headline) || linkedInHistoryTitle_(item),
      postDraft: clean_(item.postDraft || item.text || item.body || item.copy || item.message),
      postedUrl: clean_(item.postedUrl || item.url || item.link),
      scheduledFor: normaliseContentDateOutput_(item.scheduledFor || item.postedAt || item.date),
      owner: clean_(item.owner) || 'Aaron',
      notes: clean_(item.notes || item.context)
    })));

  return {
    ok: true,
    imported: saved.length,
    items: saved
  };
}

function webAppGetLinkedInProfile() {
  const config = getLinkedInConfig_();
  if (config.missing.length) {
    throw new Error('LinkedIn is not connected yet. Use Connect LinkedIn in Sales OS.');
  }

  const accessToken = getLinkedInAccessToken_(config);
  const userInfo = linkedInApiGetOptional_('https://api.linkedin.com/v2/userinfo', accessToken) || {};
  const legacyProfile = linkedInApiGetOptional_('https://api.linkedin.com/v2/me', accessToken) || {};

  return {
    ok: true,
    authorUrn: config.authorUrn,
    profile: {
      id: clean_(userInfo.sub || legacyProfile.id),
      name: clean_(userInfo.name),
      givenName: clean_(userInfo.given_name || legacyProfile.localizedFirstName),
      familyName: clean_(userInfo.family_name || legacyProfile.localizedLastName),
      email: clean_(userInfo.email),
      picture: clean_(userInfo.picture),
      locale: userInfo.locale || legacyProfile.localizedHeadline || ''
    }
  };
}

function buildLinkedInPostHistory_(items) {
  return (items || [])
    .filter(item => {
      const platform = normaliseSalesText_(item.platform);
      const status = normaliseSalesText_(item.status);
      return platform.indexOf('linkedin') >= 0 && (status === 'posted' || clean_(item.postedUrl));
    })
    .sort((a, b) => contentDateValue_(b.scheduledFor || b.updatedAt || b.createdAt) - contentDateValue_(a.scheduledFor || a.updatedAt || a.createdAt))
    .map(item => ({
      id: item.id,
      postedAt: item.scheduledFor || item.updatedAt || item.createdAt,
      title: item.title,
      text: item.postDraft,
      pillar: item.pillar,
      tags: item.tags,
      audience: item.targetAudience,
      cta: item.cta,
      assetUrl: item.assetUrl,
      postedUrl: item.postedUrl,
      sourceType: item.sourceType,
      sourceTitle: item.sourceTitle,
      sourceUrl: item.sourceUrl,
      owner: item.owner,
      notes: item.notes
    }));
}

function buildLinkedInHistoryStats_(history) {
  const items = history || [];
  const pillars = {};
  const tags = {};

  items.forEach(item => {
    const pillar = clean_(item.pillar) || 'Uncategorised';
    pillars[pillar] = (pillars[pillar] || 0) + 1;
    clean_(item.tags)
      .split(/\||,|;/)
      .map(clean_)
      .filter(Boolean)
      .forEach(tag => {
        tags[tag] = (tags[tag] || 0) + 1;
      });
  });

  return {
    total: items.length,
    pillars,
    tags
  };
}

function linkedInHistoryTitle_(item) {
  const text = clean_(item.postDraft || item.text || item.body || item.copy || item.message);
  return text ? text.slice(0, 90) : 'LinkedIn history post';
}

function readContentScheduleItems_() {
  const sheet = getContentScheduleSheet_();
  const lastRow = sheet.getLastRow();
  const items = [];

  if (lastRow < CONTENT_SCHEDULE_CONFIG.FIRST_ROW) return items;

  const values = sheet
    .getRange(
      CONTENT_SCHEDULE_CONFIG.FIRST_ROW,
      1,
      lastRow - CONTENT_SCHEDULE_CONFIG.FIRST_ROW + 1,
      CONTENT_SCHEDULE_CONFIG.HEADERS.length
    )
    .getValues();

  values.forEach((r, i) => {
    const item = buildWebContentScheduleItem_(r, CONTENT_SCHEDULE_CONFIG.FIRST_ROW + i);
    if (item.id || item.title || item.postDraft) items.push(item);
  });

  return items;
}

function buildWebContentScheduleItem_(r, rowNumber) {
  return {
    rowNumber,
    id: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_ID - 1]),
    scheduledFor: formatWebDate_(r[CONTENT_SCHEDULE_CONFIG.COL_SCHEDULED_FOR - 1]),
    platform: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_PLATFORM - 1]) || 'LinkedIn',
    pillar: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_PILLAR - 1]),
    status: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_STATUS - 1]) || 'Drafted',
    title: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_TITLE - 1]),
    postDraft: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_POST_DRAFT - 1]),
    sourceType: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_SOURCE_TYPE - 1]),
    sourceId: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_SOURCE_ID - 1]),
    sourceTitle: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_SOURCE_TITLE - 1]),
    sourceUrl: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_SOURCE_URL - 1]),
    tags: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_TAGS - 1]),
    targetAudience: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_TARGET_AUDIENCE - 1]),
    cta: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_CTA - 1]),
    assetUrl: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_ASSET_URL - 1]),
    postedUrl: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_POSTED_URL - 1]),
    owner: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_OWNER - 1]) || 'Aaron',
    notes: clean_(r[CONTENT_SCHEDULE_CONFIG.COL_NOTES - 1]),
    createdAt: formatWebDate_(r[CONTENT_SCHEDULE_CONFIG.COL_CREATED_AT - 1]),
    updatedAt: formatWebDate_(r[CONTENT_SCHEDULE_CONFIG.COL_UPDATED_AT - 1])
  };
}

function contentScheduleSort_(a, b) {
  const statusRank = item => {
    const status = normaliseSalesText_(item.status);
    if (status === 'posted' || status === 'archived') return 3;
    if (status === 'approved' || status === 'scheduled') return 1;
    return 0;
  };
  const rankDiff = statusRank(a) - statusRank(b);
  if (rankDiff) return rankDiff;
  return contentDateValue_(a.scheduledFor) - contentDateValue_(b.scheduledFor);
}

function contentDateValue_(value) {
  const date = parseContentDate_(value);
  return date ? date.getTime() : 9999999999999;
}

function buildContentScheduleStats_(items) {
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const status = item => normaliseSalesText_(item.status);
  const scheduledWindow = item => {
    const date = parseContentDate_(item.scheduledFor);
    return date && date >= today && date <= weekEnd;
  };

  return {
    total: items.length,
    drafted: items.filter(item => status(item).indexOf('draft') >= 0).length,
    scheduled: items.filter(item => status(item) === 'scheduled').length,
    approved: items.filter(item => status(item) === 'approved').length,
    posted: items.filter(item => status(item) === 'posted').length,
    needsApproval: items.filter(item => status(item) === 'drafted' || status(item) === 'needs edit').length,
    thisWeek: items.filter(scheduledWindow).length,
    linkedIn: items.filter(item => normaliseSalesText_(item.platform).indexOf('linkedin') >= 0).length
  };
}

function webAppSaveContentItem(item) {
  const sheet = getContentScheduleSheet_();
  const incoming = normaliseContentScheduleInput_(item || {});
  const existing = findContentScheduleItem_(incoming.id, incoming.sourceId);
  const targetRow = existing.rowNumber || Math.max(sheet.getLastRow() + 1, CONTENT_SCHEDULE_CONFIG.FIRST_ROW);

  if (!incoming.title && !incoming.postDraft) {
    throw new Error('Add at least a title or post draft before saving content.');
  }

  sheet.getRange(targetRow, 1, 1, CONTENT_SCHEDULE_CONFIG.HEADERS.length).setValues([contentScheduleItemToRow_(incoming, existing.item)]);
  sheet.getRange(targetRow, 1, 1, CONTENT_SCHEDULE_CONFIG.HEADERS.length).setVerticalAlignment('top').setWrap(true);
  SpreadsheetApp.flush();
  clearWebAppStateCache_(['content']);

  return {
    ok: true,
    id: incoming.id || (existing.item && existing.item.id),
    rowNumber: targetRow
  };
}

function webAppSaveContentScheduleItems(items) {
  const rows = Array.isArray(items) ? items : [items];
  const saved = rows
    .filter(Boolean)
    .map(item => webAppSaveContentItem(item));

  return {
    ok: true,
    saved: saved.length,
    items: saved
  };
}

function webAppUpdateContentItem(id, updates) {
  const found = findContentScheduleItem_(id || (updates && updates.id), updates && updates.sourceId);
  if (!found.rowNumber) {
    throw new Error('Content schedule item not found.');
  }

  const next = normaliseContentScheduleInput_(Object.assign({}, found.item, updates || {}, { id: found.item.id }));
  getContentScheduleSheet_().getRange(found.rowNumber, 1, 1, CONTENT_SCHEDULE_CONFIG.HEADERS.length).setValues([contentScheduleItemToRow_(next, found.item)]);
  SpreadsheetApp.flush();
  clearWebAppStateCache_(['content']);

  return {
    ok: true,
    id: next.id,
    rowNumber: found.rowNumber
  };
}

function webAppScheduleIndustryContent(options) {
  const settings = options || {};
  const count = Math.max(1, Math.min(12, Number(settings.count) || 3));
  const itemIds = clean_(settings.itemIds || settings.itemId)
    .split(/\n|,|;|\|/)
    .map(clean_)
    .filter(Boolean);
  const existingBySource = buildContentExistingSourceMap_();
  const sourceItems = readIndustryRadarItems_()
    .filter(item => {
      if (itemIds.length) return itemIds.indexOf(item.id) >= 0;
      const status = normaliseSalesText_(item.status);
      if (status === 'posted' || status === 'ignored') return false;
      if (!settings.allowDuplicates && existingBySource[item.id]) return false;
      return true;
    })
    .sort((a, b) => (Number(b.relevance) || 0) - (Number(a.relevance) || 0))
    .slice(0, count);
  const created = [];

  sourceItems.forEach((item, index) => {
    const draft = clean_(item.linkedinDraft) || buildIndustryLinkedInDraft_(item, index);
    const contentItem = normaliseContentScheduleInput_({
      scheduledFor: contentScheduleSlot_(index, settings.startDate || settings.scheduledFor),
      platform: settings.platform || 'LinkedIn',
      pillar: settings.pillar || contentPillarFromTags_(item.tags),
      status: settings.status || 'Scheduled',
      title: item.title,
      postDraft: draft,
      sourceType: 'Industry Radar',
      sourceId: item.id,
      sourceTitle: item.title,
      sourceUrl: item.url,
      tags: item.tags,
      targetAudience: item.targetAudience,
      cta: settings.cta || 'Follow AEGIS Industrial Systems for practical notes on industrial equipment, forklifts, and material handling.',
      owner: settings.owner || 'Aaron',
      notes: item.angle
    });
    const saved = webAppSaveContentItem(contentItem);
    created.push(Object.assign({}, contentItem, saved));

    const foundRadar = findIndustryRadarItem_(item.id, item.url);
    if (foundRadar.rowNumber) {
      const nextRadar = Object.assign({}, item, {
        linkedinDraft: draft,
        status: normaliseSalesText_(item.status) === 'approved' ? item.status : 'Drafted'
      });
      getIndustryRadarSheet_()
        .getRange(foundRadar.rowNumber, 1, 1, INDUSTRY_RADAR_CONFIG.HEADERS.length)
        .setValues([industryRadarItemToRow_(nextRadar, item)]);
    }
  });

  SpreadsheetApp.flush();
  clearWebAppStateCache_(['content', 'industry']);

  return {
    ok: true,
    scheduled: created.length,
    items: created
  };
}

function normaliseContentScheduleInput_(payload) {
  const source = payload || {};
  const title = clean_(source.title || source.headline || source.name || source.sourceTitle);
  const postDraft = clean_(source.postDraft || source.linkedinDraft || source.body || source.copy || source.message);
  const sourceId = clean_(source.sourceId || source.industryItemId || source.itemId || source.source_id);
  const sourceTitle = clean_(source.sourceTitle || source.articleTitle || title);
  const sourceUrl = clean_(source.sourceUrl || source.articleUrl || source.url || source.link);
  const tags = clean_(source.tags || source.theme || source.themes);

  return Object.assign({}, source, {
    id: clean_(source.id || source.contentId) || contentItemId_(`${sourceId} ${sourceUrl} ${title} ${postDraft}`),
    scheduledFor: normaliseContentDateOutput_(source.scheduledFor || source.scheduledAt || source.date),
    platform: clean_(source.platform) || 'LinkedIn',
    pillar: clean_(source.pillar || source.contentPillar) || contentPillarFromTags_(tags),
    status: clean_(source.status) || 'Drafted',
    title,
    postDraft,
    sourceType: clean_(source.sourceType) || (sourceId ? 'Industry Radar' : 'Manual'),
    sourceId,
    sourceTitle,
    sourceUrl,
    tags,
    targetAudience: clean_(source.targetAudience || source.audience),
    cta: clean_(source.cta || source.callToAction),
    assetUrl: clean_(source.assetUrl || source.imageUrl || source.mediaUrl),
    postedUrl: clean_(source.postedUrl || source.liveUrl || source.postUrl),
    owner: clean_(source.owner) || 'Aaron',
    notes: clean_(source.notes)
  });
}

function contentScheduleItemToRow_(item, existing) {
  const source = item || {};
  const current = existing || {};
  const now = new Date();

  return [
    clean_(source.id) || clean_(current.id) || contentItemId_(source.title || source.postDraft),
    parseContentDate_(source.scheduledFor) || clean_(source.scheduledFor) || clean_(current.scheduledFor),
    clean_(source.platform) || clean_(current.platform) || 'LinkedIn',
    clean_(source.pillar) || clean_(current.pillar),
    clean_(source.status) || clean_(current.status) || 'Drafted',
    clean_(source.title) || clean_(current.title),
    clean_(source.postDraft) || clean_(current.postDraft),
    clean_(source.sourceType) || clean_(current.sourceType),
    clean_(source.sourceId) || clean_(current.sourceId),
    clean_(source.sourceTitle) || clean_(current.sourceTitle),
    clean_(source.sourceUrl) || clean_(current.sourceUrl),
    clean_(source.tags) || clean_(current.tags),
    clean_(source.targetAudience) || clean_(current.targetAudience),
    clean_(source.cta) || clean_(current.cta),
    clean_(source.assetUrl) || clean_(current.assetUrl),
    clean_(source.postedUrl) || clean_(current.postedUrl),
    clean_(source.owner) || clean_(current.owner) || 'Aaron',
    clean_(source.notes) || clean_(current.notes),
    current.createdAt || now,
    now
  ];
}

function findContentScheduleItem_(id, sourceId) {
  const sheet = getContentScheduleSheet_();
  const lastRow = sheet.getLastRow();
  const cleanId = clean_(id);
  const cleanSourceId = clean_(sourceId);

  if (lastRow < CONTENT_SCHEDULE_CONFIG.FIRST_ROW) {
    return { rowNumber: 0, item: null };
  }

  const values = sheet
    .getRange(
      CONTENT_SCHEDULE_CONFIG.FIRST_ROW,
      1,
      lastRow - CONTENT_SCHEDULE_CONFIG.FIRST_ROW + 1,
      CONTENT_SCHEDULE_CONFIG.HEADERS.length
    )
    .getValues();

  for (let i = 0; i < values.length; i++) {
    const item = buildWebContentScheduleItem_(values[i], CONTENT_SCHEDULE_CONFIG.FIRST_ROW + i);
    if ((cleanId && item.id === cleanId) || (cleanSourceId && item.sourceId === cleanSourceId)) {
      return {
        rowNumber: CONTENT_SCHEDULE_CONFIG.FIRST_ROW + i,
        item
      };
    }
  }

  return { rowNumber: 0, item: null };
}

function buildContentExistingSourceMap_() {
  const map = {};
  readContentScheduleItems_().forEach(item => {
    if (item.sourceId) map[item.sourceId] = true;
  });
  return map;
}

function contentItemId_(seed) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, clean_(seed) || Utilities.getUuid());
  return 'CS-' + digest.slice(0, 5).map(byte => (`0${(byte & 0xff).toString(16)}`).slice(-2)).join('').toUpperCase();
}

function contentPillarFromTags_(tags) {
  const text = normaliseSalesText_(tags);
  if (text.indexOf('rough terrain') >= 0 || text.indexOf('yard') >= 0) return 'AEGIS AllTerrain / Yard Handling';
  if (text.indexOf('automation') >= 0 || text.indexOf('robot') >= 0) return 'Industrial Tech / Automation';
  if (text.indexOf('battery') >= 0 || text.indexOf('electric') >= 0) return 'Electric Equipment / Batteries';
  if (text.indexOf('safety') >= 0) return 'Safety / Operator Confidence';
  if (text.indexOf('used equipment') >= 0 || text.indexOf('forklift') >= 0) return 'Forklifts / Dealer Insights';
  return 'Material Handling Insight';
}

function parseContentDate_(value) {
  const text = clean_(value);
  if (!text) return '';
  const date = new Date(text);
  return isNaN(date.getTime()) ? '' : date;
}

function normaliseContentDateOutput_(value) {
  const date = parseContentDate_(value);
  if (!date) return clean_(value);
  return date;
}

function contentScheduleSlot_(index, startDate) {
  const preferredDays = [2, 4, 5]; // Tue, Thu, Fri
  const preferredHours = [9, 9, 10];
  const start = parseContentDate_(startDate) || new Date();
  const cursor = new Date(start);
  cursor.setHours(8, 0, 0, 0);
  const slots = [];

  for (let offset = 0; offset < 90 && slots.length <= index; offset++) {
    const candidate = new Date(cursor);
    candidate.setDate(cursor.getDate() + offset);
    const dayIndex = preferredDays.indexOf(candidate.getDay());
    if (dayIndex < 0) continue;
    candidate.setHours(preferredHours[dayIndex], 0, 0, 0);
    if (candidate <= new Date()) continue;
    slots.push(candidate);
  }

  if (slots[index]) return slots[index];

  const fallback = new Date(start);
  fallback.setDate(fallback.getDate() + (index * 2) + 1);
  fallback.setHours(9, 0, 0, 0);
  return fallback;
}

/************************************************************
 * Web App Front-End Add-On
 * Keeps your existing sheet automation as the engine.
 ************************************************************/

function doGet(event) {
  const params = (event && event.parameter) || {};
  const action = clean_(params.action);

  if (params.code && params.state) {
    return webAppLinkedInOAuthCallback_(event);
  }

  if (action === 'linkedinConnect' && webAppAccessGranted_(event)) {
    return webAppLinkedInOAuthStart_(event);
  }

  if (!webAppAccessGranted_(event)) {
    return webAppAccessDeniedOutput_(event);
  }

  if (event && event.parameter && clean_(event.parameter.action) === 'diagnostics') {
    return webAppDiagnostics_();
  }

  if (event && event.parameter && clean_(event.parameter.action) === 'state') {
    return webAppStateProbe_(getInitialWebView_(event));
  }

  if (event && event.parameter && clean_(event.parameter.action) === 'jsonp') {
    return webAppJsonpState_(event);
  }

  if (event && event.parameter && clean_(event.parameter.action) === 'normaliseStockImages') {
    return webAppNormaliseStockImages_();
  }

  const template = HtmlService.createTemplateFromFile('Index');
  template.initialView = getInitialWebView_(event);
  template.initialStateJson = getInitialWebStateJson_(template.initialView);
  const initialState = JSON.parse(template.initialStateJson);
  const initialData = initialState.data || {};
  template.webAppUrl = ScriptApp.getService().getUrl();
  template.cacheBuster = String(new Date().getTime());
  template.initialRowsHtml = getInitialRowsHtml_(
    template.initialView,
    initialData,
    template.webAppUrl,
    template.cacheBuster
  );
  template.initialProfileHtml = getInitialProfileHtml_(
    template.initialView,
    initialData,
    (event && event.parameter) || {}
  );
  template.initialStats = initialData.stats || {};
  template.initialVisibleCount = getInitialVisibleCount_(template.initialView, initialData);
  template.initialUpdatedAt = initialData.updatedAt || '';
  template.accessKey = getAegisWebAccessKey_();
  template.accessQuery = '&access=' + encodeURIComponent(getAegisWebAccessKey_());

  return template
    .evaluate()
    .setTitle('AEGIS AI Sales OS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(event) {
  let payload;

  try {
    payload = parseWebAppPostJson_(event);
  } catch (error) {
    return webAppJsonOutput_({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }

  if (!webAppAccessGranted_(event) && !webAppPayloadAccessGranted_(payload)) {
    return webAppJsonOutput_({
      ok: false,
      error: 'AEGIS access required'
    });
  }

  try {
    const action = clean_(payload.action);
    let result;

    if (action === 'getState') {
      result = getWebAppStateForView_(payload.view || 'sales');
    } else if (action === 'createEnquiry') {
      result = webAppCreateEnquiry(payload.enquiry || payload);
    } else if (action === 'createMarketplaceEnquiry') {
      result = webAppCreateMarketplaceEnquiry(payload.enquiry || payload);
    } else if (action === 'updateSalesLead') {
      result = webAppUpdateSalesLead(payload.leadId || payload.lead_id, payload.updates || payload);
    } else if (action === 'getWorkbookSchema') {
      result = webAppGetWorkbookSchema(payload.options || payload);
    } else if (action === 'createSheetTab') {
      result = webAppCreateSheetTab(payload);
    } else if (action === 'insertSheetRows') {
      result = webAppInsertSheetRows(payload);
    } else if (action === 'saveSheetRows') {
      result = webAppSaveSheetRows(payload);
    } else if (action === 'saveSheetCells') {
      result = webAppSaveSheetCells(payload);
    } else if (action === 'findMultiCompanyCells') {
      result = webAppFindMultiCompanyCells(payload);
    } else if (action === 'splitMultiCompanyCells') {
      result = webAppSplitMultiCompanyCells(payload);
    } else if (action === 'saveDatabaseRows') {
      result = webAppSaveDatabaseRows(payload);
    } else if (action === 'getDatabaseContext') {
      result = webAppGetDatabaseContext(payload.options || payload);
    } else if (action === 'getCampaignEmailContext') {
      result = webAppGetCampaignEmailContext(payload.options || payload);
    } else if (action === 'moveDatabaseRowsToCampaign') {
      result = webAppMoveDatabaseRowsToCampaign(payload.selection || payload.rows || [], payload.alsoDraft === true);
    } else if (action === 'draftCampaignRows') {
      result = webAppDraftRows(payload.rowNumbers || payload.rows || []);
    } else if (action === 'scheduleCampaignRows') {
      result = webAppScheduleRows(payload.rowNumbers || payload.rows || [], payload.firstSendAt || payload.sendAt || payload.scheduledFor);
    } else if (action === 'sendCampaignEmailBatch') {
      result = webAppSendCampaignEmailBatch(payload.options || payload);
    } else if (action === 'sendDueCampaignEmails') {
      result = webAppSendDueNow();
    } else if (action === 'saveMarketplaceItem') {
      result = webAppSaveMarketplaceItem(payload.item || payload);
    } else if (action === 'publishMarketplaceListing') {
      result = webAppPublishMarketplaceListing(payload.item || payload.listing || payload);
    } else if (action === 'publishEbayListing') {
      result = webAppPublishEbayListing(payload.item || payload.listing || payload);
    } else if (action === 'publishLinkedInPost') {
      result = webAppPublishLinkedInPost(payload.content || payload.item || payload.post || payload);
    } else if (action === 'getLinkedInPostHistory') {
      result = webAppGetLinkedInPostHistory(payload.options || payload);
    } else if (action === 'importLinkedInPostHistory') {
      result = webAppImportLinkedInPostHistory(payload.items || payload.posts || payload.history || []);
    } else if (action === 'getLinkedInProfile') {
      result = webAppGetLinkedInProfile();
    } else if (action === 'saveLinkedInAppConfig') {
      result = webAppSaveLinkedInAppConfig(payload.config || payload.linkedin || payload);
    } else if (action === 'getLinkedInAuthorizationUrl') {
      result = webAppGetLinkedInAuthorizationUrl();
    } else if (action === 'getIntegrationStatus') {
      result = webAppGetIntegrationStatus();
    } else if (action === 'buildMarketplaceListingPackage') {
      result = webAppBuildMarketplaceListingPackage(payload.truckId || payload.stockId || payload.id, payload.platform || payload.source);
    } else if (action === 'exportMarketplaceFeed') {
      result = webAppExportMarketplaceFeed(payload.platform || payload.source);
    } else if (action === 'scanIndustryRadar') {
      result = webAppScanIndustryRadar(payload.options || payload);
    } else if (action === 'saveIndustryRadarItem') {
      result = webAppSaveIndustryRadarItem(payload.item || payload.article || payload);
    } else if (action === 'updateIndustryRadarItem') {
      result = webAppUpdateIndustryRadarItem(payload.itemId || payload.industryItemId || payload.id, payload.updates || payload.item || payload);
    } else if (action === 'draftIndustryPosts') {
      result = webAppDraftIndustryPosts(payload.options || payload);
    } else if (action === 'saveContentItem') {
      result = webAppSaveContentItem(payload.content || payload.item || payload.post || payload);
    } else if (action === 'saveContentScheduleItems') {
      result = webAppSaveContentScheduleItems(payload.items || payload.posts || payload.schedule || []);
    } else if (action === 'updateContentItem') {
      result = webAppUpdateContentItem(payload.contentId || payload.itemId || payload.id, payload.updates || payload.content || payload.item || payload);
    } else if (action === 'scheduleIndustryContent') {
      result = webAppScheduleIndustryContent(payload.options || payload);
    } else if ([
      'saveStockItem',
      'createStockListing',
      'createStockItem',
      'addStockListing',
      'addStockItem',
      'createListing',
      'addListing',
      'saveStockListing'
    ].indexOf(action) >= 0) {
      result = webAppSaveStockItem(getStockPayload_(payload));
    } else if ([
      'updateStockItem',
      'editStockItem',
      'editStockListing',
      'updateStockListing'
    ].indexOf(action) >= 0) {
      result = webAppUpdateStockItem(payload.stockId || payload.truckId || payload.id, getStockPayload_(payload.updates || payload));
    } else if (action === 'updateStockImages') {
      result = webAppUpdateStockImages(payload.stockId || payload.truckId || payload.id, payload.images || payload);
    } else if ([
      'deleteStockItem',
      'removeStockItem',
      'removeStockListing',
      'deleteStockListing'
    ].indexOf(action) >= 0) {
      result = webAppDeleteStockItem(payload.stockId || payload.truckId || payload.id);
    } else if (action === 'uploadImage') {
      result = webAppUploadImage(payload.image || payload);
    } else if (action === 'sendEmail') {
      result = webAppSendEmail(mergeNestedPayload_(payload, 'email'));
    } else if (action === 'logEmailActivity') {
      result = webAppLogEmailActivity(mergeNestedPayload_(payload, 'activity', 'email'));
    } else if (action === 'sendWhatsApp') {
      result = webAppSendWhatsApp(payload.whatsapp || payload);
    } else if (action === 'syncGmailEnquiries') {
      result = webAppSyncGmailEnquiries(payload.options || payload);
    } else if (action === 'importGmailThreadAsEnquiry') {
      result = webAppImportGmailThreadAsEnquiry(payload.threadId || payload.gmailThreadId || payload.id, payload.options || payload);
    } else if (action === 'installGmailSyncTrigger') {
      result = installGmailEnquirySyncTrigger();
    } else if (action === 'getGmailSyncStatus') {
      result = webAppGetGmailSyncStatus();
    } else if (action === 'listGmailThreads') {
      result = webAppListGmailThreads(payload.options || payload);
    } else if (action === 'getGmailThread') {
      result = webAppGetGmailThread(payload.threadId || payload.gmailThreadId || payload.id);
    } else if (action === 'searchGoogleMapsBusinesses') {
      result = webAppSearchGoogleMapsBusinesses(payload.options || payload);
    } else if (action === 'extractBusinessWebsiteContacts') {
      result = webAppExtractBusinessWebsiteContacts(payload.options || payload);
    } else if (action === 'createGmailReplyDraft') {
      result = webAppCreateGmailReplyDraft(mergeNestedPayload_(payload, 'reply', 'email'));
    } else if (action === 'sendGmailReply') {
      result = webAppSendGmailReply(mergeNestedPayload_(payload, 'reply', 'email'));
    } else if (action === 'diagnoseGmailEnquiries') {
      result = webAppDiagnoseGmailEnquiries(payload.options || payload);
    } else {
      throw new Error('Unknown AEGIS action: ' + (action || 'blank'));
    }

    return webAppJsonOutput_({
      ok: true,
      action,
      result
    });
  } catch (error) {
    return webAppJsonOutput_({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function mergeNestedPayload_(payload) {
  const merged = Object.assign({}, payload || {});
  for (let i = 1; i < arguments.length; i += 1) {
    const key = arguments[i];
    const value = payload && payload[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(merged, value);
    }
  }
  return merged;
}

function parseWebAppPostJson_(event) {
  const contents = event && event.postData && event.postData.contents;
  if (!contents) return {};

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error('The AEGIS action body must be valid JSON.');
  }
}

function webAppPayloadAccessGranted_(payload) {
  const key = clean_(payload && (payload.access || payload.key || payload.aegis));
  return key && key === getAegisWebAccessKey_();
}

function webAppJsonOutput_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function getWebAppStateForView_(view) {
  return JSON.parse(getInitialWebStateJson_(getInitialWebView_({ parameter: { view } })));
}

function getAegisWebAccessKey_() {
  const props = PropertiesService.getScriptProperties();
  let key = clean_(props.getProperty(AEGIS_WEB_ACCESS_PROPERTY));

  if (!key) {
    key = AEGIS_DEFAULT_WEB_ACCESS_KEY;
    props.setProperty(AEGIS_WEB_ACCESS_PROPERTY, key);
  }

  return key;
}

function getGoogleMapsApiKey_() {
  return clean_(PropertiesService.getScriptProperties().getProperty(GOOGLE_MAPS_API_KEY_PROPERTY));
}

function webAppAccessGranted_(event) {
  const params = (event && event.parameter) || {};
  const key = clean_(params.access || params.key || params.aegis);
  return key && key === getAegisWebAccessKey_();
}

function webAppAccessDeniedOutput_(event) {
  const params = (event && event.parameter) || {};
  const action = clean_(params.action);

  if (action === 'state' || action === 'diagnostics') {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        error: 'AEGIS access required'
      }, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'jsonp') {
    const callback = clean_(params.callback || 'aegisStateCallback');
    const safeCallback = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(callback)
      ? callback
      : 'aegisStateCallback';
    return ContentService
      .createTextOutput(safeCallback + '(' + JSON.stringify({ ok: false, error: 'AEGIS access required' }) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  const attempted = !!clean_(params.access || params.key || params.aegis);
  const view = getInitialWebView_(event);
  const url = ScriptApp.getService().getUrl();
  const html = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<base target="_top">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>AEGIS Sales OS Access</title>',
    '<style>',
    'body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050805;color:#f5f6f2;font-family:Arial,Helvetica,sans-serif;}',
    '.box{width:min(420px,calc(100vw - 32px));border:1px solid rgba(169,255,114,.22);background:rgba(255,255,255,.04);box-shadow:0 28px 80px rgba(0,0,0,.42);padding:28px;}',
    '.eyebrow{color:#9cf56d;text-transform:uppercase;letter-spacing:.22em;font-size:11px;font-weight:900;}',
    'h1{margin:14px 0 10px;font-size:36px;line-height:.98;}',
    'p{color:#c5c9c1;line-height:1.5;margin:0 0 18px;}',
    'label{display:grid;gap:8px;color:#a8ff72;text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:900;}',
    'input{height:48px;border:1px solid rgba(255,255,255,.18);background:#fff;color:#111;border-radius:6px;padding:0 12px;font-size:16px;}',
    'button{height:48px;margin-top:12px;width:100%;border:0;border-radius:6px;background:linear-gradient(135deg,#caff9e,#5fbd43);color:#071006;font-weight:900;text-transform:uppercase;letter-spacing:.08em;}',
    '.error{margin:0 0 14px;padding:10px 12px;border:1px solid rgba(255,90,90,.38);background:rgba(255,90,90,.09);color:#ffd5d5;font-size:13px;}',
    '</style>',
    '</head>',
    '<body>',
    '<main class="box">',
    '<span class="eyebrow">AEGIS team access</span>',
    '<h1>Sales OS</h1>',
    '<p>Enter the AEGIS access code to open the stock, leads, marketplace, and sales desk cloud app.</p>',
    attempted ? '<div class="error">That access code was not recognised.</div>' : '',
    '<form method="get" action="' + htmlEsc_(url) + '">',
    '<input type="hidden" name="view" value="' + htmlEsc_(view) + '">',
    '<label>Access Code<input name="access" type="password" autocomplete="current-password" autofocus></label>',
    '<button type="submit">Open AEGIS</button>',
    '</form>',
    '</main>',
    '</body>',
    '</html>'
  ].join('');

  return HtmlService
    .createHtmlOutput(html)
    .setTitle('AEGIS Sales OS Access')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function webAppDiagnostics_() {
  const ss = getAegisWorkbook_();
  const diagnostic = {
    ok: true,
    workbookId: AEGIS_WORKBOOK_ID,
    workbookName: ss.getName(),
    sheets: ss.getSheets().map(sheet => ({
      name: sheet.getName(),
      rows: sheet.getLastRow(),
      columns: sheet.getLastColumn()
    })),
    stock: summariseDiagnosticCall_(() => {
      const state = webAppGetStockState();
      return {
        items: (state.items || []).length,
        stats: state.stats || {}
      };
    }),
    enquiries: summariseDiagnosticCall_(() => {
      const state = webAppGetEnquiriesState();
      return {
        enquiries: (state.enquiries || []).length,
        stats: state.stats || {}
      };
    }),
    database: summariseDiagnosticCall_(() => {
      const state = webAppGetDatabaseState();
      return {
        rows: (state.rows || []).filter(row => row.hasData).length,
        tabs: state.tabs || [],
        stats: state.stats || {}
      };
    }),
    opportunities: summariseDiagnosticCall_(() => {
      const state = webAppGetOpportunitiesState();
      return {
        opportunities: (state.opportunities || []).length,
        stats: state.stats || {}
      };
    }),
    pipeline: summariseDiagnosticCall_(() => {
      const state = webAppGetState();
      return {
        rows: (state.rows || []).length,
        stats: state.stats || {}
      };
    }),
    checkedAt: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd MMM yyyy HH:mm:ss'
    )
  };

  return ContentService
    .createTextOutput(JSON.stringify(diagnostic, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function webAppStateProbe_(view) {
  const state = JSON.parse(getInitialWebStateJson_(view));
  return ContentService
    .createTextOutput(JSON.stringify(state, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function webAppJsonpState_(event) {
  const callback = clean_((event && event.parameter && event.parameter.callback) || 'aegisStateCallback');
  const safeCallback = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(callback)
    ? callback
    : 'aegisStateCallback';
  const payload = getInitialWebStateJson_(getInitialWebView_(event));
  return ContentService
    .createTextOutput(safeCallback + '(' + payload + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function getInitialRowsHtml_(view, data, webAppUrl, cacheBuster) {
  if (view === 'pipeline') {
    const rows = data.rows || [];
    if (!rows.length) return '<tr><td colspan="9" class="muted">No campaign rows found.</td></tr>';
    return rows.map(row => [
      '<tr data-campaign-row="' + htmlEsc_(row.rowNumber) + '" onclick="if (window.selectProfile) selectProfile(' + Number(row.rowNumber) + ')">',
      '<td><input type="checkbox" class="rowCheck" value="' + htmlEsc_(row.rowNumber) + '"></td>',
      '<td><div class="companyCell"><div class="miniAvatar">' + htmlEsc_(initials_(row.company)) + '</div><strong><button type="button" class="plainLink" onclick="event.stopPropagation(); selectProfile(' + Number(row.rowNumber) + ')">' + htmlEsc_(row.company) + '</button></strong></div></td>',
      '<td>' + htmlEsc_(row.contact || '-') + '</td>',
      '<td>' + htmlEsc_(row.email || '-') + '</td>',
      '<td>' + serverStatusChip_(row) + '</td>',
      '<td>' + serverSequenceCell_(row) + '</td>',
      '<td>' + htmlEsc_(row.action || '-') + '</td>',
      '<td>' + htmlEsc_(row.nextSendAt || '-') + '</td>',
      '<td>' + htmlEsc_(row.replyReceived || 'No') + '</td>',
      '</tr>'
    ].join('')).join('');
  }

  if (view === 'database') {
    const rows = data.rows || [];
    if (!rows.length) return '<tr><td colspan="10" class="muted">No database rows found.</td></tr>';
    return rows.map(row => [
      '<tr class="sheetRow">',
      '<td class="rowNumber">' + htmlEsc_(row.sourceSheet) + '!' + htmlEsc_(row.rowNumber) + '</td>',
      '<td class="sheetSelect"><input type="checkbox" class="dbRowCheck"></td>',
      ['company', 'phone', 'postcode', 'address', 'email', 'spokeTo', 'contact', 'notes'].map(key =>
        '<td><div class="sheetCell" contenteditable="true">' + htmlEsc_(row[key] || '') + '</div></td>'
      ).join(''),
      '</tr>'
    ].join('')).join('');
  }

  if (view === 'enquiries') {
    const rows = data.enquiries || [];
    if (!rows.length) return '<tr><td colspan="7" class="muted">No enquiries yet.</td></tr>';
    return rows.map(row => [
      '<tr data-enquiry-id="' + htmlEsc_(row.id) + '">',
      '<td><div class="companyCell"><div class="miniAvatar">' + htmlEsc_(initials_(row.customer || row.company || 'E')) + '</div><strong>' + htmlEsc_(row.customer || row.company || 'Unknown') + '</strong><span class="muted">' + htmlEsc_(row.company || '') + '</span></div></td>',
      '<td>' + htmlEsc_(row.source || '-') + '</td>',
      '<td>' + htmlEsc_(row.interestedTruck || '-') + '<span class="muted">' + htmlEsc_(row.budget || '') + '</span></td>',
      '<td><span class="status neutral">' + htmlEsc_(row.stage || '-') + '</span></td>',
      '<td>' + htmlEsc_(row.phone || '-') + '<span class="muted">' + htmlEsc_(row.email || '') + '</span></td>',
      '<td><div class="enquiryTextCell">' + htmlEsc_(row.enquiryText || '-') + '</div></td>',
      '<td><div class="nextActionCell">' + htmlEsc_(row.nextAction || '-') + '</div></td>',
      '</tr>'
    ].join('')).join('');
  }

  if (view === 'opportunities') {
    const rows = data.opportunities || [];
    if (!rows.length) return '<tr><td colspan="7" class="muted">No opportunities yet.</td></tr>';
    return rows.map(row => [
      '<tr data-opportunity-id="' + htmlEsc_(row.id) + '" onclick="if (window.selectOpportunity) selectOpportunity(\'' + jsString_(row.id) + '\')">',
      '<td><div class="companyCell"><div class="miniAvatar">' + htmlEsc_(initials_(row.company)) + '</div><strong><button type="button" class="plainLink" onclick="event.stopPropagation(); selectOpportunity(\'' + jsString_(row.id) + '\')">' + htmlEsc_(row.company) + '</button></strong></div></td>',
      '<td>' + htmlEsc_(row.contact || '-') + '<span class="muted">' + htmlEsc_(row.email || '') + '</span></td>',
      '<td>' + serverOpportunityStageChip_(row.stage) + '</td>',
      '<td>' + htmlEsc_(row.classification || '-') + '</td>',
      '<td>' + htmlEsc_(row.lastReplyText || '-') + '<span class="muted">' + htmlEsc_(row.lastReplyAt || '') + '</span></td>',
      '<td>' + (row.aiReplyDraft ? '<span class="status active">Ready</span>' : '<span class="status neutral">None</span>') + '</td>',
      '<td>' + htmlEsc_(row.nextAction || '-') + '</td>',
      '</tr>'
    ].join('')).join('');
  }

  if (view === 'stock') {
    const rows = data.items || [];
    if (!rows.length) return '<tr><td colspan="5" class="muted">No stock items found.</td></tr>';
    return rows.map(row => [
      '<tr data-stock-id="' + htmlEsc_(row.id) + '" onclick="if (window.selectStock) selectStock(\'' + jsString_(row.id) + '\')">',
      '<td><div class="companyCell"><div class="miniAvatar">' + htmlEsc_(initials_(row.brand || row.model || 'ST')) + '</div><div class="stockTruckCell"><strong>' + htmlEsc_([row.brand, row.model].filter(Boolean).join(' ') || row.id) + '</strong><span>' + htmlEsc_(row.type || row.id || '') + '</span></div></div></td>',
      '<td><span class="status neutral">' + htmlEsc_(row.category || '-') + '</span></td>',
      '<td><span class="status active">' + htmlEsc_(row.status || '-') + '</span></td>',
      '<td><div class="stockSpecCell">' + htmlEsc_(row.capacity || '-') + '<span>' + htmlEsc_([row.power, row.liftHeight].filter(Boolean).join(' / ')) + '</span></div></td>',
      '<td>' + htmlEsc_(row.price || '-') + '<span class="muted">' + htmlEsc_(row.vat || '') + '</span></td>',
      '</tr>'
    ].join('')).join('');
  }

  return '';
}

function getInitialProfileHtml_(view, data, params) {
  if (view === 'pipeline') {
    const rows = data.rows || [];
    if (!rows.length) {
      return serverProfileEmpty_(
        'Select a lead',
        'Campaign preview',
        'No campaign rows were found in the Sheet.'
      );
    }

    const selectedRowNumber = Number(params.selectedRow || params.rowNumber || 0);
    const row = rows.find(item => Number(item.rowNumber) === selectedRowNumber) || rows[0];
    return serverCampaignProfile_(row);
  }

  if (view === 'opportunities') {
    const rows = data.opportunities || [];
    if (!rows.length) {
      return serverProfileEmpty_(
        'Select an opportunity',
        'Reply approval queue',
        'When a company replies, sync replies here. The campaign sequence stops, then you can draft, edit, and approve your response.'
      );
    }

    const selectedId = clean_(params.selectedOpportunity || params.opportunityId || '');
    const row = rows.find(item => clean_(item.id) === selectedId) || rows[0];
    return serverOpportunityProfile_(row);
  }

  return serverProfileEmpty_(
    'Select a lead',
    'Campaign preview',
    'Click a row to view notes, AI email drafts, follow-ups, and the call script.'
  );
}

function serverCampaignProfile_(row) {
  return [
    '<div class="profileHead">',
    '<div class="avatar">' + htmlEsc_(initials_(row.contact || row.company)) + '</div>',
    '<div>',
    '<h2>' + htmlEsc_(row.contact || row.company) + '</h2>',
    '<p>' + htmlEsc_(row.company) + ' ' + serverStatusChip_(row) + '</p>',
    '</div>',
    '</div>',
    '<div class="profileActions">',
    '<button class="btn green" onclick="selectOnlyAndRun(' + Number(row.rowNumber) + ', \'draft\')">Generate</button>',
    '<button class="btn" onclick="selectOnlyAndRun(' + Number(row.rowNumber) + ', \'regenerate\')">Rewrite</button>',
    '<button class="btn" onclick="selectOnlyAndRun(' + Number(row.rowNumber) + ', \'gmail\')">Gmail Draft</button>',
    '<button class="btn" onclick="selectOnlyAndRun(' + Number(row.rowNumber) + ', \'pause\')">Pause</button>',
    '</div>',
    serverSendTimeline_(row),
    serverDetailCard_('Notes', row.note || 'No notes yet.'),
    '<div class="editHint">Edits save back to the campaign sheet. If an email step is already sent, changing it here only updates the saved draft for your records/future use.</div>',
    serverEditableField_('Subject', 'subject', row.subject || ''),
    serverEditableField_('Initial Email - Step 1 of 3', 'initialEmail', row.initialEmail || ''),
    serverEditableField_('Follow-up 1 - Step 2 of 3', 'followUp1', row.followUp1 || ''),
    serverEditableField_('Follow-up 2 - Step 3 of 3', 'followUp2', row.followUp2 || ''),
    serverEditableField_('Call Script / Next Step', 'callScript', row.callScript || '', 'call'),
    '<button class="btn green" onclick="saveSelectedDraft()">Save Draft Edits</button>'
  ].join('');
}

function serverOpportunityProfile_(row) {
  return [
    '<div class="profileHead">',
    '<div class="avatar">' + htmlEsc_(initials_(row.contact || row.company)) + '</div>',
    '<div>',
    '<h2>' + htmlEsc_(row.contact || row.company) + '</h2>',
    '<p>' + htmlEsc_(row.company) + ' ' + serverOpportunityStageChip_(row.stage) + '</p>',
    '</div>',
    '</div>',
    '<div class="profileActions">',
    '<button class="btn green" onclick="draftOpportunityReply()">AI Reply</button>',
    '<button class="btn" onclick="saveOpportunity()">Save</button>',
    '<button class="btn" onclick="createOpportunityDraft()">Gmail Draft</button>',
    '<button class="btn green" onclick="sendOpportunityReply()">Send Reply</button>',
    '<button class="btn" onclick="markOpportunityStage(\'Call Booked\')">Call Booked</button>',
    '</div>',
    '<label class="editBlock">',
    '<span class="label">Stage</span>',
    '<select id="opp-edit-stage" class="stageSelect">',
    serverOpportunityStages_().map(stage =>
      '<option value="' + htmlEsc_(stage) + '" ' + (row.stage === stage ? 'selected' : '') + '>' + htmlEsc_(stage) + '</option>'
    ).join(''),
    '</select>',
    '</label>',
    serverDetailCard_('Prospect Reply', row.lastReplyText || 'No reply text captured.'),
    serverEditableField_('Classification', 'oppClassification', row.classification || ''),
    serverEditableField_('AI Reply Draft - approve before sending', 'oppReplyDraft', row.aiReplyDraft || ''),
    serverEditableField_('Next Action', 'oppNextAction', row.nextAction || ''),
    serverEditableField_('Owner Notes', 'oppOwnerNotes', row.ownerNotes || '', 'call'),
    serverDetailCard_('Original Email', row.originalEmail || 'No original email captured.')
  ].join('');
}

function serverProfileEmpty_(title, subtitle, message) {
  return [
    '<div class="profileHead">',
    '<div class="avatar">A</div>',
    '<div>',
    '<h2>' + htmlEsc_(title) + '</h2>',
    '<p>' + htmlEsc_(subtitle) + '</p>',
    '</div>',
    '</div>',
    '<div class="detailCard">' + htmlEsc_(message) + '</div>'
  ].join('');
}

function serverStatusChip_(row) {
  const seq = String(row.sequenceStatus || '').toLowerCase();
  if (String(row.replyReceived || '').toLowerCase() === 'yes') return '<span class="status active">Replied</span>';
  if (String(row.stopSequence || '').toLowerCase() === 'yes') return '<span class="status stop">Stopped</span>';
  if (seq === 'active') return '<span class="status active">Active</span>';
  if (seq.indexOf('follow') >= 0) return '<span class="status follow">Follow-up</span>';
  return '<span class="status neutral">' + htmlEsc_(serverShorten_(row.sequenceStatus || row.draftStatus || 'Ready', 14)) + '</span>';
}

function serverSequenceCell_(row) {
  const step = Number(row.lastSentStep) || 0;
  const barClass = step >= 3 ? 'step3' : step >= 2 ? 'step2' : '';
  const label = step > 0 ? 'Sent ' + step + ' of 3' : 'Not sent';
  return [
    '<span>' + htmlEsc_(label) + '</span>',
    '<div class="progress"><div class="bar ' + barClass + '"></div></div>',
    '<div class="sequenceMini">' + [1, 2, 3].map(n => serverStepDot_(n, row)).join('') + '</div>'
  ].join('');
}

function serverStepDot_(step, row) {
  const last = Number(row.lastSentStep) || 0;
  const stopped = String(row.stopSequence || '').toLowerCase() === 'yes' || String(row.replyReceived || '').toLowerCase() === 'yes';
  const cls = step <= last ? 'sent' : (!stopped && step === last + 1 && row.nextSendAt ? 'next' : '');
  const title = step <= last ? 'Email ' + step + ' sent' : (cls === 'next' ? 'Email ' + step + ' next' : 'Email ' + step + ' waiting');
  return '<span class="stepDot ' + cls + '" title="' + htmlEsc_(title) + '">' + step + '</span>';
}

function serverSendTimeline_(row) {
  const last = Number(row.lastSentStep) || 0;
  const latestTime = row.lastSentAt || '';
  return '<div class="sendTimeline">' + [1, 2, 3].map(step => {
    const sent = step <= last;
    const next = !sent &&
      step === last + 1 &&
      row.nextSendAt &&
      String(row.stopSequence || '').toLowerCase() !== 'yes' &&
      String(row.replyReceived || '').toLowerCase() !== 'yes';
    const label = step === 1 ? 'Initial' : 'Follow-up ' + (step - 1);
    const chip = sent
      ? '<span class="status active">Sent</span>'
      : next
        ? '<span class="status next">Next</span>'
        : '<span class="status neutral">Waiting</span>';
    const detail = sent && step === last && latestTime
      ? 'Latest sent ' + htmlEsc_(latestTime)
      : next
        ? 'Due ' + htmlEsc_(row.nextSendAt)
        : 'Not sent yet';
    return '<div class="sendStep"><strong>Step ' + step + '</strong><span>' + htmlEsc_(label) + '<br><span class="muted">' + detail + '</span></span>' + chip + '</div>';
  }).join('') + '</div>';
}

function serverDetailCard_(label, value) {
  return '<div class="detailCard"><span class="label">' + htmlEsc_(label) + '</span><div>' + htmlEsc_(value) + '</div></div>';
}

function serverEditableField_(label, key, value, extraClass) {
  const classes = ['editBlock'];
  if (key === 'subject') classes.push('subject');
  if (extraClass) classes.push(extraClass);
  return [
    '<label class="' + classes.join(' ') + '">',
    '<span class="label">' + htmlEsc_(label) + '</span>',
    '<textarea id="edit-' + htmlEsc_(key) + '">' + htmlEsc_(value) + '</textarea>',
    '</label>'
  ].join('');
}

function serverOpportunityStages_() {
  return [
    'New Reply',
    'AI Reply Drafted',
    'Needs Review',
    'Reply Sent',
    'Call Booked',
    'Qualified',
    'Proposal Sent',
    'Won',
    'Lost / Not Now'
  ];
}

function serverOpportunityStageChip_(stage) {
  const value = stage || 'New Reply';
  const lower = String(value).toLowerCase();
  const cls = lower.indexOf('won') >= 0 || lower.indexOf('booked') >= 0 || lower.indexOf('qualified') >= 0
    ? 'active'
    : lower.indexOf('lost') >= 0
      ? 'stop'
      : lower.indexOf('review') >= 0 || lower.indexOf('drafted') >= 0
        ? 'next'
        : 'neutral';
  return '<span class="status ' + cls + '">' + htmlEsc_(serverShorten_(value, 16)) + '</span>';
}

function serverShorten_(value, max) {
  const text = clean_(value);
  return text.length > max ? text.slice(0, max - 1) + '...' : text;
}

function webAppLink_(webAppUrl, view, params, cacheBuster) {
  const query = ['view=' + encodeURIComponent(view)];
  Object.keys(params || {}).forEach(key => {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') {
      query.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
  });
  if (cacheBuster) query.push('v=' + encodeURIComponent(cacheBuster));
  return (webAppUrl || '') + '?' + query.join('&');
}

function jsString_(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\\\'')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function getInitialVisibleCount_(view, data) {
  if (view === 'pipeline') return (data.rows || []).length;
  if (view === 'sales') return (data.leads || []).length;
  if (view === 'marketplace') return (data.items || []).length;
  if (view === 'industry') return (data.items || []).length;
  if (view === 'content') return (data.items || []).length;
  if (view === 'database') return (data.rows || []).filter(row => row.hasData).length;
  if (view === 'enquiries') return (data.enquiries || []).length;
  if (view === 'opportunities') return (data.opportunities || []).length;
  if (view === 'stock') return (data.items || []).length;
  if (view === 'calendar') return (data.events || []).length;
  return 0;
}

function htmlEsc_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function initials_(value) {
  const clean = String(value || 'A').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function summariseDiagnosticCall_(fn) {
  try {
    return fn();
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
  }
}

function getInitialWebView_(event) {
  const allowed = ['pipeline', 'sales', 'marketplace', 'industry', 'content', 'enquiries', 'database', 'opportunities', 'calendar', 'stock'];
  const view = clean_((event && event.parameter && event.parameter.view) || 'pipeline');
  return allowed.indexOf(view) >= 0 ? view : 'pipeline';
}

function getInitialWebStateJson_(view) {
  try {
    let data;
    if (view === 'sales') data = safeInitialWebState_(() => webAppGetSalesDeskState(), { leads: [], stockItems: [], stats: {} });
    else if (view === 'marketplace') data = safeInitialWebState_(() => webAppGetMarketplaceState(), { items: [], stockItems: [], stats: {} });
    else if (view === 'industry') data = safeInitialWebState_(() => webAppGetIndustryRadarState(), { items: [], sources: [], stats: {} });
    else if (view === 'content') data = safeInitialWebState_(() => webAppGetContentScheduleState(), { items: [], radarItems: [], stats: {} });
    else if (view === 'stock') data = safeInitialWebState_(() => webAppGetStockState(), { items: [], stats: {} });
    else if (view === 'database') data = safeInitialWebState_(() => webAppGetDatabaseState(), { rows: [], tabs: [], stats: {} });
    else if (view === 'enquiries') data = safeInitialWebState_(() => webAppGetEnquiriesState(), { enquiries: [], stats: {} });
    else if (view === 'opportunities') data = safeInitialWebState_(() => webAppGetOpportunitiesState(), { opportunities: [], stats: {} });
    else if (view === 'calendar') data = safeInitialWebState_(() => webAppGetCalendarState(), { events: [], stats: {} });
    else data = safeInitialWebState_(() => webAppGetState(), { rows: [], stats: {} });

    return safeJsonForHtml_({
      ok: true,
      view,
      data
    });
  } catch (error) {
    return safeJsonForHtml_({
      ok: false,
      view,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function safeInitialWebState_(fn, fallback) {
  try {
    return fn();
  } catch (error) {
    const data = Object.assign({}, fallback);
    data.error = error && error.message ? error.message : String(error);
    data.updatedAt = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd MMM yyyy HH:mm'
    );
    return data;
  }
}

function safeJsonForHtml_(value) {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function webAppGetState() {
  return cachedWebAppState_('pipeline', buildWebAppState_);
}

const WEB_APP_STATE_CACHE_SECONDS = 45;
const WEB_APP_STATE_CACHE_PREFIX = 'aegis_web_state_v8_';

function cachedWebAppState_(view, builder) {
  const cache = CacheService.getScriptCache();
  const key = WEB_APP_STATE_CACHE_PREFIX + view;

  try {
    const cached = cache.get(key);
    if (cached) return JSON.parse(cached);
  } catch (error) {}

  const data = builder();

  try {
    const json = JSON.stringify(data);
    if (json.length < 95000 && !(data && data.error)) {
      cache.put(key, json, WEB_APP_STATE_CACHE_SECONDS);
    }
  } catch (error) {}

  return data;
}

function clearWebAppStateCache_(views) {
  const allViews = ['pipeline', 'sales', 'marketplace', 'industry', 'content', 'database', 'enquiries', 'opportunities', 'calendar', 'stock'];
  const expanded = {};

  (views && views.length ? views : allViews).forEach(view => {
    expanded[view] = true;
    if (['pipeline', 'stock', 'enquiries', 'opportunities'].indexOf(view) >= 0) {
      expanded.sales = true;
    }
    if (view === 'stock' || view === 'enquiries') expanded.marketplace = true;
    if (view === 'content') expanded.industry = true;
  });

  const keys = Object.keys(expanded).map(view => WEB_APP_STATE_CACHE_PREFIX + view);
  const cache = CacheService.getScriptCache();

  try {
    cache.removeAll(keys);
  } catch (error) {
    keys.forEach(key => {
      try {
        cache.remove(key);
      } catch (err) {}
    });
  }
}

function buildWebAppState_() {
  const sheet = getCampaignSheet_();
  ensureCampaignHeaders_(sheet);

  const lastRow = sheet.getLastRow();
  const rows = [];

  if (lastRow >= CONFIG.FIRST_LEAD_ROW) {
    const values = sheet
      .getRange(
        CONFIG.FIRST_LEAD_ROW,
        1,
        lastRow - CONFIG.FIRST_LEAD_ROW + 1,
        CONFIG.COL_SEND_ERROR
      )
      .getValues();

    values.forEach((r, i) => {
      const company = clean_(r[CONFIG.COL_COMPANY - 1]);
      if (!company) return;

      rows.push({
        rowNumber: CONFIG.FIRST_LEAD_ROW + i,
        sourceRow: clean_(r[CONFIG.COL_ROW_ID - 1]),
        company,
        contact: clean_(r[CONFIG.COL_CONTACT - 1]),
        email: clean_(r[CONFIG.COL_EMAIL - 1]),
        note: clean_(r[CONFIG.COL_NOTE - 1]),
        segment: clean_(r[CONFIG.COL_SEGMENT - 1]),
        action: clean_(r[CONFIG.COL_ACTION - 1]),
        subject: clean_(r[CONFIG.COL_SUBJECT - 1]),
        initialEmail: clean_(r[CONFIG.COL_INITIAL_EMAIL - 1]),
        followUp1: clean_(r[CONFIG.COL_FOLLOWUP_1 - 1]),
        followUp2: clean_(r[CONFIG.COL_FOLLOWUP_2 - 1]),
        callScript: clean_(r[CONFIG.COL_CALL_SCRIPT - 1]),
        draftStatus: clean_(r[CONFIG.COL_STATUS - 1]),
        sequenceStatus: clean_(r[CONFIG.COL_SEQUENCE_STATUS - 1]),
        nextSendAt: formatWebDate_(r[CONFIG.COL_NEXT_SEND_AT - 1]),
        lastSentStep: Number(r[CONFIG.COL_LAST_SENT_STEP - 1]) || 0,
        lastSentAt: formatWebDate_(r[CONFIG.COL_LAST_SENT_AT - 1]),
        gmailThreadId: clean_(r[CONFIG.COL_GMAIL_THREAD_ID - 1]),
        replyReceived: clean_(r[CONFIG.COL_REPLY_RECEIVED - 1]),
        stopSequence: clean_(r[CONFIG.COL_STOP_SEQUENCE - 1]),
        lastReplyAt: formatWebDate_(r[CONFIG.COL_LAST_REPLY_AT - 1]),
        sendError: clean_(r[CONFIG.COL_SEND_ERROR - 1])
      });
    });
  }

  return {
    stats: buildWebStats_(rows),
    rows,
    updatedAt: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd MMM yyyy HH:mm'
    )
  };
}

function buildWebStats_(rows) {
  const total = rows.length;
  const drafted = rows.filter(r => r.subject && r.initialEmail).length;
  const active = rows.filter(r => String(r.sequenceStatus).toLowerCase() === 'active').length;
  const replies = rows.filter(r => String(r.replyReceived).toLowerCase() === 'yes').length;
  const stopped = rows.filter(r => String(r.stopSequence).toLowerCase() === 'yes').length;
  const sent = rows.filter(r => Number(r.lastSentStep) > 0).length;
  const dueNow = rows.filter(r => {
    if (!r.nextSendAt) return false;
    if (String(r.stopSequence).toLowerCase() === 'yes') return false;
    if (String(r.replyReceived).toLowerCase() === 'yes') return false;
    return new Date(r.nextSendAt).getTime() <= new Date().getTime();
  }).length;

  return {
    total,
    drafted,
    active,
    replies,
    stopped,
    sent,
    dueNow,
    replyRate: sent ? Math.round((replies / sent) * 100) : 0
  };
}

function webAppGetEnquiriesState() {
  return cachedWebAppState_('enquiries', buildWebAppEnquiriesState_);
}

function buildWebAppEnquiriesState_() {
  const sheet = getEnquirySheet_();
  const lastRow = sheet.getLastRow();
  const enquiries = [];

  if (lastRow >= ENQUIRY_CONFIG.FIRST_ROW) {
    const values = sheet
      .getRange(
        ENQUIRY_CONFIG.FIRST_ROW,
        1,
        lastRow - ENQUIRY_CONFIG.FIRST_ROW + 1,
        ENQUIRY_CONFIG.COL_ERROR
      )
      .getValues();

    values.forEach((r, i) => {
      const item = buildWebEnquiry_(r, ENQUIRY_CONFIG.FIRST_ROW + i);
      if (item.id || item.customer || item.company || item.phone || item.email || item.enquiryText) {
        enquiries.push(item);
      }
    });
  }

  return {
    enquiries,
    stats: buildEnquiryStats_(enquiries),
    updatedAt: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd MMM yyyy HH:mm'
    )
  };
}

function webAppGetStockState() {
  return cachedWebAppState_('stock', buildWebAppStockState_);
}

function buildWebAppStockState_() {
  const sheet = getStockSheet_();
  const lastRow = sheet.getLastRow();
  const items = [];

  if (lastRow >= STOCK_CONFIG.FIRST_ROW) {
    const values = sheet
      .getRange(
        STOCK_CONFIG.FIRST_ROW,
        1,
        lastRow - STOCK_CONFIG.FIRST_ROW + 1,
        STOCK_CONFIG.HEADERS.length
      )
      .getValues();

    values.forEach((r, i) => {
      const item = buildWebStockItem_(r, STOCK_CONFIG.FIRST_ROW + i);
      if (item.id || item.brand || item.model || item.description) {
        items.push(item);
      }
    });
  }

  items.sort((a, b) => {
    const aSort = Number(a.sortOrder) || 9999;
    const bSort = Number(b.sortOrder) || 9999;
    if (aSort !== bSort) return aSort - bSort;
    return `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
  });

  return {
    items,
    stats: buildStockStats_(items),
    updatedAt: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd MMM yyyy HH:mm'
    )
  };
}

function webAppGetSalesDeskState() {
  return cachedWebAppState_('sales', buildWebAppSalesDeskState_);
}

function buildWebAppSalesDeskState_() {
  const enquiries = webAppGetEnquiriesState();
  const opportunities = webAppGetOpportunitiesState();
  const stock = webAppGetStockState();
  const stockItems = stock.items || [];
  const leads = buildSalesDeskLeads_(
    enquiries.enquiries || [],
    opportunities.opportunities || [],
    stockItems
  );

  return {
    leads,
    stockItems,
    stats: buildSalesDeskStats_(leads, stockItems),
    updatedAt: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd MMM yyyy HH:mm'
    )
  };
}

function buildSalesDeskLeads_(enquiries, opportunities, stockItems) {
  const leads = [];

  enquiries.forEach(enquiry => {
    const truck = matchLeadTruck_(enquiry, stockItems);
    const lead = {
      id: 'enquiry:' + clean_(enquiry.id || enquiry.rowNumber),
      sourceId: clean_(enquiry.id),
      sourceRow: enquiry.rowNumber || '',
      type: 'enquiry',
      typeLabel: 'Enquiry',
      source: clean_(enquiry.source) || 'Manual',
      stage: clean_(enquiry.stage) || 'New Enquiry',
      customer: clean_(enquiry.customer),
      company: clean_(enquiry.company),
      contact: clean_(enquiry.customer || enquiry.company),
      phone: clean_(enquiry.phone),
      email: clean_(enquiry.email),
      location: clean_(enquiry.location),
      interestedTruck: clean_(enquiry.interestedTruck),
      budget: clean_(enquiry.budget),
      enquiryText: clean_(enquiry.enquiryText),
      lastReplyText: '',
      aiReplyDraft: '',
      nextAction: clean_(enquiry.nextAction),
      ownerNotes: clean_(enquiry.ownerNotes),
      priority: clean_(enquiry.priority),
      updatedAt: clean_(enquiry.updatedAt || enquiry.createdAt),
      truckId: truck ? truck.id : '',
      truckLabel: truck ? [truck.brand, truck.model].filter(Boolean).join(' ') : ''
    };
    lead.score = salesLeadScore_(lead);
    leads.push(lead);
  });

  opportunities.forEach(opportunity => {
    const truck = matchLeadTruck_(opportunity, stockItems);
    const lead = {
      id: 'opportunity:' + clean_(opportunity.id || opportunity.campaignRow),
      sourceId: clean_(opportunity.id),
      sourceRow: opportunity.campaignRow || opportunity.sourceRow || '',
      type: 'opportunity',
      typeLabel: 'Reply',
      source: 'Campaign Reply',
      stage: clean_(opportunity.stage) || 'New Reply',
      customer: clean_(opportunity.contact),
      company: clean_(opportunity.company),
      contact: clean_(opportunity.contact || opportunity.company),
      phone: '',
      email: clean_(opportunity.email),
      location: '',
      interestedTruck: '',
      budget: '',
      enquiryText: clean_(opportunity.lastReplyText),
      lastReplyText: clean_(opportunity.lastReplyText),
      aiReplyDraft: clean_(opportunity.aiReplyDraft),
      nextAction: clean_(opportunity.nextAction),
      ownerNotes: clean_(opportunity.ownerNotes),
      priority: '',
      updatedAt: clean_(opportunity.updatedAt || opportunity.lastReplyAt || opportunity.createdAt),
      campaignSubject: clean_(opportunity.campaignSubject),
      originalEmail: clean_(opportunity.originalEmail),
      truckId: truck ? truck.id : '',
      truckLabel: truck ? [truck.brand, truck.model].filter(Boolean).join(' ') : ''
    };
    lead.score = salesLeadScore_(lead);
    leads.push(lead);
  });

  leads.sort((a, b) => {
    if (Number(b.score) !== Number(a.score)) return Number(b.score) - Number(a.score);
    return clean_(b.updatedAt).localeCompare(clean_(a.updatedAt));
  });

  return leads;
}

function matchLeadTruck_(lead, stockItems) {
  const leadText = normaliseSalesText_([
    lead.interestedTruck,
    lead.enquiryText,
    lead.lastReplyText,
    lead.aiReplyDraft,
    lead.nextAction,
    lead.ownerNotes,
    lead.campaignSubject,
    lead.originalEmail
  ].join(' '));

  if (!leadText) return null;

  for (let i = 0; i < stockItems.length; i++) {
    const item = stockItems[i];
    const candidates = [
      item.id,
      [item.brand, item.model].filter(Boolean).join(' '),
      item.model,
      [item.brand, item.type].filter(Boolean).join(' ')
    ].map(normaliseSalesText_).filter(value => value.length >= 3);

    if (candidates.some(candidate => leadText.indexOf(candidate) >= 0)) {
      return item;
    }
  }

  return null;
}

function salesLeadScore_(lead) {
  const stage = normaliseSalesText_(lead.stage);
  const priority = normaliseSalesText_(lead.priority);
  let score = 0;

  if (stage.indexOf('needs reply') >= 0 || stage.indexOf('new reply') >= 0) score += 85;
  else if (stage.indexOf('new enquiry') >= 0) score += 75;
  else if (stage.indexOf('viewing') >= 0 || stage.indexOf('quote') >= 0 || stage.indexOf('proposal') >= 0) score += 65;
  else if (stage.indexOf('qualified') >= 0 || stage.indexOf('call booked') >= 0) score += 50;
  else score += 25;

  if (lead.type === 'opportunity') score += 20;
  if (priority.indexOf('high') >= 0 || priority.indexOf('urgent') >= 0) score += 20;
  if (lead.phone) score += 12;
  if (lead.email) score += 8;
  if (lead.truckId) score += 8;
  if (lead.aiReplyDraft) score += 6;

  return score;
}

function buildSalesDeskStats_(leads, stockItems) {
  return {
    leads: leads.length,
    hotLeads: leads.filter(lead => Number(lead.score) >= 85).length,
    needsReply: leads.filter(lead => {
      const stage = normaliseSalesText_(lead.stage);
      return stage.indexOf('needs reply') >= 0 || stage.indexOf('new reply') >= 0 || stage.indexOf('new enquiry') >= 0;
    }).length,
    viewingOrQuote: leads.filter(lead => {
      const stage = normaliseSalesText_(lead.stage);
      return stage.indexOf('viewing') >= 0 || stage.indexOf('quote') >= 0 || stage.indexOf('proposal') >= 0;
    }).length,
    stockReady: stockItems.filter(item => {
      const status = normaliseSalesText_(item.status);
      return status === 'in stock';
    }).length,
    palletTrucks: stockItems.filter(item => normaliseSalesText_(item.category).indexOf('pallet') >= 0).length
  };
}

function normaliseSalesText_(value) {
  return clean_(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function webAppGetMarketplaceState() {
  return cachedWebAppState_('marketplace', buildWebAppMarketplaceState_);
}

function buildWebAppMarketplaceState_() {
  const stock = webAppGetStockState();
  const enquiries = webAppGetEnquiriesState();
  const stockItems = stock.items || [];
  const enquiryCounts = buildMarketplaceEnquiryCounts_(enquiries.enquiries || [], stockItems);
  const stockById = {};
  stockItems.forEach(item => {
    if (item.id) stockById[item.id] = item;
  });

  const sheet = getMarketplaceSheet_();
  const lastRow = sheet.getLastRow();
  const existingByTruckId = {};
  let items = [];

  if (lastRow >= MARKETPLACE_CONFIG.FIRST_ROW) {
    const values = sheet
      .getRange(
        MARKETPLACE_CONFIG.FIRST_ROW,
        1,
        lastRow - MARKETPLACE_CONFIG.FIRST_ROW + 1,
        MARKETPLACE_CONFIG.HEADERS.length
      )
      .getValues();

    values.forEach((r, i) => {
      const item = buildWebMarketplaceItem_(r, MARKETPLACE_CONFIG.FIRST_ROW + i, stockById, enquiryCounts);
      if (!item.truckId) return;
      existingByTruckId[item.truckId] = item;
      items.push(item);
    });
  }

  seedMarketplaceRowsForStock_(sheet, stockItems, existingByTruckId);

  if (stockItems.some(item => item.id && !existingByTruckId[item.id])) {
    return buildWebAppMarketplaceState_();
  }

  items = items.filter(item => !stockItems.length || stockById[item.truckId]);
  items.sort((a, b) => `${a.truckTitle}`.localeCompare(`${b.truckTitle}`));

  return {
    items,
    stockItems,
    stats: buildMarketplaceStats_(items),
    updatedAt: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd MMM yyyy HH:mm'
    )
  };
}

function buildMarketplaceEnquiryCounts_(enquiries, stockItems) {
  const counts = {};

  (stockItems || []).forEach(stock => {
    const id = clean_(stock.id);
    if (id) counts[id] = buildEmptyMarketplaceEnquiryCount_();
  });

  (enquiries || []).forEach(enquiry => {
    const truck = matchLeadTruck_(enquiry, stockItems || []);
    if (!truck || !truck.id) return;

    const id = clean_(truck.id);
    const key = marketplaceSourceKey_(enquiry.source);
    if (!counts[id]) counts[id] = buildEmptyMarketplaceEnquiryCount_();

    counts[id].total += 1;
    counts[id][key] = (counts[id][key] || 0) + 1;

    const stamp = clean_(enquiry.updatedAt || enquiry.createdAt);
    if (stamp && (!counts[id].lastAt || stamp > counts[id].lastAt)) {
      counts[id].lastAt = stamp;
    }
  });

  return counts;
}

function buildEmptyMarketplaceEnquiryCount_() {
  return {
    total: 0,
    website: 0,
    ebay: 0,
    facebook: 0,
    linkedin: 0,
    googleBusiness: 0,
    gumtree: 0,
    whatsapp: 0,
    other: 0,
    lastAt: ''
  };
}

function marketplaceSourceKey_(source) {
  const text = normaliseSalesText_(source);
  if (text.indexOf('ebay') >= 0) return 'ebay';
  if (text.indexOf('facebook') >= 0 || text.indexOf('marketplace') >= 0) return 'facebook';
  if (text.indexOf('linkedin') >= 0 || text.indexOf('linked in') >= 0) return 'linkedin';
  if (text.indexOf('google business') >= 0 || text.indexOf('googlebusiness') >= 0 || text.indexOf('google profile') >= 0 || text.indexOf('gbp') >= 0) return 'googleBusiness';
  if (text.indexOf('gumtree') >= 0) return 'gumtree';
  if (text.indexOf('whatsapp') >= 0) return 'whatsapp';
  if (text.indexOf('website') >= 0 || text === 'web' || text.indexOf('web ') >= 0) return 'website';
  return 'other';
}

function marketplaceSourceLabel_(source) {
  const key = marketplaceSourceKey_(source);
  const labels = {
    website: 'Website Listing',
    ebay: 'eBay Listing',
    facebook: 'Facebook Marketplace',
    linkedin: 'LinkedIn',
    googleBusiness: 'Google Business Profile',
    gumtree: 'Gumtree',
    whatsapp: 'WhatsApp',
    other: clean_(source) || 'Marketplace'
  };

  return labels[key] || labels.other;
}

function webAppSaveMarketplaceItem(item) {
  const sheet = getMarketplaceSheet_();
  const incoming = item || {};
  const truckId = clean_(incoming.truckId);

  if (!truckId) {
    throw new Error('Choose a truck before saving marketplace status.');
  }

  const stockState = webAppGetStockState();
  const stockIds = (stockState.items || []).map(stock => stock.id);
  if (stockIds.length && stockIds.indexOf(truckId) === -1) {
    throw new Error('That truck was not found in Forklift Stock.');
  }

  const rowData = findMarketplaceRow_(sheet, truckId);
  const row = marketplaceItemToRow_(incoming, rowData.item);
  const targetRow = rowData.rowNumber || Math.max(sheet.getLastRow() + 1, MARKETPLACE_CONFIG.FIRST_ROW);

  sheet.getRange(targetRow, 1, 1, MARKETPLACE_CONFIG.HEADERS.length).setValues([row]);
  sheet.getRange(targetRow, 1, 1, MARKETPLACE_CONFIG.HEADERS.length).setVerticalAlignment('top').setWrap(true);
  SpreadsheetApp.flush();
  clearWebAppStateCache_(['marketplace']);

  return {
    ok: true,
    truckId,
    rowNumber: targetRow
  };
}

function webAppCreateMarketplaceEnquiry(payload) {
  const values = payload || {};
  const truckId = clean_(values.truckId);
  const stockItems = (webAppGetStockState().items || []);
  const stock = stockItems.find(item => item.id === truckId);

  if (!stock) {
    throw new Error('Choose a valid truck before adding an enquiry.');
  }

  const title = [stock.brand, stock.model].filter(Boolean).join(' ') || truckId;
  const source = marketplaceSourceLabel_(values.source || values.platform);
  const enquiryText = clean_(values.enquiryText) || `Marketplace enquiry for ${title}`;
  const result = webAppCreateEnquiry({
    customer: clean_(values.customer),
    company: clean_(values.company),
    phone: clean_(values.phone),
    email: clean_(values.email),
    source,
    stage: clean_(values.stage) || 'Needs Reply',
    interestedTruck: `${title} (${truckId})`,
    budget: clean_(values.budget),
    location: clean_(values.location),
    enquiryText,
    nextAction: clean_(values.nextAction) || 'Reply, qualify the requirement, and quote delivery if needed',
    ownerNotes: clean_(values.ownerNotes),
    priority: clean_(values.priority) || 'High'
  });

  SpreadsheetApp.flush();
  clearWebAppStateCache_(['enquiries', 'marketplace', 'sales']);

  return Object.assign({
    ok: true,
    truckId,
    source
  }, result || {});
}

function webAppMarkMarketplaceRefreshed(truckId) {
  const data = findMarketplaceRow_(getMarketplaceSheet_(), clean_(truckId));
  if (!data.rowNumber) {
    throw new Error('Marketplace row not found.');
  }

  const sheet = getMarketplaceSheet_();
  sheet.getRange(data.rowNumber, MARKETPLACE_CONFIG.COL_LAST_REFRESHED).setValue(new Date());
  sheet.getRange(data.rowNumber, MARKETPLACE_CONFIG.COL_UPDATED_AT).setValue(new Date());
  SpreadsheetApp.flush();
  clearWebAppStateCache_(['marketplace']);

  return {
    ok: true,
    truckId: clean_(truckId)
  };
}

function findMarketplaceRow_(sheet, truckId) {
  const id = clean_(truckId);
  const lastRow = sheet.getLastRow();

  if (!id || lastRow < MARKETPLACE_CONFIG.FIRST_ROW) {
    return { rowNumber: 0, item: null };
  }

  const values = sheet
    .getRange(
      MARKETPLACE_CONFIG.FIRST_ROW,
      1,
      lastRow - MARKETPLACE_CONFIG.FIRST_ROW + 1,
      MARKETPLACE_CONFIG.HEADERS.length
    )
    .getValues();

  for (let i = 0; i < values.length; i++) {
    if (clean_(values[i][MARKETPLACE_CONFIG.COL_TRUCK_ID - 1]) === id) {
      return {
        rowNumber: MARKETPLACE_CONFIG.FIRST_ROW + i,
        item: buildWebMarketplaceItem_(values[i], MARKETPLACE_CONFIG.FIRST_ROW + i, {})
      };
    }
  }

  return { rowNumber: 0, item: null };
}

function webAppUploadStockPhoto(payload) {
  const data = payload || {};
  const base64 = clean_(data.base64);
  const mimeType = clean_(data.mimeType) || 'application/octet-stream';
  const truckId = stockSlug_(data.truckId || data.id || data.brand || data.model || 'truck');
  const slot = stockSlug_(data.slot || 'main') || 'main';
  const originalName = clean_(data.fileName) || `${slot}.jpg`;

  if (!base64) {
    throw new Error('No photo data was received.');
  }

  const extension = getFileExtension_(originalName, mimeType);
  const fileName = `${truckId}-${slot}-${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss')}.${extension}`;
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  let file;

  try {
    const folder = getStockUploadFolder_();
    file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {
    throwDriveAuthorisationError_(error);
  }

  const mediaSheet = getForkliftMediaSheet_();
  mediaSheet.appendRow([
    new Date(),
    truckId,
    slot,
    fileName,
    file.getId(),
    buildPublicDriveImageUrl_(file.getId()),
    file.getUrl()
  ]);

  clearWebAppStateCache_(['stock']);

  return {
    ok: true,
    fileId: file.getId(),
    fileName,
    url: buildPublicDriveImageUrl_(file.getId()),
    driveUrl: file.getUrl()
  };
}

function webAppUploadImage(payload) {
  return webAppUploadStockPhoto(payload);
}

function authoriseDriveUpload_() {
  const folder = getStockUploadFolder_();
  return {
    ok: true,
    folderName: folder.getName(),
    folderId: folder.getId()
  };
}

function authoriseDriveUpload() {
  return authoriseDriveUpload_();
}

function throwDriveAuthorisationError_(error) {
  const message = error && error.message ? error.message : String(error);

  if (message.indexOf('https://www.googleapis.com/auth/drive') >= 0 || message.indexOf('DriveApp') >= 0) {
    throw new Error(
      'Photo upload needs one-time Google Drive authorisation by Aaron. Open the Apps Script project, run authoriseDriveUpload_, approve Drive access, then retry the upload.'
    );
  }

  throw error;
}

function webAppDeleteTestStockUpload(fileId) {
  const id = clean_(fileId);

  if (!id) {
    throw new Error('No file ID supplied for cleanup.');
  }

  const file = DriveApp.getFileById(id);
  const fileName = clean_(file.getName());

  if (fileName.indexOf('aegis-photo-permission-test') !== 0) {
    throw new Error('Cleanup only deletes AEGIS upload test files.');
  }

  file.setTrashed(true);

  const sheet = getForkliftMediaSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (clean_(values[i][4]) === id) {
        sheet.deleteRow(i + 2);
      }
    }
  }

  clearWebAppStateCache_(['stock']);

  return {
    ok: true,
    fileId: id
  };
}

function getStockUploadFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('AEGIS_STOCK_UPLOAD_FOLDER_ID');
  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId);
    } catch (error) {
      props.deleteProperty('AEGIS_STOCK_UPLOAD_FOLDER_ID');
    }
  }

  const folder = DriveApp.createFolder('AEGIS Forklift Stock Uploads');
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty('AEGIS_STOCK_UPLOAD_FOLDER_ID', folder.getId());
  return folder;
}

function getForkliftMediaSheet_() {
  const ss = getAegisWorkbook_();
  let sheet = ss.getSheetByName('Forklift Media');
  if (!sheet) sheet = ss.insertSheet('Forklift Media');

  const headers = ['Uploaded At', 'Truck ID', 'Slot', 'File Name', 'Drive File ID', 'Public Image URL', 'Drive URL'];
  const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0].map(clean_);
  if (existing.join('|') !== headers.join('|')) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function getFileExtension_(fileName, mimeType) {
  const fromName = clean_(fileName).split('.').pop().toLowerCase();
  if (/^(png|jpe?g|webp|gif)$/i.test(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'jpg';
}

function buildPublicDriveImageUrl_(fileId) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`;
}

function webAppSaveStockItem(item) {
  const sheet = getStockSheet_();
  const lastRow = sheet.getLastRow();
  const incoming = normaliseStockItemInput_(item || {});
  const id = clean_(incoming.id);
  let targetRow = 0;
  let existing = null;

  if (lastRow >= STOCK_CONFIG.FIRST_ROW) {
    const values = sheet
      .getRange(
        STOCK_CONFIG.FIRST_ROW,
        1,
        lastRow - STOCK_CONFIG.FIRST_ROW + 1,
        STOCK_CONFIG.HEADERS.length
      )
      .getValues();

    values.some((r, i) => {
      const rowItem = buildWebStockItem_(r, STOCK_CONFIG.FIRST_ROW + i);
      if (id && rowItem.id === id) {
        targetRow = STOCK_CONFIG.FIRST_ROW + i;
        existing = rowItem;
        return true;
      }
      return false;
    });
  }

  if (!clean_(incoming.brand) && !clean_(incoming.model)) {
    throw new Error('Add at least a brand or model before saving stock.');
  }

  const row = stockItemToRow_(incoming, existing);

  if (incoming.validateOnly === true || String(incoming.mode || '').toLowerCase() === 'validate') {
    return {
      ok: true,
      validateOnly: true,
      id: row[STOCK_CONFIG.COL_ID - 1],
      brand: incoming.brand,
      model: incoming.model
    };
  }

  targetRow = targetRow || Math.max(sheet.getLastRow() + 1, STOCK_CONFIG.FIRST_ROW);
  sheet.getRange(targetRow, 1, 1, STOCK_CONFIG.HEADERS.length).setValues([row]);
  SpreadsheetApp.flush();
  clearWebAppStateCache_(['stock']);

  return {
    ok: true,
    rowNumber: targetRow,
    id: row[STOCK_CONFIG.COL_ID - 1]
  };
}

function webAppUpdateStockItem(stockId, updates) {
  const sheet = getStockSheet_();
  const incoming = normaliseStockItemInput_(updates || {});
  const found = findStockItem_(stockId || incoming.id);

  if (!found.rowNumber) {
    throw new Error('Stock item not found.');
  }

  const nextItem = Object.assign({}, found.item, incoming);

  if (!clean_(nextItem.id)) {
    nextItem.id = found.item.id;
  }

  if (!clean_(nextItem.brand) && !clean_(nextItem.model)) {
    throw new Error('Stock item must have at least a brand or model.');
  }

  const row = stockItemToRow_(nextItem, found.item);
  sheet.getRange(found.rowNumber, 1, 1, STOCK_CONFIG.HEADERS.length).setValues([row]);
  SpreadsheetApp.flush();
  clearWebAppStateCache_(['stock', 'marketplace', 'sales']);

  return {
    ok: true,
    rowNumber: found.rowNumber,
    oldId: found.item.id,
    id: row[STOCK_CONFIG.COL_ID - 1]
  };
}

function getStockPayload_(payload) {
  const values = payload || {};
  return values.item || values.stock || values.listing || values.truck || values.vehicle || values.equipment || values;
}

function normaliseStockItemInput_(payload) {
  const source = getStockPayload_(payload || {});
  const title = clean_(source.title || source.name || source.truckTitle || source.listingTitle);
  const parsedTitle = parseStockTitle_(title);
  const imageList = source.galleryImages || source.images || source.gallery || source.imageUrls || source.photos;

  return Object.assign({}, source, {
    id: clean_(source.id || source.stockId || source.truckId || source.sku),
    category: clean_(source.category || source.stockCategory || source.kind) || inferStockCategory_(source),
    status: clean_(source.status || source.stockStatus || source.availability) || 'in-stock',
    featured: clean_(source.featured || source.isFeatured),
    brand: clean_(source.brand || source.make || source.manufacturer || parsedTitle.brand),
    model: clean_(source.model || source.modelName || parsedTitle.model || title),
    type: clean_(source.type || source.machineType || source.equipmentType || source.productType),
    power: clean_(source.power || source.drive || source.energy),
    capacity: clean_(source.capacity || source.loadCapacity || source.liftCapacity),
    liftHeight: clean_(source.liftHeight || source.lift || source.maxLiftHeight),
    year: clean_(source.year || source.manufactureYear),
    hours: clean_(source.hours || source.operatingHours),
    mast: clean_(source.mast || source.mastType),
    tyres: clean_(source.tyres || source.tires),
    battery: clean_(source.battery || source.batterySpec),
    fuel: clean_(source.fuel || source.fuelType),
    price: clean_(source.price || source.askingPrice || source.salePrice),
    vat: clean_(source.vat || source.vatStatus),
    description: clean_(source.description || source.listingDescription || source.details),
    bullets: normaliseStockListField_(source.bullets || source.features || source.keyFeatures),
    imageMain: clean_(source.imageMain || source.mainImage || source.image || source.photo || (Array.isArray(imageList) ? imageList[0] : '')),
    galleryImages: normaliseStockListField_(imageList),
    sortOrder: clean_(source.sortOrder || source.order),
    validateOnly: source.validateOnly === true,
    mode: clean_(source.mode)
  });
}

function parseStockTitle_(title) {
  const value = clean_(title);
  if (!value) return { brand: '', model: '' };

  const parts = value.split(/\s+/);
  if (parts.length < 2) return { brand: '', model: value };

  return {
    brand: parts[0],
    model: parts.slice(1).join(' ')
  };
}

function inferStockCategory_(source) {
  const text = [
    source.category,
    source.type,
    source.machineType,
    source.equipmentType,
    source.productType,
    source.title,
    source.name,
    source.description
  ].map(clean_).join(' ').toLowerCase();

  if (text.indexOf('construction') >= 0 || text.indexOf('excavator') >= 0 || text.indexOf('digger') >= 0 || text.indexOf('dumper') >= 0) return 'construction';
  if (text.indexOf('agric') >= 0 || text.indexOf('tractor') >= 0 || text.indexOf('telehandler') >= 0) return 'agricultural';
  if (text.indexOf('commercial') >= 0 || text.indexOf('vehicle') >= 0 || text.indexOf('van') >= 0 || text.indexOf('tipper') >= 0) return 'commercial-vehicles';
  if (text.indexOf('plant') >= 0 || text.indexOf('equipment') >= 0 || text.indexOf('generator') >= 0 || text.indexOf('compressor') >= 0) return 'plant-equipment';
  if (text.indexOf('industrial') >= 0 || text.indexOf('warehouse') >= 0) return 'industrial';
  if (text.indexOf('pallet') >= 0) return 'pallet-truck';
  if (text.indexOf('forklift') >= 0) return 'forklift-truck';
  return '';
}

function webAppUpdateStockImages(stockId, images) {
  const found = findStockItem_(stockId || (images && images.id));

  if (!found.rowNumber) {
    throw new Error('Stock item not found.');
  }

  const payload = images || {};
  const gallery = normaliseStockImageArray_(payload.galleryImages || payload.gallery || payload.images || found.item.galleryImages);
  const main = normalisePublicDriveImageUrl_(clean_(payload.imageMain || payload.mainImage || payload.main || gallery[0] || found.item.imageMain));
  const normalisedGallery = gallery
    .map(normalisePublicDriveImageUrl_)
    .filter(Boolean);

  const updated = Object.assign({}, found.item, {
    imageMain: main,
    galleryImages: normalisedGallery.join('|')
  });

  return webAppUpdateStockItem(found.item.id, updated);
}

function webAppDeleteStockItem(stockId) {
  const found = findStockItem_(stockId);

  if (!found.rowNumber) {
    throw new Error('Stock item not found.');
  }

  const sheet = getStockSheet_();
  sheet.deleteRow(found.rowNumber);
  pauseMarketplaceForDeletedStock_(found.item.id);
  SpreadsheetApp.flush();
  clearWebAppStateCache_(['stock', 'marketplace', 'sales']);

  return {
    ok: true,
    id: found.item.id,
    deletedRow: found.rowNumber
  };
}

function webAppBuildMarketplaceListingPackage(truckId, platform) {
  const pack = buildMarketplaceListingPackage_(truckId, platform || 'all');
  return {
    ok: true,
    truckId: pack.truckId,
    platform: pack.platform,
    package: pack
  };
}

function buildMarketplaceListingPackage_(truckId, platform) {
  const stock = findStockItem_(truckId).item;

  if (!stock || !stock.id) {
    throw new Error('Choose a valid stock item before preparing marketplace listing copy.');
  }

  const target = marketplaceSourceKey_(platform || 'all');
  const title = buildMarketplaceListingTitle_(stock);
  const price = marketplacePriceText_(stock);
  const status = stockStatusLabel_(stock.status || 'in-stock');
  const specs = marketplaceStockBulletList_(stock);
  const bulletText = specs.map(line => `- ${line}`).join('\n');
  const description = clean_(stock.description) || `${title} available from AEGIS Industrial Systems.`;
  const images = buildMarketplaceImageList_(stock);
  const conditionDescription = [
    description,
    specs.length ? `Key spec: ${specs.join(' | ')}` : '',
    'Collection or UK delivery can be arranged. Send your postcode for a transport quote.'
  ].filter(Boolean).join('\n\n');

  const copy = {
    ebay: [
      title,
      '',
      'Condition: Used / checked before sale',
      `Availability: ${status}`,
      price ? `Price: ${price}` : '',
      '',
      description,
      '',
      bulletText,
      '',
      'Collection or delivery can be arranged. Message with your postcode for a transport quote.'
    ].filter(Boolean).join('\n'),
    facebook: [
      `${title} - ${status}`,
      price || '',
      bulletText,
      'Message AEGIS with your postcode for delivery pricing or to arrange a viewing.'
    ].filter(Boolean).join('\n\n'),
    linkedin: [
      `${title} now available from AEGIS Industrial Systems.`,
      description,
      specs.length ? specs.slice(0, 5).map(line => `- ${line}`).join('\n') : '',
      price ? `Guide price: ${price}` : '',
      'Message us with your postcode for delivery pricing or to arrange a viewing.',
      '#Forklifts #MaterialHandling #WarehouseOperations #AEGISIndustrialSystems'
    ].filter(Boolean).join('\n\n'),
    gumtree: [
      title,
      price ? `Price: ${price}` : '',
      '',
      description,
      '',
      bulletText,
      '',
      'Delivery can be quoted by postcode. Viewing by arrangement.'
    ].filter(Boolean).join('\n')
  };

  return {
    truckId: stock.id,
    platform: target,
    title,
    price,
    status,
    stock,
    specs,
    images,
    copy,
    manualLinks: {
      ebaySell: 'https://www.ebay.co.uk/sl/sell',
      facebookMarketplaceCreate: 'https://www.facebook.com/marketplace/create/item',
      metaCommerceManager: 'https://business.facebook.com/commerce_manager',
      linkedinPost: 'https://www.linkedin.com/feed/',
      gumtreePost: 'https://www.gumtree.com/post-ad'
    },
    ebay: {
      apiReady: isEbayApiConfigured_(),
      reason: isEbayApiConfigured_()
        ? 'eBay API credentials are configured. Use Publish eBay Live after checking the listing package.'
        : 'eBay OAuth and seller business policy IDs are not configured in Apps Script properties yet.',
      requiredProperties: [
        'EBAY_CLIENT_ID',
        'EBAY_CLIENT_SECRET',
        'EBAY_REFRESH_TOKEN',
        'EBAY_MERCHANT_LOCATION_KEY',
        'EBAY_PAYMENT_POLICY_ID',
        'EBAY_FULFILLMENT_POLICY_ID',
        'EBAY_RETURN_POLICY_ID',
        'EBAY_CATEGORY_ID'
      ],
      inventoryItem: buildEbayInventoryItemDraft_(stock, title, conditionDescription, images),
      offerDraft: buildEbayOfferDraft_(stock, title)
    },
    facebook: {
      directMarketplaceApiReady: false,
      reason: 'Facebook Marketplace does not expose the same public seller listing API path as eBay. Use the prepared copy for Marketplace, or use the feed row for Meta Commerce catalog/Shop workflows.',
      marketplaceDraft: {
        title,
        price: numericMarketplacePrice_(stock.price),
        description: copy.facebook,
        category: stock.category || 'forklift-truck',
        images
      },
      commerceCatalogRow: buildMetaCatalogFeedRow_(stock, title, description, images)
    },
    csvRows: {
      ebay: buildEbayCsvRow_(stock, title, copy.ebay, images),
      facebook: buildMetaCatalogFeedRow_(stock, title, description, images)
    }
  };
}

function buildMarketplaceListingTitle_(stock) {
  const type = clean_(stock.type);
  const power = clean_(stock.power);
  const includePower = power && type.toLowerCase().indexOf(power.toLowerCase()) === -1;
  return [
    stock.brand,
    stock.model,
    stock.capacity,
    includePower ? power : '',
    type
  ].map(clean_).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || clean_(stock.id) || 'AEGIS Forklift Stock Item';
}

function marketplacePriceText_(stock) {
  const raw = clean_(stock.price);
  if (!raw) return '';
  const amount = /^£/.test(raw) ? raw : `£${raw}`;
  return [amount, clean_(stock.vat)].filter(Boolean).join(' ');
}

function numericMarketplacePrice_(value) {
  const number = clean_(value).replace(/[^\d.]/g, '');
  return number || '';
}

function stockStatusLabel_(value) {
  const clean = clean_(value).toLowerCase().replace(/\s+/g, '-');
  if (clean === 'in-stock' || clean === 'instock') return 'In stock';
  if (clean === 'reserved') return 'Reserved';
  if (clean === 'sold') return 'Sold';
  if (clean === 'draft') return 'Draft';
  return clean_(value) || 'In stock';
}

function marketplaceStockBulletList_(stock) {
  const manual = clean_(stock.bullets)
    .split(/\n|;|\|/)
    .map(line => clean_(line))
    .filter(Boolean);

  if (manual.length) return manual;

  return [
    stock.capacity ? `Capacity: ${stock.capacity}` : '',
    stock.liftHeight ? `Lift height: ${stock.liftHeight}` : '',
    stock.year ? `Year: ${stock.year}` : '',
    stock.hours ? `Hours: ${stock.hours}` : '',
    stock.mast ? `Mast: ${stock.mast}` : '',
    stock.tyres ? `Tyres: ${stock.tyres}` : '',
    stock.battery ? `Battery: ${stock.battery}` : '',
    stock.fuel ? `Fuel: ${stock.fuel}` : ''
  ].map(clean_).filter(Boolean);
}

function buildMarketplaceImageList_(stock) {
  const images = normaliseStockImageArray_([stock.imageMain, stock.galleryImages].filter(Boolean).join('|'))
    .map(normalisePublicDriveImageUrl_)
    .filter(Boolean);
  return images.filter((url, index) => images.indexOf(url) === index);
}

function buildEbayInventoryItemDraft_(stock, title, conditionDescription, images) {
  return {
    sku: clean_(stock.id),
    availability: {
      shipToLocationAvailability: {
        quantity: 1
      }
    },
    product: {
      title,
      description: conditionDescription,
      imageUrls: images,
      aspects: {
        Brand: [clean_(stock.brand) || 'AEGIS'],
        Model: [clean_(stock.model) || title],
        Power: clean_(stock.power) ? [clean_(stock.power)] : [],
        Capacity: clean_(stock.capacity) ? [clean_(stock.capacity)] : []
      }
    },
    condition: 'USED_EXCELLENT',
    conditionDescription
  };
}

function buildEbayOfferDraft_(stock, title) {
  const props = PropertiesService.getScriptProperties();
  return {
    sku: clean_(stock.id),
    marketplaceId: clean_(props.getProperty('EBAY_MARKETPLACE_ID')) || 'EBAY_GB',
    format: 'FIXED_PRICE',
    availableQuantity: 1,
    categoryId: clean_(props.getProperty('EBAY_CATEGORY_ID')) || '',
    merchantLocationKey: clean_(props.getProperty('EBAY_MERCHANT_LOCATION_KEY')) || '',
    listingDescription: clean_(stock.description) || title,
    pricingSummary: {
      price: {
        value: numericMarketplacePrice_(stock.price),
        currency: 'GBP'
      }
    },
    listingPolicies: {
      fulfillmentPolicyId: clean_(props.getProperty('EBAY_FULFILLMENT_POLICY_ID')) || '',
      paymentPolicyId: clean_(props.getProperty('EBAY_PAYMENT_POLICY_ID')) || '',
      returnPolicyId: clean_(props.getProperty('EBAY_RETURN_POLICY_ID')) || ''
    }
  };
}

function buildMetaCatalogFeedRow_(stock, title, description, images) {
  return {
    id: clean_(stock.id),
    title,
    description,
    availability: normaliseSalesText_(stock.status).indexOf('sold') >= 0 ? 'out of stock' : 'in stock',
    condition: 'used',
    price: numericMarketplacePrice_(stock.price) ? `${numericMarketplacePrice_(stock.price)} GBP` : '',
    link: marketplacePublicStockUrl_(stock),
    image_link: images[0] || '',
    additional_image_link: images.slice(1).join(','),
    brand: clean_(stock.brand) || 'AEGIS',
    google_product_category: 'Business & Industrial > Material Handling > Forklifts',
    product_type: clean_(stock.category) || 'forklift-truck'
  };
}

function marketplacePublicStockUrl_(stock) {
  const base = clean_(PropertiesService.getScriptProperties().getProperty('AEGIS_PUBLIC_STOCK_URL')) || 'https://www.forkliftprosolutions.co.uk/used-forklifts/';
  const id = clean_(stock && stock.id);
  if (!id) return base;
  return `${base}${base.indexOf('?') >= 0 ? '&' : '?'}stock=${encodeURIComponent(id)}`;
}

function buildEbayCsvRow_(stock, title, description, images) {
  return {
    SKU: clean_(stock.id),
    Title: title,
    Description: description,
    Price: numericMarketplacePrice_(stock.price),
    Quantity: '1',
    Condition: 'Used',
    CategoryID: PropertiesService.getScriptProperties().getProperty('EBAY_CATEGORY_ID') || '',
    ImageURL: images[0] || '',
    AdditionalImageURLs: images.slice(1).join('|'),
    Brand: clean_(stock.brand),
    Model: clean_(stock.model),
    Capacity: clean_(stock.capacity),
    Power: clean_(stock.power)
  };
}

function webAppExportMarketplaceFeed(platform) {
  const key = marketplaceSourceKey_(platform || 'facebook');
  const stockItems = (webAppGetStockState().items || [])
    .filter(stock => normaliseSalesText_(stock.status).indexOf('sold') === -1);
  const rows = stockItems.map(stock => {
    const pack = buildMarketplaceListingPackage_(stock.id, key);
    return key === 'ebay' ? pack.csvRows.ebay : pack.csvRows.facebook;
  });
  const csv = objectRowsToCsv_(rows);

  return {
    ok: true,
    platform: key === 'ebay' ? 'ebay' : 'facebook',
    count: rows.length,
    fileName: `aegis-${key === 'ebay' ? 'ebay' : 'facebook'}-feed-${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm')}.csv`,
    csv
  };
}

function objectRowsToCsv_(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  rows.forEach(row => {
    lines.push(headers.map(header => csvCell_(row[header])).join(','));
  });
  return lines.join('\n');
}

function csvCell_(value) {
  const text = Array.isArray(value) ? value.join('|') : clean_(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function webAppPublishMarketplaceListing(payload) {
  const values = payload || {};
  const truckId = clean_(values.truckId || values.stockId || values.id);
  const platform = marketplaceSourceKey_(values.platform || values.source || 'website');
  const url = clean_(values.url || values.listingUrl);
  const status = clean_(values.status) || (url ? 'Live' : 'Ready to Publish');
  const current = findMarketplaceRow_(getMarketplaceSheet_(), truckId);
  const item = Object.assign({}, current.item || {}, {
    truckId,
    nextAction: clean_(values.nextAction) || (url ? 'Monitor enquiries and refresh listing weekly' : 'Publish listing and paste live URL'),
    notes: clean_(values.notes) || clean_(current.item && current.item.notes)
  });

  if (!truckId) {
    throw new Error('Choose a stock item before publishing a marketplace listing.');
  }

  if (platform === 'ebay') {
    item.ebayStatus = status;
    if (url) item.ebayUrl = url;
  } else if (platform === 'facebook') {
    item.facebookStatus = status;
    if (url) item.facebookUrl = url;
  } else if (platform === 'linkedin') {
    item.linkedinStatus = status;
    if (url) item.linkedinUrl = url;
  } else if (platform === 'googleBusiness') {
    item.googleBusinessStatus = status;
    if (url) item.googleBusinessUrl = url;
  } else if (platform === 'gumtree') {
    item.gumtreeStatus = status;
    if (url) item.gumtreeUrl = url;
  } else if (platform === 'whatsapp') {
    item.whatsappStatus = status;
  } else {
    item.websiteStatus = status;
    if (url) item.websiteUrl = url;
  }

  const result = webAppSaveMarketplaceItem(item);
  return Object.assign({
    ok: true,
    platform,
    status,
    url,
    package: buildMarketplaceListingPackage_(truckId, platform)
  }, result || {});
}

function webAppGetIntegrationStatus() {
  const ebay = getEbayConfig_();
  const linkedIn = getLinkedInConfig_();
  const gmail = getGmailIntegrationStatus_();

  return {
    ok: true,
    gmail,
    ebay: {
      configured: !ebay.missing.length,
      missing: ebay.missing,
      marketplaceId: ebay.marketplaceId,
      environment: ebay.environment
    },
    linkedin: {
      configured: !linkedIn.missing.length,
      missing: linkedIn.missing,
      authorUrn: linkedIn.authorUrn ? linkedIn.authorUrn.replace(/(.{18}).+/, '$1...') : '',
      clientConfigured: Boolean(linkedIn.clientId && linkedIn.clientSecret),
      canRefreshToken: Boolean(linkedIn.refreshToken && linkedIn.clientId && linkedIn.clientSecret),
      accessTokenExpiresAt: linkedIn.accessTokenExpiresAt ? new Date(linkedIn.accessTokenExpiresAt).toISOString() : '',
      redirectUri: getLinkedInRedirectUri_()
    },
    facebookMarketplace: {
      configured: false,
      note: 'Personal Facebook Marketplace direct auto-posting is not exposed like eBay. Use prepared copy or Meta Commerce/catalog workflows.'
    }
  };
}

function getGmailIntegrationStatus_() {
  const status = {
    configured: false,
    available: false,
    account: '',
    aliases: [],
    canReadThreads: false,
    canCreateDrafts: false,
    canSendEmail: false,
    syncInstalled: false,
    syncIntervalMinutes: null,
    error: ''
  };

  try {
    const activeEmail = Session.getActiveUser && Session.getActiveUser().getEmail
      ? clean_(Session.getActiveUser().getEmail())
      : '';
    const aliases = GmailApp.getAliases().map(alias => clean_(alias)).filter(Boolean);
    const syncStatus = webAppGetGmailSyncStatus();

    status.configured = true;
    status.available = true;
    status.account = activeEmail || aliases[0] || 'Authorized Google account';
    status.aliases = aliases;
    status.canReadThreads = true;
    status.canCreateDrafts = true;
    status.canSendEmail = true;
    status.syncInstalled = Boolean(syncStatus.installed);
    status.syncIntervalMinutes = syncStatus.intervalMinutes || null;
    status.note = 'Gmail is provided by Apps Script GmailApp under the authorized Google account. Sending still requires an explicit confirmed action.';
  } catch (error) {
    status.error = serverShorten_(error && error.message ? error.message : String(error), 300);
    status.note = 'Gmail needs Apps Script authorization before Sales OS can read threads, create drafts, or send approved emails.';
  }

  return status;
}

function webAppSaveLinkedInAppConfig(payload) {
  const values = payload || {};
  const clientId = clean_(values.clientId || values.id);
  const clientSecret = clean_(values.clientSecret || values.secret);
  const scope = clean_(values.scope) || 'openid profile w_member_social';
  const redirectUri = clean_(values.redirectUri || values.redirectUrl) || getDefaultLinkedInRedirectUri_();

  if (!clientId || !clientSecret) {
    throw new Error('LinkedIn Client ID and Client Secret are required.');
  }

  PropertiesService.getScriptProperties().setProperties({
    LINKEDIN_CLIENT_ID: clientId,
    LINKEDIN_CLIENT_SECRET: clientSecret,
    LINKEDIN_OAUTH_SCOPE: scope,
    LINKEDIN_REDIRECT_URI: redirectUri
  });

  return {
    ok: true,
    redirectUri: getLinkedInRedirectUri_(),
    scope,
    connectUrl: getLinkedInConnectUrl_()
  };
}

function webAppLinkedInOAuthStart_(event) {
  const url = createLinkedInAuthorizationUrl_();

  return webAppRedirectOutput_(url);
}

function webAppGetLinkedInAuthorizationUrl() {
  return {
    ok: true,
    url: createLinkedInAuthorizationUrl_(),
    redirectUri: getLinkedInRedirectUri_()
  };
}

function createLinkedInAuthorizationUrl_() {
  const config = getLinkedInConfig_();

  if (!config.clientId || !config.clientSecret) {
    throw new Error('Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET first, then try Connect LinkedIn again.');
  }

  const state = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put(linkedInOAuthStateCacheKey_(state), '1', 600);

  const scope = clean_(PropertiesService.getScriptProperties().getProperty('LINKEDIN_OAUTH_SCOPE')) || 'openid profile w_member_social';
  return (
    'https://www.linkedin.com/oauth/v2/authorization' +
    '?response_type=code' +
    '&client_id=' + encodeURIComponent(config.clientId) +
    '&redirect_uri=' + encodeURIComponent(getLinkedInRedirectUri_()) +
    '&state=' + encodeURIComponent(state) +
    '&scope=' + encodeURIComponent(scope)
  );
}

function webAppLinkedInOAuthCallback_(event) {
  const params = (event && event.parameter) || {};
  const state = clean_(params.state);
  const stateKey = linkedInOAuthStateCacheKey_(state);
  const cachedState = state ? CacheService.getScriptCache().get(stateKey) : '';

  if (params.error) {
    return webAppHtmlMessage_(
      'LinkedIn connection cancelled',
      clean_(params.error_description || params.error)
    );
  }

  if (!state || !cachedState) {
    return webAppHtmlMessage_(
      'LinkedIn connection expired',
      'The OAuth state expired or did not match. Go back to Sales OS and click Connect LinkedIn again.'
    );
  }

  CacheService.getScriptCache().remove(stateKey);

  const code = clean_(params.code);
  if (!code) {
    return webAppHtmlMessage_('LinkedIn connection failed', 'LinkedIn did not return an authorization code.');
  }

  try {
    const config = getLinkedInConfig_();
    const token = exchangeLinkedInAuthorizationCode_(code, config);
    const authorUrn = resolveLinkedInAuthorUrn_(token.accessToken);
    const props = PropertiesService.getScriptProperties();
    const values = {
      LINKEDIN_ACCESS_TOKEN: token.accessToken,
      LINKEDIN_AUTHOR_URN: authorUrn,
      LINKEDIN_ACCESS_TOKEN_EXPIRES_AT: String(new Date(Date.now() + (Number(token.expiresIn) || 0) * 1000).getTime())
    };

    if (token.refreshToken) values.LINKEDIN_REFRESH_TOKEN = token.refreshToken;
    if (token.scope) values.LINKEDIN_GRANTED_SCOPE = token.scope;

    props.setProperties(values);

    return webAppHtmlMessage_(
      'LinkedIn connected',
      'AEGIS Sales OS can now publish approved LinkedIn posts and stock announcements. You can close this tab.'
    );
  } catch (error) {
    return webAppHtmlMessage_(
      'LinkedIn connection failed',
      error && error.message ? error.message : String(error)
    );
  }
}

function webAppPublishEbayListing(payload) {
  const values = payload || {};
  const truckId = clean_(values.truckId || values.stockId || values.id);

  if (!truckId) {
    throw new Error('Choose a stock item before publishing to eBay.');
  }

  const config = getEbayConfig_();
  if (config.missing.length) {
    throw new Error('eBay publishing is not configured yet. Add these Apps Script properties: ' + config.missing.join(', '));
  }

  const stock = findStockItem_(truckId).item;
  if (!stock || !stock.id) {
    throw new Error('Stock item not found for eBay publishing.');
  }

  const pack = buildMarketplaceListingPackage_(truckId, 'ebay');
  const sku = clean_(stock.id);
  const inventoryItem = Object.assign({}, pack.ebay.inventoryItem, {
    availability: {
      shipToLocationAvailability: {
        quantity: Math.max(1, Number(values.quantity) || 1)
      }
    }
  });
  const offerDraft = Object.assign({}, pack.ebay.offerDraft, {
    listingDescription: clean_(values.description) || pack.copy.ebay,
    pricingSummary: {
      price: {
        value: numericMarketplacePrice_(values.price || stock.price),
        currency: clean_(values.currency) || 'GBP'
      }
    }
  });

  ebayApiFetch_('PUT', `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, config, inventoryItem);
  const offerResponse = ebayApiFetch_('POST', '/sell/inventory/v1/offer', config, offerDraft);
  const offerId = clean_(offerResponse.offerId || offerResponse.id);

  if (!offerId) {
    throw new Error('eBay created the inventory item but did not return an offer ID.');
  }

  const publishResponse = ebayApiFetch_('POST', `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`, config, null);
  const listingId = clean_(publishResponse.listingId || publishResponse.id);
  const url = listingId ? `https://www.ebay.co.uk/itm/${listingId}` : '';

  const saved = webAppPublishMarketplaceListing({
    truckId,
    platform: 'ebay',
    status: 'Live',
    url,
    nextAction: 'Monitor eBay enquiries and refresh listing weekly',
    notes: clean_(values.notes)
  });

  return {
    ok: true,
    platform: 'ebay',
    truckId,
    sku,
    offerId,
    listingId,
    url,
    saved
  };
}

function webAppPublishLinkedInPost(payload) {
  const values = payload || {};
  const truckId = clean_(values.truckId || values.stockId);
  const contentId = clean_(values.contentId || values.itemId || (!truckId ? values.id : ''));
  let content = null;
  let found = null;

  if (contentId) {
    found = findContentScheduleItem_(contentId, values.sourceId);
    if (!found.rowNumber) {
      throw new Error('Content Schedule item not found for LinkedIn posting.');
    }
    content = normaliseContentScheduleInput_(Object.assign({}, found.item, values, { id: found.item.id }));
  } else if (truckId) {
    const pack = buildMarketplaceListingPackage_(truckId, 'linkedin');
    content = normaliseContentScheduleInput_({
      platform: 'LinkedIn',
      pillar: 'Stock / Marketplace',
      status: 'Approved',
      title: pack.title,
      postDraft: pack.copy.linkedin,
      sourceType: 'Forklift Stock',
      sourceId: truckId,
      sourceTitle: pack.title,
      sourceUrl: marketplacePublicStockUrl_(pack.stock),
      tags: 'stock|forklifts|material handling',
      owner: 'Aaron',
      notes: 'Published from Marketplace Control'
    });
  } else {
    content = normaliseContentScheduleInput_(values.content || values.item || values.post || values);
  }

  const text = appendSourceUrlToPostText_(
    clean_(values.text || values.body || values.message || content.postDraft || content.linkedinDraft),
    clean_(values.sourceUrl || content.sourceUrl)
  );
  const assetUrl = clean_(
    values.assetUrl ||
    values.imageUrl ||
    values.mediaUrl ||
    values.image ||
    values.photoUrl ||
    content.assetUrl ||
    content.imageUrl ||
    content.mediaUrl
  );

  if (!text) {
    throw new Error('Add LinkedIn post text before publishing.');
  }

  const config = getLinkedInConfig_();
  if (config.missing.length) {
    throw new Error('LinkedIn publishing is not configured yet. Add these Apps Script properties: ' + config.missing.join(', '));
  }

  const post = linkedInApiCreatePost_(config, text, {
    assetUrl,
    title: clean_(values.title || content.title),
    description: clean_(values.description || content.cta || content.notes)
  });
  const postedUrl = clean_(values.postedUrl) || linkedInPostUrl_(post.id);
  let savedContent = null;
  let savedMarketplace = null;

  if (found && found.rowNumber) {
    savedContent = webAppUpdateContentItem(content.id, Object.assign({}, content, {
      status: 'Posted',
      postedUrl,
      assetUrl: assetUrl || content.assetUrl,
      notes: clean_(content.notes)
    }));
  } else if (content.title || content.postDraft) {
    savedContent = webAppSaveContentItem(Object.assign({}, content, {
      status: 'Posted',
      postedUrl,
      assetUrl: assetUrl || content.assetUrl
    }));
  }

  if (truckId) {
    savedMarketplace = webAppPublishMarketplaceListing({
      truckId,
      platform: 'linkedin',
      status: 'Live',
      url: postedUrl,
      nextAction: 'Monitor LinkedIn comments/messages and log buyer enquiries in Sales Desk'
    });
  }

  return {
    ok: true,
    platform: 'linkedin',
    postId: post.id,
    url: postedUrl,
    assetUrl,
    mediaAsset: post.mediaAsset || '',
    contentId: (savedContent && savedContent.id) || content.id || '',
    truckId,
    savedContent,
    savedMarketplace
  };
}

function getEbayConfig_() {
  const props = PropertiesService.getScriptProperties();
  const environment = clean_(props.getProperty('EBAY_ENVIRONMENT')).toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
  const config = {
    environment,
    apiBase: environment === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com',
    clientId: clean_(props.getProperty('EBAY_CLIENT_ID')),
    clientSecret: clean_(props.getProperty('EBAY_CLIENT_SECRET')),
    refreshToken: clean_(props.getProperty('EBAY_REFRESH_TOKEN')),
    marketplaceId: clean_(props.getProperty('EBAY_MARKETPLACE_ID')) || 'EBAY_GB',
    merchantLocationKey: clean_(props.getProperty('EBAY_MERCHANT_LOCATION_KEY')),
    paymentPolicyId: clean_(props.getProperty('EBAY_PAYMENT_POLICY_ID')),
    fulfillmentPolicyId: clean_(props.getProperty('EBAY_FULFILLMENT_POLICY_ID')),
    returnPolicyId: clean_(props.getProperty('EBAY_RETURN_POLICY_ID')),
    categoryId: clean_(props.getProperty('EBAY_CATEGORY_ID')),
    scope: clean_(props.getProperty('EBAY_OAUTH_SCOPE')) || 'https://api.ebay.com/oauth/api_scope/sell.inventory'
  };
  config.missing = [
    ['EBAY_CLIENT_ID', config.clientId],
    ['EBAY_CLIENT_SECRET', config.clientSecret],
    ['EBAY_REFRESH_TOKEN', config.refreshToken],
    ['EBAY_MERCHANT_LOCATION_KEY', config.merchantLocationKey],
    ['EBAY_PAYMENT_POLICY_ID', config.paymentPolicyId],
    ['EBAY_FULFILLMENT_POLICY_ID', config.fulfillmentPolicyId],
    ['EBAY_RETURN_POLICY_ID', config.returnPolicyId],
    ['EBAY_CATEGORY_ID', config.categoryId]
  ].filter(([, value]) => !value).map(([name]) => name);
  return config;
}

function isEbayApiConfigured_() {
  return !getEbayConfig_().missing.length;
}

function getEbayAccessToken_(config) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `EBAY_ACCESS_TOKEN_${config.environment}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const response = UrlFetchApp.fetch(`${config.apiBase}/identity/v1/oauth2/token`, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    headers: {
      Authorization: `Basic ${Utilities.base64Encode(`${config.clientId}:${config.clientSecret}`)}`
    },
    payload: {
      grant_type: 'refresh_token',
      refresh_token: config.refreshToken,
      scope: config.scope
    },
    muteHttpExceptions: true
  });
  const data = parseApiJsonResponse_(response, 'eBay OAuth');
  const token = clean_(data.access_token);
  if (!token) {
    throw new Error('eBay OAuth did not return an access token.');
  }

  cache.put(cacheKey, token, Math.max(60, Math.min(7000, Number(data.expires_in) - 60 || 7000)));
  return token;
}

function ebayApiFetch_(method, path, config, body) {
  const token = getEbayAccessToken_(config);
  const options = {
    method: String(method || 'get').toLowerCase(),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Content-Language': 'en-GB'
    },
    muteHttpExceptions: true
  };

  if (body !== null && typeof body !== 'undefined') {
    options.payload = JSON.stringify(body);
  }

  const response = UrlFetchApp.fetch(`${config.apiBase}${path}`, options);
  return parseApiJsonResponse_(response, `eBay ${method} ${path}`);
}

function getLinkedInConfig_() {
  const props = PropertiesService.getScriptProperties();
  const config = {
    accessToken: clean_(props.getProperty('LINKEDIN_ACCESS_TOKEN')),
    accessTokenExpiresAt: Number(props.getProperty('LINKEDIN_ACCESS_TOKEN_EXPIRES_AT')) || 0,
    refreshToken: clean_(props.getProperty('LINKEDIN_REFRESH_TOKEN')),
    clientId: clean_(props.getProperty('LINKEDIN_CLIENT_ID')),
    clientSecret: clean_(props.getProperty('LINKEDIN_CLIENT_SECRET')),
    authorUrn: clean_(
      props.getProperty('LINKEDIN_AUTHOR_URN') ||
      props.getProperty('LINKEDIN_PERSON_URN') ||
      props.getProperty('LINKEDIN_ORGANIZATION_URN')
    ),
    visibility: clean_(props.getProperty('LINKEDIN_VISIBILITY')) || 'PUBLIC'
  };
  config.missing = [
    config.accessToken || (config.refreshToken && config.clientId && config.clientSecret) ? '' : 'LINKEDIN_ACCESS_TOKEN',
    config.authorUrn ? '' : 'LINKEDIN_AUTHOR_URN'
  ].filter(Boolean);
  return config;
}

function getLinkedInAccessToken_(config) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('LINKEDIN_ACCESS_TOKEN');
  if (cached) return cached;
  if (config.accessToken && (!config.accessTokenExpiresAt || config.accessTokenExpiresAt > Date.now() + 1000 * 60 * 10)) {
    return config.accessToken;
  }

  if (!config.refreshToken || !config.clientId || !config.clientSecret) {
    if (config.accessToken) return config.accessToken;
    throw new Error('LinkedIn access token is missing. Use Connect LinkedIn in Sales OS.');
  }

  const response = UrlFetchApp.fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'refresh_token',
      refresh_token: config.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret
    },
    muteHttpExceptions: true
  });
  const data = parseApiJsonResponse_(response, 'LinkedIn OAuth');
  const token = clean_(data.access_token);
  if (!token) {
    throw new Error('LinkedIn OAuth did not return an access token.');
  }

  PropertiesService.getScriptProperties().setProperties({
    LINKEDIN_ACCESS_TOKEN: token,
    LINKEDIN_ACCESS_TOKEN_EXPIRES_AT: String(new Date(Date.now() + (Number(data.expires_in) || 0) * 1000).getTime())
  });
  cache.put('LINKEDIN_ACCESS_TOKEN', token, Math.max(60, Math.min(7000, Number(data.expires_in) - 60 || 7000)));
  return token;
}

function exchangeLinkedInAuthorizationCode_(code, config) {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('LinkedIn Client ID and Client Secret are missing.');
  }

  const response = UrlFetchApp.fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: getLinkedInRedirectUri_(),
      client_id: config.clientId,
      client_secret: config.clientSecret
    },
    muteHttpExceptions: true
  });
  const data = parseApiJsonResponse_(response, 'LinkedIn OAuth code exchange');
  const accessToken = clean_(data.access_token);

  if (!accessToken) {
    throw new Error('LinkedIn OAuth did not return an access token.');
  }

  return {
    accessToken,
    refreshToken: clean_(data.refresh_token),
    expiresIn: Number(data.expires_in) || 0,
    scope: clean_(data.scope)
  };
}

function resolveLinkedInAuthorUrn_(accessToken) {
  const userInfo = linkedInApiGetOptional_('https://api.linkedin.com/v2/userinfo', accessToken);
  const userInfoSub = clean_(userInfo && userInfo.sub);
  if (userInfoSub) return userInfoSub.indexOf('urn:li:person:') === 0 ? userInfoSub : `urn:li:person:${userInfoSub}`;

  const legacyProfile = linkedInApiGetOptional_('https://api.linkedin.com/v2/me', accessToken);
  const profileId = clean_(legacyProfile && legacyProfile.id);
  if (profileId) return profileId.indexOf('urn:li:person:') === 0 ? profileId : `urn:li:person:${profileId}`;

  throw new Error('LinkedIn token worked, but AEGIS could not resolve the Person URN. Add the Sign In with LinkedIn using OpenID Connect product, or set LINKEDIN_AUTHOR_URN manually.');
}

function linkedInApiGetOptional_(url, accessToken) {
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) return null;

  try {
    return JSON.parse(response.getContentText() || '{}');
  } catch (error) {
    return null;
  }
}

function getLinkedInRedirectUri_() {
  return clean_(PropertiesService.getScriptProperties().getProperty('LINKEDIN_REDIRECT_URI')) || getDefaultLinkedInRedirectUri_();
}

function getDefaultLinkedInRedirectUri_() {
  return 'https://aegis-gpt-proxy.vercel.app/api/linkedin/callback';
}

function getLinkedInConnectUrl_() {
  return `${ScriptApp.getService().getUrl()}?action=linkedinConnect&access=${encodeURIComponent(getAegisWebAccessKey_())}`;
}

function linkedInOAuthStateCacheKey_(state) {
  return `linkedin_oauth_state_${clean_(state)}`;
}

function webAppRedirectOutput_(url) {
  const safeUrl = String(url || '');
  const escapedUrl = escapeHtml_(safeUrl);
  return HtmlService
    .createHtmlOutput(
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta http-equiv="refresh" content="1;url=' +
      escapedUrl +
      '"><style>body{font-family:Arial,sans-serif;padding:32px;line-height:1.45}a{display:inline-block;background:#111;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700}</style></head><body>' +
      '<h1>Connect LinkedIn</h1><p>If LinkedIn does not open automatically, use the button below.</p><p><a target="_top" rel="noopener" href="' +
      escapedUrl +
      '">Continue to LinkedIn</a></p><script>window.top.location.href=' +
      JSON.stringify(safeUrl) +
      ';setTimeout(function(){window.location.href=' +
      JSON.stringify(safeUrl) +
      ';},800);</script></body></html>'
    )
    .setTitle('Connect LinkedIn');
}

function webAppHtmlMessage_(title, message) {
  return HtmlService
    .createHtmlOutput(
      '<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:32px;line-height:1.5}h1{font-size:28px}</style></head><body><h1>' +
      escapeHtml_(title) +
      '</h1><p>' +
      escapeHtml_(message) +
      '</p></body></html>'
    )
    .setTitle(title);
}

function escapeHtml_(value) {
  return clean_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linkedInApiCreatePost_(config, text, mediaOptions) {
  const media = mediaOptions || {};
  const accessToken = getLinkedInAccessToken_(config);
  const imageAsset = media.assetUrl ? linkedInUploadImageAsset_(config, accessToken, media) : '';
  const shareContent = {
    shareCommentary: {
      text
    },
    shareMediaCategory: imageAsset ? 'IMAGE' : 'NONE'
  };

  if (imageAsset) {
    shareContent.media = [{
      status: 'READY',
      media: imageAsset,
      title: {
        text: clean_(media.title) || 'AEGIS Industrial Systems'
      },
      description: {
        text: clean_(media.description)
      }
    }];
  }

  const response = UrlFetchApp.fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'post',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0'
    },
    payload: JSON.stringify({
      author: config.authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': shareContent
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': config.visibility || 'PUBLIC'
      }
    }),
    muteHttpExceptions: true
  });
  const data = parseApiJsonResponse_(response, 'LinkedIn create post', [201]);
  const headers = response.getAllHeaders ? response.getAllHeaders() : response.getHeaders();
  const id = clean_(data.id || headers['X-RestLi-Id'] || headers['x-restli-id']);
  return Object.assign({}, data, { id, mediaAsset: imageAsset });
}

function linkedInUploadImageAsset_(config, accessToken, media) {
  const imageUrl = clean_(media.assetUrl || media.imageUrl || media.mediaUrl);
  if (!imageUrl) return '';

  const registerResponse = UrlFetchApp.fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'post',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0'
    },
    payload: JSON.stringify({
      registerUploadRequest: {
        recipes: [
          'urn:li:digitalmediaRecipe:feedshare-image'
        ],
        owner: config.authorUrn,
        serviceRelationships: [{
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent'
        }]
      }
    }),
    muteHttpExceptions: true
  });
  const registerData = parseApiJsonResponse_(registerResponse, 'LinkedIn register image upload');
  const value = registerData.value || {};
  const asset = clean_(value.asset);
  const mechanism = value.uploadMechanism || {};
  const upload = mechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'] || {};
  const uploadUrl = clean_(upload.uploadUrl);

  if (!asset || !uploadUrl) {
    throw new Error('LinkedIn did not return an image upload URL.');
  }

  const imageResponse = UrlFetchApp.fetch(imageUrl, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true
  });
  const imageCode = imageResponse.getResponseCode();
  if (imageCode < 200 || imageCode >= 300) {
    throw new Error(`LinkedIn image upload could not fetch image URL (${imageCode}). Use a public image URL or upload the image into Sales OS first.`);
  }

  const imageBlob = imageResponse.getBlob();
  const uploadResponse = UrlFetchApp.fetch(uploadUrl, {
    method: 'put',
    contentType: imageBlob.getContentType() || 'application/octet-stream',
    payload: imageBlob.getBytes(),
    muteHttpExceptions: true
  });
  const uploadCode = uploadResponse.getResponseCode();
  if (uploadCode < 200 || uploadCode >= 300) {
    throw new Error(`LinkedIn image upload failed (${uploadCode}): ${uploadResponse.getContentText()}`);
  }

  return asset;
}

function appendSourceUrlToPostText_(text, url) {
  const body = clean_(text);
  const link = clean_(url);
  if (!body || !link || body.indexOf(link) >= 0) return body;
  return `${body}\n\n${link}`;
}

function linkedInPostUrl_(postId) {
  const id = clean_(postId);
  return id ? `https://www.linkedin.com/feed/update/${id}/` : '';
}

function parseApiJsonResponse_(response, label, okCodes) {
  const code = response.getResponseCode();
  const text = response.getContentText();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = { raw: text };
    }
  }

  const allowed = okCodes || [200, 201, 204];
  if (allowed.indexOf(code) === -1) {
    const message = clean_(data.message || data.error_description || data.error || data.raw || text);
    throw new Error(`${label} failed (${code})${message ? `: ${serverShorten_(message, 500)}` : ''}`);
  }

  return data;
}

function webAppSendEmail(payload) {
  const values = payload || {};
  const emailPayload = values.email && typeof values.email === 'object' ? values.email : {};
  const to = firstEmailAddress_(
    values.to,
    values.email,
    values.emailAddress,
    values.email_address,
    values.emailTo,
    values.email_to,
    values.recipient,
    values.recipientEmail,
    values.recipient_email,
    values.recipientEmailAddress,
    values.recipient_email_address,
    values.customerEmail,
    values.customer_email,
    values.contactEmail,
    values.contact_email,
    values.leadEmail,
    values.lead_email,
    values.recipients,
    emailPayload.to,
    emailPayload.email,
    emailPayload.emailAddress,
    emailPayload.email_address,
    emailPayload.emailTo,
    emailPayload.email_to,
    emailPayload.recipient,
    emailPayload.recipientEmail,
    emailPayload.recipient_email,
    emailPayload.recipientEmailAddress,
    emailPayload.recipient_email_address,
    emailPayload.customerEmail,
    emailPayload.customer_email,
    emailPayload.contactEmail,
    emailPayload.contact_email,
    emailPayload.leadEmail,
    emailPayload.lead_email,
    emailPayload.recipients,
    values.contact,
    values.customer,
    values.lead,
    values.company,
    values.item,
    values.row
  );
  const subject = clean_(values.subject || emailPayload.subject || emailPayload.emailSubject);
  const body = clean_(values.body || values.message || emailPayload.body || emailPayload.message || emailPayload.text || emailPayload.content || emailPayload.emailBody);
  const name = clean_(values.name || values.fromName || emailPayload.name || emailPayload.fromName) || 'Aaron';
  const draftOnly = values.draftOnly === true || emailPayload.draftOnly === true || String(values.mode || emailPayload.mode || '').toLowerCase() === 'draft';

  if (!to || !isValidEmail_(to)) {
    throw new Error('Send email needs a valid recipient email address.');
  }

  if (!subject || !body) {
    throw new Error('Send email needs both a subject and message body.');
  }

  if (draftOnly) {
    const draft = GmailApp.createDraft(to, subject, body, { name });
    return {
      ok: true,
      draftOnly: true,
      draftId: draft.getId(),
      to,
      subject
    };
  }

  GmailApp.sendEmail(to, subject, body, { name });
  return {
    ok: true,
    sent: true,
    to,
    subject
  };
}

function webAppLogEmailActivity(payload) {
  const values = payload || {};
  const emailPayload = values.email && typeof values.email === 'object' ? values.email : {};
  const to = firstEmailAddress_(
    values.to,
    values.email,
    values.emailAddress,
    values.email_address,
    values.recipient,
    values.recipientEmail,
    values.recipient_email,
    values.recipientEmailAddress,
    values.recipient_email_address,
    values.customerEmail,
    values.customer_email,
    values.contactEmail,
    values.contact_email,
    values.leadEmail,
    values.lead_email,
    values.recipients,
    emailPayload.to,
    emailPayload.email,
    emailPayload.emailAddress,
    emailPayload.email_address,
    emailPayload.recipient,
    emailPayload.recipientEmail,
    emailPayload.recipient_email,
    values.contact,
    values.customer,
    values.lead,
    values.company,
    values.item,
    values.row
  );

  if (!to || !isValidEmail_(to)) {
    throw new Error('Email activity log needs a valid recipient email address.');
  }

  const company = clean_(values.company || values.companyName || values.business || values.businessName || emailPayload.company || emailPayload.companyName);
  const subject = clean_(values.subject || emailPayload.subject || emailPayload.emailSubject);
  const informationAbout = clean_(
    values.informationAbout ||
    values.infoAbout ||
    values.topic ||
    values.about ||
    values.intent ||
    values.purpose ||
    values.reason ||
    emailPayload.informationAbout ||
    emailPayload.topic
  );
  const product = clean_(
    values.product ||
    values.productName ||
    values.stock ||
    values.stockId ||
    values.truckId ||
    values.interestedTruck ||
    values.machine ||
    emailPayload.product ||
    emailPayload.stockId ||
    emailPayload.truckId
  );
  const sentAt = clean_(values.sentAt || values.sent_at || values.date || values.timestamp) || new Date();
  const status = clean_(values.status) || (values.draftOnly === true || clean_(values.mode).toLowerCase() === 'draft' ? 'Drafted' : 'Sent');
  const source = clean_(values.source) || 'ChatGPT Gmail';
  const summary = serverShorten_(clean_(
    values.summary ||
    values.emailSummary ||
    values.body ||
    values.message ||
    emailPayload.summary ||
    emailPayload.body ||
    emailPayload.message
  ), 800);
  const nextFollowUpAt = clean_(values.nextFollowUpAt || values.next_follow_up_at || values.nextFollowUp || values.followUpAt);
  const nextAction = clean_(values.nextAction || values.next_action || values.followUpAction || values.followUp);
  const campaignStep = clean_(values.campaignStep || values.campaign_step || values.step || values.sequenceStep);
  const contact = clean_(values.contact || values.contactName || emailPayload.contact || emailPayload.contactName);
  const gmailThreadId = clean_(values.gmailThreadId || values.threadId || values.thread_id || emailPayload.gmailThreadId || emailPayload.threadId);
  const gmailMessageId = clean_(values.gmailMessageId || values.messageId || values.message_id || emailPayload.gmailMessageId || emailPayload.messageId);
  const notes = clean_(values.notes || values.ownerNotes || values.note);
  const databaseSheet = clean_(values.sourceSheet || values.databaseSheet || values.sheet || values.tab);
  const databaseRow = clean_(values.rowNumber || values.databaseRow || values.row);
  const dryRun = values.dryRun === true || clean_(values.dryRun).toLowerCase() === 'true';
  const matchedDatabaseRow = findDatabaseRowForEmailActivity_(to, company, databaseSheet, databaseRow);

  const activity = {
    loggedAt: new Date(),
    direction: clean_(values.direction) || 'Outbound',
    status,
    company: company || matchedDatabaseRow.company,
    contact,
    email: to,
    subject,
    informationAbout,
    product,
    campaignStep,
    summary,
    gmailThreadId,
    gmailMessageId,
    sentAt,
    nextFollowUpAt,
    nextAction,
    source,
    databaseSheet: databaseSheet || matchedDatabaseRow.sourceSheet,
    databaseRow: databaseRow || matchedDatabaseRow.rowNumber,
    notes
  };

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      activity,
      matchedDatabaseRow
    };
  }

  const sheet = getEmailActivitySheet_();
  const row = EMAIL_ACTIVITY_CONFIG.HEADERS.map(header => emailActivityValueForHeader_(activity, header));
  sheet.appendRow(row);
  const activityRow = sheet.getLastRow();
  const databaseUpdated = appendEmailActivityToDatabaseNotes_(activity, matchedDatabaseRow);

  SpreadsheetApp.flush();
  clearWebAppStateCache_(['database', 'sales', 'opportunities', 'enquiries']);

  return {
    ok: true,
    logged: true,
    activityRow,
    activity,
    matchedDatabaseRow,
    databaseUpdated
  };
}

function getEmailActivitySheet_() {
  const ss = getAegisWorkbook_();
  let sheet = ss.getSheetByName(EMAIL_ACTIVITY_CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(EMAIL_ACTIVITY_CONFIG.SHEET_NAME);
  }
  sheet
    .getRange(EMAIL_ACTIVITY_CONFIG.HEADER_ROW, 1, 1, EMAIL_ACTIVITY_CONFIG.HEADERS.length)
    .setValues([EMAIL_ACTIVITY_CONFIG.HEADERS])
    .setFontWeight('bold')
    .setBackground('#202331')
    .setFontColor('#FFFFFF')
    .setWrap(true);
  sheet.setFrozenRows(1);
  return sheet;
}

function emailActivityValueForHeader_(activity, header) {
  const map = {
    'Logged At': activity.loggedAt,
    'Direction': activity.direction,
    'Status': activity.status,
    'Company': activity.company,
    'Contact': activity.contact,
    'Email': activity.email,
    'Subject': activity.subject,
    'Information About': activity.informationAbout,
    'Product / Stock': activity.product,
    'Campaign Step': activity.campaignStep,
    'Summary': activity.summary,
    'Gmail Thread ID': activity.gmailThreadId,
    'Gmail Message ID': activity.gmailMessageId,
    'Sent At': activity.sentAt,
    'Next Follow-Up At': activity.nextFollowUpAt,
    'Next Action': activity.nextAction,
    'Source': activity.source,
    'Database Sheet': activity.databaseSheet,
    'Database Row': activity.databaseRow,
    'Notes': activity.notes
  };
  return map[header] === undefined ? '' : map[header];
}

function findDatabaseRowForEmailActivity_(email, company, sourceSheet, rowNumber) {
  const ss = getAegisWorkbook_();
  const explicitSheet = clean_(sourceSheet);
  const explicitRow = Number(rowNumber);
  if (explicitSheet && explicitRow > DATABASE_CONFIG.HEADER_ROW) {
    const sheet = ss.getSheetByName(explicitSheet);
    if (sheet) {
      const headerMap = getHeaderMap_(sheet);
      const values = sheet.getRange(explicitRow, 1, 1, sheet.getLastColumn()).getValues()[0];
      return buildWebDatabaseRow_(explicitSheet, explicitRow, values, headerMap);
    }
  }

  const targetEmail = clean_(email).toLowerCase();
  const targetCompany = clean_(company).toLowerCase();
  const context = readDatabaseRowsForContext_(5000, '');
  const rows = context.rows || [];
  return rows.find(row => targetEmail && clean_(row.email).toLowerCase() === targetEmail) ||
    rows.find(row => targetCompany && clean_(row.company).toLowerCase() === targetCompany) ||
    {};
}

function appendEmailActivityToDatabaseNotes_(activity, databaseRow) {
  if (!databaseRow || !databaseRow.sourceSheet || !databaseRow.rowNumber) return false;

  const ss = getAegisWorkbook_();
  const sheet = ss.getSheetByName(databaseRow.sourceSheet);
  if (!sheet) return false;

  const headerMap = getHeaderMap_(sheet);
  const notesCol = getDatabaseColumnForWebField_('notes', headerMap);
  if (!notesCol) return false;

  const existing = clean_(sheet.getRange(Number(databaseRow.rowNumber), notesCol).getValue());
  const when = activity.sentAt instanceof Date
    ? Utilities.formatDate(activity.sentAt, Session.getScriptTimeZone(), 'dd MMM yyyy HH:mm')
    : clean_(activity.sentAt);
  const note = [
    `[${when || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy HH:mm')}] ${activity.status || 'Email'}: ${activity.subject || 'No subject'}`,
    activity.informationAbout ? `About: ${activity.informationAbout}` : '',
    activity.product ? `Product/stock: ${activity.product}` : '',
    activity.summary ? `Summary: ${activity.summary}` : '',
    activity.nextFollowUpAt ? `Next follow-up: ${activity.nextFollowUpAt}` : '',
    activity.nextAction ? `Next action: ${activity.nextAction}` : ''
  ].filter(Boolean).join(' | ');

  sheet.getRange(Number(databaseRow.rowNumber), notesCol).setValue(existing ? `${existing}\n${note}` : note);
  return true;
}

function firstEmailAddress_() {
  for (let i = 0; i < arguments.length; i += 1) {
    const email = extractEmailFromValue_(arguments[i], 0);
    if (email) return email;
  }
  return '';
}

function extractEmailFromValue_(value, depth) {
  if (value === null || value === undefined || depth > 3) return '';

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const email = extractEmailFromValue_(value[i], depth + 1);
      if (email) return email;
    }
    return '';
  }

  if (typeof value === 'object') {
    const keys = [
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
    for (let i = 0; i < keys.length; i += 1) {
      if (Object.prototype.hasOwnProperty.call(value, keys[i])) {
        const email = extractEmailFromValue_(value[keys[i]], depth + 1);
        if (email) return email;
      }
    }
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key) && /email|mail|recipient|contact|customer|lead|to|address/i.test(key)) {
        const email = extractEmailFromValue_(value[key], depth + 1);
        if (email) return email;
      }
    }
    return '';
  }

  return extractEmail_(value);
}

function webAppSendWhatsApp(payload) {
  const values = payload || {};
  const phone = normaliseWhatsAppPhone_(values.phone || values.to);
  const message = clean_(values.message || values.body);

  if (!phone) {
    throw new Error('WhatsApp needs a recipient phone number.');
  }

  if (!message) {
    throw new Error('WhatsApp needs a message.');
  }

  return {
    ok: true,
    sent: false,
    phone,
    message,
    whatsappUrl: `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(message)}`,
    note: 'WhatsApp direct sending is not connected yet. This creates the ready-to-send WhatsApp link.'
  };
}

function findStockItem_(stockId) {
  const id = clean_(stockId);
  const sheet = getStockSheet_();
  const lastRow = sheet.getLastRow();

  if (!id || lastRow < STOCK_CONFIG.FIRST_ROW) {
    return { rowNumber: 0, item: null };
  }

  const values = sheet
    .getRange(
      STOCK_CONFIG.FIRST_ROW,
      1,
      lastRow - STOCK_CONFIG.FIRST_ROW + 1,
      STOCK_CONFIG.HEADERS.length
    )
    .getValues();

  for (let i = 0; i < values.length; i++) {
    const item = buildWebStockItem_(values[i], STOCK_CONFIG.FIRST_ROW + i);
    if (clean_(item.id) === id) {
      return {
        rowNumber: STOCK_CONFIG.FIRST_ROW + i,
        item
      };
    }
  }

  return { rowNumber: 0, item: null };
}

function normaliseStockImageArray_(value) {
  if (Array.isArray(value)) {
    return value.map(clean_).filter(Boolean);
  }

  return clean_(value)
    .split(/\n|,|\|/)
    .map(part => clean_(part))
    .filter(Boolean);
}

function pauseMarketplaceForDeletedStock_(truckId) {
  const data = findMarketplaceRow_(getMarketplaceSheet_(), clean_(truckId));
  if (!data.rowNumber) return false;

  const sheet = getMarketplaceSheet_();
  sheet.getRange(data.rowNumber, MARKETPLACE_CONFIG.COL_WEBSITE_STATUS).setValue('Paused');
  sheet.getRange(data.rowNumber, MARKETPLACE_CONFIG.COL_EBAY_STATUS).setValue('Paused');
  sheet.getRange(data.rowNumber, MARKETPLACE_CONFIG.COL_FACEBOOK_STATUS).setValue('Paused');
  sheet.getRange(data.rowNumber, MARKETPLACE_CONFIG.COL_LINKEDIN_STATUS).setValue('Paused');
  sheet.getRange(data.rowNumber, MARKETPLACE_CONFIG.COL_GOOGLE_BUSINESS_STATUS).setValue('Paused');
  sheet.getRange(data.rowNumber, MARKETPLACE_CONFIG.COL_GUMTREE_STATUS).setValue('Paused');
  sheet.getRange(data.rowNumber, MARKETPLACE_CONFIG.COL_WHATSAPP_STATUS).setValue('Paused');
  sheet.getRange(data.rowNumber, MARKETPLACE_CONFIG.COL_NEXT_ACTION).setValue('Stock item deleted - remove public listings if still visible');
  sheet.getRange(data.rowNumber, MARKETPLACE_CONFIG.COL_UPDATED_AT).setValue(new Date());
  return true;
}

function normaliseWhatsAppPhone_(value) {
  const raw = clean_(value).replace(/[^\d+]/g, '');
  if (!raw) return '';
  if (raw.indexOf('+') === 0) return raw.replace(/^\+/, '');
  if (raw.indexOf('00') === 0) return raw.slice(2);
  if (raw.indexOf('0') === 0) return `44${raw.slice(1)}`;
  return raw;
}

function webAppCreateEnquiry(enquiry) {
  const sheet = getEnquirySheet_();
  const now = new Date();
  const values = enquiry || {};
  const customer = clean_(values.customer);
  const company = clean_(values.company);
  const phone = clean_(values.phone);
  const email = clean_(values.email);
  const enquiryText = clean_(values.enquiryText);

  if (!customer && !company && !phone && !email && !enquiryText) {
    throw new Error('Add at least a customer, company, phone, email, or enquiry note.');
  }

  if (email && !isValidEmail_(email)) {
    throw new Error('That email address does not look valid.');
  }

  const id = `ENQ-${Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss')}-${Utilities.getUuid().slice(0, 6)}`;
  const row = Math.max(sheet.getLastRow() + 1, ENQUIRY_CONFIG.FIRST_ROW);

  sheet.getRange(row, 1, 1, ENQUIRY_CONFIG.COL_ERROR).setValues([[
    id,
    now,
    now,
    clean_(values.source) || 'Manual',
    clean_(values.stage) || 'New Enquiry',
    customer,
    company,
    phone,
    email,
    clean_(values.location),
    clean_(values.interestedTruck),
    clean_(values.budget),
    enquiryText,
    clean_(values.nextAction) || 'Reply and qualify requirement',
    clean_(values.ownerNotes),
    '',
    clean_(values.priority) || 'Normal',
    clean_(values.gmailThreadId),
    ''
  ]]);

  sheet.getRange(row, 1, 1, ENQUIRY_CONFIG.COL_ERROR).setVerticalAlignment('top').setWrap(true);
  clearWebAppStateCache_(['enquiries']);

  return {
    ok: true,
    id
  };
}

function webAppUpdateEnquiry(enquiryId, updates) {
  const sheet = getEnquirySheet_();
  const id = clean_(enquiryId);
  const row = findEnquiryRow_(sheet, id);
  const values = updates || {};

  if (!row) {
    throw new Error('Enquiry not found.');
  }

  const fieldMap = {
    source: ENQUIRY_CONFIG.COL_SOURCE,
    stage: ENQUIRY_CONFIG.COL_STAGE,
    customer: ENQUIRY_CONFIG.COL_CUSTOMER,
    company: ENQUIRY_CONFIG.COL_COMPANY,
    phone: ENQUIRY_CONFIG.COL_PHONE,
    email: ENQUIRY_CONFIG.COL_EMAIL,
    location: ENQUIRY_CONFIG.COL_LOCATION,
    interestedTruck: ENQUIRY_CONFIG.COL_INTERESTED_TRUCK,
    budget: ENQUIRY_CONFIG.COL_BUDGET,
    enquiryText: ENQUIRY_CONFIG.COL_ENQUIRY_TEXT,
    nextAction: ENQUIRY_CONFIG.COL_NEXT_ACTION,
    ownerNotes: ENQUIRY_CONFIG.COL_OWNER_NOTES,
    priority: ENQUIRY_CONFIG.COL_PRIORITY,
    gmailThreadId: ENQUIRY_CONFIG.COL_GMAIL_THREAD_ID
  };

  if (Object.prototype.hasOwnProperty.call(values, 'email')) {
    const email = clean_(values.email);
    if (email && !isValidEmail_(email)) {
      throw new Error('That email address does not look valid.');
    }
  }

  Object.keys(fieldMap).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return;
    sheet.getRange(row, fieldMap[key]).setValue(clean_(values[key]));
  });

  if (Object.prototype.hasOwnProperty.call(values, 'lastContactedAt')) {
    const lastContactedAt = values.lastContactedAt === 'NOW'
      ? new Date()
      : clean_(values.lastContactedAt);
    sheet.getRange(row, ENQUIRY_CONFIG.COL_LAST_CONTACTED_AT).setValue(lastContactedAt);
  }

  sheet.getRange(row, ENQUIRY_CONFIG.COL_UPDATED_AT).setValue(new Date());
  clearWebAppStateCache_(['enquiries']);

  return {
    ok: true,
    id
  };
}

function webAppDeleteEnquiry(enquiryId) {
  const sheet = getEnquirySheet_();
  const id = clean_(enquiryId);
  const row = findEnquiryRow_(sheet, id);

  if (!row) {
    throw new Error('Enquiry not found.');
  }

  sheet.deleteRow(row);
  SpreadsheetApp.flush();
  clearWebAppStateCache_(['enquiries', 'sales', 'marketplace']);

  return {
    ok: true,
    id
  };
}

function webAppUpdateSalesLead(leadId, updates) {
  const parsed = parseSalesLeadId_(leadId);
  const values = updates || {};
  const stage = clean_(values.stage);
  const truckId = clean_(values.truckId);
  let result;

  if (parsed.type === 'enquiry') {
    const enquiryUpdates = {
      stage,
      nextAction: clean_(values.nextAction),
      ownerNotes: clean_(values.ownerNotes),
      priority: clean_(values.priority)
    };

    if (values.markContacted || Object.prototype.hasOwnProperty.call(values, 'lastContactedAt')) {
      enquiryUpdates.lastContactedAt = values.markContacted ? 'NOW' : values.lastContactedAt;
    }

    result = webAppUpdateEnquiry(parsed.sourceId, enquiryUpdates);
  } else if (parsed.type === 'opportunity') {
    result = webAppUpdateOpportunity(parsed.sourceId, {
      stage,
      nextAction: clean_(values.nextAction),
      ownerNotes: clean_(values.ownerNotes)
    });
  } else {
    throw new Error('Unknown sales lead type.');
  }

  const sold = normaliseSalesText_(stage).indexOf('won') >= 0 || normaliseSalesText_(stage).indexOf('sold') >= 0;
  if (sold && truckId) {
    markStockItemSold_(truckId);
    markMarketplaceTruckSold_(truckId);
  }

  SpreadsheetApp.flush();
  clearWebAppStateCache_(['sales', 'enquiries', 'opportunities', 'stock', 'marketplace']);

  return Object.assign({
    ok: true,
    leadId: clean_(leadId),
    stage,
    truckId
  }, result || {});
}

function parseSalesLeadId_(leadId) {
  const id = clean_(leadId);
  const parts = id.split(':');
  if (parts.length < 2 || !parts[0] || !parts.slice(1).join(':')) {
    throw new Error('Sales lead ID was not recognised.');
  }

  return {
    type: parts[0],
    sourceId: parts.slice(1).join(':')
  };
}

function markStockItemSold_(truckId) {
  const id = clean_(truckId);
  const state = webAppGetStockState();
  const item = (state.items || []).find(stock => clean_(stock.id) === id);

  if (!item) return false;

  item.status = 'sold';
  item.featured = 'No';
  webAppSaveStockItem(item);
  return true;
}

function markMarketplaceTruckSold_(truckId) {
  const id = clean_(truckId);
  const sheet = getMarketplaceSheet_();
  const rowData = findMarketplaceRow_(sheet, id);

  if (!rowData.rowNumber) return false;

  sheet.getRange(rowData.rowNumber, MARKETPLACE_CONFIG.COL_WEBSITE_STATUS).setValue('Sold');
  sheet.getRange(rowData.rowNumber, MARKETPLACE_CONFIG.COL_EBAY_STATUS).setValue('Sold');
  sheet.getRange(rowData.rowNumber, MARKETPLACE_CONFIG.COL_FACEBOOK_STATUS).setValue('Sold');
  sheet.getRange(rowData.rowNumber, MARKETPLACE_CONFIG.COL_LINKEDIN_STATUS).setValue('Paused');
  sheet.getRange(rowData.rowNumber, MARKETPLACE_CONFIG.COL_GOOGLE_BUSINESS_STATUS).setValue('Paused');
  sheet.getRange(rowData.rowNumber, MARKETPLACE_CONFIG.COL_GUMTREE_STATUS).setValue('Sold');
  sheet.getRange(rowData.rowNumber, MARKETPLACE_CONFIG.COL_WHATSAPP_STATUS).setValue('Paused');
  sheet.getRange(rowData.rowNumber, MARKETPLACE_CONFIG.COL_GOOGLE_ADS_STATUS).setValue('Paused');
  sheet.getRange(rowData.rowNumber, MARKETPLACE_CONFIG.COL_NEXT_ACTION).setValue('Remove or pause public listings after sale');
  sheet.getRange(rowData.rowNumber, MARKETPLACE_CONFIG.COL_UPDATED_AT).setValue(new Date());
  clearWebAppStateCache_(['marketplace']);
  return true;
}

function getForkliftStockInventory() {
  return webAppGetStockState();
}

function upsertForkliftStockItem(item) {
  return webAppSaveStockItem(item);
}

function deleteForkliftStockItem(stockId) {
  return webAppDeleteStockItem(stockId);
}

function uploadForkliftStockImage(payload) {
  return webAppUploadStockPhoto(payload);
}

function webAppSyncGmailEnquiries(options) {
  const result = syncGmailEnquiries_(withDefaultGmailSyncOptions_(options || {}));
  clearWebAppStateCache_(['enquiries']);
  return result;
}

function webAppImportGmailThreadAsEnquiry(threadId, options) {
  const id = clean_(threadId);

  if (!id) {
    throw new Error('Gmail thread ID is required.');
  }

  const sheet = getEnquirySheet_();
  const existingThreadIds = getExistingEnquiryThreadIds_(sheet);

  if (existingThreadIds[id]) {
    return {
      ok: true,
      imported: 0,
      skipped: 1,
      threadId: id,
      reason: 'already-imported'
    };
  }

  const thread = GmailApp.getThreadById(id);
  const enquiry = buildEnquiryFromGmailThread_(thread, withDefaultGmailSyncOptions_(options || {}));

  if (!enquiry) {
    throw new Error('That Gmail thread was found, but it did not look like a buyer or business enquiry.');
  }

  webAppCreateEnquiry(enquiry);
  clearWebAppStateCache_(['enquiries']);

  return {
    ok: true,
    imported: 1,
    skipped: 0,
    threadId: id,
    email: enquiry.email,
    customer: enquiry.customer,
    interestedTruck: enquiry.interestedTruck
  };
}

function withDefaultGmailSyncOptions_(options) {
  return Object.assign({
    days: 14,
    includeBusinessInbox: true,
    importAmbiguousBusiness: true,
    limitPerQuery: 12,
    maxThreads: 35
  }, options || {});
}

function syncGmailEnquiries_(options) {
  const sheet = getEnquirySheet_();
  const existingThreadIds = getExistingEnquiryThreadIds_(sheet);
  const queries = getGmailEnquiryQueries_(options || {});
  const limitPerQuery = Math.max(1, Math.min(Number(options && options.limitPerQuery) || 5, 20));
  const maxThreads = Math.max(1, Math.min(Number(options && options.maxThreads) || 12, 50));
  const threadMap = {};
  const queryErrors = [];

  queries.forEach(query => {
    try {
      GmailApp.search(query, 0, limitPerQuery).forEach(thread => {
        threadMap[thread.getId()] = thread;
      });
    } catch (err) {
      queryErrors.push({
        query,
        error: err && err.message ? err.message : String(err)
      });
    }
  });

  const threads = Object.keys(threadMap)
    .map(id => threadMap[id])
    .sort((a, b) => {
      const left = a && a.getLastMessageDate ? a.getLastMessageDate().getTime() : 0;
      const right = b && b.getLastMessageDate ? b.getLastMessageDate().getTime() : 0;
      return right - left;
    })
    .slice(0, maxThreads);
  let imported = 0;
  let skipped = 0;
  const importedItems = [];
  const alreadyImported = [];

  threads.forEach(thread => {
    const threadId = thread.getId();
    const existing = existingThreadIds[threadId];

    if (existing) {
      const summary = diagnoseGmailThread_(thread, {});
      alreadyImported.push({
        threadId,
        rowNumber: existing.rowNumber || '',
        enquiryId: existing.enquiryId || '',
        customer: existing.customer || summary.sender.name || '',
        email: existing.email || summary.sender.email || '',
        subject: summary.subject,
        from: summary.from,
        bodyExcerpt: summary.bodyExcerpt,
        looksLike: summary.looksLike
      });
      skipped++;
      return;
    }

    const enquiry = buildEnquiryFromGmailThread_(thread, options || {});

    if (!enquiry) {
      skipped++;
      return;
    }

    webAppCreateEnquiry(enquiry);
    existingThreadIds[threadId] = true;
    imported++;
    importedItems.push({
      threadId,
      customer: enquiry.customer,
      email: enquiry.email,
      stage: enquiry.stage,
      interestedTruck: enquiry.interestedTruck,
      enquiryText: shortenForSheet_(enquiry.enquiryText, 220)
    });
    Utilities.sleep(120);
  });

  return {
    imported,
    skipped,
    scanned: threads.length,
    importedItems: importedItems.slice(0, 12),
    alreadyImported: alreadyImported.slice(0, 12),
    limitPerQuery,
    maxThreads,
    queries,
    queryErrors
  };
}

function webAppDiagnoseGmailEnquiries(options) {
  const values = withDefaultGmailSyncOptions_(options || {});
  const queries = getGmailEnquiryQueries_(values);
  const includeThreads = values && values.includeThreads === true;
  const detailLimit = Math.max(1, Math.min(Number(values && values.detailLimit) || 5, 10));
  const existingThreadIds = includeThreads ? getExistingEnquiryThreadIds_(getEnquirySheet_()) : {};
  const results = [];

  queries.forEach(query => {
    try {
      const threads = GmailApp.search(query, 0, 5);
      const item = {
        query,
        count: threads.length,
        subjects: threads.map(thread => clean_(thread.getFirstMessageSubject ? thread.getFirstMessageSubject() : '')).filter(Boolean)
      };

      if (includeThreads) {
        item.threads = threads
          .slice(0, detailLimit)
          .map(thread => diagnoseGmailThread_(thread, existingThreadIds));
      }

      results.push(item);
    } catch (err) {
      results.push({
        query,
        count: 0,
        error: err && err.message ? err.message : String(err)
      });
    }
  });

  return {
    ok: true,
    activeUser: Session.getActiveUser().getEmail(),
    aliases: getMyEmailAddresses_(),
    queries: results
  };
}

function diagnoseGmailThread_(thread, existingThreadIds) {
  GmailApp.refreshThread(thread);

  const messages = thread.getMessages();
  const myEmails = getMyEmailAddresses_();
  let chosen = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const from = String(message.getFrom() || '').toLowerCase();

    if (!isFromMe_(from, myEmails)) {
      chosen = message;
      break;
    }
  }

  if (!chosen && messages.length) {
    chosen = messages[messages.length - 1];
  }

  const subject = chosen
    ? clean_(thread.getFirstMessageSubject ? thread.getFirstMessageSubject() : chosen.getSubject())
    : '';
  const body = chosen
    ? trimReplyText_(chosen.getPlainBody ? chosen.getPlainBody() : chosen.getBody())
    : '';
  const combined = `${subject}\n${body}`;
  const sender = chosen ? parseEmailSender_(chosen.getFrom()) : {};
  const looksLike = looksLikeGmailBuyerEnquiry_(combined, sender);
  const existing = Boolean(existingThreadIds && existingThreadIds[thread.getId()]);

  return {
    threadId: thread.getId(),
    existing,
    skipReason: existing ? 'already-imported' : (looksLike ? 'would-import' : 'not-forklift-enquiry'),
    messageCount: messages.length,
    subject,
    from: chosen ? clean_(chosen.getFrom()) : '',
    sender,
    date: chosen ? chosen.getDate() : '',
    bodyExcerpt: shortenForSheet_(body, 500),
    looksLike,
    source: looksLike ? detectEnquirySource_(combined) : '',
    interestedTruck: looksLike ? detectTruckRequirement_(combined) : ''
  };
}

function getGmailEnquiryQueries_(options) {
  const days = Math.max(1, Math.min(Number(options && options.days) || 30, 365));
  const customQuery = clean_(options && options.query);
  const includeBusinessInbox = options && options.includeBusinessInbox === true;
  const base = `newer_than:${days}d`;
  const inboxBase = `${base} in:inbox -in:sent -in:trash -in:spam -category:promotions -category:social`;
  const defaultQueries = [
    `${inboxBase} {forklift "fork lift" "pallet truck" pallettruck "electric pallet" "fork truck" counterbalance telehandler stacker}`,
    `${inboxBase} {truck forklift "pallet truck" TianyuLux Toyota Hyster Linde Yale Still Jungheinrich Viago}`,
    `${inboxBase} {"still available" "is this available" "best price" "lowest price" "can you deliver" viewing quote}`,
    `${inboxBase} {eBay Facebook Marketplace LinkedIn Gumtree WhatsApp "Google Business"}`,
    `${inboxBase} {AEGIS "Forklift Pro" "forklift pro" "Aegis Industrial"}`
  ];

  if (includeBusinessInbox) {
    defaultQueries.push(inboxBase);
  }

  return customQuery ? [customQuery].concat(defaultQueries) : defaultQueries;
}

function getExistingEnquiryThreadIds_(sheet) {
  const ids = {};
  const lastRow = sheet.getLastRow();

  if (lastRow < ENQUIRY_CONFIG.FIRST_ROW) {
    return ids;
  }

  sheet
    .getRange(
      ENQUIRY_CONFIG.FIRST_ROW,
      1,
      lastRow - ENQUIRY_CONFIG.FIRST_ROW + 1,
      ENQUIRY_CONFIG.COL_GMAIL_THREAD_ID
    )
    .getValues()
    .forEach((row, i) => {
      const id = clean_(row[ENQUIRY_CONFIG.COL_GMAIL_THREAD_ID - 1]);
      const hasVisibleEnquiry = Boolean(
        clean_(row[ENQUIRY_CONFIG.COL_ID - 1]) ||
        clean_(row[ENQUIRY_CONFIG.COL_CUSTOMER - 1]) ||
        clean_(row[ENQUIRY_CONFIG.COL_COMPANY - 1]) ||
        clean_(row[ENQUIRY_CONFIG.COL_PHONE - 1]) ||
        clean_(row[ENQUIRY_CONFIG.COL_EMAIL - 1]) ||
        clean_(row[ENQUIRY_CONFIG.COL_ENQUIRY_TEXT - 1])
      );

      if (id && hasVisibleEnquiry) {
        ids[id] = {
          rowNumber: ENQUIRY_CONFIG.FIRST_ROW + i,
          enquiryId: clean_(row[ENQUIRY_CONFIG.COL_ID - 1]),
          customer: clean_(row[ENQUIRY_CONFIG.COL_CUSTOMER - 1]),
          email: clean_(row[ENQUIRY_CONFIG.COL_EMAIL - 1])
        };
      }
    });

  return ids;
}

function buildEnquiryFromGmailThread_(thread, options) {
  GmailApp.refreshThread(thread);

  const messages = thread.getMessages();
  const myEmails = getMyEmailAddresses_();
  let chosen = null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const from = String(message.getFrom() || '').toLowerCase();

    if (!isFromMe_(from, myEmails)) {
      chosen = message;
      break;
    }
  }

  if (!chosen && messages.length) {
    chosen = messages[messages.length - 1];
  }

  if (!chosen) return null;

  const subject = clean_(thread.getFirstMessageSubject ? thread.getFirstMessageSubject() : chosen.getSubject());
  const body = trimReplyText_(chosen.getPlainBody ? chosen.getPlainBody() : chosen.getBody());
  const combined = `${subject}\n${body}`;
  const from = parseEmailSender_(chosen.getFrom());
  const phone = extractPhone_(combined);
  const highConfidence = looksLikeGmailBuyerEnquiry_(combined, from);
  const ambiguousBusiness = !highConfidence &&
    options &&
    options.importAmbiguousBusiness === true &&
    looksLikeBusinessEnquiry_(combined, from);

  if (!highConfidence && !ambiguousBusiness) {
    return null;
  }

  return {
    source: highConfidence ? detectEnquirySource_(combined) : 'Gmail - Needs Triage',
    stage: highConfidence ? 'Needs Reply' : 'Needs Triage',
    customer: from.name,
    company: '',
    phone,
    email: from.email,
    location: '',
    interestedTruck: highConfidence ? detectTruckRequirement_(combined) : '',
    budget: detectBudget_(combined),
    enquiryText: shortenForSheet_([subject, body].filter(Boolean).join('\n\n'), 1200),
    nextAction: highConfidence
      ? 'Reply, confirm truck requirement, location, budget, and viewing/delivery preference'
      : 'Review this Gmail message and decide whether it is a sales enquiry, supplier/admin email, or not relevant',
    ownerNotes: `Imported from Gmail on ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy HH:mm')}${ambiguousBusiness ? ' as business triage because it did not match truck keywords.' : ''}`,
    priority: highConfidence ? 'Normal' : 'Low',
    gmailThreadId: thread.getId()
  };
}

function parseEmailSender_(fromText) {
  const text = clean_(fromText);
  const email = extractEmail_(text);
  const name = clean_(text.replace(/<[^>]+>/g, '').replace(email, '').replace(/"/g, ''));

  return {
    name: name || email,
    email
  };
}

function looksLikeGmailBuyerEnquiry_(value, sender) {
  const text = clean_(value).toLowerCase();
  const email = clean_(sender && sender.email).toLowerCase();
  const name = clean_(sender && sender.name).toLowerCase();

  if (!text || looksLikeNoiseEmail_(text, email, name)) {
    return false;
  }

  return looksLikeForkliftEnquiry_(value);
}

function looksLikeForkliftEnquiry_(value) {
  const text = clean_(value).toLowerCase();
  const keywords = [
    'forklift',
    'fork lift',
    'fork truck',
    'truck',
    'counterbalance',
    'telehandler',
    'pallet truck',
    'electric pallet',
    'tianyulux',
    'toyota',
    'hyster',
    'linde',
    'yale',
    'jungheinrich',
    'viago',
    'aegis',
    'forklift pro',
    'still available',
    'is this available',
    'best price',
    'viewing',
    'delivery',
    'quote',
    'e bay',
    'ebay',
    'facebook marketplace',
    'marketplace'
  ];

  return keywords.some(keyword => text.includes(keyword));
}

function looksLikeBusinessEnquiry_(value, sender) {
  const text = clean_(value).toLowerCase();
  const email = clean_(sender && sender.email).toLowerCase();
  const name = clean_(sender && sender.name).toLowerCase();

  if (!text || looksLikeNoiseEmail_(text, email, name)) {
    return false;
  }

  const directSignals = [
    'hi aaron',
    'hello aaron',
    'dear aaron',
    'good morning',
    'good afternoon',
    'good evening',
    'can you',
    'could you',
    'would you',
    'i am looking',
    "i'm looking",
    'looking for',
    'interested in',
    'do you have',
    'what do you have',
    'have you got',
    'is it available',
    'available',
    'in stock',
    'stock',
    'quote',
    'price',
    'cost',
    'buy',
    'purchase',
    'delivery',
    'viewing',
    'call me',
    'phone me',
    'whatsapp',
    'machine',
    'equipment',
    'unit'
  ];

  if (directSignals.some(signal => text.includes(signal))) {
    return true;
  }

  return Boolean(extractPhone_(value) && extractEmail_(value));
}

function looksLikeNoiseEmail_(text, email, name) {
  const source = `${email} ${name} ${text}`.toLowerCase();
  const noiseSignals = [
    'noreply',
    'no-reply',
    'donotreply',
    'do-not-reply',
    'newsletter',
    'unsubscribe',
    'marketing',
    'notification',
    'notifications@',
    'mailer-daemon',
    'delivery subsystem',
    'google search console',
    'vercel',
    'linkedin',
    'deliveroo',
    'rundown ai',
    'artlist',
    'nvidia',
    'qr code generator',
    'corporatefinanceinstitute',
    'lovable',
    'base44'
  ];

  return noiseSignals.some(signal => source.includes(signal));
}

function detectEnquirySource_(value) {
  const text = clean_(value).toLowerCase();

  if (text.includes('facebook') || text.includes('marketplace')) return 'Facebook Marketplace';
  if (text.includes('ebay') || text.includes('e bay')) return 'eBay';
  if (text.includes('linkedin') || text.includes('linked in')) return 'LinkedIn';
  if (text.includes('website') || text.includes('web form')) return 'Website';
  return 'Gmail';
}

function detectTruckRequirement_(value) {
  const text = clean_(value);
  const lines = text
    .split(/\n+/)
    .map(line => clean_(line))
    .filter(Boolean);

  const match = lines.find(line => /forklift|fork lift|pallet truck|truck|diesel|electric|gas|lpg|toyota|linde|still|hyster|yale|bt|jungheinrich/i.test(line));
  return shortenForSheet_(match || '', 180);
}

function detectBudget_(value) {
  const text = clean_(value);
  const match = text.match(/(?:£|gbp\s?)(\d[\d,]*(?:\.\d{2})?)/i);
  return match ? match[0] : '';
}

function extractPhone_(value) {
  const text = clean_(value);
  const match = text.match(/(?:\+44|0)\s?\d[\d\s().-]{8,}/);
  return match ? clean_(match[0]).replace(/\s{2,}/g, ' ') : '';
}

function shortenForSheet_(value, maxLength) {
  const text = clean_(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function findEnquiryRow_(sheet, enquiryId) {
  const lastRow = sheet.getLastRow();

  if (!enquiryId || lastRow < ENQUIRY_CONFIG.FIRST_ROW) {
    return 0;
  }

  const ids = sheet
    .getRange(ENQUIRY_CONFIG.FIRST_ROW, ENQUIRY_CONFIG.COL_ID, lastRow - ENQUIRY_CONFIG.FIRST_ROW + 1, 1)
    .getValues();

  for (let i = 0; i < ids.length; i++) {
    if (clean_(ids[i][0]) === enquiryId) {
      return ENQUIRY_CONFIG.FIRST_ROW + i;
    }
  }

  return 0;
}

function webAppGetDatabaseState() {
  return cachedWebAppState_('database', buildWebAppDatabaseState_);
}

function buildWebAppDatabaseState_() {
  const ss = getAegisWorkbook_();
  const rows = [];
  const tabs = [];
  const columns = getWebDatabaseColumns_();
  const visibleLimit = 250;
  let total = 0;
  let withEmail = 0;
  let withContact = 0;

  ss.getSheets().forEach(sheet => {
    const sheetName = sheet.getName();

    if (
      DATABASE_CONFIG.EXCLUDED_SHEETS.indexOf(sheetName) >= 0 ||
      sheetName === 'Dashboard'
    ) {
      return;
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastCol < 1) {
      return;
    }

    const headerMap = getHeaderMap_(sheet);

    if (!headerMap.company) {
      return;
    }

    const dataRowCount = Math.max(lastRow - DATABASE_CONFIG.HEADER_ROW, 0);
    const values = dataRowCount
      ? sheet
        .getRange(
          DATABASE_CONFIG.HEADER_ROW + 1,
          1,
          dataRowCount,
          lastCol
        )
        .getValues()
      : [];

    let tabCount = 0;

    values.forEach((r, i) => {
      const item = buildWebDatabaseRow_(sheetName, DATABASE_CONFIG.HEADER_ROW + 1 + i, r, headerMap);

      if (item.hasData) {
        total++;
        tabCount++;
        if (item.email) withEmail++;
        if (item.contact || item.spokeTo) withContact++;
        if (rows.length < visibleLimit) rows.push(item);
      }
    });

    if (rows.length < visibleLimit) {
      for (let i = 1; i <= 10 && rows.length < visibleLimit; i++) {
        rows.push(buildWebDatabaseRow_(
          sheetName,
          lastRow + i,
          [],
          headerMap
        ));
      }
    }

    tabs.push({
      name: sheetName,
      count: tabCount
    });
  });

  return {
    columns,
    rows,
    tabs,
    limited: total > rows.filter(r => r.hasData).length,
    visibleLimit,
    stats: {
      total,
      withEmail,
      withContact,
      tabs: tabs.length
    },
    updatedAt: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd MMM yyyy HH:mm'
    )
  };
}

function getWebDatabaseColumns_() {
  return [
    { key: 'company', label: 'Company', width: 260 },
    { key: 'phone', label: 'Phone number', width: 150 },
    { key: 'postcode', label: 'Post code', width: 130 },
    { key: 'address', label: 'Address', width: 270 },
    { key: 'email', label: 'Email', width: 250 },
    { key: 'website', label: 'Website', width: 250 },
    { key: 'linkedIn', label: 'LinkedIn', width: 250 },
    { key: 'spokeTo', label: 'Spoke to', width: 170 },
    { key: 'contact', label: 'Contact', width: 170 },
    { key: 'sourceUrl', label: 'Source URL', width: 250 },
    { key: 'confidence', label: 'Confidence', width: 120 },
    { key: 'notes', label: 'Notes', width: 320 }
  ];
}

function buildWebDatabaseRow_(sheetName, rowNumber, rowValues, headerMap) {
  const company = firstClean_([
    getByHeader_(rowValues, headerMap.company),
    rowValues[0],
    rowValues[1]
  ]);

  const item = {
    sourceSheet: sheetName,
    rowNumber,
    company,
    phone: clean_(getByHeader_(rowValues, headerMap.phone)),
    postcode: clean_(getByHeader_(rowValues, headerMap.postcode)),
    address: clean_(getByHeader_(rowValues, headerMap.address)),
    email: detectEmailFromDatabaseRow_(rowValues, headerMap),
    website: clean_(getByHeader_(rowValues, headerMap.website)),
    linkedIn: clean_(getByHeader_(rowValues, headerMap.linkedIn)),
    spokeTo: clean_(getByHeader_(rowValues, headerMap.spokeTo)),
    contact: firstClean_([
      getByHeader_(rowValues, headerMap.contact),
      getByHeader_(rowValues, headerMap.director)
    ]),
    sourceUrl: clean_(getByHeader_(rowValues, headerMap.sourceUrl)),
    confidence: clean_(getByHeader_(rowValues, headerMap.confidence)),
    notes: clean_(getByHeader_(rowValues, headerMap.notes))
  };

  item.hasData = getWebDatabaseColumns_().some(col => clean_(item[col.key]));
  return item;
}

function webAppGetWorkbookSchema(options) {
  const settings = options || {};
  const ss = getAegisWorkbook_();
  const includeSamples = settings.includeSamples === true || clean_(settings.includeSamples).toLowerCase() === 'true';
  const limit = Math.max(1, Math.min(100, Number(settings.limit) || 30));
  const sheetFilter = clean_(settings.sheetName || settings.sheet || settings.tab).toLowerCase();

  const sheets = ss.getSheets()
    .filter(sheet => !sheetFilter || sheet.getName().toLowerCase() === sheetFilter)
    .map(sheet => {
      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();
      const headers = lastColumn
        ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(clean_)
        : [];
      const info = {
        name: sheet.getName(),
        rows: lastRow,
        columns: lastColumn,
        headers,
        writable: true
      };

      if (includeSamples && lastRow > 1 && lastColumn > 0) {
        const sampleRows = Math.min(limit, lastRow - 1);
        info.samples = sheet.getRange(2, 1, sampleRows, lastColumn).getValues().map((row, index) => ({
          rowNumber: index + 2,
          values: row.map(clean_)
        }));
      }

      return info;
    });

  return {
    ok: true,
    workbookId: AEGIS_WORKBOOK_ID,
    workbookName: ss.getName(),
    sheets
  };
}

function webAppCreateSheetTab(payload) {
  const ss = getAegisWorkbook_();
  const sheetName = normaliseWritableSheetName_(payload.sheetName || payload.tabName || payload.name || payload.title);
  const headers = normaliseSheetHeaders_(payload.headers || payload.columns || payload.fields);
  const dryRun = payload && (payload.dryRun === true || clean_(payload.dryRun).toLowerCase() === 'true');
  const existing = ss.getSheetByName(sheetName);

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      created: !existing,
      existed: Boolean(existing),
      sheetName,
      headers
    };
  }

  const sheet = existing || ss.insertSheet(sheetName);

  if (headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  SpreadsheetApp.flush();
  clearWebAppStateCache_(['database']);

  return {
    ok: true,
    created: !existing,
    existed: Boolean(existing),
    sheetName,
    headers
  };
}

function webAppInsertSheetRows(payload) {
  const ss = getAegisWorkbook_();
  const sheetName = normaliseWritableSheetName_(payload.sheetName || payload.tabName || payload.sheet || payload.tab);
  const dryRun = payload && (payload.dryRun === true || clean_(payload.dryRun).toLowerCase() === 'true');
  const count = Math.max(1, Math.min(1000, Number(payload.count || payload.rowsToInsert || payload.numberOfRows) || 1));
  const beforeRow = Number(payload.beforeRow || payload.rowNumber || payload.row || 0);
  const afterRow = Number(payload.afterRow || 0);
  const insertBefore = beforeRow || (afterRow ? afterRow + 1 : 0);

  if (!insertBefore || insertBefore < 1) {
    throw new Error('insertSheetRows needs beforeRow, afterRow, or rowNumber.');
  }

  const sheet = ss.getSheetByName(sheetName);
  const lastRow = sheet ? sheet.getLastRow() : 0;
  const targetRow = Math.max(1, Math.min(insertBefore, Math.max(lastRow + 1, 1)));
  const insertRows = normaliseSheetRowsForInsertedRows_(payload, count);
  const rowPayload = {
    sheetName,
    headers: payload.headers || payload.columns || payload.fields,
    rows: insertRows
  };

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      sheetName,
      beforeRow: targetRow,
      count,
      rowsWithValues: rowPayload.rows.length
    };
  }

  const targetSheet = sheet || ss.insertSheet(sheetName);
  targetSheet.insertRowsBefore(targetRow, count);

  if (rowPayload.rows.length) {
    rowPayload.rows = rowPayload.rows.map((row, index) => Object.assign({}, row, {
      sheetName,
      rowNumber: targetRow + index
    }));
    webAppSaveSheetRows(rowPayload);
  }

  SpreadsheetApp.flush();
  clearWebAppStateCache_(['database']);

  return {
    ok: true,
    sheetName,
    beforeRow: targetRow,
    count,
    rowsWithValues: rowPayload.rows.length
  };
}

function webAppSaveSheetRows(payload) {
  const ss = getAegisWorkbook_();
  const dryRun = payload && (payload.dryRun === true || clean_(payload.dryRun).toLowerCase() === 'true');
  const rows = normaliseSheetRowUpdates_(payload);
  const defaultSheetName = clean_(payload.sheetName || payload.tabName || payload.sheet || payload.tab);
  const defaultHeaders = normaliseSheetHeaders_(payload.headers || payload.columns || payload.fields);
  let saved = 0;
  let appended = 0;
  let fieldsUpdated = 0;
  const results = [];

  rows.forEach(rowUpdate => {
    const sheetName = normaliseWritableSheetName_(rowUpdate.sheetName || rowUpdate.tabName || rowUpdate.sheet || rowUpdate.tab || defaultSheetName);
    const rowNumber = Number(rowUpdate.rowNumber || rowUpdate.row || 0);
    const rowValues = rowUpdate.values !== undefined ? rowUpdate.values : (rowUpdate.data !== undefined ? rowUpdate.data : rowUpdate);
    const isArrayRow = Array.isArray(rowValues);
    const objectValues = isArrayRow ? null : normaliseSheetRowObject_(rowValues);
    const headers = defaultHeaders.concat(normaliseSheetHeaders_(rowUpdate.headers || rowUpdate.columns || rowUpdate.fields));
    const existing = ss.getSheetByName(sheetName);
    const effectiveRowNumber = rowNumber || (existing ? Math.max(existing.getLastRow() + 1, 2) : 2);

    if (dryRun) {
      const fieldCount = isArrayRow ? rowValues.length : Object.keys(objectValues || {}).length;
      if (!rowNumber) appended++;
      if (fieldCount) {
        saved++;
        fieldsUpdated += fieldCount;
      }
      results.push({
        sheetName,
        rowNumber: rowNumber || '',
        wouldAppend: !rowNumber,
        fieldsUpdated: fieldCount,
        dryRun: true
      });
      return;
    }

    const sheet = existing || ss.insertSheet(sheetName);

    if (headers.length) {
      ensureGenericSheetHeaders_(sheet, headers);
    }

    if (!rowNumber) appended++;

    let rowFieldsUpdated = 0;
    if (isArrayRow) {
      const cleanValues = rowValues.map(clean_);
      if (cleanValues.length) {
        sheet.getRange(effectiveRowNumber, 1, 1, cleanValues.length).setValues([cleanValues]);
        rowFieldsUpdated = cleanValues.length;
      }
    } else {
      const headerMap = ensureGenericSheetHeaders_(sheet, Object.keys(objectValues || {}));
      Object.keys(objectValues || {}).forEach(key => {
        const col = headerMap[normaliseHeader_(key)];
        if (!col) return;
        sheet.getRange(effectiveRowNumber, col).setValue(clean_(objectValues[key]));
        rowFieldsUpdated++;
      });
    }

    if (rowFieldsUpdated) {
      saved++;
      fieldsUpdated += rowFieldsUpdated;
    }
    results.push({
      sheetName,
      rowNumber: effectiveRowNumber,
      appended: !rowNumber,
      fieldsUpdated: rowFieldsUpdated
    });
  });

  SpreadsheetApp.flush();
  clearWebAppStateCache_(['database']);

  return {
    ok: true,
    dryRun,
    saved,
    appended,
    fieldsUpdated,
    attempted: rows.length,
    results
  };
}

function webAppSaveSheetCells(payload) {
  const ss = getAegisWorkbook_();
  const dryRun = payload && (payload.dryRun === true || clean_(payload.dryRun).toLowerCase() === 'true');
  const cells = normaliseSheetCellUpdates_(payload);
  const defaultSheetName = clean_(payload.sheetName || payload.tabName || payload.sheet || payload.tab);
  let saved = 0;
  const results = [];

  cells.forEach(cell => {
    const sheetName = normaliseWritableSheetName_(cell.sheetName || cell.tabName || cell.sheet || cell.tab || defaultSheetName);
    const rangeA1 = clean_(cell.range || cell.a1 || cell.cell);
    if (!rangeA1) {
      throw new Error('saveSheetCells needs a range/cell, for example A2 or B2:D2.');
    }
    const values = cell.values !== undefined ? cell.values : cell.value;

    if (dryRun) {
      saved++;
      results.push({ sheetName, range: rangeA1, dryRun: true });
      return;
    }

    const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    const range = sheet.getRange(rangeA1);

    if (Array.isArray(values)) {
      const matrix = Array.isArray(values[0]) ? values : [values];
      range.setValues(matrix.map(row => row.map(clean_)));
    } else {
      range.setValue(clean_(values));
    }

    saved++;
    results.push({ sheetName, range: rangeA1 });
  });

  SpreadsheetApp.flush();
  clearWebAppStateCache_(['database']);

  return {
    ok: true,
    dryRun,
    saved,
    attempted: cells.length,
    results
  };
}

function webAppFindMultiCompanyCells(payload) {
  return scanMultiCompanyCells_(payload || {});
}

function webAppSplitMultiCompanyCells(payload) {
  const options = payload || {};
  const dryRun = options.dryRun === true || clean_(options.dryRun).toLowerCase() === 'true';
  const scan = scanMultiCompanyCells_(options);

  if (dryRun) {
    return Object.assign({}, scan, { dryRun: true });
  }

  const ss = getAegisWorkbook_();
  const changes = scan.matches.slice().sort((a, b) => b.rowNumber - a.rowNumber);
  let splitRows = 0;

  changes.forEach(match => {
    const sheet = ss.getSheetByName(match.sheetName);
    if (!sheet || match.companies.length < 2) return;

    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    const rowValues = sheet.getRange(match.rowNumber, 1, 1, lastColumn).getValues()[0];
    const companyColumn = match.companyColumn;
    applyParsedCompanyToRow_(rowValues, match.companies[0], match.headerMap);
    sheet.getRange(match.rowNumber, 1, 1, lastColumn).setValues([rowValues]);

    const extraCompanies = match.companies.slice(1);
    sheet.insertRowsAfter(match.rowNumber, extraCompanies.length);
    const newRows = extraCompanies.map(company => {
      const next = new Array(lastColumn).fill('');
      applyParsedCompanyToRow_(next, company, match.headerMap);
      return next;
    });
    sheet.getRange(match.rowNumber + 1, 1, newRows.length, lastColumn).setValues(newRows);
    splitRows += extraCompanies.length;
  });

  SpreadsheetApp.flush();
  clearWebAppStateCache_(['database']);

  return {
    ok: true,
    dryRun: false,
    scannedRows: scan.scannedRows,
    matchedRows: scan.matchedRows,
    insertedRows: splitRows,
    matches: scan.matches
  };
}

function scanMultiCompanyCells_(options) {
  const ss = getAegisWorkbook_();
  const sheetName = clean_(options.sheetName || options.sourceSheet || options.sheet || options.tab) || 'Database';
  const limit = Math.max(1, Math.min(10000, Number(options.limit) || 5000));
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  const headerMap = getHeaderMap_(sheet);
  const companyColumn = headerMap.company || 1;
  const lastRow = Math.min(sheet.getLastRow(), DATABASE_CONFIG.HEADER_ROW + limit);
  const rowCount = Math.max(lastRow - DATABASE_CONFIG.HEADER_ROW, 0);
  if (!rowCount) {
    return { ok: true, sheetName, scannedRows: 0, matchedRows: 0, matches: [] };
  }

  const companyValues = sheet
    .getRange(DATABASE_CONFIG.HEADER_ROW + 1, companyColumn, rowCount, 1)
    .getValues();
  const matches = [];

  companyValues.forEach((row, index) => {
    const rowNumber = DATABASE_CONFIG.HEADER_ROW + 1 + index;
    const original = clean_(row[0]);
    const companies = splitCompanyCellValue_(original);
    if (companies.length < 2) return;
    matches.push({
      sheetName,
      rowNumber,
      companyColumn,
      headerMap,
      original,
      companies,
      count: companies.length
    });
  });

  return {
    ok: true,
    sheetName,
    scannedRows: rowCount,
    matchedRows: matches.length,
    matches
  };
}

function splitCompanyCellValue_(value) {
  const text = clean_(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[•●▪]/g, '\n');

  if (!text) return [];

  const lineParts = text
    .split(/\n+/)
    .map(part => clean_(part).replace(/^\s*(?:[-*]|\d+[.)])\s*/, ''))
    .filter(Boolean);

  if (lineParts.length > 1) {
    return uniqueCleanCompanies_(lineParts);
  }

  const suffixMatches = Array.from(text.matchAll(/\b(?:LIMITED|LTD\.?|PLC|LLP|L\.L\.P\.|INC\.?|CORP\.?)\b/gi));
  if (suffixMatches.length < 2) return [text];
  if (/^\s*[A-Z0-9&.' -]+\s+(?:INC|LTD|LIMITED|PLC|LLP)\.?\s*$/i.test(text)) return [text];

  const parts = [];
  let start = 0;
  suffixMatches.forEach(match => {
    const end = match.index + match[0].length;
    const part = clean_(text.slice(start, end)).replace(/^[,&;|/-]+|[,;|/-]+$/g, '').trim();
    if (part) parts.push(part);
    start = end;
  });

  const tail = clean_(text.slice(start)).replace(/^[,&;|/-]+|[,;|/-]+$/g, '').trim();
  if (tail) parts.push(tail);

  return uniqueCleanCompanies_(parts);
}

function applyParsedCompanyToRow_(rowValues, companyText, headerMap) {
  const parsed = parseCompanyLine_(companyText);
  rowValues[(headerMap.company || 1) - 1] = parsed.company;
  if (parsed.phone && headerMap.phone) rowValues[headerMap.phone - 1] = parsed.phone;
  if (parsed.postcode && headerMap.postcode) rowValues[headerMap.postcode - 1] = parsed.postcode;
}

function parseCompanyLine_(companyText) {
  const parts = clean_(companyText).split(',').map(clean_).filter(Boolean);
  const postcodePattern = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
  const phonePattern = /^(?:\+?\d[\d\s().-]{6,}\d)$/;
  let postcode = '';
  let phone = '';
  const companyParts = [];

  parts.forEach(part => {
    if (!postcode && postcodePattern.test(part)) {
      postcode = part.toUpperCase();
    } else if (!phone && phonePattern.test(part)) {
      phone = part;
    } else {
      companyParts.push(part);
    }
  });

  return {
    company: companyParts.join(', ') || clean_(companyText),
    phone,
    postcode
  };
}

function uniqueCleanCompanies_(companies) {
  const seen = {};
  const output = [];
  companies.forEach(company => {
    const cleanCompany = clean_(company).replace(/\s{2,}/g, ' ');
    const key = cleanCompany.toLowerCase();
    if (!cleanCompany || seen[key]) return;
    seen[key] = true;
    output.push(cleanCompany);
  });
  return output;
}

function normaliseWritableSheetName_(value) {
  const sheetName = clean_(value);
  if (!sheetName) throw new Error('Sheet/tab name is required.');
  if (/[\[\]\*\?\/\\:]/.test(sheetName)) {
    throw new Error('Sheet/tab name contains characters Google Sheets does not allow.');
  }
  return sheetName.slice(0, 100);
}

function normaliseSheetHeaders_(headers) {
  if (!headers) return [];
  if (Array.isArray(headers)) return headers.map(clean_).filter(Boolean);
  return clean_(headers).split(/[,|\n]/).map(clean_).filter(Boolean);
}

function normaliseSheetRowUpdates_(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.records)) return payload.records;
  if (Array.isArray(payload.updates)) return payload.updates;
  if (payload.row && typeof payload.row === 'object') return [payload.row];
  if (payload.item && typeof payload.item === 'object') return [payload.item];
  return [payload];
}

function normaliseSheetRowsForInsertedRows_(payload, count) {
  const rows = [];
  if (Array.isArray(payload.rows)) {
    rows.push.apply(rows, payload.rows);
  } else if (Array.isArray(payload.values) && Array.isArray(payload.values[0])) {
    payload.values.slice(0, count).forEach(valueRow => rows.push({ values: valueRow }));
  } else if (Array.isArray(payload.values)) {
    rows.push({ values: payload.values });
  } else if (payload.values && typeof payload.values === 'object') {
    rows.push({ values: payload.values });
  } else if (payload.row && typeof payload.row === 'object') {
    rows.push(payload.row);
  }
  return rows.slice(0, count);
}

function normaliseSheetCellUpdates_(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.cells)) return payload.cells;
  if (Array.isArray(payload.ranges)) return payload.ranges;
  if (Array.isArray(payload.updates)) return payload.updates;
  if (payload.cell && typeof payload.cell === 'object') return [payload.cell];
  return [payload];
}

function normaliseSheetRowObject_(value) {
  const excluded = {
    action: true,
    access: true,
    key: true,
    aegis: true,
    confirmed: true,
    dryRun: true,
    sheetName: true,
    tabName: true,
    sheet: true,
    tab: true,
    rowNumber: true,
    row: true,
    headers: true,
    columns: true,
    fields: true
  };
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const output = {};
  Object.keys(source).forEach(key => {
    if (excluded[key]) return;
    const value = source[key];
    if (value === undefined || value === null) return;
    output[key] = value;
  });
  return output;
}

function ensureGenericSheetHeaders_(sheet, requestedHeaders) {
  const headerNames = normaliseSheetHeaders_(requestedHeaders);
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(clean_);
  let changed = false;

  headerNames.forEach(header => {
    if (!header) return;
    const normalised = normaliseHeader_(header);
    const exists = currentHeaders.some(current => normaliseHeader_(current) === normalised);
    if (exists) return;
    currentHeaders.push(header);
    changed = true;
  });

  if (changed) {
    sheet.getRange(1, 1, 1, currentHeaders.length).setValues([currentHeaders]);
    sheet.setFrozenRows(1);
  }

  const map = {};
  currentHeaders.forEach((header, index) => {
    const key = normaliseHeader_(header);
    if (key && !map[key]) map[key] = index + 1;
  });
  return map;
}

function webAppSaveDatabaseRows(updates) {
  const ss = getAegisWorkbook_();
  const columns = getWebDatabaseColumns_();
  const dryRun = updates && (updates.dryRun === true || clean_(updates.dryRun).toLowerCase() === 'true');
  const normalisedUpdates = normaliseDatabaseRowUpdates_(updates);
  let saved = 0;
  let appended = 0;
  let fieldsUpdated = 0;
  const results = [];

  normalisedUpdates.forEach(update => {
    const sheetName = clean_(update && (update.sourceSheet || update.sheet || update.tab)) || 'A';
    let rowNumber = Number(update && update.rowNumber);
    const values = normaliseDatabaseRowValues_(update);
    let sheet = ss.getSheetByName(sheetName);

    if (dryRun) {
      if (!rowNumber) appended++;
      const rowFieldsUpdated = columns.filter(col => Object.prototype.hasOwnProperty.call(values, col.key)).length;
      if (rowFieldsUpdated) {
        saved++;
        fieldsUpdated += rowFieldsUpdated;
      }
      results.push({
        sourceSheet: sheetName,
        rowNumber: rowNumber || '',
        company: values.company || '',
        fieldsUpdated: rowFieldsUpdated,
        dryRun: true
      });
      return;
    }

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(DATABASE_CONFIG.HEADER_ROW, 1, 1, columns.length).setValues([columns.map(col => col.label)]);
    }

    if (!rowNumber) {
      rowNumber = Math.max(sheet.getLastRow() + 1, DATABASE_CONFIG.HEADER_ROW + 1);
      appended++;
    }

    if (rowNumber <= DATABASE_CONFIG.HEADER_ROW) {
      return;
    }

    const headerMap = ensureDatabaseHeaders_(sheet, columns);
    let rowFieldsUpdated = 0;

    const clearFields = normaliseDatabaseClearFields_(update);
    clearFields.forEach(field => {
      const targetCol = getDatabaseColumnForWebField_(field, headerMap);
      if (!targetCol) return;
      sheet.getRange(rowNumber, targetCol).clearContent();
      rowFieldsUpdated++;
    });

    columns.forEach(col => {
      if (!Object.prototype.hasOwnProperty.call(values, col.key)) return;
      const targetCol = getDatabaseColumnForWebField_(col.key, headerMap);
      if (!targetCol) return;
      sheet.getRange(rowNumber, targetCol).setValue(clean_(values[col.key]));
      rowFieldsUpdated++;
    });

    if (rowFieldsUpdated) {
      saved++;
      fieldsUpdated += rowFieldsUpdated;
    }
    results.push({
      sourceSheet: sheetName,
      rowNumber,
      company: values.company || '',
      fieldsUpdated: rowFieldsUpdated
    });
  });

  SpreadsheetApp.flush();
  clearWebAppStateCache_(['database']);

  return {
    ok: true,
    dryRun,
    saved,
    appended,
    fieldsUpdated,
    attempted: normalisedUpdates.length,
    results
  };
}

function normaliseDatabaseRowUpdates_(updates) {
  if (!updates) return [];
  if (Array.isArray(updates)) return updates;
  if (Array.isArray(updates.rows)) return updates.rows;
  if (Array.isArray(updates.databaseRows)) return updates.databaseRows;
  if (Array.isArray(updates.database_rows)) return updates.database_rows;
  if (Array.isArray(updates.items)) return updates.items;
  if (Array.isArray(updates.records)) return updates.records;
  if (Array.isArray(updates.updates)) return updates.updates;
  if (updates.row && typeof updates.row === 'object') return [updates.row];
  if (updates.databaseUpdate && typeof updates.databaseUpdate === 'object') return [updates.databaseUpdate];
  if (updates.database_update && typeof updates.database_update === 'object') return [updates.database_update];
  return [updates];
}

function normaliseDatabaseRowValues_(update) {
  const source = Object.assign({}, update || {}, (update && update.values) || {});
  const values = {};
  getWebDatabaseColumns_().forEach(col => {
    const value = firstClean_([
      source[col.key],
      source[snakeCase_(col.key)],
      source[col.label],
      source[col.label.toLowerCase()],
      source[col.label.replace(/\s+/g, '')],
      databaseFieldAliasValue_(source, col.key)
    ]);
    if (value) values[col.key] = value;
  });
  return values;
}

function databaseFieldAliasValue_(source, key) {
  const aliases = {
    company: ['business', 'businessName', 'business_name', 'companyName', 'company_name'],
    phone: ['telephone', 'mobile', 'phoneNumber', 'phone_number', 'tel'],
    postcode: ['postCode', 'post_code', 'zip', 'zipCode'],
    address: ['streetAddress', 'street_address', 'registeredAddress', 'registered_address'],
    email: ['databaseEmail', 'database_email', 'companyEmail', 'company_email', 'contactEmail', 'contact_email', 'emailAddress', 'email_address', 'recipientEmail'],
    website: ['web', 'url', 'websiteUrl', 'website_url', 'officialWebsite', 'official_website', 'companyWebsite', 'company_website'],
    linkedIn: ['linkedin', 'linkedinUrl', 'linkedin_url', 'linkedInUrl', 'linked_in_url', 'linkedinPage', 'linkedin_page', 'linkedInPage'],
    spokeTo: ['spokeWith', 'spoke_with'],
    contact: ['contactName', 'contact_name', 'decisionMaker', 'decision_maker', 'person'],
    sourceUrl: ['source', 'sourceURL', 'source_url', 'researchSource', 'research_source', 'verifiedSource', 'verified_source', 'proofUrl', 'proof_url'],
    confidence: ['confidenceLevel', 'confidence_level', 'researchConfidence', 'research_confidence'],
    notes: ['note', 'researchNotes', 'research_notes', 'updateNotes', 'update_notes']
  };

  const keys = aliases[key] || [];
  return firstClean_(keys.map(alias => source[alias]));
}

function normaliseDatabaseClearFields_(update) {
  const raw = (update && (update.clearFields || update.clear || update.clear_fields)) || [];
  const items = Array.isArray(raw) ? raw : clean_(raw).split(/[,|]/);
  const allowed = getWebDatabaseColumns_().map(col => col.key);
  return items
    .map(item => {
      const clean = clean_(item);
      const snake = snakeCase_(clean);
      return allowed.find(key => key === clean || snakeCase_(key) === snake || snakeCase_(getWebDatabaseColumns_().find(col => col.key === key).label) === snake) || '';
    })
    .filter(Boolean);
}

function snakeCase_(value) {
  return clean_(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function ensureDatabaseHeaders_(sheet, columns) {
  let headerMap = getHeaderMap_(sheet);
  const headers = sheet.getRange(DATABASE_CONFIG.HEADER_ROW, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(clean_);
  let changed = false;

  columns.forEach(col => {
    if (getDatabaseColumnForWebField_(col.key, headerMap)) return;
    headers.push(col.label);
    changed = true;
  });

  if (changed) {
    sheet.getRange(DATABASE_CONFIG.HEADER_ROW, 1, 1, headers.length).setValues([headers]);
    headerMap = getHeaderMap_(sheet);
  }

  return headerMap;
}

function getDatabaseColumnForWebField_(key, headerMap) {
  const map = {
    company: headerMap.company || 1,
    phone: headerMap.phone || 2,
    postcode: headerMap.postcode || 3,
    address: headerMap.address || 4,
    email: headerMap.email || 5,
    website: headerMap.website || 0,
    linkedIn: headerMap.linkedIn || 0,
    spokeTo: headerMap.spokeTo || 6,
    contact: headerMap.contact || 7,
    sourceUrl: headerMap.sourceUrl || 0,
    confidence: headerMap.confidence || 0,
    notes: headerMap.notes || 8
  };

  return map[key] || 0;
}

function webAppGetDatabaseContext(options) {
  const settings = options || {};
  const limit = Math.max(1, Math.min(5000, Number(settings.limit) || 250));
  const sheetFilter = clean_(settings.sourceSheet || settings.sheet || settings.tab).toLowerCase();
  const query = clean_(settings.query || settings.search).toLowerCase();
  const withEmailOnly = settings.withEmailOnly === true || clean_(settings.emailOnly).toLowerCase() === 'true';
  const scanLimit = (query || withEmailOnly) ? 5000 : limit;
  const context = readDatabaseRowsForContext_(scanLimit, sheetFilter);
  let rows = context.rows || [];

  rows = rows.filter(row => {
    if (!row.hasData) return false;
    if (sheetFilter && clean_(row.sourceSheet).toLowerCase() !== sheetFilter) return false;
    if (withEmailOnly && !row.email) return false;
    if (query) {
      const haystack = [
        row.company,
        row.contact,
        row.email,
        row.phone,
        row.postcode,
        row.address,
        row.notes,
        row.sourceSheet
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return {
    ok: true,
    rows: rows.slice(0, limit),
    rowCount: rows.length,
    returned: Math.min(rows.length, limit),
    limited: rows.length > limit,
    tabs: context.tabs,
    columns: getWebDatabaseColumns_(),
    stats: context.stats,
    note: 'Database rows are companies/prospects. Use saveDatabaseRows to update existing rowNumber/sourceSheet or append new rows.'
  };
}

function readDatabaseRowsForContext_(limit, sheetFilter) {
  const ss = getAegisWorkbook_();
  const rows = [];
  const tabs = [];
  let total = 0;
  let withEmail = 0;
  let withContact = 0;

  ss.getSheets().forEach(sheet => {
    const sheetName = sheet.getName();
    if (sheetFilter && clean_(sheetName).toLowerCase() !== sheetFilter) return;
    if (DATABASE_CONFIG.EXCLUDED_SHEETS.indexOf(sheetName) >= 0 || sheetName === 'Dashboard') return;

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastCol < 1) return;

    const headerMap = getHeaderMap_(sheet);
    if (!headerMap.company) return;

    const dataRowCount = Math.max(lastRow - DATABASE_CONFIG.HEADER_ROW, 0);
    if (!dataRowCount) return;

    const values = sheet
      .getRange(DATABASE_CONFIG.HEADER_ROW + 1, 1, dataRowCount, lastCol)
      .getValues();

    let tabCount = 0;
    values.forEach((r, i) => {
      const item = buildWebDatabaseRow_(sheetName, DATABASE_CONFIG.HEADER_ROW + 1 + i, r, headerMap);
      if (!item.hasData) return;
      total++;
      tabCount++;
      if (item.email) withEmail++;
      if (item.contact || item.spokeTo) withContact++;
      if (rows.length < limit) rows.push(item);
    });

    tabs.push({ name: sheetName, count: tabCount });
  });

  return {
    rows,
    tabs,
    stats: {
      total,
      withEmail,
      withContact,
      tabs: tabs.length
    }
  };
}

function webAppGetCampaignEmailContext(options) {
  const settings = options || {};
  const limit = Math.max(1, Math.min(300, Number(settings.limit) || 100));
  const query = clean_(settings.query || settings.search).toLowerCase();
  let rows = buildWebAppState_().rows || [];

  rows = rows.map(row => campaignEmailContextRow_(row)).filter(row => {
    if (query) {
      const haystack = [row.company, row.contact, row.email, row.sequenceStatus, row.draftStatus, row.subject].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return {
    ok: true,
    rows: rows.slice(0, limit),
    rowCount: rows.length,
    returned: Math.min(rows.length, limit),
    limited: rows.length > limit,
    stats: buildCampaignEmailContextStats_(rows),
    nextInitialEmailCandidates: selectCampaignEmailBatchRows_({ count: 10, step: 1 }).map(row => campaignEmailContextRow_(row)),
    note: 'Use sendCampaignEmailBatch only after Aaron explicitly approves sending.'
  };
}

function campaignEmailContextRow_(row) {
  const lastStep = Number(row.lastSentStep) || 0;
  return Object.assign({}, row, {
    firstEmailSent: lastStep >= 1,
    followUp1Sent: lastStep >= 2,
    followUp2Sent: lastStep >= 3,
    canSendInitialEmail: Boolean(row.email && row.subject && row.initialEmail && lastStep === 0 && row.replyReceived !== 'Yes' && row.stopSequence !== 'Yes')
  });
}

function buildCampaignEmailContextStats_(rows) {
  return {
    total: rows.length,
    withDraft: rows.filter(row => row.subject && row.initialEmail).length,
    firstEmailSent: rows.filter(row => row.firstEmailSent).length,
    followUp1Sent: rows.filter(row => row.followUp1Sent).length,
    followUp2Sent: rows.filter(row => row.followUp2Sent).length,
    replied: rows.filter(row => clean_(row.replyReceived).toLowerCase() === 'yes').length,
    stopped: rows.filter(row => clean_(row.stopSequence).toLowerCase() === 'yes').length,
    readyForInitial: rows.filter(row => row.canSendInitialEmail).length
  };
}

function webAppSendCampaignEmailBatch(options) {
  const settings = options || {};
  const count = Math.max(1, Math.min(50, Number(settings.count) || 10));
  const step = Math.max(1, Math.min(3, Number(settings.step) || 1));
  const draftOnly = settings.draftOnly === true || clean_(settings.mode).toLowerCase() === 'draft';
  const rows = selectCampaignEmailBatchRows_(Object.assign({}, settings, { count, step }));
  const sheet = getCampaignSheet_();
  const now = new Date();
  const sent = [];
  const drafted = [];
  const skipped = [];

  rows.forEach(row => {
    const lead = getLeadFromRow_(sheet, row.rowNumber);
    const content = getEmailStepContent_(sheet, row.rowNumber, step);

    try {
      if (draftOnly) {
        const draft = GmailApp.createDraft(lead.email, content.subject, content.body, { name: 'Aaron' });
        sheet.getRange(row.rowNumber, CONFIG.COL_GMAIL_DRAFT_ID).setValue(draft.getId());
        sheet.getRange(row.rowNumber, CONFIG.COL_STATUS).setValue(`Gmail draft created for step ${step}`);
        drafted.push({ rowNumber: row.rowNumber, company: lead.company, email: lead.email, draftId: draft.getId() });
      } else {
        if (checkRepliesForRow_(sheet, row.rowNumber)) {
          skipped.push({ rowNumber: row.rowNumber, company: lead.company, reason: 'Reply already received' });
          return;
        }
        sendCampaignStep_(sheet, row.rowNumber, lead, step, content, now);
        sent.push({ rowNumber: row.rowNumber, company: lead.company, email: lead.email, step });
        Utilities.sleep(500);
      }
    } catch (error) {
      const message = String(error.message || error);
      sheet.getRange(row.rowNumber, CONFIG.COL_SEQUENCE_STATUS).setValue('Send error');
      sheet.getRange(row.rowNumber, CONFIG.COL_SEND_ERROR).setValue(message);
      skipped.push({ rowNumber: row.rowNumber, company: lead.company, reason: message });
    }
  });

  SpreadsheetApp.flush();
  clearWebAppStateCache_(['pipeline', 'opportunities']);

  return {
    ok: true,
    requested: count,
    selected: rows.length,
    draftOnly,
    step,
    sent,
    drafted,
    skipped
  };
}

function selectCampaignEmailBatchRows_(options) {
  const settings = options || {};
  const count = Math.max(1, Math.min(50, Number(settings.count) || 10));
  const step = Math.max(1, Math.min(3, Number(settings.step) || 1));
  const query = clean_(settings.query || settings.search).toLowerCase();

  return (buildWebAppState_().rows || []).filter(row => {
    const lastStep = Number(row.lastSentStep) || 0;
    const sequenceStatus = clean_(row.sequenceStatus).toLowerCase();
    const replyReceived = clean_(row.replyReceived).toLowerCase();
    const stopSequence = clean_(row.stopSequence).toLowerCase();
    const content = step === 1 ? row.initialEmail : step === 2 ? row.followUp1 : row.followUp2;

    if (!row.company || !row.email || !isValidEmail_(row.email)) return false;
    if (!row.subject || !content) return false;
    if (replyReceived === 'yes' || stopSequence === 'yes') return false;
    if (sequenceStatus.includes('replied') || sequenceStatus.includes('stopped') || sequenceStatus.includes('complete')) return false;
    if (lastStep >= step) return false;
    if (step > 1 && lastStep !== step - 1) return false;
    if (query) {
      const haystack = [row.company, row.contact, row.email, row.segment, row.sequenceStatus, row.draftStatus].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  }).slice(0, count);
}

function webAppMoveDatabaseRowsToCampaign(selection, alsoDraft) {
  const ss = getAegisWorkbook_();
  const campaignSheet = getCampaignSheet_();
  ensureCampaignHeaders_(campaignSheet);
  ensureHelperHeaders_(campaignSheet);

  const grouped = {};

  (selection || []).forEach(item => {
    const sheetName = clean_(item && item.sourceSheet);
    const rowNumber = Number(item && item.rowNumber);

    if (!sheetName || !rowNumber || rowNumber <= DATABASE_CONFIG.HEADER_ROW) return;
    if (!grouped[sheetName]) grouped[sheetName] = [];
    grouped[sheetName].push(rowNumber);
  });

  const moveItems = [];
  const skippedNoEmail = [];
  const skippedBlankCompany = [];

  Object.keys(grouped).forEach(sheetName => {
    const sourceSheet = ss.getSheetByName(sheetName);
    if (!sourceSheet) return;

    const headerMap = getHeaderMap_(sourceSheet);
    const rows = [...new Set(grouped[sheetName])].sort((a, b) => a - b);

    rows.forEach(row => {
      const lead = buildLeadFromDatabaseRow_(sourceSheet, row, headerMap);

      if (!lead.company) {
        skippedBlankCompany.push(`${sheetName}!${row}`);
        return;
      }

      if (!lead.email || !isValidEmail_(lead.email)) {
        skippedNoEmail.push(`${sheetName}!${row}`);
        return;
      }

      moveItems.push({
        sheetName,
        sourceRow: row,
        campaignRowValues: buildCampaignRowValues_(lead)
      });
    });
  });

  if (!moveItems.length) {
    return {
      moved: 0,
      drafted: 0,
      draftErrors: 0,
      skippedNoEmail,
      skippedBlankCompany
    };
  }

  const campaignStartRow = reserveCampaignRows_(campaignSheet, moveItems.length);
  const values = moveItems.map(item => item.campaignRowValues);

  campaignSheet
    .getRange(campaignStartRow, 1, values.length, CONFIG.COL_SEND_ERROR)
    .setValues(values);

  formatMovedCampaignRows_(campaignSheet, campaignStartRow, values.length);
  SpreadsheetApp.flush();

  Object.keys(grouped).forEach(sheetName => {
    const sourceSheet = ss.getSheetByName(sheetName);
    if (!sourceSheet) return;

    const rowsToDelete = moveItems
      .filter(item => item.sheetName === sheetName)
      .map(item => item.sourceRow)
      .sort((a, b) => b - a);

    deleteRowsBottomUp_(sourceSheet, rowsToDelete);
  });

  SpreadsheetApp.flush();

  let drafted = 0;
  let draftErrors = 0;

  if (alsoDraft) {
    for (let i = 0; i < values.length; i++) {
      const ok = draftLeadRow_(campaignSheet, campaignStartRow + i, false);
      if (ok) drafted++;
      else draftErrors++;
      Utilities.sleep(300);
    }
  } else {
    for (let i = 0; i < values.length; i++) {
      writeStatus_(campaignSheet, campaignStartRow + i, 'Moved - ready for AI draft', '');
    }
  }

  clearWebAppStateCache_(['database', 'pipeline', 'opportunities']);

  return {
    moved: moveItems.length,
    drafted,
    draftErrors,
    skippedNoEmail,
    skippedBlankCompany
  };
}

function webAppDraftRows(rowNumbers) {
  const sheet = getCampaignSheet_();
  let drafted = 0;
  let errors = 0;

  rowNumbers.forEach(row => {
    const ok = draftLeadRow_(sheet, Number(row), false);
    if (ok) drafted++;
    else errors++;
    Utilities.sleep(250);
  });

  clearWebAppStateCache_(['pipeline']);

  return { drafted, errors };
}

function webAppRegenerateRows(rowNumbers) {
  const sheet = getCampaignSheet_();
  let regenerated = 0;
  let errors = 0;

  rowNumbers.forEach(row => {
    const ok = draftLeadRow_(sheet, Number(row), true);
    if (ok) regenerated++;
    else errors++;
    Utilities.sleep(250);
  });

  clearWebAppStateCache_(['pipeline']);

  return { regenerated, errors };
}

function webAppScheduleRows(rowNumbers, firstSendAtText) {
  const sheet = getCampaignSheet_();
  const sendAt = parseScheduleDate_(firstSendAtText);

  if (!sendAt) {
    throw new Error('Use date/time format YYYY-MM-DD HH:MM');
  }

  let scheduled = 0;
  let skipped = 0;

  rowNumbers.forEach(row => {
    row = Number(row);

    const lead = getLeadFromRow_(sheet, row);
    const subject = clean_(sheet.getRange(row, CONFIG.COL_SUBJECT).getValue());
    const body = clean_(sheet.getRange(row, CONFIG.COL_INITIAL_EMAIL).getValue());

    if (!lead.company || !lead.email || !isValidEmail_(lead.email) || !subject || !body) {
      skipped++;
      return;
    }

    if (shouldSuppressLead_(lead)) {
      sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Suppressed');
      sheet.getRange(row, CONFIG.COL_STOP_SEQUENCE).setValue('Yes');
      skipped++;
      return;
    }

    sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Active');
    sheet.getRange(row, CONFIG.COL_NEXT_SEND_AT).setValue(sendAt);
    sheet.getRange(row, CONFIG.COL_LAST_SENT_STEP).setValue(0);
    sheet.getRange(row, CONFIG.COL_REPLY_RECEIVED).setValue('No');
    sheet.getRange(row, CONFIG.COL_STOP_SEQUENCE).setValue('No');
    sheet.getRange(row, CONFIG.COL_SEND_ERROR).setValue('');

    scheduled++;
  });

  clearWebAppStateCache_(['pipeline']);

  return { scheduled, skipped };
}

function webAppPauseRows(rowNumbers) {
  const sheet = getCampaignSheet_();

  rowNumbers.forEach(row => {
    row = Number(row);
    sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Paused manually');
    sheet.getRange(row, CONFIG.COL_STOP_SEQUENCE).setValue('Yes');
    sheet.getRange(row, CONFIG.COL_NEXT_SEND_AT).setValue('');
  });

  clearWebAppStateCache_(['pipeline']);

  return { paused: rowNumbers.length };
}

function webAppResumeRows(rowNumbers) {
  const sheet = getCampaignSheet_();

  rowNumbers.forEach(row => {
    row = Number(row);
    sheet.getRange(row, CONFIG.COL_SEQUENCE_STATUS).setValue('Active');
    sheet.getRange(row, CONFIG.COL_STOP_SEQUENCE).setValue('No');
  });

  clearWebAppStateCache_(['pipeline']);

  return { resumed: rowNumbers.length };
}

function webAppSendDueNow() {
  sendDueCampaignEmails();
  clearWebAppStateCache_(['pipeline', 'opportunities']);
  return { ok: true };
}

function webAppCheckReplies() {
  const sheet = getCampaignSheet_();
  const lastRow = sheet.getLastRow();
  let paused = 0;

  for (let row = CONFIG.FIRST_LEAD_ROW; row <= lastRow; row++) {
    if (checkRepliesForRow_(sheet, row)) paused++;
    Utilities.sleep(100);
  }

  clearWebAppStateCache_(['pipeline', 'opportunities']);

  return { paused };
}

function webAppSyncOpportunities() {
  const synced = syncRepliesToOpportunities_();
  clearWebAppStateCache_(['pipeline', 'opportunities', 'calendar']);
  return { synced };
}

function webAppGetOpportunitiesState() {
  return cachedWebAppState_('opportunities', buildWebAppOpportunitiesState_);
}

function buildWebAppOpportunitiesState_() {
  const sheet = getOpportunitySheet_();
  const lastRow = sheet.getLastRow();
  const opportunities = [];

  if (lastRow >= OPPORTUNITY_CONFIG.FIRST_ROW) {
    const values = sheet
      .getRange(
        OPPORTUNITY_CONFIG.FIRST_ROW,
        1,
        lastRow - OPPORTUNITY_CONFIG.FIRST_ROW + 1,
        OPPORTUNITY_CONFIG.COL_ERROR
      )
      .getValues();

    values.forEach(r => {
      const item = buildWebOpportunity_(r);
      if (item.id && item.company) opportunities.push(item);
    });
  }

  return {
    opportunities,
    stats: buildOpportunityStats_(opportunities),
    updatedAt: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'dd MMM yyyy HH:mm'
    )
  };
}

function webAppGetCalendarState() {
  return cachedWebAppState_('calendar', buildWebAppCalendarState_);
}

function buildWebAppCalendarState_() {
  const bookingLink = getCalendarBookingLink_();
  const now = new Date();
  const until = addDays_(now, 30);
  const events = [];
  const opportunities = buildWebAppOpportunitiesState_().opportunities;

  try {
    const calendar = CalendarApp.getDefaultCalendar();
    const calendarEvents = calendar.getEvents(now, until);

    calendarEvents.forEach(event => {
      const guests = [];

      try {
        event.getGuestList().forEach(guest => {
          guests.push({
            email: clean_(guest.getEmail && guest.getEmail()),
            name: clean_(guest.getName && guest.getName())
          });
        });
      } catch (err) {}

      const title = clean_(event.getTitle());
      const description = clean_(event.getDescription());
      const match = findOpportunityForCalendarEvent_(opportunities, title, description, guests);

      events.push({
        id: event.getId(),
        title,
        start: formatCalendarDate_(event.getStartTime()),
        end: formatCalendarDate_(event.getEndTime()),
        location: clean_(event.getLocation()),
        description,
        guests,
        opportunityId: match ? match.id : '',
        company: match ? match.company : '',
        contact: match ? match.contact : '',
        stage: match ? match.stage : ''
      });
    });
  } catch (err) {
    return {
      bookingLink,
      events: [],
      stats: {
        upcoming: 0,
        today: 0,
        linked: 0,
        thisWeek: 0
      },
      error: String(err.message || err),
      updatedAt: Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd MMM yyyy HH:mm')
    };
  }

  return {
    bookingLink,
    events,
    stats: buildCalendarStats_(events, now),
    updatedAt: Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd MMM yyyy HH:mm')
  };
}

function webAppSetCalendarBookingLink(url) {
  const bookingLink = clean_(url);

  if (bookingLink && !/^https?:\/\/\S+$/i.test(bookingLink)) {
    throw new Error('Booking link must start with https://');
  }

  PropertiesService.getScriptProperties().setProperty('CALENDAR_BOOKING_LINK', bookingLink);
  clearWebAppStateCache_(['calendar']);

  return {
    ok: true,
    bookingLink
  };
}

function findOpportunityForCalendarEvent_(opportunities, title, description, guests) {
  const haystack = [
    title,
    description,
    guests.map(g => `${g.name} ${g.email}`).join(' ')
  ].join(' ').toLowerCase();

  return opportunities.find(opportunity => {
    const email = clean_(opportunity.email).toLowerCase();
    const company = clean_(opportunity.company).toLowerCase();
    const contact = clean_(opportunity.contact).toLowerCase();

    if (email && haystack.includes(email)) return true;
    if (company && haystack.includes(company)) return true;
    if (contact && haystack.includes(contact)) return true;
    return false;
  }) || null;
}

function buildCalendarStats_(events, now) {
  const todayKey = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const weekEnd = addDays_(now, 7);

  return {
    upcoming: events.length,
    today: events.filter(event => event.start && event.start.slice(0, 10) === todayKey).length,
    linked: events.filter(event => event.opportunityId).length,
    thisWeek: events.filter(event => {
      const date = parseWebDate_(event.start);
      return date && date <= weekEnd;
    }).length
  };
}

function formatCalendarDate_(value) {
  if (!(value instanceof Date)) return '';
  return Utilities.formatDate(
    value,
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm'
  );
}

function parseWebDate_(value) {
  const text = clean_(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);

  if (!match) return null;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  );

  return isNaN(date.getTime()) ? null : date;
}

function buildOpportunityStats_(opportunities) {
  return {
    total: opportunities.length,
    newReplies: opportunities.filter(o => o.stage === 'New Reply').length,
    drafted: opportunities.filter(o => o.aiReplyDraft).length,
    needsReview: opportunities.filter(o => o.stage === 'AI Reply Drafted' || o.stage === 'Needs Review').length,
    callBooked: opportunities.filter(o => o.stage === 'Call Booked').length,
    won: opportunities.filter(o => o.stage === 'Won').length
  };
}

function webAppDraftOpportunityReply(opportunityId) {
  const found = getOpportunityById_(opportunityId);
  const result = callOpenAIForReplyDraft_(found.opportunity);
  const stage = clean_(result.stage_recommendation) || 'AI Reply Drafted';

  found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_STAGE).setValue(stage);
  found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_CLASSIFICATION).setValue(clean_(result.classification));
  found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_AI_REPLY_DRAFT).setValue(clean_(result.reply_draft));
  found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_NEXT_ACTION).setValue(clean_(result.next_action));
  found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_UPDATED_AT).setValue(new Date());
  found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_ERROR).setValue('');
  clearWebAppStateCache_(['opportunities', 'calendar']);

  return {
    ok: true,
    id: opportunityId
  };
}

function webAppUpdateOpportunity(opportunityId, updates) {
  const found = getOpportunityById_(opportunityId);

  if (Object.prototype.hasOwnProperty.call(updates || {}, 'stage')) {
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_STAGE).setValue(clean_(updates.stage));
  }

  if (Object.prototype.hasOwnProperty.call(updates || {}, 'classification')) {
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_CLASSIFICATION).setValue(clean_(updates.classification));
  }

  if (Object.prototype.hasOwnProperty.call(updates || {}, 'aiReplyDraft')) {
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_AI_REPLY_DRAFT).setValue(clean_(updates.aiReplyDraft));
  }

  if (Object.prototype.hasOwnProperty.call(updates || {}, 'nextAction')) {
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_NEXT_ACTION).setValue(clean_(updates.nextAction));
  }

  if (Object.prototype.hasOwnProperty.call(updates || {}, 'ownerNotes')) {
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_OWNER_NOTES).setValue(clean_(updates.ownerNotes));
  }

  found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_UPDATED_AT).setValue(new Date());
  found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_ERROR).setValue('');
  clearWebAppStateCache_(['opportunities', 'calendar']);

  return {
    ok: true,
    id: opportunityId
  };
}

function webAppCreateOpportunityGmailDraft(opportunityId, updates) {
  const found = getOpportunityById_(opportunityId);
  const opportunity = found.opportunity;
  const draftBody = Object.prototype.hasOwnProperty.call(updates || {}, 'aiReplyDraft')
    ? clean_(updates.aiReplyDraft)
    : clean_(opportunity.aiReplyDraft);
  const stage = Object.prototype.hasOwnProperty.call(updates || {}, 'stage')
    ? clean_(updates.stage)
    : clean_(opportunity.stage);
  const classification = Object.prototype.hasOwnProperty.call(updates || {}, 'classification')
    ? clean_(updates.classification)
    : clean_(opportunity.classification);
  const nextAction = Object.prototype.hasOwnProperty.call(updates || {}, 'nextAction')
    ? clean_(updates.nextAction)
    : clean_(opportunity.nextAction);
  const ownerNotes = Object.prototype.hasOwnProperty.call(updates || {}, 'ownerNotes')
    ? clean_(updates.ownerNotes)
    : clean_(opportunity.ownerNotes);

  if (!opportunity.email || !isValidEmail_(opportunity.email)) {
    throw new Error('Opportunity is missing a valid email address.');
  }

  if (!draftBody) {
    throw new Error('Draft an AI reply first, or write a reply in the box.');
  }

  const subject = opportunity.campaignSubject
    ? `Re: ${opportunity.campaignSubject.replace(/^Re:\s*/i, '')}`
    : `Re: ${opportunity.company}`;

  try {
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_STAGE).setValue(stage || 'Needs Review');
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_CLASSIFICATION).setValue(classification);
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_AI_REPLY_DRAFT).setValue(draftBody);
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_NEXT_ACTION).setValue(nextAction);
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_OWNER_NOTES).setValue(ownerNotes);

    SpreadsheetApp.flush();

    const draft = GmailApp.createDraft(
      opportunity.email,
      subject,
      draftBody,
      {
        name: 'Aaron'
      }
    );

    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_GMAIL_DRAFT_ID).setValue(draft.getId());
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_STAGE).setValue('Needs Review');
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_UPDATED_AT).setValue(new Date());
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_ERROR).setValue('');
    clearWebAppStateCache_(['opportunities', 'calendar']);

    return {
      ok: true,
      draftId: draft.getId(),
      to: opportunity.email,
      subject
    };
  } catch (err) {
    const message = String(err.message || err);
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_ERROR).setValue(message);
    throw new Error(`Could not create Gmail draft: ${message}`);
  }
}

function webAppSendOpportunityReply(opportunityId, updates) {
  const found = getOpportunityById_(opportunityId);
  const opportunity = found.opportunity;
  const body = Object.prototype.hasOwnProperty.call(updates || {}, 'aiReplyDraft')
    ? clean_(updates.aiReplyDraft)
    : clean_(opportunity.aiReplyDraft);
  const classification = Object.prototype.hasOwnProperty.call(updates || {}, 'classification')
    ? clean_(updates.classification)
    : clean_(opportunity.classification);
  const nextAction = Object.prototype.hasOwnProperty.call(updates || {}, 'nextAction')
    ? clean_(updates.nextAction)
    : clean_(opportunity.nextAction);
  const ownerNotes = Object.prototype.hasOwnProperty.call(updates || {}, 'ownerNotes')
    ? clean_(updates.ownerNotes)
    : clean_(opportunity.ownerNotes);

  if (!opportunity.email || !isValidEmail_(opportunity.email)) {
    throw new Error('Opportunity is missing a valid email address.');
  }

  if (!body) {
    throw new Error('Draft or write a reply before sending.');
  }

  const subject = opportunity.campaignSubject
    ? `Re: ${opportunity.campaignSubject.replace(/^Re:\s*/i, '')}`
    : `Re: ${opportunity.company}`;

  try {
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_CLASSIFICATION).setValue(classification);
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_AI_REPLY_DRAFT).setValue(body);
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_NEXT_ACTION).setValue(nextAction);
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_OWNER_NOTES).setValue(ownerNotes);

    if (opportunity.gmailThreadId) {
      const thread = GmailApp.getThreadById(opportunity.gmailThreadId);
      thread.reply(body, {
        name: 'Aaron'
      });
    } else {
      GmailApp.sendEmail(opportunity.email, subject, body, {
        name: 'Aaron'
      });
    }

    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_STAGE).setValue('Reply Sent');
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_UPDATED_AT).setValue(new Date());
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_ERROR).setValue('');
    clearWebAppStateCache_(['opportunities', 'calendar']);

    return {
      ok: true,
      to: opportunity.email,
      subject
    };
  } catch (err) {
    const message = String(err.message || err);
    found.sheet.getRange(found.row, OPPORTUNITY_CONFIG.COL_ERROR).setValue(message);
    throw new Error(`Could not send reply: ${message}`);
  }
}

function webAppCreateDraftRows(rowNumbers) {
  const sheet = getCampaignSheet_();
  let created = 0;
  let skipped = 0;

  rowNumbers.forEach(row => {
    const ok = createGmailDraftForRow_(sheet, Number(row));
    if (ok) created++;
    else skipped++;
    Utilities.sleep(200);
  });

  clearWebAppStateCache_(['pipeline']);

  return { created, skipped };
}

function webAppUpdateDraft(rowNumber, draft) {
  const sheet = getCampaignSheet_();
  const row = Number(rowNumber);

  if (!row || row < CONFIG.FIRST_LEAD_ROW) {
    throw new Error('Select a valid campaign row first.');
  }

  const lead = getLeadFromRow_(sheet, row);

  if (!lead.company) {
    throw new Error('Could not find a company on that campaign row.');
  }

  const values = [
    clean_(draft && draft.subject),
    clean_(draft && draft.initialEmail),
    clean_(draft && draft.followUp1),
    clean_(draft && draft.followUp2),
    clean_(draft && draft.callScript)
  ];

  sheet
    .getRange(row, CONFIG.COL_SUBJECT, 1, 5)
    .setValues([values]);

  writeStatus_(sheet, row, 'Edited in web app - ready for review', '');
  clearWebAppStateCache_(['pipeline']);

  return {
    ok: true,
    rowNumber: row
  };
}

function formatWebDate_(value) {
  if (!(value instanceof Date)) return '';
  return Utilities.formatDate(
    value,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm"
  );
}
