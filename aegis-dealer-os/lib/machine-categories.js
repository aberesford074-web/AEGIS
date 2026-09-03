export const WEBSITE_CATEGORIES = [
  'forklift-truck',
  'pallet-truck',
  'construction',
  'agricultural',
  'commercial-vehicles',
  'plant-equipment',
  'industrial'
];

export const MACHINE_CATEGORY_TEMPLATES = [
  {
    id: 'forklift-truck',
    label: 'Forklift trucks',
    fields: ['capacity_kg', 'lift_height_mm', 'mast_type', 'fuel_type', 'hours', 'fork_length_mm'],
    preparation: ['Safety inspection', 'Service history', 'Thorough examination', 'Tyres', 'Photography']
  },
  {
    id: 'pallet-truck',
    label: 'Pallet trucks',
    fields: ['capacity_kg', 'lift_height_mm', 'power_type', 'battery', 'fork_length_mm', 'hours'],
    preparation: ['Battery test', 'Charger check', 'Load-wheel inspection', 'Safety inspection', 'Photography']
  },
  {
    id: 'construction',
    label: 'Construction equipment',
    fields: ['operating_weight_kg', 'engine_power_kw', 'hours', 'undercarriage', 'attachments', 'emissions_stage'],
    preparation: ['Fluid inspection', 'Undercarriage report', 'Attachment check', 'Service', 'Photography']
  },
  {
    id: 'agricultural',
    label: 'Agricultural machinery',
    fields: ['engine_power_hp', 'hours', 'transmission', 'pto', 'tyres', 'attachments'],
    preparation: ['Service', 'Hydraulics check', 'Tyre report', 'Roadworthiness', 'Photography']
  },
  {
    id: 'commercial-vehicles',
    label: 'Commercial vehicles',
    fields: ['mileage', 'gross_vehicle_weight_kg', 'body_type', 'fuel_type', 'transmission', 'mot_expiry'],
    preparation: ['Roadworthiness', 'MOT check', 'Service history', 'Body inspection', 'Photography']
  },
  {
    id: 'plant-equipment',
    label: 'Plant and equipment',
    fields: ['engine_power_kw', 'hours', 'output_rating', 'fuel_type', 'attachments', 'service_history'],
    preparation: ['Function test', 'Fluid inspection', 'Safety guards', 'Service', 'Photography']
  },
  {
    id: 'industrial',
    label: 'Industrial equipment',
    fields: ['capacity', 'power_supply', 'dimensions', 'hours', 'controls', 'certification'],
    preparation: ['Function test', 'Electrical inspection', 'Guarding check', 'Certification', 'Photography']
  }
];

export function machineCategoryTemplate(value) {
  const category = normaliseWebsiteCategory(value, 'industrial');
  return MACHINE_CATEGORY_TEMPLATES.find((template) => template.id === category)
    || MACHINE_CATEGORY_TEMPLATES[MACHINE_CATEGORY_TEMPLATES.length - 1];
}

export function normaliseWebsiteCategory(value, fallback = null) {
  const text = String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (WEBSITE_CATEGORIES.includes(text)) return text;
  if (text.includes('forklift')) return 'forklift-truck';
  if (text.includes('pallet')) return 'pallet-truck';
  if (text.includes('excavat') || text.includes('digger') || text.includes('dumper') || text.includes('loader') || text.includes('construction')) return 'construction';
  if (text.includes('tractor') || text.includes('telehandler') || text.includes('agric')) return 'agricultural';
  if (text.includes('commercial') || text.includes('vehicle') || text.includes('van') || text.includes('truck') || text.includes('tipper')) return 'commercial-vehicles';
  if (text.includes('plant') || text.includes('generator') || text.includes('compressor')) return 'plant-equipment';
  if (text.includes('industrial') || text.includes('warehouse')) return 'industrial';
  return fallback;
}

export function normaliseMachineSpecifications(category, value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error('Machine specifications must be a set of named values.');
    error.statusCode = 400;
    throw error;
  }
  const template = machineCategoryTemplate(category);
  const allowed = new Set(template.fields);
  const specifications = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowed.has(key) || raw == null || raw === '') continue;
    if (!['string', 'number', 'boolean'].includes(typeof raw)) {
      const error = new Error(`Specification ${key} must be a simple value.`);
      error.statusCode = 400;
      throw error;
    }
    if (typeof raw === 'string' && raw.length > 500) {
      const error = new Error(`Specification ${key} is too long.`);
      error.statusCode = 400;
      throw error;
    }
    specifications[key] = raw;
  }
  return specifications;
}
