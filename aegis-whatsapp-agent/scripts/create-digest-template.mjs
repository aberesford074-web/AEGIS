import { getConfig } from "../src/config.js";

const config = getConfig();
const credentials = Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString("base64");
const authHeaders = {
  Authorization: `Basic ${credentials}`,
  "Content-Type": "application/json",
};

async function twilioFetch(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(data, null, 2)}`);
  }

  return data;
}

const friendlyName = `aegis_email_digest_${Date.now()}`;
const template = await twilioFetch("https://content.twilio.com/v1/Content", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({
    friendly_name: friendlyName,
    language: "en",
    types: {
      "twilio/text": {
        body: [
          "AEGIS found {{1}} email(s) needing attention.",
          "",
          "{{2}}",
          "",
          "Reply emails to view the summaries and approve any replies.",
        ].join("\n"),
      },
    },
    variables: {
      1: "3",
      2: "1. Example sender - Customer enquiry | 2. Example supplier - Quote request",
    },
  }),
});

const approval = await twilioFetch(`https://content.twilio.com/v1/Content/${template.sid}/ApprovalRequests/whatsapp`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({
    name: friendlyName,
    category: "UTILITY",
  }),
});

console.log(JSON.stringify({
  contentSid: template.sid,
  friendlyName,
  approvalStatus: approval.status,
  nextEnvLine: `TWILIO_DIGEST_CONTENT_SID=${template.sid}`,
}, null, 2));
