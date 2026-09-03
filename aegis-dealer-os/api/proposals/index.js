import crypto from 'node:crypto';
import { requireOrganisationSession } from '../../lib/auth.js';
import { handleApiError, methodNotAllowed, requireText } from '../../lib/http.js';
import { proposalNumber, proposalTotal } from '../../lib/proposals.js';
import { organisationContext } from '../../lib/supabase.js';
import { proposalPdf } from '../../lib/proposal-pdf.js';

const selection = '*,customer:customers(id,name),contact:contacts(id,first_name,last_name,email),machine:machines(id,make,model,serial_number,year,hours,price),opportunity:opportunities(id,title,stage,value)';

function present(row) {
  return {
    ...row,
    record_type: 'proposal',
    reference: row.proposal_number,
    buyer_name: row.customer?.name || null,
    machine_label: [row.machine?.make, row.machine?.model].filter(Boolean).join(' '),
    sale_price: row.total_price,
    deal_type: 'proposal'
  };
}

function payload(body, organisationId, userId) {
  const askingPrice = body?.askingPrice ?? body?.asking_price ?? null;
  const values = {
    askingPrice,
    discount: body?.discount,
    transportPrice: body?.transportPrice ?? body?.transport_price,
    preparationPrice: body?.preparationPrice ?? body?.preparation_price
  };
  return {
    organisation_id: organisationId,
    opportunity_id: body?.opportunityId ?? body?.opportunity_id ?? null,
    customer_id: body?.customerId ?? body?.customer_id ?? null,
    contact_id: body?.contactId ?? body?.contact_id ?? null,
    machine_id: body?.machineId ?? body?.machine_id ?? null,
    proposal_number: body?.proposalNumber ?? body?.proposal_number
      ?? proposalNumber(new Date(), crypto.randomUUID().slice(0, 4).toUpperCase()),
    title: body?.title,
    status: body?.status || 'draft',
    asking_price: askingPrice === '' || askingPrice == null ? null : Number(askingPrice),
    discount: Number(values.discount || 0),
    transport_price: Number(values.transportPrice || 0),
    preparation_price: Number(values.preparationPrice || 0),
    total_price: proposalTotal(values),
    currency: body?.currency || 'GBP',
    valid_until: body?.validUntil ?? body?.valid_until ?? null,
    summary: body?.summary || null,
    terms: body?.terms || null,
    created_by_clerk_user_id: userId
  };
}

export default async function handler(request, response) {
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) {
    return methodNotAllowed(response, ['GET', 'POST', 'PATCH']);
  }
  try {
    const session = await requireOrganisationSession(request);
    const context = await organisationContext(session);
    const orgId = context.organisation.id;

    if (request.method === 'GET') {
      if (request.query?.pdf) {
        const proposalResult = await context.supabase.from('sales_proposals').select(selection)
          .eq('organisation_id', orgId).eq('id', String(request.query.pdf)).maybeSingle();
        if (proposalResult.error) throw proposalResult.error;
        if (!proposalResult.data) return response.status(404).json({ error: 'Quotation not found.' });
        const generatedAt = new Date().toISOString();
        const snapshot = present(proposalResult.data);
        await context.supabase.from('sales_proposals').update({ pdf_generated_at: generatedAt, pdf_snapshot: snapshot })
          .eq('organisation_id', orgId).eq('id', proposalResult.data.id);
        const pdf = proposalPdf(proposalResult.data, context.organisation.name);
        response.setHeader('Content-Type', 'application/pdf');
        response.setHeader('Content-Disposition', `attachment; filename="${proposalResult.data.proposal_number}.pdf"`);
        response.setHeader('Cache-Control', 'private, no-store');
        return response.status(200).send(pdf);
      }
      const proposalResult = await context.supabase.from('sales_proposals').select(selection)
        .eq('organisation_id', orgId).order('updated_at', { ascending: false }).limit(500);
      if (proposalResult.error) throw proposalResult.error;
      let items = (proposalResult.data || []).map(present);
      if (request.query?.includeDeals === 'true') {
        const dealSelection = '*,buyer:customers!deals_buyer_customer_id_fkey(id,name),seller:customers!deals_seller_customer_id_fkey(id,name),machine:machines(id,make,model,serial_number)';
        const dealResult = await context.supabase.from('deals').select(dealSelection)
          .eq('organisation_id', orgId).order('updated_at', { ascending: false }).limit(500);
        if (dealResult.error) throw dealResult.error;
        const deals = (dealResult.data || []).map((row) => ({
          ...row,
          record_type: 'deal',
          buyer_name: row.buyer?.name || null,
          seller_name: row.seller?.name || null,
          machine_label: [row.machine?.make, row.machine?.model].filter(Boolean).join(' ')
        }));
        items = [...items, ...deals].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      }
      return response.status(200).json({ items });
    }

    if (request.method === 'POST') {
      const body = payload(request.body, orgId, session.clerkUserId);
      body.title = requireText(body.title, 'Proposal title');
      if (!body.customer_id) return response.status(400).json({ error: 'Link a company to the proposal.' });
      if (!body.machine_id) return response.status(400).json({ error: 'Link a machine to the proposal.' });
      const { data, error } = await context.supabase.from('sales_proposals').insert(body).select(selection).single();
      if (error) throw error;
      if (body.opportunity_id) {
        await context.supabase.from('opportunities').update({
          stage: 'proposal',
          value: body.total_price,
          next_action: body.status === 'sent' ? 'Follow up proposal' : 'Review and send proposal'
        }).eq('organisation_id', orgId).eq('id', body.opportunity_id);
      }
      await context.supabase.from('audit_events').insert({
        organisation_id: orgId,
        actor_clerk_user_id: session.clerkUserId,
        event_type: 'proposal.created',
        record_type: 'proposal',
        record_id: data.id,
        payload: { proposalNumber: data.proposal_number, totalPrice: data.total_price }
      });
      return response.status(201).json({ item: present(data) });
    }

    const id = requireText(request.body?.id, 'Proposal ID');
    const body = payload(request.body, orgId, session.clerkUserId);
    delete body.organisation_id;
    delete body.created_by_clerk_user_id;
    if (!request.body?.proposalNumber && !request.body?.proposal_number) delete body.proposal_number;
    const { data, error } = await context.supabase.from('sales_proposals').update(body)
      .eq('organisation_id', orgId).eq('id', id).select(selection).maybeSingle();
    if (error) throw error;
    if (!data) return response.status(404).json({ error: 'Proposal not found.' });
    return response.status(200).json({ item: present(data) });
  } catch (error) {
    return handleApiError(response, error);
  }
}
