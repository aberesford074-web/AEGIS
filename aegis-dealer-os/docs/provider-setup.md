# Provider setup checklist

Create one production project/account for each provider. AEGIS is multi-tenant:
dealer organisations and their data live inside the application, not in separate
provider projects.

## Vercel

- Import `aegis-dealer-os` as the project root.
- Add every variable in `.env.example` for Production, Preview and Development
  as appropriate; secrets must never be exposed to the browser.
- Add `CRON_SECRET` as a random value of at least 16 characters. Vercel will
  send it in the cron request `Authorization` header.
- The included schedule runs daily and therefore works on a Hobby project. For
  more frequent syncs, use Upstash scheduling/queues or a Vercel plan that
  permits higher-frequency cron jobs.

## Supabase

- Create a project in the preferred data-residency region.
- Run `supabase/migrations/0001_core.sql` in the SQL editor or through the
  Supabase CLI.
- Store only `SUPABASE_SECRET_KEY` in Vercel server-side environment variables.
  Never expose it in browser code.

## Clerk

- Enable Organisations.
- Set the AEGIS production URL and preview URL as allowed origins.
- Configure a JWT template that includes the active `org_id` and `org_role`.
- Only a Clerk organisation admin can call the AEGIS onboarding endpoint.

## Nango

- Create a provider configuration per connected system—not per dealer.
- A dealer completes OAuth/credential connection inside AEGIS; store only the
  Nango connection identifier in `integration_connections`.
- Do not copy CRM, inbox, DMS or telematics credentials into Supabase.

## OpenRouter, Stripe, Upstash and Vanta

- Use OpenRouter only from Vercel server functions. AI drafts remain review-only.
- Configure Stripe webhook signing before enabling paid plans or checkout.
- Use the existing Upstash environment values for rate limits, cache and locks.
- Connect Vanta after the Vercel, Clerk, GitHub, Supabase and other production
  accounts exist; Vanta is evidence/compliance tooling, not an application data
  processor.
