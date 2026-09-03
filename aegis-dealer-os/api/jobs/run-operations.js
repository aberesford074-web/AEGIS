import { runPublishingJobs } from '../../lib/publishing.js';
import { expireReservations } from '../../lib/reservations.js';
import { supabaseAdmin } from '../../lib/supabase.js';

export default async function handler(request, response) {
  const authorization = request.headers.authorization || '';
  if (!process.env.CRON_SECRET || authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return response.status(401).json({ error: 'Unauthorised operations request.' });
  }
  try {
    const supabase = supabaseAdmin();
    const [publishing, expiredReservations] = await Promise.all([
      runPublishingJobs({ supabase, limit: 100 }),
      expireReservations(supabase)
    ]);
    return response.status(200).json({ publishing, expiredReservations });
  } catch (error) {
    console.error('Operations worker failed.', error);
    return response.status(500).json({ error: 'The operations worker could not complete.' });
  }
}
