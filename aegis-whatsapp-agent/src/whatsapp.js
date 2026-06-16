export async function sendWhatsApp(config, body) {
  return sendWhatsAppForm(config, { Body: body });
}

export async function sendWhatsAppAction(config, action) {
  if (!config.twilio.actionContentSid) {
    return sendWhatsApp(config, buildEmailActionMessage(action));
  }

  return sendWhatsAppForm(config, {
    ContentSid: config.twilio.actionContentSid,
    ContentVariables: JSON.stringify({
      1: truncate(action.from, 80),
      2: action.shortId,
      3: truncate(action.summary, 450),
      4: truncate(action.suggestedReply, 550),
    }),
  });
}

export async function sendWhatsAppInboxList(config, actions, options = {}) {
  const safeActions = actions.slice(0, 10);
  if (safeActions.length === 0) {
    return sendWhatsApp(config, "I checked your inbox. Nothing needs your attention right now.");
  }

  if (options.useApprovedTemplate && config.twilio.digestContentSid) {
    return sendWhatsAppForm(config, {
      ContentSid: config.twilio.digestContentSid,
      ContentVariables: JSON.stringify({
        1: String(safeActions.length),
        2: summarizeDigestPreview(safeActions),
      }),
    });
  }

  const content = await createInboxListContent(config, safeActions);
  return sendWhatsAppForm(config, {
    ContentSid: content.sid,
  });
}

async function sendWhatsAppForm(config, fields) {
  const credentials = Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: config.twilio.whatsappFrom,
        To: config.twilio.ownerWhatsappTo,
        StatusCallback: `${config.publicBaseUrl}/webhooks/twilio/status`,
        ...fields,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Twilio WhatsApp send failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function createInboxListContent(config, actions) {
  const credentials = Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString("base64");
  const fallbackList = actions
    .map((action, index) => `${index + 1}. ${formatSender(action)} - ${truncate(action.subject || action.summary, 70)}`)
    .join("\n");
  const payload = {
    friendly_name: `aegis_inbox_${Date.now()}`,
    language: "en",
    types: {
      "twilio/text": {
        body: [
          `I found ${actions.length} email ${actions.length === 1 ? "summary" : "summaries"} for you.`,
          "",
          fallbackList,
          "",
          "Tap View emails to open one.",
          "You can also ask me things like: show urgent emails, make it warmer, view full email, or create a draft.",
        ].join("\n"),
      },
      "twilio/list-picker": {
        body: [
          `I found ${actions.length} email ${actions.length === 1 ? "summary" : "summaries"} for you.`,
          "",
          "Tap an email to review the summary, suggested reply, and next actions.",
          "",
          "After opening one, you can tell me: warmer, shorter, more serious, view full email, edit, draft, or send.",
        ].join("\n"),
        button: "View emails",
        items: actions.map((action) => ({
          item: truncate(formatSender(action), 24),
          id: `detail:${action.shortId}`,
          description: truncate(action.subject || action.summary || "Open email summary", 72),
        })),
      },
    },
  };

  const response = await fetch("https://content.twilio.com/v1/Content", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Twilio list content failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export function buildEmailActionMessage(action) {
  return [
    `Email from ${action.from}`,
    "",
    `ID: ${action.shortId}`,
    "",
    "Why it matters:",
    action.summary,
    "",
    `Urgency: ${action.urgency}`,
    `Risk: ${action.riskLevel}`,
    "",
    "Suggested reply:",
    action.suggestedReply,
    "",
    "What would you like to do?",
    `draft ${action.shortId} = Create Gmail draft`,
    `send ${action.shortId} = Prepare to send`,
    `ignore ${action.shortId} = Archive it`,
    `view ${action.shortId} = View full email`,
    `regen ${action.shortId} = Try another draft`,
    `edit ${action.shortId} = Manually edit the draft in WhatsApp`,
    `style ${action.shortId} warmer = Ask AI to change the tone`,
  ].join("\n");
}

export function parseWhatsAppCommand(body) {
  const text = String(body || "").trim();
  const normalized = text.toLowerCase();
  const payloadMatch = text.match(/^(detail|draft|send|ignore|rewrite):([a-z0-9-]+)$/i);
  if (payloadMatch) {
    const commandMap = {
      detail: "detail",
      draft: "1",
      send: "send_button",
      ignore: "3",
      rewrite: "edit",
    };

    return {
      isCommand: true,
      command: commandMap[payloadMatch[1].toLowerCase()],
      shortId: payloadMatch[2],
      instruction: "",
    };
  }

  if (["send", "approve", "approve and send"].includes(normalized)) {
    return { isCommand: true, command: "2", shortId: "", instruction: "" };
  }

  if (["confirm send", "yes send", "send now"].includes(normalized)) {
    return { isCommand: true, command: "confirm_send", shortId: "", instruction: "" };
  }

  const inboxCommands = [
    "show emails",
    "show my emails",
    "show unread",
    "show unread emails",
    "check inbox",
    "check my inbox",
    "refresh inbox",
    "refresh",
    "inbox",
    "emails",
    "new emails",
    "what emails do i have",
    "what needs attention",
  ];

  if (inboxCommands.includes(normalized)) {
    return { isCommand: true, command: "show_unread", shortId: "", instruction: "" };
  }

  if (["draft", "create draft", "save draft"].includes(normalized)) {
    return { isCommand: true, command: "1", shortId: "", instruction: "" };
  }

  if (["ignore", "discard", "archive"].includes(normalized)) {
    return { isCommand: true, command: "3", shortId: "", instruction: "" };
  }

  if (["view", "view full email", "full email", "show full email"].includes(normalized)) {
    return { isCommand: true, command: "view", shortId: "", instruction: "" };
  }

  if (["regen", "regenerate", "regenerate draft", "try again"].includes(normalized)) {
    return { isCommand: true, command: "regen", shortId: "", instruction: "" };
  }

  const styleOnlyCommands = [
    "warmer",
    "make it warmer",
    "more friendly",
    "make it more friendly",
    "more professional",
    "make it more professional",
    "more formal",
    "make it more formal",
    "more serious",
    "make it more serious",
    "shorter",
    "make it shorter",
    "more direct",
    "make it more direct",
    "more confident",
    "make it more confident",
  ];

  if (styleOnlyCommands.includes(normalized)) {
    return { isCommand: true, command: "4", shortId: "", instruction: text };
  }

  if (["edit", "edit reply", "manual edit"].includes(normalized)) {
    return { isCommand: true, command: "edit", shortId: "", instruction: "" };
  }

  const wordCommand = text.match(/^(view|full|regen|regenerate|style|rewrite)\s+([a-z0-9-]+)(?:\s+([\s\S]+))?$/i);
  if (wordCommand) {
    const commandMap = {
      view: "view",
      full: "view",
      regen: "regen",
      regenerate: "regen",
      style: "4",
      rewrite: "4",
    };

    return {
      isCommand: true,
      command: commandMap[wordCommand[1].toLowerCase()],
      shortId: wordCommand[2],
      instruction: wordCommand[3] || "",
    };
  }

  const actionWordCommand = text.match(/^(draft|send|approve|ignore|archive|edit)\s+([a-z0-9-]+)$/i);
  if (actionWordCommand) {
    const commandMap = {
      draft: "1",
      send: "2",
      approve: "2",
      ignore: "3",
      archive: "3",
      edit: "edit",
    };

    return {
      isCommand: true,
      command: commandMap[actionWordCommand[1].toLowerCase()],
      shortId: actionWordCommand[2],
      instruction: "",
    };
  }

  const match = text.match(/^([1-4])\s+([a-z0-9-]+)(?:\s+([\s\S]+))?$/i);

  if (!match) {
    return {
      isCommand: false,
      text,
      help: [
        "I can help once an email is open.",
        "",
        "To see your unread emails, say: show emails",
        "",
        "Try:",
        "view full email",
        "make it warmer",
        "make it more professional",
        "regenerate",
        "edit",
        "draft",
        "send",
        "ignore",
      ].join("\n"),
    };
  }

  return {
    isCommand: true,
    command: match[1],
    shortId: match[2],
    instruction: match[3] || "",
  };
}

function truncate(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function formatSender(action) {
  const from = String(action.from || "").trim();
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return (match ? match[1] : from.replace(/<.*?>/g, "")).trim() || "Unknown sender";
}

function summarizeDigestPreview(actions) {
  return truncate(
    actions
      .slice(0, 3)
      .map((action, index) => `${index + 1}. ${formatSender(action)} - ${action.subject || action.summary}`)
      .join(" | "),
    450
  );
}

export function buildTwimlMessage(body) {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<Response>",
    `<Message>${escapeXml(body)}</Message>`,
    "</Response>",
  ].join("");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
