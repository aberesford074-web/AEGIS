import { runSalesAgentAuditJobs } from '../../lib/sales-agent-queue.js';
import { supabaseAdmin } from '../../lib/supabase.js';

export default async function handler(request, response) {
  if (!process.env.CRON_SECRET || request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return response.status(401).json({ error: 'Unauthorised sales-agent worker request.' });
  }
  try {
    return response.status(200).json(await runSalesAgentAuditJobs({ supabase: supabaseAdmin(), limit: 5 }));
  } catch (error) {
    console.error('Sales-agent worker failed.', error);
    return response.status(500).json({ error: 'The sales-agent audit worker could not complete.' });
  }
}
