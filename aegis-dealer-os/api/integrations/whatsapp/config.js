import { handleApiError, methodNotAllowed } from '../../../lib/http.js';
import { verifyWhatsAppState, whatsappPublicConfiguration } from '../../../lib/meta-whatsapp.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
  try {
    verifyWhatsAppState(request.query.state);
    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).json(whatsappPublicConfiguration(request.query.state));
  } catch (error) {
    return handleApiError(response, error);
  }
}

