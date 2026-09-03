import { handleApiError, methodNotAllowed } from '../lib/http.js';
import { createPublicSignupCheckout, publicSignupCors, publicSignupStatus } from '../lib/public-signup.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { enforceRateLimit, requestFingerprint } from '../lib/rate-limit.js';

export default async function handler(request, response) {
  publicSignupCors(response, request.headers.origin);
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (!['POST', 'GET'].includes(request.method)) return methodNotAllowed(response, ['POST', 'GET', 'OPTIONS']);
  try {
    const fingerprint = requestFingerprint(request, 'public-signup');
    await enforceRateLimit({
      key: `rate:signup:${request.method}:${fingerprint}`,
      limit: request.method === 'POST' ? 5 : 90,
      windowSeconds: request.method === 'POST' ? 3600 : 900,
      message: 'Too many signup requests. Please wait before trying again.'
    });
    const supabase = supabaseAdmin();
    if (request.method === 'POST') return response.status(201).json(await createPublicSignupCheckout({ supabase, body: request.body }));
    return response.status(200).json(await publicSignupStatus({ supabase, signupId: String(request.query?.signup || '').trim() }));
  } catch (error) {
    return handleApiError(response, error);
  }
}
