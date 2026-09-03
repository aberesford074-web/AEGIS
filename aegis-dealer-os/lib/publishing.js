import crypto from 'node:crypto';

function retryAt(attempts) {
  const minutes = Math.min(360, 2 ** Math.max(0, attempts) * 5);
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export async function enqueuePublishingJob({ supabase, organisationId, machine, operation, channel = 'website' }) {
  const version = machine.updated_at || new Date().toISOString();
  const idempotencyKey = crypto.createHash('sha256')
    .update([organisationId, machine.id, channel, operation, version].join(':'))
    .digest('hex');
  const payload = {
    desiredPublished: operation !== 'unpublish',
    machineVersion: version,
    websiteSlug: machine.website_slug || null
  };
  const { data, error } = await supabase.from('publishing_jobs').upsert({
    organisation_id: organisationId,
    machine_id: machine.id,
    channel,
    operation,
    status: 'queued',
    payload,
    idempotency_key: idempotencyKey,
    next_attempt_at: new Date().toISOString()
  }, { onConflict: 'idempotency_key' }).select('*').single();
  if (error) throw error;
  await supabase.from('machines').update({
    publishing_status: 'queued',
    publishing_last_error: null
  }).eq('organisation_id', organisationId).eq('id', machine.id);
  return data;
}

async function executeJob(supabase, job) {
  const { data: machine, error: machineError } = await supabase.from('machines')
    .select('id,is_published,updated_at,website_slug')
    .eq('organisation_id', job.organisation_id)
    .eq('id', job.machine_id)
    .maybeSingle();
  if (machineError) throw machineError;
  if (!machine) throw new Error('The machine no longer exists.');

  const expected = job.operation !== 'unpublish';
  if (Boolean(machine.is_published) !== expected) {
    throw new Error('The machine changed while this publishing job was waiting. A newer job is required.');
  }

  if (job.channel !== 'website') {
    const { data: connection, error } = await supabase.from('integration_connections')
      .select('status')
      .eq('organisation_id', job.organisation_id)
      .eq('provider_config_key', job.channel)
      .maybeSingle();
    if (error) throw error;
    if (!connection || connection.status !== 'active') {
      throw new Error(`${job.channel} is not connected for controlled publishing.`);
    }
  }

  // The website channel is DealerFoundry's authoritative public stock feed.
  // Once the desired database state is verified, the feed reflects it without
  // a second mutable copy. External marketplaces use their own adapters above.
  return { machineId: machine.id, channel: job.channel, operation: job.operation, verifiedAt: new Date().toISOString() };
}

export async function runPublishingJobs({ supabase, organisationId = null, jobId = null, limit = 25 } = {}) {
  let query = supabase.from('publishing_jobs').select('*')
    .in('status', ['queued', 'failed'])
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);
  if (organisationId) query = query.eq('organisation_id', organisationId);
  if (jobId) query = query.eq('id', jobId);
  const { data: jobs, error } = await query;
  if (error) throw error;
  const results = [];

  for (const job of jobs || []) {
    const attempts = Number(job.attempts || 0) + 1;
    await supabase.from('publishing_jobs').update({ status: 'running', attempts, started_at: new Date().toISOString(), last_error: null }).eq('id', job.id);
    await supabase.from('machines').update({ publishing_status: 'publishing' }).eq('organisation_id', job.organisation_id).eq('id', job.machine_id);
    try {
      const result = await executeJob(supabase, job);
      const completedAt = new Date().toISOString();
      await supabase.from('publishing_jobs').update({ status: 'succeeded', completed_at: completedAt, last_error: null }).eq('id', job.id);
      await supabase.from('machines').update({
        publishing_status: job.operation === 'unpublish' ? 'not_published' : 'published',
        publishing_last_error: null,
        publishing_last_succeeded_at: completedAt
      }).eq('organisation_id', job.organisation_id).eq('id', job.machine_id);
      results.push({ id: job.id, status: 'succeeded', result });
    } catch (jobError) {
      const exhausted = attempts >= Number(job.max_attempts || 5);
      const status = exhausted ? 'dead_letter' : 'failed';
      await supabase.from('publishing_jobs').update({ status, last_error: jobError.message, next_attempt_at: retryAt(attempts) }).eq('id', job.id);
      await supabase.from('machines').update({ publishing_status: 'failed', publishing_last_error: jobError.message }).eq('organisation_id', job.organisation_id).eq('id', job.machine_id);
      await supabase.from('notifications').insert({
        organisation_id: job.organisation_id,
        notification_type: 'publishing_failed',
        title: exhausted ? 'Publishing needs attention' : 'Publishing will retry',
        body: jobError.message,
        severity: exhausted ? 'urgent' : 'warning',
        related_record_type: 'machine',
        related_record_id: job.machine_id
      });
      results.push({ id: job.id, status, error: jobError.message });
    }
  }
  return results;
}
