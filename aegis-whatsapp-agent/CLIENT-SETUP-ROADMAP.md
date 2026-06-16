# Client Setup Roadmap

The MVP is owner-mode. It proves the core experience on Aaron's Gmail and WhatsApp first.

To make this reusable for clients, build these layers in order.

## Phase 1: Aaron Works First

- One Gmail account
- One WhatsApp recipient
- Local JSON store
- Manual inbox check endpoint
- WhatsApp approval commands

Success means:

- unread Gmail arrives
- Aegis sends WhatsApp summary
- Aaron replies `1`, `2`, `3`, or `4`
- Gmail draft/send/archive happens

## Phase 2: Hosted Owner Version

- Deploy to Render, Railway, or Vercel/Node host
- Use a stable public URL
- Use Twilio production WhatsApp sender or sandbox while testing
- Add scheduled inbox polling
- Add basic admin logs

## Phase 3: Client Version

Replace local JSON with a database.

Recommended tables:

- users
- connected_email_accounts
- whatsapp_recipients
- email_actions
- approvals
- audit_logs

Each client needs:

- their own Google OAuth connection
- their own approved WhatsApp recipient or sender setup
- their own prompt/preferences
- their own safety settings

## Phase 4: Paid Product

Add:

- Stripe checkout
- onboarding form
- terms/consent
- client dashboard
- usage limits
- support workflow

## Safety Defaults

Keep approval required by default.

Never auto-send:

- legal emails
- financial emails
- medical emails
- password/security emails
- complaints or disputes
- HR/employment messages

These should create drafts or request manual review.
