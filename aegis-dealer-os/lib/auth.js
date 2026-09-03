import { createClerkClient, verifyToken } from '@clerk/backend';
import { supabaseAdmin } from './supabase.js';

const browserParties = [
  'https://dealer.aegis-allterrain.co.uk',
  'https://aegis-dealer-os.vercel.app',
  'http://localhost:3000'
];

function validParty(value) {
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try { return new URL(value).origin; } catch { return null; }
  }
  return value.startsWith('h5') ? value : null;
}

function bearerToken(request) {
  const value = request.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : null;
}

export async function requireUserSession(request) {
  const token = bearerToken(request);
  if (!token) throw new ApiAuthError('Sign in is required.');

  // Native Clerk OAuth returns an opaque `oat_…` access token rather than a
  // JWT. Validate it through Clerk's OIDC userinfo endpoint. Browser sessions
  // and JWT integrations continue through verifyToken below.
  if (token.startsWith('oat_')) {
    const response = await fetch(
      `${process.env.CLERK_ISSUER || 'https://oriented-boar-7515.clerk.accounts.dev'}/oauth/userinfo`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) throw new ApiAuthError('The Clerk access token is invalid or expired.');
    const profile = await response.json();
    if (!profile.sub) throw new ApiAuthError('The signed-in user could not be identified.');
    return {
      clerkUserId: profile.sub,
      clerkOrganisationId: profile.org_id || null,
      clerkRole: profile.org_role || null
    };
  }

  const verificationOptions = {
    secretKey: process.env.CLERK_SECRET_KEY,
    authorizedParties: [...new Set([
      ...browserParties,
      validParty(process.env.APP_URL),
      validParty(process.env.COMMAND_CENTER_URL),
      validParty(process.env.CLERK_NATIVE_CLIENT_ID)
    ].filter(Boolean))]
  };
  if (process.env.CLERK_JWT_KEY && process.env.CLERK_JWT_KEY !== '[SENSITIVE]') {
    verificationOptions.jwtKey = process.env.CLERK_JWT_KEY;
  }

  let verified;
  try {
    verified = await verifyToken(token, verificationOptions);
  } catch {
    throw new ApiAuthError('Your secure sign-in session could not be verified. Please sign out and sign in again.');
  }
  const claims = verified.payload || verified;
  if (!claims.sub) throw new ApiAuthError('The signed-in user could not be identified.');
  return {
    clerkUserId: claims.sub,
    clerkOrganisationId: claims.org_id || null,
    clerkRole: claims.org_role || null
  };
}

export async function requireOrganisationSession(request) {
  const session = await requireUserSession(request);
  const selectedOrganisationId = String(request.headers['x-aegis-organisation-id'] || '').trim();
  if (selectedOrganisationId) {
    const supabase = supabaseAdmin();
    const { data: membership, error } = await supabase
      .from('organisation_memberships')
      .select('role')
      .eq('organisation_id', selectedOrganisationId)
      .eq('clerk_user_id', session.clerkUserId)
      .maybeSingle();
    if (error) throw error;
    if (!membership) throw new ApiAuthError('You do not have access to the selected client account.');
    const { data: organisation, error: organisationError } = await supabase
      .from('organisations')
      .select('clerk_organisation_id')
      .eq('id', selectedOrganisationId)
      .single();
    if (organisationError) throw organisationError;
    return {
      ...session,
      clerkOrganisationId: organisation.clerk_organisation_id,
      clerkRole: membership.role === 'owner' ? 'org:admin' : 'org:member'
    };
  }
  if (session.clerkOrganisationId) {
    return { ...session, clerkRole: session.clerkRole || 'org:member' };
  }

  // Native OAuth tokens may not carry an active organisation immediately after
  // the first workspace is provisioned. A single local membership remains a
  // tenant-safe fallback; users with multiple memberships must select one.
  const supabase = supabaseAdmin();
  const { data: memberships, error } = await supabase
    .from('organisation_memberships')
    .select('organisation_id, role')
    .eq('clerk_user_id', session.clerkUserId)
    .limit(2);
  if (error) throw error;
  if (memberships?.length === 1) {
    const membership = memberships[0];
    const { data: organisation, error: organisationError } = await supabase
      .from('organisations')
      .select('clerk_organisation_id')
      .eq('id', membership.organisation_id)
      .single();
    if (organisationError) throw organisationError;
    return {
      ...session,
      clerkOrganisationId: organisation.clerk_organisation_id,
      clerkRole: membership.role === 'owner' ? 'org:admin' : 'org:member'
    };
  }

  // Clerk does not always put an active organisation in a fresh browser JWT
  // immediately after an invitation is accepted. Resolve the user's accepted
  // Clerk memberships against organisations that AEGIS has already provisioned.
  if (!memberships?.length) {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const clerkMemberships = await clerk.users.getOrganizationMembershipList({
      userId: session.clerkUserId,
      limit: 100
    });
    const clerkOrganisationIds = (clerkMemberships.data || []).map((item) => item.organization.id);
    if (clerkOrganisationIds.length) {
      const { data: organisations, error: organisationsError } = await supabase
        .from('organisations')
        .select('clerk_organisation_id')
        .in('clerk_organisation_id', clerkOrganisationIds)
        .limit(2);
      if (organisationsError) throw organisationsError;
      if (organisations?.length === 1) {
        const clerkOrganisationId = organisations[0].clerk_organisation_id;
        const clerkMembership = clerkMemberships.data.find(
          (item) => item.organization.id === clerkOrganisationId
        );
        return {
          ...session,
          clerkOrganisationId,
          clerkRole: clerkMembership?.role || 'org:member'
        };
      }
    }
  }

  throw new ApiAuthError('Choose a dealer organisation before continuing.');
}

export async function requireClerkOrganisationAdmin(session) {
  if (['org:admin', 'org:owner'].includes(session.clerkRole)) return;
  const response = await fetch(
    `https://api.clerk.com/v1/organizations/${encodeURIComponent(session.clerkOrganisationId)}/memberships?limit=100`,
    { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } }
  );
  if (!response.ok) {
    const error = new Error('Unable to verify the dealer organisation administrator.');
    error.statusCode = 403;
    throw error;
  }
  const body = await response.json();
  const membership = body.data?.find(
    (item) => item.public_user_data?.user_id === session.clerkUserId
  );
  if (!membership || !['org:admin', 'org:owner'].includes(membership.role)) {
    const error = new Error('A Clerk organisation administrator must onboard this dealer.');
    error.statusCode = 403;
    throw error;
  }
}

export class ApiAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ApiAuthError';
    this.statusCode = 401;
  }
}
