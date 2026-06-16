const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

export function getGoogleAuthUrl(config) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.google.clientId);
  url.searchParams.set("redirect_uri", config.google.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  return url.toString();
}

export async function exchangeGoogleCode(config, code) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: config.google.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export async function refreshGoogleTokens(config, tokens) {
  if (!tokens.refresh_token) return tokens;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status} ${await response.text()}`);
  }

  return { ...tokens, ...(await response.json()) };
}

export function createGmailClient(_config, tokens) {
  return { tokens };
}

async function gmailFetch(gmail, path, options = {}) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${gmail.tokens.access_token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Gmail request failed: ${response.status} ${await response.text()}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function decodeBase64Url(value) {
  if (!value) return "";
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function walkParts(payload, collected = []) {
  if (!payload) return collected;
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    collected.push(decodeBase64Url(payload.body.data));
  }
  if (payload.parts) {
    payload.parts.forEach((part) => walkParts(part, collected));
  }
  return collected;
}

function getHeader(headers, name) {
  return headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";
}

export function parseMessage(message) {
  const headers = message.payload?.headers || [];
  const plainText = walkParts(message.payload).join("\n\n") || decodeBase64Url(message.payload?.body?.data);

  return {
    id: message.id,
    threadId: message.threadId,
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    snippet: message.snippet || "",
    body: plainText.slice(0, 12000),
  };
}

export async function listUnreadMessages(gmail, maxResults) {
  const query = encodeURIComponent([
    "-category:promotions",
    "-category:social",
    "-category:forums",
    "-from:(noreply OR no-reply OR newsletter)",
    "-subject:(unsubscribe OR discount OR sale OR webinar OR masterclass)",
  ].join(" "));
  const data = await gmailFetch(
    gmail,
    `/users/me/messages?labelIds=INBOX&labelIds=UNREAD&maxResults=${maxResults}&q=${query}`
  );
  return data.messages || [];
}

export async function listAllUnreadMessages(gmail, maxResults) {
  const data = await gmailFetch(
    gmail,
    `/users/me/messages?labelIds=INBOX&labelIds=UNREAD&maxResults=${maxResults}`
  );
  return data.messages || [];
}

export async function getMessage(gmail, messageId) {
  const data = await gmailFetch(gmail, `/users/me/messages/${messageId}?format=full`);
  return parseMessage(data);
}

export async function createDraftReply(gmail, action, replyBody) {
  const raw = [
    `To: ${action.replyTo}`,
    `Subject: Re: ${action.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    replyBody,
  ].join("\n");

  return gmailFetch(gmail, "/users/me/drafts", {
    method: "POST",
    body: JSON.stringify({
      message: {
        threadId: action.threadId,
        raw: Buffer.from(raw).toString("base64url"),
      },
    }),
  });
}

export async function sendReply(gmail, action, replyBody) {
  const raw = [
    `To: ${action.replyTo}`,
    `Subject: Re: ${action.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    replyBody,
  ].join("\n");

  return gmailFetch(gmail, "/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({
      threadId: action.threadId,
      raw: Buffer.from(raw).toString("base64url"),
    }),
  });
}

export async function archiveMessage(gmail, messageId) {
  return gmailFetch(gmail, `/users/me/messages/${messageId}/modify`, {
    method: "POST",
    body: JSON.stringify({
      removeLabelIds: ["INBOX", "UNREAD"],
    }),
  });
}

export function extractReplyAddress(fromHeader) {
  const match = String(fromHeader || "").match(/<([^>]+)>/);
  return match ? match[1] : String(fromHeader || "").trim();
}
