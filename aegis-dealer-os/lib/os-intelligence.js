import { MACHINE_CATEGORY_TEMPLATES, normaliseWebsiteCategory } from './machine-categories.js';

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const tokens = (value) => String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter((item) => item.length > 2);

export function stockAgeDays(machine, now = new Date()) {
  const created = new Date(machine.created_at || machine.updated_at || now);
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86_400_000));
}

export function machineryTemplates() {
  return MACHINE_CATEGORY_TEMPLATES;
}

export function scoreRequirement(requirement, machine) {
  const data = requirement.data || {};
  const reasons = [];
  let score = 20;
  const requestedCategory = normaliseWebsiteCategory(data.category || data.machine_type);
  const machineCategory = normaliseWebsiteCategory(machine.website_category || machine.machine_type);
  if (requestedCategory && requestedCategory === machineCategory) { score += 30; reasons.push('category'); }
  else if (requestedCategory) score -= 20;
  if (data.make && String(machine.make || '').toLowerCase().includes(String(data.make).toLowerCase())) { score += 15; reasons.push('make'); }
  if (data.model && String(machine.model || '').toLowerCase().includes(String(data.model).toLowerCase())) { score += 15; reasons.push('model'); }
  const minYear = number(data.min_year);
  if (minYear && number(machine.year) >= minYear) { score += 10; reasons.push('year'); }
  else if (minYear && number(machine.year) < minYear) score -= 10;
  const maxHours = number(data.max_hours);
  if (maxHours && number(machine.hours) != null && number(machine.hours) <= maxHours) { score += 10; reasons.push('hours'); }
  else if (maxHours && number(machine.hours) > maxHours) score -= 10;
  const maxBudget = number(data.max_budget);
  if (maxBudget && number(machine.price) != null && number(machine.price) <= maxBudget) { score += 10; reasons.push('budget'); }
  else if (maxBudget && number(machine.price) > maxBudget) score -= 15;
  const requirementTokens = tokens([data.keywords, requirement.summary, requirement.title].filter(Boolean).join(' '));
  const machineTokens = new Set(tokens([machine.make, machine.model, machine.machine_type, machine.description].filter(Boolean).join(' ')));
  const keywordHits = requirementTokens.filter((item) => machineTokens.has(item)).length;
  if (keywordHits) { score += Math.min(15, keywordHits * 5); reasons.push(`${keywordHits} keyword${keywordHits === 1 ? '' : 's'}`); }
  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export function matchRequirements(requirements = [], machines = []) {
  return requirements.flatMap((requirement) => machines.map((machine) => ({
    id: `${requirement.id}:${machine.id}`,
    requirement_id: requirement.id,
    requirement_title: requirement.title,
    customer_id: requirement.relationships?.customer_id || null,
    machine_id: machine.id,
    machine_label: [machine.make, machine.model].filter(Boolean).join(' '),
    machine_category: machine.website_category || machine.machine_type,
    price: machine.price,
    currency: machine.currency || 'GBP',
    ...scoreRequirement(requirement, machine)
  }))).filter((match) => match.score >= 45).sort((a, b) => b.score - a.score).slice(0, 100);
}

export function operationalInsights({ machines = [], opportunities = [], activities = [], deals = [], matches = [] }) {
  const now = new Date();
  const aged = machines.filter((item) => !['sold'].includes(item.status) && stockAgeDays(item, now) >= 90);
  const incomplete = machines.filter((item) => !item.price || !item.description || !(item.image_urls || []).length);
  const overdue = activities.filter((item) => item.due_at && !item.completed_at && new Date(item.due_at) < now);
  const stale = opportunities.filter((item) => !['won', 'lost'].includes(item.stage) && now - new Date(item.updated_at) > 5 * 86_400_000);
  const negativeMargin = deals.filter((item) => item.status === 'completed' && Number(item.sale_price || 0) - Number(item.purchase_price || 0) - Number(item.transport_cost || 0) - Number(item.preparation_cost || 0) - Number(item.other_costs || 0) - Number(item.commission || 0) < 0);
  return [
    { kind: 'stock_content', priority: incomplete.length ? 'high' : 'clear', count: incomplete.length, title: 'Machines missing publishing essentials', action: 'Add price, description and photography.' },
    { kind: 'stock_ageing', priority: aged.length ? 'high' : 'clear', count: aged.length, title: 'Machines aged over 90 days', action: 'Review pricing and remarketing.' },
    { kind: 'follow_up', priority: stale.length ? 'high' : 'clear', count: stale.length, title: 'Stale sales opportunities', action: 'Prepare follow-ups for approval.' },
    { kind: 'preparation', priority: overdue.length ? 'high' : 'clear', count: overdue.length, title: 'Overdue preparation tasks', action: 'Reassign or complete workshop tasks.' },
    { kind: 'buyer_match', priority: matches.length ? 'opportunity' : 'clear', count: matches.length, title: 'Strong buyer-to-stock matches', action: 'Review matches before contacting buyers.' },
    { kind: 'margin', priority: negativeMargin.length ? 'high' : 'clear', count: negativeMargin.length, title: 'Completed deals with negative margin', action: 'Review cost allocation and deal pricing.' }
  ];
}
