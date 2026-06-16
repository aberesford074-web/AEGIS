import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";
import { analyzeEmail, regenerateReply, rewriteReply } from "./ai.js";
import { getConfig } from "./config.js";
import {
  archiveMessage,
  createDraftReply,
  createGmailClient,
  exchangeGoogleCode,
  extractReplyAddress,
  getGoogleAuthUrl,
  getMessage,
  listAllUnreadMessages,
  listUnreadMessages,
  refreshGoogleTokens,
  sendReply,
} from "./gmail.js";
import { JsonStore } from "./store.js";
import {
  buildTwimlMessage,
  parseWhatsAppCommand,
  sendWhatsApp,
  sendWhatsAppAction,
  sendWhatsAppInboxList,
} from "./whatsapp.js";

const config = getConfig();
const store = new JsonStore(config.app.storePath);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, text, contentType = "text/plain") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const contentType = req.headers["content-type"] || "";

  if (contentType.includes("application/json")) {
    return raw ? JSON.parse(raw) : {};
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }

  return { raw };
}

function makeShortId(messageId) {
  return crypto.createHash("sha1").update(messageId).digest("hex").slice(0, 8);
}

async function getAuthedGmail() {
  const tokens = await store.getGoogleTokens();
  if (!tokens) {
    throw new Error("Gmail is not connected. Visit /auth/google first.");
  }

  const refreshed = await refreshGoogleTokens(config, tokens);
  if (refreshed.access_token !== tokens.access_token) {
    await store.saveGoogleTokens(refreshed);
  }

  return createGmailClient(config, refreshed);
}

async function checkInbox(options = {}) {
  const {
    includeAllUnread = false,
    ignoreProcessed = false,
    sendEvenIfLowValue = false,
    useApprovedDigestTemplate = true,
    type = "email_digest",
  } = options;
  const gmail = await getAuthedGmail();
  const unread = includeAllUnread
    ? await listAllUnreadMessages(gmail, config.app.maxEmailsPerCheck)
    : await listUnreadMessages(gmail, config.app.maxEmailsPerCheck);
  const results = [];
  const actions = [];
  const skipped = [];

  for (const item of unread) {
    if (!ignoreProcessed && await store.hasProcessedMessage(item.id)) continue;

    const email = await getMessage(gmail, item.id);
    const analysis = await analyzeEmail(config, email);
    const shortId = makeShortId(email.id);
    const action = {
      shortId,
      messageId: email.id,
      threadId: email.threadId,
      from: email.from,
      replyTo: extractReplyAddress(email.from),
      subject: email.subject,
      summary: analysis.summary,
      intent: analysis.intent,
      urgency: analysis.urgency,
      riskLevel: analysis.risk_level,
      category: analysis.category,
      shouldNotify: analysis.should_notify,
      safeToSend: analysis.safe_to_send,
      recommendedAction: analysis.recommended_action,
      reason: analysis.reason,
      suggestedReply: analysis.suggested_reply,
      emailBody: email.body,
      emailSnippet: email.snippet,
      receivedAt: email.date,
      status: "waiting_for_whatsapp_approval",
      createdAt: new Date().toISOString(),
    };

    if (!ignoreProcessed) {
      await store.markProcessedMessage(email.id);
    }

    if (!sendEvenIfLowValue && (!analysis.should_notify || analysis.recommended_action === "ignore")) {
      skipped.push({
        messageId: email.id,
        subject: email.subject,
        category: analysis.category,
        reason: analysis.reason,
      });
      continue;
    }

    await store.saveEmailAction(action);
    actions.push(action);

    results.push({
      shortId,
      messageId: email.id,
      summary: analysis.summary,
    });
  }

  const inboxMessage = actions.length > 0
    ? await sendWhatsAppInboxList(config, actions, { useApprovedTemplate: useApprovedDigestTemplate })
    : null;
  const run = {
    ok: true,
    type,
    createdAt: new Date().toISOString(),
    scanned: unread.length,
    actionsCreated: results.length,
    skipped: skipped.length,
    sentToWhatsApp: inboxMessage ? 1 : 0,
    inboxMessageSid: inboxMessage?.sid || null,
    results,
    skippedResults: skipped,
  };
  await store.saveDigestRun(run);
  return run;
}

async function handleWhatsAppCommand(body) {
  const parsed = parseWhatsAppCommand(body.ButtonPayload || body.Body);
  const session = await store.getWhatsAppSession();
  const bodyText = String(body.Body || "").trim();

  if (parsed.command === "show_unread") {
    const run = await checkInbox({
      includeAllUnread: true,
      ignoreProcessed: true,
      sendEvenIfLowValue: true,
      useApprovedDigestTemplate: false,
      type: "on_demand_unread",
    });

    if (run.actionsCreated === 0) {
      return "I checked your inbox. You do not have any unread emails right now.";
    }

    return `I found ${run.actionsCreated} unread email ${run.actionsCreated === 1 ? "summary" : "summaries"} and sent them as a list. Tap View emails to open one.`;
  }

  if (session.editModeActionId && bodyText && !parsed.isCommand) {
    const action = await store.getEmailAction(session.editModeActionId);
    if (!action) {
      await store.saveWhatsAppSession({ editModeActionId: null });
      return "I could not find that email anymore.";
    }

    const isFullReplacement = looksLikeFullReply(bodyText);
    const nextReply = isFullReplacement ? bodyText : await rewriteReply(config, action, bodyText);
    const updatedAction = {
      ...action,
      suggestedReply: nextReply,
      status: isFullReplacement
        ? "whatsapp_manual_edit_waiting_for_approval"
        : "whatsapp_instruction_edit_waiting_for_approval",
    };
    await store.saveEmailAction(updatedAction);
    await store.saveWhatsAppSession({ activeActionId: action.shortId, editModeActionId: null, pendingSendActionId: null });
    await sendWhatsAppAction(config, updatedAction);
    return isFullReplacement
      ? [
          "Done. I replaced the draft with your edited version.",
          "",
          "You can still ask me to polish it, for example: make it warmer, shorter, more professional, or more serious.",
          "",
          "Or say send, regenerate, view full email, or ignore.",
        ].join("\n")
      : [
          "Done. I used that as an instruction and rewrote the draft.",
          "",
          "If you want to manually replace the whole reply, tap Edit Draft and send the complete message exactly as you want it.",
          "",
          "Or say send, regenerate, view full email, or ignore.",
        ].join("\n");
  }

  if (!parsed.isCommand && session.activeActionId && bodyText) {
    const action = await store.getEmailAction(session.activeActionId);
    if (!action) return parsed.help;
    const rewritten = await rewriteReply(config, action, bodyText);
    const updatedAction = {
      ...action,
      suggestedReply: rewritten,
      status: "chat_rewritten_waiting_for_approval",
    };
    await store.saveEmailAction(updatedAction);
    await store.saveWhatsAppSession({ activeActionId: action.shortId, pendingSendActionId: null });
    await sendWhatsAppAction(config, updatedAction);
    return [
      "I updated the draft.",
      "",
      "You can keep talking to me normally:",
      "shorter",
      "warmer",
      "more professional",
      "more serious",
      "view full email",
      "draft",
      "send",
      "ignore",
    ].join("\n");
  }

  if (!parsed.isCommand) return parsed.help;

  if (parsed.command === "confirm_send") {
    if (!session.pendingSendActionId) {
      return "Nothing is waiting to send. Open an email and say send first.";
    }

    const action = await store.getEmailAction(session.pendingSendActionId);
    if (!action) {
      await store.saveWhatsAppSession({ pendingSendActionId: null });
      return "I could not find that pending email anymore.";
    }

    if (!canSendDirectly(action)) {
      const gmail = await getAuthedGmail();
      const draft = await createDraftReply(gmail, action, action.suggestedReply);
      await store.saveEmailAction({ ...action, status: "draft_created_after_safety_check", draftId: draft.id });
      await store.saveWhatsAppSession({ activeActionId: action.shortId, editModeActionId: null, pendingSendActionId: null });
      return "I paused the send because this looks sensitive. I created a Gmail draft instead so you can review it.";
    }

    const gmail = await getAuthedGmail();
    const sent = await sendReply(gmail, action, action.suggestedReply);
    await store.saveEmailAction({ ...action, status: "sent", sentMessageId: sent.id });
    await store.saveWhatsAppSession({ activeActionId: action.shortId, editModeActionId: null, pendingSendActionId: null });
    return `Sent. The reply went to ${action.from}.`;
  }

  const shortId = parsed.shortId || session.activeActionId;
  if (!shortId) {
    return [
      "Open one of the emails first, then I can help with it.",
      "",
      "Once it is open, you can say:",
      "view full email",
      "make it warmer",
      "make it more formal",
      "edit",
      "regenerate",
      "draft",
      "send",
      "ignore",
    ].join("\n");
  }

  const action = await store.getEmailAction(shortId);
  if (!action) return `I could not find email ID ${shortId}.`;

  const gmail = await getAuthedGmail();

  if (parsed.command === "detail") {
    await store.saveWhatsAppSession({ activeActionId: action.shortId, editModeActionId: null, pendingSendActionId: null });
    await sendWhatsAppAction(config, action);
    return [
      `Opened the email from ${action.from}.`,
      "",
      "You can now talk to me naturally:",
      "make it warmer",
      "make it shorter",
      "make it more professional",
      "make it serious",
      "view full email",
      "edit",
      "regenerate",
      "draft",
      "send",
    ].join("\n");
  }

  if (parsed.command === "view") {
    let fullEmail = action.emailBody || action.emailSnippet || action.summary || "No email body available.";
    try {
      const latestEmail = await getMessage(gmail, action.messageId);
      fullEmail = latestEmail.body || latestEmail.snippet || fullEmail;
    } catch (error) {
      console.warn(`Could not fetch full email ${action.messageId}:`, error.message);
    }

    return [
      `Full email for ${action.shortId}`,
      "",
      `From: ${action.from}`,
      `Subject: ${action.subject || "(no subject)"}`,
      action.receivedAt ? `Received: ${action.receivedAt}` : "",
      "",
      fullEmail.slice(0, 2800),
      "",
      "Next, you can say:",
      "regenerate",
      "make it warmer",
      "make it shorter",
      "make it more professional",
      "edit",
      "draft",
      "send",
    ].filter(Boolean).join("\n");
  }

  if (parsed.command === "edit") {
    await store.saveWhatsAppSession({ activeActionId: action.shortId, editModeActionId: action.shortId, pendingSendActionId: null });
    return [
      "Edit mode is on.",
      "",
      "You can do either of these:",
      "",
      "1. Send a full edited reply and I will replace the draft exactly.",
      "2. Send a short instruction like: say I'm interested, change Tuesday to Thursday, make it warmer.",
      "",
      "I will update the draft and show it back before anything is sent.",
      "",
      "Current draft:",
      action.suggestedReply,
    ].join("\n");
  }

  if (parsed.command === "1") {
    const draft = await createDraftReply(gmail, action, action.suggestedReply);
    await store.saveEmailAction({ ...action, status: "draft_created", draftId: draft.id });
    await store.saveWhatsAppSession({ activeActionId: action.shortId, editModeActionId: null, pendingSendActionId: null });
    return `Draft created in Gmail for ${action.from}. Nothing has been sent.`;
  }

  if (parsed.command === "2") {
    if (!canSendDirectly(action)) {
      const draft = await createDraftReply(gmail, action, action.suggestedReply);
      await store.saveEmailAction({ ...action, status: "draft_created_sensitive", draftId: draft.id });
      await store.saveWhatsAppSession({ activeActionId: action.shortId, editModeActionId: null, pendingSendActionId: null });
      return "This one looks sensitive or too uncertain to send from WhatsApp. I created a Gmail draft instead.";
    }

    await store.saveWhatsAppSession({
      activeActionId: action.shortId,
      editModeActionId: null,
      pendingSendActionId: action.shortId,
    });
    return [
      `Ready to send this reply to ${action.from}.`,
      "",
      "For safety, reply: confirm send",
      "",
      "Or say: edit, make it warmer, shorter, view full email, create draft, or ignore.",
    ].join("\n");
  }

  if (parsed.command === "send_button") {
    if (!canSendDirectly(action)) {
      const draft = await createDraftReply(gmail, action, action.suggestedReply);
      await store.saveEmailAction({ ...action, status: "draft_created_sensitive", draftId: draft.id });
      await store.saveWhatsAppSession({ activeActionId: action.shortId, editModeActionId: null, pendingSendActionId: null });
      return [
        "I did not send this one because it looks sensitive or uncertain.",
        "",
        "I created a Gmail draft instead so you can review it before it goes out.",
      ].join("\n");
    }

    const sent = await sendReply(gmail, action, action.suggestedReply);
    await store.saveEmailAction({ ...action, status: "sent", sentMessageId: sent.id });
    await store.saveWhatsAppSession({ activeActionId: action.shortId, editModeActionId: null, pendingSendActionId: null });
    return `Sent. The reply went to ${action.from}.`;
  }

  if (parsed.command === "3") {
    await archiveMessage(gmail, action.messageId);
    await store.saveEmailAction({ ...action, status: "archived" });
    await store.saveWhatsAppSession({ activeActionId: null, editModeActionId: null, pendingSendActionId: null });
    return `Archived email from ${action.from}.`;
  }

  if (parsed.command === "4") {
    const rewritten = await rewriteReply(config, action, parsed.instruction);
    const updatedAction = { ...action, suggestedReply: rewritten, status: "rewritten_waiting_for_approval" };
    await store.saveEmailAction(updatedAction);
    await store.saveWhatsAppSession({ activeActionId: action.shortId, editModeActionId: null, pendingSendActionId: null });
    await sendWhatsAppAction(config, updatedAction);
    return "I changed the tone. Tell me another tweak, or say draft, send, view full email, or ignore.";
  }

  if (parsed.command === "regen") {
    const rewritten = await regenerateReply(config, action);
    const updatedAction = { ...action, suggestedReply: rewritten, status: "regenerated_waiting_for_approval" };
    await store.saveEmailAction(updatedAction);
    await store.saveWhatsAppSession({ activeActionId: action.shortId, editModeActionId: null, pendingSendActionId: null });
    await sendWhatsAppAction(config, updatedAction);
    return "I generated a fresh version. You can ask for another tone, edit it yourself, create a draft, or send.";
  }

  return "Unknown command.";
}

function canSendDirectly(action) {
  const sender = `${action.from || ""} ${action.replyTo || ""}`.toLowerCase();
  const subject = String(action.subject || "").toLowerCase();
  const reply = String(action.suggestedReply || "").trim();

  if (action.riskLevel !== "normal") return false;
  if (action.safeToSend === false) return false;
  if (reply.length < 20) return false;
  if (sender.includes("no-reply") || sender.includes("noreply")) return false;

  const sensitiveTerms = [
    "password",
    "security",
    "invoice",
    "payment",
    "refund",
    "contract",
    "legal",
    "dispute",
    "bank",
    "tax",
    "medical",
    "hr",
  ];

  return !sensitiveTerms.some((term) => subject.includes(term));
}

function looksLikeFullReply(text) {
  const value = String(text || "").trim();
  const lower = value.toLowerCase();
  const lineCount = value.split(/\r?\n/).filter((line) => line.trim()).length;

  if (lineCount >= 3) return true;
  if (value.length >= 120) return true;
  if (/^(hi|hello|dear|good morning|good afternoon|good evening)\b/.test(lower) && value.length >= 45) return true;
  if (/\b(kind regards|best regards|many thanks|thanks,|regards,|cheers,)\b/.test(lower)) return true;

  return false;
}

let digestRunning = false;

async function runScheduledDigest(reason = "scheduled") {
  if (digestRunning) return;
  digestRunning = true;

  try {
    const run = await checkInbox();
    console.log("Email digest complete", {
      reason,
      scanned: run.scanned,
      actionsCreated: run.actionsCreated,
      skipped: run.skipped,
    });
  } catch (error) {
    console.error(`Email digest failed (${reason})`, error);
  } finally {
    digestRunning = false;
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/") {
      sendJson(res, 200, {
        ok: true,
        app: "Aegis WhatsApp Email Agent",
        profile: config.profile,
        next: ["Connect Gmail at /auth/google", "POST /jobs/check-inbox", "Setup guide at /setup"],
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        profile: config.profile,
        port: config.port,
        storePath: config.app.storePath,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/setup") {
      sendJson(res, 200, {
        ok: true,
        product: "Aegis WhatsApp Email Agent",
        profile: config.profile,
        purpose: "Connect Gmail, summarise useful emails, and control draft/send/archive actions from WhatsApp.",
        steps: [
          {
            step: 1,
            title: "Create the user config",
            details: [
              `Set PROFILE=${config.profile} or use a matching .env.${config.profile} file.`,
              "Add that user's Gmail OAuth client details.",
              "Add their WhatsApp destination as OWNER_WHATSAPP_TO=whatsapp:+countrycode...",
              "For production, use a verified WhatsApp Business sender instead of the Twilio sandbox.",
            ],
          },
          {
            step: 2,
            title: "Connect Gmail",
            url: `${config.publicBaseUrl}/auth/google`,
            details: ["Open this URL, sign into Gmail, and approve Gmail read/modify/send scopes."],
          },
          {
            step: 3,
            title: "Connect WhatsApp",
            details: [
              `Inbound webhook: ${config.publicBaseUrl}/webhooks/twilio/whatsapp`,
              `Status callback: ${config.publicBaseUrl}/webhooks/twilio/status`,
              "Method: POST for both.",
            ],
          },
          {
            step: 4,
            title: "Enable digest",
            details: [
              "Set DIGEST_ENABLED=true.",
              "Set DIGEST_INTERVAL_MINUTES to the digest frequency.",
              "Use DIGEST_STARTUP_SCAN=true if you want an inbox scan when the service starts.",
            ],
          },
          {
            step: 5,
            title: "Safety defaults",
            details: [
              "Normal emails require a second WhatsApp confirmation before sending.",
              "Sensitive emails become Gmail drafts instead of being sent from WhatsApp.",
              "Promotions, newsletters, noreply messages, and low-value email are skipped.",
            ],
          },
        ],
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/test/whatsapp") {
      const message = [
        "Aegis WhatsApp Email Agent is connected.",
        "",
        "Next test: connect Gmail, then I can summarise unread emails and send approval options here.",
      ].join("\n");
      sendJson(res, 200, await sendWhatsApp(config, message));
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/google") {
      res.writeHead(302, { Location: getGoogleAuthUrl(config) });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/google/callback") {
      const code = url.searchParams.get("code");
      if (!code) {
        sendText(res, 400, "Missing Google OAuth code. Start at /auth/google.");
        return;
      }

      await store.saveGoogleTokens(await exchangeGoogleCode(config, code));
      sendText(res, 200, "Gmail connected. You can close this tab and test /jobs/check-inbox.");
      return;
    }

    if (req.method === "POST" && url.pathname === "/jobs/check-inbox") {
      sendJson(res, 200, await checkInbox());
      return;
    }

    if (req.method === "POST" && url.pathname === "/webhooks/twilio/whatsapp") {
      const body = await readBody(req);
      sendText(res, 200, buildTwimlMessage(await handleWhatsAppCommand(body)), "text/xml");
      return;
    }

    if (req.method === "POST" && url.pathname === "/webhooks/twilio/status") {
      const body = await readBody(req);
      console.log("Twilio status", body);
      sendText(res, 204, "");
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, error: error.message });
  }
}

http.createServer(handleRequest).listen(config.port, () => {
  console.log(`Aegis WhatsApp Email Agent (${config.profile}) running on http://localhost:${config.port}`);
  console.log(`Using store: ${config.app.storePath}`);

  if (config.app.digestEnabled) {
    const intervalMinutes = Math.max(5, config.app.digestIntervalMinutes);
    console.log(`Scheduled email digest enabled every ${intervalMinutes} minutes.`);

    if (config.app.digestStartupScan) {
      setTimeout(() => runScheduledDigest("startup"), 3000);
    }

    setInterval(() => runScheduledDigest("scheduled"), intervalMinutes * 60 * 1000);
  }
});
