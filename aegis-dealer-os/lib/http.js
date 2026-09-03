import { ApiAuthError } from './auth.js';

export function methodNotAllowed(response, allowed) {
  response.setHeader('Allow', allowed.join(', '));
  return response.status(405).json({ error: 'Method not allowed.' });
}

export function handleApiError(response, error) {
  if (error instanceof ApiAuthError || error?.statusCode) return response.status(error.statusCode).json({ error: error.message });
  console.error(error);
  return response.status(500).json({ error: 'Unexpected server error.' });
}

export function requireText(value, name) {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  if (!cleaned) throw new Error(`${name} is required.`);
  return cleaned;
}
