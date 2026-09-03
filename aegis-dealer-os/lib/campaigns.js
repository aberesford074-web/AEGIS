const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

export function normaliseCampaignRecipient(row) {
  const email = String(row?.email || '').trim().toLowerCase();
  if (!validEmail(email)) return null;
  return {
    contact_id: row.id || row.contact_id || null,
    email,
    name: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.name || null,
    status: row.email_marketing_status === 'unsubscribed' ? 'suppressed' : 'queued'
  };
}

export function uniqueCampaignRecipients(rows) {
  const seen = new Set();
  return (rows || []).map(normaliseCampaignRecipient).filter((row) => {
    if (!row || seen.has(row.email)) return false;
    seen.add(row.email);
    return true;
  });
}

export function campaignCanTransition(from, to) {
  const transitions = {
    draft: new Set(['scheduled', 'cancelled']),
    scheduled: new Set(['paused', 'cancelled']),
    sending: new Set(['paused', 'cancelled', 'completed', 'failed']),
    paused: new Set(['scheduled', 'cancelled']),
    completed: new Set(),
    cancelled: new Set(),
    failed: new Set(['scheduled', 'cancelled'])
  };
  return transitions[from]?.has(to) || false;
}

export function campaignProgress({ recipient_count = 0, sent_count = 0, failed_count = 0 }) {
  const total = Math.max(0, Number(recipient_count) || 0);
  const sent = Math.max(0, Number(sent_count) || 0);
  const failed = Math.max(0, Number(failed_count) || 0);
  return { total, sent, failed, remaining: Math.max(0, total - sent - failed) };
}
