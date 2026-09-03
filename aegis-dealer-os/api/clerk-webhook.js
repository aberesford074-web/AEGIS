import { createClerkClient } from '@clerk/backend';
import { verifyWebhook } from '@clerk/backend/webhooks';
import { supabaseAdmin } from '../lib/supabase.js';

export const config = { api: { bodyParser: false } };

async function rawRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function clerkRole(role, userEmail, ownerEmail) {
  if (String(userEmail || '').trim().toLowerCase() === String(ownerEmail || '').trim().toLowerCase()) return 'owner';
  return ['org:admin', 'org:owner'].includes(role) ? 'manager' : 'operations';
}

async function organisationForClerkID(supabase, clerkOrganisationId) {
  const { data, error } = await supabase.from('organisations')
    .select('id,client_contact_email,invitation_accepted_at')
    .eq('clerk_organisation_id', clerkOrganisationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function recordAudit(supabase, organisationId, eventType, payload) {
  const { error } = await supabase.from('audit_events').insert({
    organisation_id: organisationId,
    event_type: eventType,
    record_type: 'organisation',
    record_id: organisationId,
    payload
  });
  if (error) console.error('Clerk webhook audit event failed.', error);
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).send('Method not allowed.');
  try {
    const rawBody = await rawRequestBody(request);
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers || {})) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
      else if (value != null) headers.set(name, String(value));
    }
    const appURL = String(process.env.APP_URL || 'https://aegis-dealer-os.vercel.app').replace(/\/$/, '');
    const event = await verifyWebhook(new Request(`${appURL}/api/webhooks/clerk`, {
      method: 'POST',
      headers,
      body: rawBody
    }), { signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET });
    const data = event.data || {};
    const clerkOrganisationId = data.organization?.id || data.organization_id || data.public_organization_data?.id;
    if (!clerkOrganisationId) return response.status(200).json({ received: true, ignored: true });

    const supabase = supabaseAdmin();
    const organisation = await organisationForClerkID(supabase, clerkOrganisationId);
    if (!organisation) return response.status(200).json({ received: true, ignored: true });

    if (event.type === 'organizationMembership.created' || event.type === 'organizationMembership.updated') {
      const clerkUserId = data.public_user_data?.user_id || data.user_id;
      if (clerkUserId) {
        let userEmail = data.public_user_data?.identifier || data.public_user_data?.email_address || null;
        if (!userEmail) {
          const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
          const user = await clerk.users.getUser(clerkUserId);
          userEmail = user.primaryEmailAddress?.emailAddress || null;
        }
        const role = clerkRole(data.role, userEmail, organisation.client_contact_email);
        const { error: membershipError } = await supabase.from('organisation_memberships').upsert({
          organisation_id: organisation.id,
          clerk_user_id: clerkUserId,
          role
        });
        if (membershipError) throw membershipError;
        const acceptedAt = new Date().toISOString();
        const { error: organisationError } = await supabase.from('organisations').update({
          invitation_status: 'accepted',
          invitation_accepted_at: organisation.invitation_accepted_at || acceptedAt,
          invitation_last_error: null
        }).eq('id', organisation.id);
        if (organisationError) throw organisationError;
        await recordAudit(supabase, organisation.id, 'client_membership_provisioned', { clerk_user_id: clerkUserId, role });
      }
    }

    if (event.type === 'organizationMembership.deleted') {
      const clerkUserId = data.public_user_data?.user_id || data.user_id;
      if (clerkUserId) {
        const { error } = await supabase.from('organisation_memberships')
          .delete()
          .eq('organisation_id', organisation.id)
          .eq('clerk_user_id', clerkUserId)
          .neq('role', 'owner');
        if (error) throw error;
        await recordAudit(supabase, organisation.id, 'client_membership_removed', { clerk_user_id: clerkUserId });
      }
    }

    if (event.type === 'organizationInvitation.accepted') {
      const { error } = await supabase.from('organisations').update({
        invitation_status: 'accepted',
        invitation_accepted_at: new Date().toISOString(),
        invitation_last_error: null
      }).eq('id', organisation.id);
      if (error) throw error;
      await recordAudit(supabase, organisation.id, 'client_invitation_accepted', { email: data.email_address || organisation.client_contact_email });
    }

    return response.status(200).json({ received: true });
  } catch (error) {
    console.error('Clerk webhook processing failed.', error);
    return response.status(401).send('Invalid webhook.');
  }
}
