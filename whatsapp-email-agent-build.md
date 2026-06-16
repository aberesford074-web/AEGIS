# Aegis WhatsApp Email Agent Build Plan

## Product Wedge

Control important Gmail replies from WhatsApp.

The first product moment:

```text
New email arrives
-> AI summarises it
-> WhatsApp asks what to do
-> user replies 1
-> Gmail draft is created
```

## MVP Scope

Build for one user first: Aaron/Aegis.

Do not build multi-user SaaS, memory, billing, dashboard, or autonomous sending yet.

### Included

- Monitor Gmail for unread emails.
- Summarise important email threads.
- Draft a suggested reply.
- Send WhatsApp notification.
- Accept simple WhatsApp commands:
  - `1` create Gmail draft
  - `2` send email, disabled by default for MVP
  - `3` ignore/archive
  - `4` rewrite suggestion
- Label processed Gmail threads.
- Store audit log.

### Excluded For MVP

- Public Gmail OAuth onboarding.
- Multi-user accounts.
- Long-term memory.
- Fully autonomous sending.
- Payment/billing.
- Dashboard.

## Recommended First Stack

For the first prototype, use Google Apps Script instead of FastAPI.

Why:

- Gmail, labels, drafts, and triggers are native.
- Fast to test.
- No server hosting needed.
- Safer while the workflow is still changing.

Use:

- GmailApp / Gmail API inside Apps Script
- OpenAI API via `UrlFetchApp`
- Twilio WhatsApp API or WhatsApp Cloud API
- Google Sheet as log/control table

Move to FastAPI/Postgres later when the workflow is proven.

## Required Secrets

Store these in Apps Script Properties, not frontend JavaScript:

- `OPENAI_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `AARON_WHATSAPP_TO`

Optional later:

- `WHATSAPP_VERIFY_TOKEN`
- `META_ACCESS_TOKEN`

## Sheet Tabs

Create a separate spreadsheet or separate tabs from the Aegis lead CRM:

- `Email Agent Inbox`
- `Email Agent Actions`
- `Email Agent Settings`

Do not mix this product prototype into `Chatbot Leads`.

### Email Agent Inbox Columns

- `Agent Item ID`
- `Created At`
- `Gmail Thread ID`
- `Gmail Message ID`
- `From`
- `Subject`
- `Summary`
- `Suggested Reply`
- `Priority`
- `Risk Level`
- `Status`
- `WhatsApp Message SID`
- `Last Action`
- `Draft ID`
- `Notes`

### Status Values

- `New`
- `WhatsApp Sent`
- `Draft Created`
- `Ignored`
- `Rewrite Requested`
- `Manual Review`
- `Error`

## Apps Script Functions

### scanUnreadEmails

Runs every 5-15 minutes.

1. Search Gmail:

```text
is:unread -label:aegis-agent-processed newer_than:2d
```

2. Get thread/message.
3. Skip newsletters, promotions, and obvious automated emails.
4. Send message content to OpenAI.
5. Store summary/suggested reply in `Email Agent Inbox`.
6. Send WhatsApp notification.
7. Apply Gmail label `aegis-agent-processed`.

### sendWhatsAppNotification

Sends:

```text
New email from [sender]

Summary:
[summary]

Suggested reply:
[reply]

Reply:
1 = Create Gmail draft
2 = Send email
3 = Ignore
4 = Rewrite
```

### handleWhatsAppWebhook

Triggered by inbound WhatsApp reply.

1. Find latest open agent item for Aaron.
2. If reply is `1`, create Gmail draft.
3. If reply is `2`, do not send in MVP. Create draft and mark `Manual Review`.
4. If reply is `3`, archive/ignore.
5. If reply is `4`, ask OpenAI for rewrite and send another WhatsApp message.

### createGmailDraftForAgentItem

Creates a Gmail draft in the same thread using suggested reply.

### classifyEmailRisk

Never auto-send or confidently handle:

- legal
- medical
- banking/payment
- security/password
- HR/employment
- complaints/escalations
- angry customers

Mark these as `Manual Review`.

## OpenAI Prompt Shape

Return strict JSON:

```json
{
  "summary": "",
  "intent": "",
  "priority": "low|medium|high",
  "risk_level": "normal|sensitive|manual_review",
  "action_required": true,
  "suggested_reply": "",
  "reason": ""
}
```

## Website Placement

Show it as a flagship product between the trust logo band and the industry cards.

Reason:

- The hero sells the main Aegis promise.
- The flagship product section proves Aegis can build actual products.
- The industry cards still sell custom automation services.

This is now implemented in `index.html` as:

```text
section#product
```

## Next Build Step

Build the single-user Apps Script prototype:

1. Create the Email Agent sheet tabs.
2. Add script properties.
3. Implement `scanUnreadEmails`.
4. Implement OpenAI summary call.
5. Implement Twilio WhatsApp send.
6. Implement inbound WhatsApp webhook.
7. Test with Aaron's Gmail only.
