export const portalModules = [
  'website',
  'stock',
  'crm',
  'opportunities',
  'proposals',
  'whatsapp',
  'automations',
  'campaigns'
];

export function normaliseModules(value) {
  const requested = Array.isArray(value) ? value : ['website', 'stock'];
  const modules = portalModules.filter((module) => requested.includes(module));
  return modules.length ? modules : ['website', 'stock'];
}

export function portalTier(modules) {
  if (modules.some((module) => ['whatsapp', 'automations', 'campaigns'].includes(module))) return 'full';
  if (modules.some((module) => ['crm', 'opportunities', 'proposals'].includes(module))) return 'sales';
  return 'website_stock';
}

export function publicSlug(value) {
  return String(value || 'client')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'client';
}

