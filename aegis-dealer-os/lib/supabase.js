import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function organisationContext(session) {
  const supabase = supabaseAdmin();
  const { data: organisation, error } = await supabase.from('organisations').select('id, name, clerk_organisation_id, public_slug, website_url, website_connection_status, portal_status, portal_tier, enabled_modules, onboarding_state, onboarding_completed_at').eq('clerk_organisation_id', session.clerkOrganisationId).maybeSingle();
  if (error) throw error;
  if (!organisation) throw new Error('This dealer organisation has not been onboarded.');
  let { data: membership, error: membershipError } = await supabase.from('organisation_memberships').select('role').eq('organisation_id', organisation.id).eq('clerk_user_id', session.clerkUserId).maybeSingle();
  if (membershipError) throw membershipError;
  // A valid Clerk organisation claim proves that an invited client has joined.
  // Mirror it locally on first access so the tenant-safe API can apply its own
  // operational roles without requiring a separate webhook to arrive first.
  if (!membership && session.clerkOrganisationId === organisation.clerk_organisation_id) {
    const role = ['org:admin', 'org:owner'].includes(session.clerkRole) ? 'manager' : 'operations';
    const { data: mirrored, error: mirrorError } = await supabase
      .from('organisation_memberships')
      .upsert({ organisation_id: organisation.id, clerk_user_id: session.clerkUserId, role })
      .select('role')
      .single();
    if (mirrorError) throw mirrorError;
    membership = mirrored;
  }
  if (!membership) {
    const accessError = new Error('You do not have access to this dealer organisation.');
    accessError.statusCode = 403;
    throw accessError;
  }
  return { supabase, organisation, membership };
}

export function requireManager(membership) {
  if (!['owner', 'manager'].includes(membership.role)) {
    const error = new Error('Manager approval is required for this action.');
    error.statusCode = 403;
    throw error;
  }
}
