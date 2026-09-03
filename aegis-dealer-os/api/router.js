import activities from './activities/index.js';
import accounts from './accounts/index.js';
import accountActions from './accounts/actions.js';
import approvalDecision from './approvals/[id].js';
import approvals from './approvals/index.js';
import automations from './automations/index.js';
import billing from './billing/index.js';
import campaigns from './campaigns/index.js';
import customers from './customers/index.js';
import dashboard from './dashboard.js';
import deals from './deals/index.js';
import demo from './demo/index.js';
import health from './health.js';
import gmailCallback from './integrations/gmail/callback.js';
import gmailStart from './integrations/gmail/start.js';
import integrations from './integrations/index.js';
import whatsappComplete from './integrations/whatsapp/complete.js';
import whatsappConfig from './integrations/whatsapp/config.js';
import whatsappStart from './integrations/whatsapp/start.js';
import whatsappStatus from './integrations/whatsapp/status.js';
import whatsappPair from './integrations/whatsapp/pair.js';
import knowledge from './knowledge.js';
import runAutomations from './jobs/run-automations.js';
import runCampaigns from './jobs/run-campaigns.js';
import runOperations from './jobs/run-operations.js';
import runSalesAgent from './jobs/run-sales-agent.js';
import machines from './machines/index.js';
import notifications from './notifications/index.js';
import onboarding from './onboarding/organisation.js';
import opportunities from './opportunities/index.js';
import os from './os/index.js';
import platform from './platform/index.js';
import prospects from './prospects/index.js';
import proposals from './proposals/index.js';
import publicSignup from './public-signup.js';
import publicBooking from './public-booking.js';
import records from './records/index.js';
import search from './search.js';
import salesAgent from './sales-agent/index.js';
import stripeWebhook from './stripe-webhook.js';

const handlers = {
  accounts,
  accountActions,
  activities,
  approvalDecision,
  approvals,
  automations,
  billing,
  campaigns,
  customers,
  dashboard,
  deals,
  demo,
  gmailCallback,
  gmailStart,
  health,
  integrations,
  whatsappComplete,
  whatsappConfig,
  whatsappStart,
  whatsappStatus,
  whatsappPair,
  knowledge,
  machines,
  notifications,
  onboarding,
  opportunities,
  os,
  platform,
  prospects,
  proposals,
  publicSignup,
  publicBooking,
  records,
  runAutomations,
  runCampaigns,
  runOperations,
  runSalesAgent,
  search,
  salesAgent,
  stripeWebhook
};

export default async function handler(request, response) {
  const route = Array.isArray(request.query?.route)
    ? request.query.route[0]
    : request.query?.route;
  const selected = handlers[route];
  if (!selected) return response.status(404).json({ error: 'AEGIS API route not found.' });
  return selected(request, response);
}
