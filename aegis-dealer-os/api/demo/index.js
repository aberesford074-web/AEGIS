import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed } from '../../lib/http.js';
import { organisationContext, requireManager } from '../../lib/supabase.js';

async function one(query) {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    requireManager(context.membership);
    const orgId = context.organisation.id;
    const now = new Date();

    let customer = await one(context.supabase.from('customers').select('*')
      .eq('organisation_id', orgId).eq('source_system', 'aegis_demo').eq('external_id', 'northfield-logistics'));
    if (!customer) {
      const result = await context.supabase.from('customers').insert({
        organisation_id: orgId,
        name: 'Northfield Logistics Ltd',
        primary_contact_name: 'Sarah Mitchell',
        primary_contact_email: 'sarah@northfield-logistics.example',
        primary_contact_phone: '+44 7700 900321',
        lifecycle_stage: 'customer',
        relationship_roles: ['buyer', 'customer'],
        source_system: 'aegis_demo',
        external_id: 'northfield-logistics',
        notes: 'Demonstration customer for the AEGIS enquiry-to-sale journey.'
      }).select('*').single();
      if (result.error) throw result.error;
      customer = result.data;
    }

    let machine = await one(context.supabase.from('machines').select('*')
      .eq('organisation_id', orgId).eq('source_system', 'aegis_demo').eq('external_id', 'toyota-demo-001'));
    if (!machine) {
      const result = await context.supabase.from('machines').insert({
        organisation_id: orgId,
        make: 'Toyota',
        model: '8FBE20U',
        machine_type: 'Electric forklift',
        serial_number: 'AEGIS-DEMO-001',
        year: 2018,
        hours: 3245,
        ownership_status: 'stock',
        status: 'in-stock',
        condition: 'Good used condition',
        location: 'Birmingham',
        price: 18500,
        currency: 'GBP',
        description: '2.0 tonne electric forklift prepared for demonstration.',
        source_system: 'aegis_demo',
        external_id: 'toyota-demo-001'
      }).select('*').single();
      if (result.error) throw result.error;
      machine = result.data;
    }

    const opportunityTitle = 'WhatsApp enquiry — Toyota 8FBE20U';
    let opportunity = await one(context.supabase.from('opportunities').select('*')
      .eq('organisation_id', orgId).eq('source', 'aegis_demo').eq('title', opportunityTitle));
    if (!opportunity) {
      const result = await context.supabase.from('opportunities').insert({
        organisation_id: orgId,
        customer_id: customer.id,
        machine_id: machine.id,
        owner_clerk_user_id: session.clerkUserId,
        title: opportunityTitle,
        stage: 'proposal',
        value: 18500,
        next_action: 'Proposal accepted — complete deal handover',
        source: 'aegis_demo'
      }).select('*').single();
      if (result.error) throw result.error;
      opportunity = result.data;
    }

    let proposal = await one(context.supabase.from('sales_proposals').select('*')
      .eq('organisation_id', orgId).eq('proposal_number', 'AEGIS-DEMO-PROP-001'));
    if (!proposal) {
      const result = await context.supabase.from('sales_proposals').insert({
        organisation_id: orgId,
        opportunity_id: opportunity.id,
        customer_id: customer.id,
        machine_id: machine.id,
        proposal_number: 'AEGIS-DEMO-PROP-001',
        title: 'Toyota 8FBE20U supply proposal',
        status: 'accepted',
        asking_price: 18500,
        discount: 500,
        transport_price: 350,
        preparation_price: 150,
        total_price: 18500,
        currency: 'GBP',
        valid_until: new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10),
        summary: 'Prepared Toyota electric forklift matched to the customer’s WhatsApp enquiry.',
        terms: 'Subject to inspection. Price excludes VAT. Delivery by agreement.',
        created_by_clerk_user_id: session.clerkUserId
      }).select('*').single();
      if (result.error) throw result.error;
      proposal = result.data;
    }

    const existingActivities = await context.supabase.from('activities').select('id,activity_type')
      .eq('organisation_id', orgId).eq('opportunity_id', opportunity.id);
    if (existingActivities.error) throw existingActivities.error;
    if (!(existingActivities.data || []).some((item) => item.activity_type === 'whatsapp_enquiry')) {
      const result = await context.supabase.from('activities').insert([
        {
          organisation_id: orgId, opportunity_id: opportunity.id, customer_id: customer.id,
          machine_id: machine.id, actor_clerk_user_id: session.clerkUserId,
          activity_type: 'whatsapp_enquiry',
          body: 'Customer asked for a 2 tonne electric forklift under £20,000. AEGIS matched the Toyota 8FBE20U.',
          metadata: { channel: 'whatsapp', direction: 'inbound', demo: true }
        },
        {
          organisation_id: orgId, opportunity_id: opportunity.id, customer_id: customer.id,
          machine_id: machine.id, actor_clerk_user_id: session.clerkUserId,
          activity_type: 'follow_up',
          body: 'Confirmed battery condition, delivery requirement and proposal acceptance.',
          completed_at: now.toISOString(), metadata: { demo: true }
        }
      ]);
      if (result.error) throw result.error;
    }

    let deal = await one(context.supabase.from('deals').select('*')
      .eq('organisation_id', orgId).eq('reference', 'AEGIS-DEMO-DEAL-001').eq('machine_id', machine.id));
    if (!deal) {
      const result = await context.supabase.from('deals').insert({
        organisation_id: orgId,
        reference: 'AEGIS-DEMO-DEAL-001',
        deal_type: 'owned_stock',
        status: 'completed',
        machine_id: machine.id,
        opportunity_id: opportunity.id,
        buyer_customer_id: customer.id,
        salesperson_clerk_user_id: session.clerkUserId,
        purchase_price: 12750,
        sale_price: 18500,
        transport_cost: 350,
        preparation_cost: 750,
        other_costs: 0,
        commission: 250,
        currency: 'GBP',
        completed_at: now.toISOString(),
        notes: 'Demonstration completed sale. Gross margin: £4,400.'
      }).select('*').single();
      if (result.error) throw result.error;
      deal = result.data;
    }

    await context.supabase.from('opportunities').update({ stage: 'won', next_action: 'Completed' })
      .eq('organisation_id', orgId).eq('id', opportunity.id);
    await context.supabase.from('machines').update({ status: 'sold', is_published: false, customer_id: customer.id })
      .eq('organisation_id', orgId).eq('id', machine.id);
    await context.supabase.from('audit_events').insert({
      organisation_id: orgId,
      actor_clerk_user_id: session.clerkUserId,
      event_type: 'demo.sales_journey.loaded',
      record_type: 'deal',
      record_id: deal.id,
      payload: { customerId: customer.id, machineId: machine.id, opportunityId: opportunity.id, proposalId: proposal.id }
    });

    return response.status(201).json({
      ok: true,
      message: 'Loaded the WhatsApp enquiry-to-sale demonstration with a completed £4,400 gross margin.',
      records: { customerId: customer.id, machineId: machine.id, opportunityId: opportunity.id, proposalId: proposal.id, dealId: deal.id }
    });
  } catch (error) {
    return handleApiError(response, error);
  }
}
