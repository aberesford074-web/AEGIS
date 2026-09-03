import { createClerkClient } from '@clerk/backend';
import { requireClerkOrganisationAdmin, requireOrganisationSession, requireUserSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../../lib/http.js';
import { organisationContext, requireManager, supabaseAdmin } from '../../lib/supabase.js';

const onboardingSteps = new Set(['business', 'branding', 'website', 'stock', 'team', 'launch']);

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  try {
    if (request.method === 'GET' || request.method === 'PATCH') {
      const context = await organisationContext(await requireOrganisationSession(request));
      if (request.method === 'PATCH') {
        requireManager(context.membership);
        const step = String(request.body?.step || '').trim();
        if (!onboardingSteps.has(step)) return response.status(400).json({ error: 'Choose a valid onboarding step.' });
        const state = { ...(context.organisation.onboarding_state || {}), [step]: request.body?.complete !== false };
        const complete = [...onboardingSteps].every((name) => state[name] === true);
        const { data, error } = await context.supabase.from('organisations').update({
          onboarding_state: state,
          onboarding_completed_at: complete ? (context.organisation.onboarding_completed_at || new Date().toISOString()) : null
        }).eq('id', context.organisation.id).select('onboarding_state,onboarding_completed_at').single();
        if (error) throw error;
        return response.status(200).json({ onboarding: data });
      }
      return response.status(200).json({ onboarding: { state: context.organisation.onboarding_state || {}, completedAt: context.organisation.onboarding_completed_at, steps: [...onboardingSteps] } });
    }
    const session = await requireUserSession(request);
    const supabase = supabaseAdmin();
    let clerkOrganisation;
    if (session.clerkOrganisationId) {
      await requireClerkOrganisationAdmin(session);
      const clerkResponse = await fetch(
        `https://api.clerk.com/v1/organizations/${encodeURIComponent(session.clerkOrganisationId)}`,
        { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } }
      );
      if (!clerkResponse.ok) throw new Error('Unable to load the Clerk organisation.');
      clerkOrganisation = await clerkResponse.json();
    } else {
      const { data: existingMembership } = await supabase
        .from('organisation_memberships')
        .select('organisation_id')
        .eq('clerk_user_id', session.clerkUserId)
        .limit(1)
        .maybeSingle();
      if (existingMembership) {
        const { data: existingOrganisation, error: existingError } = await supabase
          .from('organisations')
          .select('id, name, clerk_organisation_id, public_slug')
          .eq('id', existingMembership.organisation_id)
          .single();
        if (existingError) throw existingError;
        return response.status(200).json({ organisation: existingOrganisation });
      }
      const accessError = new Error('Dealer workspaces are created after subscription confirmation. Use the secure AEGIS invitation sent to your business email.');
      accessError.statusCode = 403;
      throw accessError;
      /*
       * Legacy self-service workspace creation is intentionally disabled. Paid
       * public signups are provisioned only by the signed Stripe webhook.
       */
      const name = String(request.body?.name || 'Beresford Machinery').trim();
      const slug = String(request.body?.slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      // Clerk organisation slugs are an optional Clerk-instance feature. AEGIS
      // owns the public dealer slug in Supabase, so provisioning must not fail
      // when a customer has Clerk slugs disabled.
      clerkOrganisation = await clerk.organizations.createOrganization({
        name,
        createdBy: session.clerkUserId
      });
    }
    const name = clerkOrganisation.name;
    const publicSlug = String(clerkOrganisation.slug || name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data: organisation, error } = await supabase.from('organisations').upsert({ clerk_organisation_id: clerkOrganisation.id, name, public_slug: publicSlug }, { onConflict: 'clerk_organisation_id' }).select('id, name, clerk_organisation_id, public_slug').single();
    if (error) throw error;
    const { error: membershipError } = await supabase.from('organisation_memberships').upsert({ organisation_id: organisation.id, clerk_user_id: session.clerkUserId, role: 'owner' });
    if (membershipError) throw membershipError;
    const { error: automationError } = await supabase.from('automation_rules').upsert([
      {
        organisation_id: organisation.id,
        name: 'Daily dealer briefing',
        kind: 'daily_brief',
        cadence_minutes: 1440,
        configuration: {},
        requires_approval: false
      },
      {
        organisation_id: organisation.id,
        name: 'Quiet opportunity follow-ups',
        kind: 'stale_follow_up',
        cadence_minutes: 1440,
        configuration: { inactivityDays: 5 },
        requires_approval: true
      }
    ], { onConflict: 'organisation_id,kind,name' });
    if (automationError) throw automationError;
    return response.status(201).json({ organisation });
  } catch (error) {
    return handleApiError(response, error);
  }
}
