# AEGIS Dealer OS platform foundation

This folder is the migration target for the existing Google Apps Script Sales OS.
It follows the infrastructure published by Meuze, with Vercel replacing AWS as the
application-hosting layer:

| Responsibility | AEGIS provider |
| --- | --- |
| Web application, APIs, scheduled jobs | Vercel |
| Tenant database and machine media | Supabase (Postgres + Storage) |
| Authentication and organisation membership | Clerk |
| Gmail | Direct Google OAuth with encrypted server-side credentials |
| Other connected dealer systems | Provider-specific OAuth or a managed integration service |
| AI inference | OpenRouter |
| Subscription billing | Stripe |
| Cache, rate limits and job locks | Upstash Redis |
| Security/compliance evidence | Vanta |

## Non-negotiable product boundaries

- A dealer's data is isolated to its organisation at the database layer.
- AI may prepare, prioritise, classify and recommend. It must not send customer
  messages, change commercial terms, publish stock, or commit spend without a
  recorded human approval.
- Provider credentials never enter the native app. Gmail tokens are encrypted
  server-side before storage and are redacted from every connection response.
- Supabase is the system of record. Google Sheets, Excel and CSV are import/export
  tools, not parallel databases that can silently drift away from AEGIS.

## Deployment status

- Production API: `https://aegis-dealer-os.vercel.app`
- Vercel project: `aarons-projects-ad3d34e3/aegis-dealer-os`
- Supabase is provisioned in London and linked to Production and Preview.
- The core tenant schema and private `dealer-media` bucket are live.
- The daily sync job is protected by a server-only `CRON_SECRET`.
- Gmail OAuth, OpenRouter, Stripe, Upstash and Vanta remain optional capabilities
  until their projects are connected.

Run future database migrations with `pnpm db:migrate` after securely loading the
Vercel Production environment. Applied migrations are checksummed and cannot be
silently edited.

To apply one new migration while auditing unrelated historical checksum drift,
run `node scripts/migrate.js 0004_relationship_deals.sql`. The targeted migration
is still checksummed and recorded in the same production ledger.

The universal business-agent index is migration `0007_business_knowledge.sql`.
After reviewing it, activate it with
`node scripts/migrate.js 0007_business_knowledge.sql`, then deploy the API before
shipping the matching native build.

## Migration order

1. Organisations, users and branch records.
2. Customers, contacts, machine stock and installed-base records.
3. Opportunities, notes, activities and approval history.
4. OAuth connections for inbox, CRM, DMS/ERP, OEM telematics and marketplace.
5. Sales cockpit, then operations signals.

## What is live in this codebase

- Clerk JWT verification and Clerk-organisation-to-AEGIS-organisation mapping.
- Organisation-scoped API routes for the dashboard, opportunities, approvals and
  connected-system records.
- Manager-only approval decisions and integration registration.
- Upstash-backed per-dealer AI request limiting.
- Tenant-specific automation rules, execution history and operator notifications.
- Daily dealer briefings and quiet-opportunity detection.
- Automatic follow-up preparation routed into the human approval queue.
- Guided CSV, TSV and modern Excel (`.xlsx`) imports with explicit field mapping,
  validation, match keys and non-destructive duplicate handling.
- First-class email campaign drafts, audiences, schedules, pause/resume state,
  per-recipient delivery results and unsubscribe suppression.
- Approval-first AI sales-agent briefs. Each brief can inspect a prospect's public
  website, cite observable improvement opportunities, prepare discovery questions
  and an appointment ask, then wait for a manager approval before outreach.
- A scheduled sales-agent audit queue. Managers can queue up to 100 new prospect
  audits per UTC day; a protected worker processes them in small batches with
  retries, deduplication and a daily-safe pace, then returns each brief to approval.
- A universal, organisation-scoped business knowledge projection. Existing
  companies, contacts, machines, deals, activities, campaigns, approvals,
  integrations and audit events are indexed automatically. Future modules join
  the agent by adding the standard sync trigger, or by storing flexible records
  in `business_records`; native chat does not need a new keyword router for each
  new record type. Authenticated clients can create those future types through
  `api/records`; the Mac agent requires inline confirmation before it writes.

## Business-agent knowledge boundary

Supabase is the system of record, but the model never receives Supabase service
credentials or unrestricted SQL access. Authenticated API requests resolve the
signed-in Clerk organisation, retrieve a bounded set of relevant live records
from `business_knowledge`, and return only that evidence plus a dynamic catalog
of available record types. Provider credentials and tokens are removed before
records enter the knowledge projection. Mutating or commercial actions continue
to use structured APIs and the human approval queue.

## AI sales-agent calls

`/api/sales-agent` is the first outbound-sales layer. It reads organisation-scoped
prospects, safely fetches a public HTML website when one is supplied, and uses the
server-side `OPENAI_API_KEY` (or `AEGIS_AGENT_API_KEY`) to generate a structured
call brief. The brief is stored in `sales_agent_runs` and is visible in the
Command Centre's **AI Sales Agent** screen.

The agent must identify itself as an AI assistant, ask permission to continue,
honour opt-outs and use only supplied public evidence. It does not dial, record,
send messages or book appointments automatically. A compliant telephony provider
(for example Twilio, Telnyx, Retell or a SIP trunk) and a review of UK PECR,
US TCPA/state rules, call recording consent and caller-ID requirements are needed
before enabling outbound calls. Configure the provider only after a human approves
the brief; do not put any provider secret in browser code.

For the first implementation, use Apollo as the B2B company/contact enrichment
source and Twilio Programmable Voice as the telephony adapter, subject to their
country verification, contracts and your own legal review. The provider adapters
remain disabled until their server-side credentials and suppression rules are
configured.

The next implementation step is native Clerk sign-in and creation of the first
real dealer organisation. Apps Script is an import-only migration source and is
not part of the target runtime. Once its records have been checked in Supabase,
the legacy bridge can be disabled permanently.

## Gmail activation

Create a Google Cloud OAuth 2.0 **Web application** client and enable the Gmail
API. Register this exact authorised redirect URI:

`https://aegis-dealer-os.vercel.app/api/integrations/gmail/callback`

Set `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`,
`GMAIL_OAUTH_STATE_SECRET` and `GMAIL_TOKEN_ENCRYPTION_KEY` in Vercel Production,
then deploy the API. The two AEGIS secrets must be separate random values of at
least 32 characters. Google should initially list the dealer account as an OAuth
test user; production use of the sensitive `gmail.send` scope requires Google's
normal OAuth verification process.

The native Connections screen obtains a short-lived, tenant-bound authorisation
URL from the API and opens Google in an `ASWebAuthenticationSession`. AI cannot
grant mailbox access or manufacture a pending Gmail connection; only the user can
finish Google's consent screen.

## Scheduling note

The Vercel Hobby cron remains the daily 05:00 UTC automation sweep. Campaigns
use Supabase Cron to call the protected `/api/jobs/run-campaigns` worker every
five minutes, so precise campaign scheduling does not require a paid Vercel
plan. Configure or rotate that job with `pnpm scheduler:configure` after loading
the Production environment. `CRON_SECRET` is stored in Supabase Vault rather
than in the scheduled SQL command. The worker sends conservative batches of
individual Gmail messages and resumes remaining recipients on the next run.

## WhatsApp channel architecture

WhatsApp is a channel into the same organisation-scoped AEGIS business agent;
it is not a second, independent agent and it does not connect directly to the
Supabase service role. The hosted webhook verifies Meta's exact request
signature, resolves the connected business number to one dealer organisation,
and stores conversations and messages in the tenant-safe WhatsApp tables.
Unknown numbers are recorded as `unpaired` and blocked from agent execution
until a dealer manager explicitly pairs them as staff or a customer.

OpenClaw remains an optional local web/browser sidecar for the native app. It is
not the WhatsApp gateway or the source of business permissions: relying on it
would make dealer messaging depend on a particular Mac being awake and would
bypass AEGIS's central approvals and audit trail.

The Connections screen uses Meta Embedded Signup. Before dealers can use the
one-button connection flow, the AEGIS operator must create and verify the Meta
Tech Provider app, configure its WhatsApp product and set these Vercel
Production values directly (never paste secrets into chat):

- `META_WHATSAPP_APP_ID`
- `META_WHATSAPP_APP_SECRET`
- `META_WHATSAPP_CONFIG_ID`
- `META_WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_OAUTH_STATE_SECRET`
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`

The webhook URL to register in Meta is:

`https://aegis-dealer-os.vercel.app/api/integrations/whatsapp/webhook`

Apply `0009_whatsapp_channel.sql` and deploy the API before enabling the Meta
app. Access tokens are AES-GCM encrypted before storage and are never returned
by the Connections API.
