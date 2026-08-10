# Aegis WhatsApp Email Agent

Owner-mode MVP for the Aegis WhatsApp Email Agent.

This first version is designed to work for Aaron first:

1. Connect Aaron's Gmail.
2. Check unread inbox messages.
3. Use OpenAI to summarise the email and draft a reply.
4. Send the summary and suggested reply to Aaron on WhatsApp.
5. Aaron controls the email from WhatsApp:
   - tap an email from the inbox list to open its card
   - say `view full email` to see the original email
   - say `make it warmer`, `shorter`, or `more professional` to rewrite the draft
   - say `draft` to create a Gmail draft
   - say `send`, then `confirm send` to send safely
   - say `ignore` to archive it

This version now supports separate profiles so the same codebase can run one instance for Aaron and another for Aaron's dad without sharing inboxes, WhatsApp numbers, or token stores.

## Profile Setup

The clean pattern is one profile per person:

- `aaron` profile: Aaron's Gmail, Aaron's WhatsApp, Aaron's token store
- `dad` profile: Dad's Gmail, Dad's WhatsApp, Dad's token store

Dad's example profile is available at `.env.dad.example` with:

- email account: configured privately through Google OAuth
- WhatsApp destination: a placeholder to replace locally
- local port: `8788`
- local store: `./data/store.dad.json`

You can keep the existing `.env` for backwards compatibility, but the preferred setup is:

```bash
cp .env.aaron.example .env.aaron
cp .env.dad.example .env.dad
```

Then fill in Dad's public URL in `.env.dad` when you want inbound WhatsApp replies to work outside localhost.

## Local Setup

```bash
cd aegis-whatsapp-agent
npm run start:aaron
```

This prototype uses only built-in Node APIs, so there is no install step.

To run Dad's instance:

```bash
npm run start:dad
```

Each profile should use its own:

- `PORT`
- `PUBLIC_BASE_URL`
- `GOOGLE_REDIRECT_URI`
- `OWNER_WHATSAPP_TO`
- `STORE_PATH`
- `AGENT_DISPLAY_NAME`

## Railway Deploy

The right cloud model is one Railway service per person:

- one Railway service for `aaron`
- one Railway service for `dad`

Each service can use the same repo and same start command:

```text
node src/server.js
```

Set these environment variables per Railway service:

- `PROFILE`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `OWNER_WHATSAPP_TO`
- `TWILIO_ACTION_CONTENT_SID`
- `TWILIO_DIGEST_CONTENT_SID`
- `DIGEST_ENABLED`
- `DIGEST_INTERVAL_MINUTES`
- `DIGEST_STARTUP_SCAN`
- `AGENT_DISPLAY_NAME`
- `STORE_PATH`

Suggested values:

- Aaron service:
  `PROFILE=aaron`
  `STORE_PATH=./data/store.aaron.json`

- Dad service:
  `PROFILE=dad`
  `STORE_PATH=./data/store.dad.json`

When running on Railway, the app will automatically use `RAILWAY_PUBLIC_DOMAIN` as its public base URL if `PUBLIC_BASE_URL` is not set.

Important:

- Railway file storage is not durable enough for long-term token and message storage.
- The current JSON store is fine for getting the deployment live, but the next real upgrade should be moving store data into a database.
- Each Gmail OAuth client must allow the exact hosted callback URL, for example:
  `https://your-service.up.railway.app/auth/google/callback`
- Each WhatsApp webhook must point to the same hosted service:
  `/webhooks/twilio/whatsapp`
  `/webhooks/twilio/status`

## Required Accounts

### OpenAI

Used by this backend to summarise emails and draft replies. This version uses API credits because it runs outside the ChatGPT app.

Needed:

- `OPENAI_API_KEY`

### Google Cloud / Gmail

Create an OAuth app with Gmail scopes.

Needed:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

For local testing, use the matching profile port:

```text
http://localhost:8787/auth/google/callback
```

Then visit the same profile's auth URL:

```text
http://localhost:8787/auth/google
```

### Twilio WhatsApp

Start with the Twilio WhatsApp sandbox.

Needed:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `OWNER_WHATSAPP_TO`

For sandbox testing:

```text
TWILIO_WHATSAPP_FROM=whatsapp:+1XXXXXXXXXX
OWNER_WHATSAPP_TO=whatsapp:+44XXXXXXXXXX
```

Your phone must join the Twilio WhatsApp sandbox first.

## Public Webhook URL

Twilio needs a public URL for inbound WhatsApp replies.

For local testing, run a tunnel such as ngrok for each profile:

```bash
ngrok http 8787
```

Then set:

```text
PUBLIC_BASE_URL=https://your-ngrok-url.ngrok-free.app
```

Twilio inbound WhatsApp webhook:

```text
https://your-ngrok-url.ngrok-free.app/webhooks/twilio/whatsapp
```

Twilio status callback:

```text
https://your-ngrok-url.ngrok-free.app/webhooks/twilio/status
```

For Dad's profile, do the same with `8788`.

## Test The Flow

After Gmail is connected and Twilio is configured:

```bash
curl -X POST http://localhost:8787/test/whatsapp
curl -X POST http://localhost:8787/jobs/check-inbox
```

If unread email exists, you should receive a WhatsApp message with:

```text
You have 3 new email summaries.

Tap View emails, then choose the email to open.
```

Once an email is open, you can talk naturally:

```text
view full email
make it warmer
regenerate
draft
send
confirm send
ignore
```

## Scheduled Digest

The agent can check Gmail on a schedule and only notify WhatsApp about useful emails.

```text
DIGEST_ENABLED=true
DIGEST_INTERVAL_MINUTES=60
DIGEST_STARTUP_SCAN=true
```

The filter skips common low-value inbox noise such as promotions, newsletters, no-reply senders, sales emails, webinars, and generic updates. Sensitive emails are turned into Gmail drafts instead of being sent directly from WhatsApp.

The health endpoint now shows which profile is running and which store file it is using:

```bash
curl http://localhost:8787/health
```

## Setup For Another User

Use this endpoint as the setup checklist:

```text
https://your-public-url.example.com/setup
```

It shows the steps for Gmail OAuth, Twilio WhatsApp webhooks, digest settings, and safety defaults.

## Client-Ready Version Later

To set this up for other people, the app needs:

- real database instead of local JSON
- user accounts
- OAuth token storage per client
- per-client WhatsApp number/destination
- billing
- admin dashboard
- audit logs
- stronger security and data retention controls

This folder is the first working prototype, not the final SaaS.
