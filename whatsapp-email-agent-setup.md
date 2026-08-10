# Aegis WhatsApp Email Agent Setup

This is the single-user MVP for Aaron/Aegis.

It should live in a **separate Apps Script project** from the Aegis website lead CRM.

## What It Does

1. Scans unread Gmail threads.
2. Skips obvious newsletters/no-reply emails.
3. Sends the email content to OpenAI for:
   - summary
   - intent
   - priority
   - risk level
   - suggested reply
4. Sends a WhatsApp message with the summary and suggested reply.
5. Accepts WhatsApp commands:
   - `1` create Gmail draft
   - `2` create draft and mark manual review because auto-send is disabled for MVP
   - `3` ignore
   - `4` rewrite
6. Logs everything to Google Sheets.

## Files

- `whatsapp-email-agent.gs` - Apps Script code
- `whatsapp-email-agent-build.md` - product/build plan

## Create Spreadsheet

Create a new Google Sheet called:

```text
Aegis WhatsApp Email Agent
```

Copy its spreadsheet ID from the URL.

In `whatsapp-email-agent.gs`, replace:

```js
const EMAIL_AGENT_SPREADSHEET_ID = "PASTE_AGENT_SPREADSHEET_ID_HERE";
```

with your real spreadsheet ID.

## Create Apps Script Project

1. Go to [script.google.com](https://script.google.com).
2. Create a new project.
3. Paste the full contents of `whatsapp-email-agent.gs`.
4. Save.

## Add Script Properties

In Apps Script:

1. Project Settings
2. Script Properties
3. Add:

```text
OPENAI_API_KEY
OPENAI_MODEL
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM
AARON_WHATSAPP_TO
```

Example values:

```text
OPENAI_MODEL = gpt-4.1-mini
TWILIO_WHATSAPP_FROM = whatsapp:+1XXXXXXXXXX
AARON_WHATSAPP_TO = whatsapp:+44XXXXXXXXXX
```

Do not put these values in the website JavaScript.

## First Setup Test

Deploy the Apps Script as a web app, then open:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=setup
```

Expected:

- `Email Agent Inbox` sheet created
- `Email Agent Actions` sheet created
- `Email Agent Settings` sheet created
- Gmail labels created:
  - `aegis-agent-processed`
  - `aegis-agent-drafted`
  - `aegis-agent-manual-review`

## Scan Test

Send yourself a test email from another address.

Then open:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?action=scan
```

Expected:

- One row appears in `Email Agent Inbox`
- WhatsApp notification arrives
- Gmail thread gets label `aegis-agent-processed`

## WhatsApp Webhook

In Twilio WhatsApp settings, set the inbound message webhook to your Apps Script web app URL:

```text
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

When you reply:

```text
1
```

Expected:

- Gmail draft is created
- Row status changes to `Draft Created`
- Gmail thread gets label `aegis-agent-drafted`

## Install Scan Trigger

Only after manual scan works, run this Apps Script function once:

```text
installEmailAgentScanTrigger
```

That scans Gmail every 10 minutes.

## MVP Safety Rules

- Command `2` does not auto-send yet.
- Sensitive emails are marked for manual review.
- Legal, medical, banking, HR, security, complaint, and angry-customer emails should not be auto-sent.
- This is for your own inbox first, not public SaaS users.

## Next Improvements

After MVP works:

1. Improve sender filtering.
2. Add contact-specific preferences.
3. Add custom tone settings.
4. Add a small dashboard.
5. Add multi-user auth only after real demand.
