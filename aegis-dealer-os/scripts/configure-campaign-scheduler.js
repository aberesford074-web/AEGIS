import process from 'node:process';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';

const connectionString = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL;
let cronSecret = process.env.CRON_SECRET?.trim();
const configuredAppURL = process.env.APP_URL?.trim();
const appURL = (!configuredAppURL || configuredAppURL === '[SENSITIVE]' ? 'https://aegis-dealer-os.vercel.app' : configuredAppURL).replace(/\/$/, '');
if (process.argv.includes('--rotate-vercel-secret')) {
  cronSecret = crypto.randomBytes(32).toString('hex');
  const update = spawnSync('pnpm', [
    'dlx', 'vercel@latest', 'env', 'add', 'CRON_SECRET', 'production',
    '--force', '--sensitive', '--yes'
  ], { input: `${cronSecret}\n`, encoding: 'utf8', env: process.env });
  if (update.status !== 0) throw new Error(update.stderr || 'Vercel did not accept the rotated CRON_SECRET.');
  console.log('Rotated the Vercel Production cron secret.');
}
if (!connectionString) throw new Error('A Postgres connection string is required.');
if (!cronSecret) throw new Error('CRON_SECRET is required.');

const sql = postgres(connectionString, { max: 1, ssl: 'require', connect_timeout: 20, idle_timeout: 5 });
const secretName = 'aegis_campaign_cron_secret';
const jobName = 'aegis-campaign-worker';

try {
  await sql.unsafe('create extension if not exists pg_cron with schema pg_catalog');
  await sql.unsafe('create extension if not exists pg_net with schema extensions');

  const [existingSecret] = await sql`
    select id from vault.decrypted_secrets where name = ${secretName} limit 1
  `;
  if (existingSecret) {
    await sql`select vault.update_secret(${existingSecret.id}, ${cronSecret}, ${secretName}, ${'AEGIS campaign worker authentication'})`;
  } else {
    await sql`select vault.create_secret(${cronSecret}, ${secretName}, ${'AEGIS campaign worker authentication'})`;
  }

  const existingJobs = await sql`select jobid from cron.job where jobname = ${jobName}`;
  for (const job of existingJobs) await sql`select cron.unschedule(${job.jobid}::bigint)`;

  const command = `
    select net.http_post(
      url := '${appURL}/api/jobs/run-campaigns',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
          where name = '${secretName}' limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    );
  `;
  const [job] = await sql`select cron.schedule(${jobName}, ${'*/5 * * * *'}, ${command}) as job_id`;
  console.log(`Configured ${jobName} every five minutes (job ${job.job_id}).`);
} finally {
  await sql.end();
}
