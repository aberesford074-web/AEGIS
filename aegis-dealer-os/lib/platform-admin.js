import { requireUserSession } from './auth.js';
import { supabaseAdmin } from './supabase.js';

export async function requirePlatformAdmin(request, allowedRoles = ['owner', 'admin', 'support', 'read_only']) {
  const session = await requireUserSession(request);
  const supabase = supabaseAdmin();
  const { data: administrator, error } = await supabase
    .from('platform_admins')
    .select('clerk_user_id,role')
    .eq('clerk_user_id', session.clerkUserId)
    .maybeSingle();
  if (error) throw error;
  if (!administrator || !allowedRoles.includes(administrator.role)) {
    const accessError = new Error('AEGIS platform administrator access is required.');
    accessError.statusCode = 403;
    throw accessError;
  }
  return { ...session, platformRole: administrator.role, supabase };
}

export function requirePlatformWrite(session) {
  if (!['owner', 'admin'].includes(session.platformRole)) {
    const error = new Error('AEGIS owner or administrator access is required for this change.');
    error.statusCode = 403;
    throw error;
  }
}
