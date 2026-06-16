const EMAIL_AGENT_SPREADSHEET_ID = "PASTE_AGENT_SPREADSHEET_ID_HERE";
const AGENT_INBOX_SHEET = "Email Agent Inbox";
const AGENT_ACTIONS_SHEET = "Email Agent Actions";
const AGENT_SETTINGS_SHEET = "Email Agent Settings";
const AGENT_PROCESSED_LABEL = "aegis-agent-processed";
const AGENT_DRAFTED_LABEL = "aegis-agent-drafted";
const AGENT_MANUAL_REVIEW_LABEL = "aegis-agent-manual-review";
const MAX_EMAILS_PER_SCAN = 5;

const AGENT_INBOX_HEADERS = [
  "Agent Item ID",
  "Created At",
  "Gmail Thread ID",
  "Gmail Message ID",
  "From",
  "Subject",
  "Summary",
  "Suggested Reply",
  "Priority",
  "Risk Level",
  "Status",
  "WhatsApp Message SID",
  "Last Action",
  "Draft ID",
  "Notes",
];

const AGENT_ACTION_HEADERS = [
  "Action ID",
  "Timestamp",
  "Agent Item ID",
  "Inbound Text",
  "Action",
  "Status",
  "Details",
];

const AGENT_SETTINGS_HEADERS = [
  "Setting",
  "Value",
  "Notes",
];

function agentGetWorkbook() {
  return SpreadsheetApp.openById(EMAIL_AGENT_SPREADSHEET_ID);
}

function agentGetOrCreateSheet(name) {
  const workbook = agentGetWorkbook();
  return workbook.getSheetByName(name) || workbook.insertSheet(name);
}

function agentEnsureHeaders(sheet, headers) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const existing = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].filter(String);
  const next = existing.slice();

  headers.forEach((header) => {
    if (!next.includes(header)) {
      next.push(header);
    }
  });

  sheet.getRange(1, 1, 1, next.length).setValues([next]);
  sheet.getRange(1, 1, 1, next.length).setFontWeight("bold");
  return next;
}

function agentRowFromObject(headers, values) {
  return headers.map((header) => values[header] || "");
}

function agentNormalise(value) {
  return String(value || "").trim().toLowerCase();
}

function agentCreateJson(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function agentGetProperty(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) {
    throw new Error(`Missing script property: ${name}`);
  }
  return value;
}

function agentGenerateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function agentGetOrCreateGmailLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function agentLogAction(agentItemId, inboundText, action, status, details) {
  const sheet = agentGetOrCreateSheet(AGENT_ACTIONS_SHEET);
  const headers = agentEnsureHeaders(sheet, AGENT_ACTION_HEADERS);

  sheet.appendRow(agentRowFromObject(headers, {
    "Action ID": agentGenerateId("ACT"),
    "Timestamp": new Date(),
    "Agent Item ID": agentItemId || "",
    "Inbound Text": inboundText || "",
    "Action": action || "",
    "Status": status || "",
    "Details": details || "",
  }));
}

function agentSetupSheets() {
  agentEnsureHeaders(agentGetOrCreateSheet(AGENT_INBOX_SHEET), AGENT_INBOX_HEADERS);
  agentEnsureHeaders(agentGetOrCreateSheet(AGENT_ACTIONS_SHEET), AGENT_ACTION_HEADERS);
  const settingsSheet = agentGetOrCreateSheet(AGENT_SETTINGS_SHEET);
  const settingsHeaders = agentEnsureHeaders(settingsSheet, AGENT_SETTINGS_HEADERS);

  if (settingsSheet.getLastRow() === 1) {
    settingsSheet.appendRow(agentRowFromObject(settingsHeaders, {
      "Setting": "search_query",
      "Value": `is:unread -label:${AGENT_PROCESSED_LABEL} newer_than:2d`,
      "Notes": "Gmail search query used by scanUnreadEmails.",
    }));
    settingsSheet.appendRow(agentRowFromObject(settingsHeaders, {
      "Setting": "send_command_enabled",
      "Value": "false",
      "Notes": "Keep false for MVP. Command 2 creates manual-review draft instead of sending.",
    }));
  }

  agentGetOrCreateGmailLabel(AGENT_PROCESSED_LABEL);
  agentGetOrCreateGmailLabel(AGENT_DRAFTED_LABEL);
  agentGetOrCreateGmailLabel(AGENT_MANUAL_REVIEW_LABEL);

  return agentCreateJson({ ok: true, message: "Email Agent sheets and Gmail labels are ready." });
}

function agentGetSetting(key, fallback) {
  const sheet = agentGetOrCreateSheet(AGENT_SETTINGS_SHEET);
  const values = sheet.getDataRange().getValues();

  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][0]) === key) {
      return values[index][1] || fallback;
    }
  }

  return fallback;
}

function agentExtractPlainThread(thread) {
  const messages = thread.getMessages();
  const latest = messages[messages.length - 1];
  const body = latest.getPlainBody().replace(/\s+/g, " ").slice(0, 6000);

  return {
    thread,
    latest,
    from: latest.getFrom(),
    subject: latest.getSubject(),
    body,
  };
}

function agentShouldSkipEmail(emailData) {
  const text = agentNormalise(`${emailData.from} ${emailData.subject}`);
  const skipWords = [
    "no-reply",
    "noreply",
    "newsletter",
    "promotion",
    "unsubscribe",
    "receipt",
    "security alert",
  ];

  return skipWords.some((word) => text.includes(word));
}

function agentAnalyzeEmail(emailData) {
  const apiKey = agentGetProperty("OPENAI_API_KEY");
  const model = PropertiesService.getScriptProperties().getProperty("OPENAI_MODEL") || "gpt-4.1-mini";
  const prompt = [
    "You are Aegis WhatsApp Email Agent.",
    "Analyze this email thread and return strict JSON only.",
    "",
    "JSON schema:",
    "{",
    '  "summary": "one or two short sentences",',
    '  "intent": "what the sender wants",',
    '  "priority": "low|medium|high",',
    '  "risk_level": "normal|sensitive|manual_review",',
    '  "action_required": true,',
    '  "suggested_reply": "a concise human reply",',
    '  "reason": "why this priority/risk was chosen"',
    "}",
    "",
    "Never suggest sending sensitive legal, medical, financial, security, complaint, or HR replies automatically. Mark those manual_review.",
    "",
    `From: ${emailData.from}`,
    `Subject: ${emailData.subject}`,
    `Body: ${emailData.body}`,
  ].join("\n");

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    payload: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: "json_object",
        },
      },
    }),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(`OpenAI request failed: ${code} ${body}`);
  }

  const parsed = JSON.parse(body);
  const outputText = agentExtractOpenAiOutput(parsed);
  if (!outputText) {
    throw new Error(`OpenAI response did not include output_text: ${body}`);
  }

  return JSON.parse(outputText);
}

function agentExtractOpenAiOutput(parsed) {
  if (parsed.output_text) {
    return parsed.output_text;
  }

  if (!parsed.output || !parsed.output.length) {
    return "";
  }

  for (let outputIndex = 0; outputIndex < parsed.output.length; outputIndex += 1) {
    const output = parsed.output[outputIndex];
    if (!output.content || !output.content.length) {
      continue;
    }

    for (let contentIndex = 0; contentIndex < output.content.length; contentIndex += 1) {
      const content = output.content[contentIndex];
      if (content.text) {
        return content.text;
      }
    }
  }

  return "";
}

function agentSendWhatsApp(message) {
  const accountSid = agentGetProperty("TWILIO_ACCOUNT_SID");
  const authToken = agentGetProperty("TWILIO_AUTH_TOKEN");
  const from = agentGetProperty("TWILIO_WHATSAPP_FROM");
  const to = agentGetProperty("AARON_WHATSAPP_TO");
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const response = UrlFetchApp.fetch(endpoint, {
    method: "post",
    headers: {
      Authorization: `Basic ${Utilities.base64Encode(`${accountSid}:${authToken}`)}`,
    },
    payload: {
      From: from,
      To: to,
      Body: message,
    },
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  const body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error(`Twilio request failed: ${code} ${body}`);
  }

  return JSON.parse(body).sid || "";
}

function agentFormatWhatsAppMessage(agentItemId, emailData, analysis) {
  return [
    `New email from ${emailData.from}`,
    "",
    `ID: ${agentItemId}`,
    "",
    "Summary:",
    analysis.summary || "",
    "",
    "Suggested reply:",
    analysis.suggested_reply || "",
    "",
    "Reply with:",
    "1 = Create Gmail draft",
    "2 = Send email (disabled for MVP)",
    "3 = Ignore",
    "4 = Rewrite",
  ].join("\n");
}

function scanUnreadEmails() {
  agentSetupSheets();
  const processedLabel = agentGetOrCreateGmailLabel(AGENT_PROCESSED_LABEL);
  const manualReviewLabel = agentGetOrCreateGmailLabel(AGENT_MANUAL_REVIEW_LABEL);
  const query = agentGetSetting("search_query", `is:unread -label:${AGENT_PROCESSED_LABEL} newer_than:2d`);
  const threads = GmailApp.search(query, 0, MAX_EMAILS_PER_SCAN);
  const result = {
    ok: true,
    scanned: threads.length,
    sentToWhatsApp: 0,
    skipped: 0,
    errors: [],
  };

  threads.forEach((thread) => {
    try {
      const emailData = agentExtractPlainThread(thread);

      if (agentShouldSkipEmail(emailData)) {
        thread.addLabel(processedLabel);
        result.skipped += 1;
        return;
      }

      const analysis = agentAnalyzeEmail(emailData);
      const agentItemId = agentGenerateId("EMAIL");
      const message = agentFormatWhatsAppMessage(agentItemId, emailData, analysis);
      const whatsAppSid = agentSendWhatsApp(message);
      const savedId = agentAppendInboxItemWithId(agentItemId, emailData, analysis, whatsAppSid);

      thread.addLabel(processedLabel);
      if (analysis.risk_level === "manual_review" || analysis.risk_level === "sensitive") {
        thread.addLabel(manualReviewLabel);
      }

      agentLogAction(savedId, "", "send_whatsapp_summary", "success", emailData.subject);
      result.sentToWhatsApp += 1;
    } catch (error) {
      result.errors.push(error.message);
    }
  });

  return result;
}

function agentAppendInboxItemWithId(agentItemId, emailData, analysis, whatsAppSid) {
  const sheet = agentGetOrCreateSheet(AGENT_INBOX_SHEET);
  const headers = agentEnsureHeaders(sheet, AGENT_INBOX_HEADERS);

  sheet.appendRow(agentRowFromObject(headers, {
    "Agent Item ID": agentItemId,
    "Created At": new Date(),
    "Gmail Thread ID": emailData.thread.getId(),
    "Gmail Message ID": emailData.latest.getId(),
    "From": emailData.from,
    "Subject": emailData.subject,
    "Summary": analysis.summary || "",
    "Suggested Reply": analysis.suggested_reply || "",
    "Priority": analysis.priority || "medium",
    "Risk Level": analysis.risk_level || "normal",
    "Status": "WhatsApp Sent",
    "WhatsApp Message SID": whatsAppSid || "",
    "Last Action": "Sent WhatsApp summary",
    "Draft ID": "",
    "Notes": analysis.reason || "",
  }));

  return agentItemId;
}

function agentGetInboxContext() {
  const sheet = agentGetOrCreateSheet(AGENT_INBOX_SHEET);
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);

  return { sheet, values, headers };
}

function agentFindLatestOpenItem() {
  const context = agentGetInboxContext();
  const statusIndex = context.headers.indexOf("Status");
  const idIndex = context.headers.indexOf("Agent Item ID");

  for (let rowIndex = context.values.length - 1; rowIndex >= 1; rowIndex -= 1) {
    const status = context.values[rowIndex][statusIndex];
    if (["WhatsApp Sent", "Rewrite Requested", "Manual Review"].includes(String(status))) {
      return {
        context,
        row: context.values[rowIndex],
        rowNumber: rowIndex + 1,
        agentItemId: context.values[rowIndex][idIndex],
      };
    }
  }

  return null;
}

function agentGetCell(row, headers, header) {
  const index = headers.indexOf(header);
  return index === -1 ? "" : row[index];
}

function agentUpdateRow(sheet, headers, rowNumber, updates) {
  Object.keys(updates).forEach((header) => {
    const index = headers.indexOf(header);
    if (index !== -1) {
      sheet.getRange(rowNumber, index + 1).setValue(updates[header]);
    }
  });
}

function agentCreateDraft(item) {
  const headers = item.context.headers;
  const thread = GmailApp.getThreadById(agentGetCell(item.row, headers, "Gmail Thread ID"));
  const message = GmailApp.getMessageById(agentGetCell(item.row, headers, "Gmail Message ID"));
  const replyBody = agentGetCell(item.row, headers, "Suggested Reply");
  const subject = agentGetCell(item.row, headers, "Subject");
  const from = agentGetCell(item.row, headers, "From");
  const emailMatch = String(from).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const to = emailMatch ? emailMatch[0] : from;
  const draft = message.createDraftReply(replyBody, {
    subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    to,
  });
  const draftedLabel = agentGetOrCreateGmailLabel(AGENT_DRAFTED_LABEL);

  thread.addLabel(draftedLabel);
  agentUpdateRow(item.context.sheet, headers, item.rowNumber, {
    "Status": "Draft Created",
    "Last Action": "Created Gmail draft",
    "Draft ID": draft.getId(),
  });
  agentLogAction(item.agentItemId, "1", "create_draft", "success", draft.getId());

  return `Draft created for: ${subject}`;
}

function agentIgnoreItem(item, inboundText) {
  agentUpdateRow(item.context.sheet, item.context.headers, item.rowNumber, {
    "Status": "Ignored",
    "Last Action": "Ignored from WhatsApp",
  });
  agentLogAction(item.agentItemId, inboundText, "ignore", "success", "");
  return "Ignored.";
}

function agentRewriteItem(item, inboundText) {
  const headers = item.context.headers;
  const summary = agentGetCell(item.row, headers, "Summary");
  const currentReply = agentGetCell(item.row, headers, "Suggested Reply");
  const apiKey = agentGetProperty("OPENAI_API_KEY");
  const model = PropertiesService.getScriptProperties().getProperty("OPENAI_MODEL") || "gpt-4.1-mini";
  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    payload: JSON.stringify({
      model,
      input: [
        "Rewrite this suggested email reply. Keep it concise, clear, and professional.",
        `Email summary: ${summary}`,
        `Current reply: ${currentReply}`,
        `User instruction: ${inboundText}`,
      ].join("\n"),
    }),
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error(`OpenAI rewrite failed: ${response.getResponseCode()} ${response.getContentText()}`);
  }

  const parsed = JSON.parse(response.getContentText());
  const outputText = agentExtractOpenAiOutput(parsed);
  if (!outputText) {
    throw new Error(`OpenAI rewrite did not include output text: ${response.getContentText()}`);
  }

  agentUpdateRow(item.context.sheet, headers, item.rowNumber, {
    "Suggested Reply": outputText,
    "Status": "Rewrite Requested",
    "Last Action": "Rewritten from WhatsApp",
  });
  agentLogAction(item.agentItemId, inboundText, "rewrite", "success", outputText);
  agentSendWhatsApp([
    "Rewritten reply:",
    "",
    outputText,
    "",
    "Reply 1 to create a Gmail draft, 3 to ignore, or 4 with another rewrite instruction.",
  ].join("\n"));

  return "Rewrite sent.";
}

function handleWhatsAppCommand(inboundText) {
  agentSetupSheets();
  const text = String(inboundText || "").trim();
  const item = agentFindLatestOpenItem();

  if (!item) {
    agentLogAction("", text, "no_open_item", "skipped", "No open email agent item.");
    return "No open email item found.";
  }

  if (text === "1") {
    return agentCreateDraft(item);
  }

  if (text === "2") {
    const draftMessage = agentCreateDraft(item);
    agentGetOrCreateGmailLabel(AGENT_MANUAL_REVIEW_LABEL).addToThread(
      GmailApp.getThreadById(agentGetCell(item.row, item.context.headers, "Gmail Thread ID"))
    );
    agentUpdateRow(item.context.sheet, item.context.headers, item.rowNumber, {
      "Status": "Manual Review",
      "Last Action": "Send requested but disabled; draft created",
    });
    agentLogAction(item.agentItemId, text, "send_disabled", "manual_review", "Command 2 is disabled for MVP.");
    return `${draftMessage}. Auto-send is disabled for MVP, so review/send manually.`;
  }

  if (text === "3") {
    return agentIgnoreItem(item, text);
  }

  if (text === "4" || text.toLowerCase().startsWith("4")) {
    return agentRewriteItem(item, text.replace(/^4\s*/, ""));
  }

  return "Reply with 1, 2, 3, or 4.";
}

function doPost(event) {
  const params = event && event.parameter ? event.parameter : {};
  const inboundText = params.Body || params.body || "";
  const responseText = handleWhatsAppCommand(inboundText);

  return ContentService
    .createTextOutput(`<Response><Message>${responseText}</Message></Response>`)
    .setMimeType(ContentService.MimeType.XML);
}

function doGet(event) {
  const action = event && event.parameter ? event.parameter.action : "";

  if (action === "setup") {
    return agentSetupSheets();
  }

  if (action === "scan") {
    return agentCreateJson(scanUnreadEmails());
  }

  return agentCreateJson({
    ok: true,
    message: "Aegis WhatsApp Email Agent is live. Use ?action=setup or ?action=scan.",
  });
}

function installEmailAgentScanTrigger() {
  ScriptApp.newTrigger("scanUnreadEmails")
    .timeBased()
    .everyMinutes(10)
    .create();
}
