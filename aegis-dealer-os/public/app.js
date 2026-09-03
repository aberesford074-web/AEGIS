/* DealerFoundry browser workspace. All database calls go through tenant-checked API
   routes; the browser only holds the Clerk session token. */
const state = { clerk: null, token: null, dashboard: null, fileRows: [], accounts: [], selectedOrganisationId: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function toast(message, danger = false) {
  const node = $('#toast'); node.textContent = message; node.style.background = danger ? '#ffe0df' : '#e8f5dd'; node.style.color = danger ? '#681b17' : '#163012'; node.classList.add('show');
  window.clearTimeout(toast.timer); toast.timer = window.setTimeout(() => node.classList.remove('show'), 4200);
}

async function token() {
  if (!state.clerk?.session) return null;
  state.token = await state.clerk.session.getToken();
  return state.token;
}

async function api(path, options = {}) {
  const accessToken = await token();
  const headers = { 'content-type': 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), ...(state.selectedOrganisationId ? { 'x-aegis-organisation-id': state.selectedOrganisationId } : {}), ...(options.headers || {}) };
  const response = await fetch(path, {
    ...options,
    headers
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || body.message || `Request failed (${response.status}).`);
  return body;
}

async function downloadProposal(id, reference) {
  const accessToken = await token();
  const headers = { ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), ...(state.selectedOrganisationId ? { 'x-aegis-organisation-id': state.selectedOrganisationId } : {}) };
  const response = await fetch(`/api/proposals?pdf=${encodeURIComponent(id)}`, { headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'The quotation PDF could not be generated.');
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url; link.download = `${reference || 'quotation'}.pdf`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setScreen(screen) {
  $$('.nav').forEach((item) => item.classList.toggle('active', item.dataset.screen === screen));
  $$('.screen').forEach((item) => item.classList.toggle('active', item.dataset.screen === screen));
  if (state.clerk?.session) loadScreen(screen).catch((error) => toast(error.message, true));
}

function html(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function safeExternalHref(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? html(url.toString()) : '';
  } catch { return ''; }
}
function money(value) { const parsed = Number(value); return Number.isFinite(parsed) ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(parsed) : 'POA'; }
function tag(value) { const text = String(value || 'draft'); const type = ['draft', 'sold'].includes(text) ? text : ''; return `<span class="tag ${type}">${html(text.replaceAll('-', ' '))}</span>`; }

function renderMetrics(metrics = {}) {
  const modules = new Set(state.dashboard?.organisation?.enabled_modules || ['website', 'stock']);
  $('#metrics').innerHTML = [
    ['Machine stock', metrics.machines], ['Open opportunities', metrics.openOpportunities], ['Companies', metrics.customers], ['Pending approvals', metrics.pendingApprovals]
  ].filter(([label]) => label === 'Machine stock' || (label === 'Open opportunities' && modules.has('opportunities')) || (label === 'Companies' && modules.has('crm')) || (label === 'Pending approvals' && modules.size > 2))
    .map(([label, value]) => `<article class="metric"><span>${label}</span><strong>${Number(value || 0)}</strong></article>`).join('');
}

function applyPortalModules(organisation = {}) {
  const modules = new Set(organisation.enabled_modules || ['website', 'stock']);
  const screenModules = {
    'command-centre': [], machines: ['stock'], companies: ['crm'], sales: ['proposals'],
    publishing: ['stock', 'website'], templates: ['stock'], 'lead-inbox': ['opportunities'], 'buyer-match': ['crm'], preparation: ['stock'],
    commercial: ['proposals'], reports: ['stock'], opportunities: ['opportunities'], automations: ['automations'], 'ai-workbench': ['automations'], connections: ['website', 'whatsapp'],
    approvals: ['proposals', 'whatsapp', 'automations', 'campaigns'],
    notifications: []
  };
  $$('.nav').forEach((item) => {
    const required = screenModules[item.dataset.screen] || [];
    item.classList.toggle('hidden', required.length > 0 && !required.some((module) => modules.has(module)));
  });
  const active = $('.screen.active')?.dataset.screen;
  const required = screenModules[active] || [];
  if (required.length && !required.some((module) => modules.has(module))) setScreen('command-centre');
}

function renderMachines(items = []) {
  $('#machine-list').classList.toggle('empty', !items.length);
  $('#machine-list').innerHTML = !items.length ? 'No machine stock yet. Import your Beresford starter inventory or a DMS/ERP export.' : `<table><thead><tr><th>Machine</th><th>Category / specs</th><th>Status</th><th>Year / hours</th><th>Price</th><th>Website</th></tr></thead><tbody>${items.map((item) => `<tr><td><strong>${html([item.make, item.model].filter(Boolean).join(' '))}</strong><br><small>${html(item.machine_type || '')}</small></td><td>${html(String(item.website_category || item.machine_type || 'Industrial').replaceAll('-', ' '))}<br><small>${Object.keys(item.specifications || {}).length} saved specifications</small></td><td>${tag(item.status)}</td><td>${html([item.year, item.hours ? `${item.hours} hrs` : ''].filter(Boolean).join(' · ') || '—')}</td><td>${money(item.price)}</td><td><button class="ghost publish" data-id="${item.id}" data-published="${item.is_published}">${item.is_published ? 'Unpublish' : 'Publish'}</button><br><small>${html(String(item.publishing_status || 'not published').replaceAll('_',' '))}</small></td></tr>`).join('')}</tbody></table>`;
  $$('.publish').forEach((button) => button.addEventListener('click', async () => {
    try { const result=await api('/api/machines', { method: 'PATCH', body: JSON.stringify({ id: button.dataset.id, is_published: button.dataset.published !== 'true' }) }); toast(result.item.publishing_status === 'failed' ? 'Publishing needs attention. See notifications.' : button.dataset.published === 'true' ? 'Machine removed from the public feed.' : 'Machine verified on the DealerFoundry feed.'); loadMachines(); } catch (error) { toast(error.message, true); }
  }));
}

function renderCompanies(items = []) {
  $('#company-list').classList.toggle('empty', !items.length);
  $('#company-list').innerHTML = !items.length ? 'No companies yet. Add one or import a spreadsheet.' : `<table><thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th>Stage</th></tr></thead><tbody>${items.map((item) => `<tr><td><strong>${html(item.name)}</strong><br><small>${html(item.website || '')}</small></td><td>${html(item.primary_contact_name || item.primary_contact_email || '—')}</td><td>${html(item.primary_contact_phone || '—')}</td><td>${tag(item.lifecycle_stage || 'prospect')}</td></tr>`).join('')}</tbody></table>`;
}

function renderSalesAgent(data = {}) {
  const prospects = data.prospects || [];
  const runs = data.runs || [];
  const latestByProspect = new Map();
  runs.forEach((run) => { if (!latestByProspect.has(run.prospect_id)) latestByProspect.set(run.prospect_id, run); });
  const ready = runs.filter((run) => run.status === 'ready').length;
  const approved = runs.filter((run) => ['approved', 'queued', 'in_progress'].includes(run.status)).length;
  metricCards('#sales-agent-summary', [['Prospects with phones', prospects.length], ['Briefs ready', ready], ['Approved outreach', approved], ['Opted out', prospects.filter((item) => item.outreach_status === 'opted_out').length], ['Phone provider', data.readiness?.telephony ? data.readiness.telephony : 'Not connected']]);
  $('#sales-agent-list').classList.toggle('empty', !prospects.length);
  $('#sales-agent-list').innerHTML = !prospects.length ? 'No prospects with phone numbers yet. Import a prospect list to begin.' : `<table><thead><tr><th>Prospect</th><th>Website</th><th>Phone</th><th>Outreach</th><th>Latest brief</th><th></th></tr></thead><tbody>${prospects.map((prospect) => { const run = latestByProspect.get(prospect.id); const action = prospect.outreach_status === 'opted_out' ? '<span class="channel">Suppressed</span>' : run?.status === 'ready' ? `<button class="ghost approve-sales-agent" data-id="${html(run.id)}">Approve brief</button>` : run?.status === 'approved' ? '<span class="channel">Approved</span>' : `<button class="ghost prepare-sales-agent" data-id="${html(prospect.id)}">Prepare brief</button>`; const websiteHref = safeExternalHref(prospect.website); const outreach = prospect.outreach_status === 'allowed' ? '<span class="channel">Allowed</span>' : prospect.outreach_status === 'opted_out' ? '<span class="channel">Opted out</span>' : '<span class="channel">Unknown</span>'; const optOut = prospect.outreach_status === 'opted_out' ? '' : `<button class="ghost opt-out-sales-agent" data-id="${html(prospect.id)}">Mark opt-out</button>`; return `<tr><td><strong>${html(prospect.company)}</strong><br><small>${html(prospect.contact_name || 'No named contact')}</small></td><td>${websiteHref ? `<a href="${websiteHref}" target="_blank" rel="noreferrer">${html(prospect.website)}</a>` : (prospect.website ? 'Invalid URL' : 'Not supplied')}</td><td>${html(prospect.phone)}</td><td>${outreach}<br><small>${optOut}</small></td><td>${run ? tag(run.status) : 'Not prepared'}</td><td>${action}</td></tr>`; }).join('')}</tbody></table>`;
  $('#sales-agent-briefs').innerHTML = runs.slice(0, 8).map((run) => { const prospect = prospects.find((item) => item.id === run.prospect_id); if (!prospect || !run.call_brief) return ''; const brief = run.call_brief; return `<article class="panel agent-brief"><div class="agent-brief-head"><div><p class="eyebrow">${html(prospect.company)}</p><h2>${html(prospect.contact_name || 'Prospect call brief')}</h2></div>${tag(run.status)}</div><p><strong>Opening:</strong> ${html(brief.opening || '—')}</p><div class="agent-columns"><div><strong>Website observations</strong><ul>${(brief.websiteObservations || []).map((item) => `<li>${html(item)}</li>`).join('') || '<li>None recorded</li>'}</ul></div><div><strong>Improvement opportunities</strong><ul>${(brief.improvementOpportunities || []).map((item) => `<li>${html(item)}</li>`).join('') || '<li>None recorded</li>'}</ul></div><div><strong>Discovery questions</strong><ul>${(brief.discoveryQuestions || []).map((item) => `<li>${html(item)}</li>`).join('') || '<li>None recorded</li>'}</ul></div></div><p><strong>Appointment ask:</strong> ${html(brief.appointmentAsk || '—')}</p><p class="muted">${html((brief.complianceNotes || []).join(' · '))}</p></article>`; }).join('');
  $$('.prepare-sales-agent').forEach((button) => button.addEventListener('click', async () => { button.disabled = true; button.textContent = 'Preparing…'; try { const result = await api('/api/sales-agent', { method: 'POST', body: JSON.stringify({ action: 'prepare', prospectId: button.dataset.id }) }); toast(result.message || 'Call brief prepared.'); await loadScreen('sales-agent'); } catch (error) { toast(error.message, true); button.disabled = false; button.textContent = 'Prepare brief'; } }));
  $$('.approve-sales-agent').forEach((button) => button.addEventListener('click', async () => { button.disabled = true; try { const result = await api('/api/sales-agent', { method: 'PATCH', body: JSON.stringify({ action: 'approve', id: button.dataset.id }) }); toast(result.message || 'Brief approved.'); await loadScreen('sales-agent'); } catch (error) { toast(error.message, true); button.disabled = false; } }));
  $$('.opt-out-sales-agent').forEach((button) => button.addEventListener('click', async () => { if (!window.confirm('Mark this prospect as opted out? Future outreach will be suppressed.')) return; button.disabled = true; try { const result = await api('/api/prospects', { method: 'PATCH', body: JSON.stringify({ id: button.dataset.id, changes: { outreach_status: 'opted_out', opt_out_reason: 'Manual opt-out recorded in AI Sales Agent' } }) }); toast(result.message || 'Prospect suppressed.'); await loadScreen('sales-agent'); } catch (error) { toast(error.message, true); button.disabled = false; } }));
  $('#queue-sales-agent')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Queueing…';
    try {
      const result = await api('/api/sales-agent', { method: 'POST', body: JSON.stringify({ action: 'enqueue_batch', limit: 100 }) });
      toast(result.message || 'Audit batch queued.');
      await loadScreen('sales-agent');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = 'Queue today’s audits';
    }
  });
}
function renderSales(items = []) { $('#sales-list').innerHTML = !items.length ? 'No sales have been recorded yet.' : `<table><thead><tr><th>Reference</th><th>Date</th><th>Value</th><th>Status</th></tr></thead><tbody>${items.map((item) => `<tr><td>${html(item.reference || '—')}</td><td>${html(item.sale_date || '—')}</td><td>${money(item.sale_price)}</td><td>${tag(item.status)}</td></tr>`).join('')}</tbody></table>`; $('#sales-list').classList.toggle('empty', !items.length); }
function renderOpportunities(items = []) { $('#opportunity-list').innerHTML = !items.length ? 'No opportunities yet.' : `<table><thead><tr><th>Opportunity</th><th>Stage</th><th>Value</th><th>Next action</th></tr></thead><tbody>${items.map((item) => `<tr><td><strong>${html(item.title)}</strong></td><td>${tag(item.stage)}</td><td>${money(item.value)}</td><td>${html(item.next_action || '—')}</td></tr>`).join('')}</tbody></table>`; $('#opportunity-list').classList.toggle('empty', !items.length); }
function renderAutomations(data = {}) { const rules = data.rules || []; $('#automation-list').innerHTML = !rules.length ? 'No automations yet.' : `<table><thead><tr><th>Automation</th><th>Frequency</th><th>Approval</th><th>Status</th></tr></thead><tbody>${rules.map((item) => `<tr><td><strong>${html(item.name)}</strong><br><small>${html(item.kind)}</small></td><td>Every ${html(item.cadence_minutes)} min</td><td>${item.requires_approval ? 'Required' : 'Not required'}</td><td>${tag(item.enabled ? 'active' : 'paused')}</td></tr>`).join('')}</tbody></table>`; $('#automation-list').classList.toggle('empty', !rules.length); }
function renderApprovals(items = []) { $('#approval-list').innerHTML = !items.length ? 'No approvals waiting.' : `<table><thead><tr><th>Action</th><th>Requested</th><th>Status</th></tr></thead><tbody>${items.map((item) => `<tr><td>${html(item.action_type)}</td><td>${new Date(item.created_at).toLocaleString()}</td><td>${tag(item.status)}</td></tr>`).join('')}</tbody></table>`; $('#approval-list').classList.toggle('empty', !items.length); }
function renderConnections(items = []) { $('#connection-list').innerHTML = !items.length ? 'No connections yet.' : `<table><thead><tr><th>Connection</th><th>Provider</th><th>Status</th><th>Last sync</th></tr></thead><tbody>${items.map((item) => `<tr><td>${html(item.display_name || item.provider_config_key)}</td><td>${html(item.provider_config_key)}</td><td>${tag(item.status)}</td><td>${item.last_synced_at ? new Date(item.last_synced_at).toLocaleString() : 'Not synced'}</td></tr>`).join('')}</tbody></table>`; $('#connection-list').classList.toggle('empty', !items.length); }
function renderNotifications(items = []) { $('#notification-list').classList.toggle('empty', !items.length); $('#notification-list').innerHTML = !items.length ? 'No operational alerts.' : `<table><thead><tr><th>Alert</th><th>Severity</th><th>Created</th><th></th></tr></thead><tbody>${items.map((item)=>`<tr class="${item.read_at?'':'attention'}"><td><strong>${html(item.title)}</strong><br><small>${html(item.body || '')}</small></td><td>${tag(item.severity)}</td><td>${new Date(item.created_at).toLocaleString()}</td><td>${item.read_at?'Read':`<button class="ghost mark-notification" data-id="${html(item.id)}">Mark read</button>`}</td></tr>`).join('')}</tbody></table>`; $$('.mark-notification').forEach((button)=>button.addEventListener('click',async()=>{try{await api('/api/notifications',{method:'PATCH',body:JSON.stringify({id:button.dataset.id})}); await loadScreen('notifications');}catch(error){toast(error.message,true);}})); }

function metricCards(target, cards) {
  $(target).innerHTML = cards.map(([label, value]) => `<article class="metric"><span>${html(label)}</span><strong>${html(value)}</strong></article>`).join('');
}

function renderPublishing(machines = [], connections = []) {
  const published = machines.filter((item) => item.is_published);
  const ready = machines.filter((item) => ['in-stock', 'reserved', 'available-to-source'].includes(item.status));
  const incomplete = machines.filter((item) => !item.price || !item.description || !(item.image_urls || []).length);
  metricCards('#publishing-summary', [['Published', published.length], ['Ready stock', ready.length], ['Needs content', incomplete.length], ['Connections', connections.filter((item) => ['active', 'connected'].includes(item.status)).length]]);
  $('#publishing-list').classList.toggle('empty', !machines.length);
  $('#publishing-list').innerHTML = !machines.length ? 'No machine records are ready for publishing.' : `<table><thead><tr><th>Machine</th><th>Completeness</th><th>Website</th><th>Delivery state</th><th>Updated</th></tr></thead><tbody>${machines.map((item) => { const checks=[item.price,item.description,(item.image_urls || []).length,Object.keys(item.specifications || {}).length]; const complete=checks.filter(Boolean).length; return `<tr><td><strong>${html([item.make,item.model].filter(Boolean).join(' '))}</strong><br><small>${html(item.website_category || item.machine_type || 'Machinery')}</small></td><td>${complete}/4 essentials</td><td>${item.is_published ? '<span class="channel">Live</span>' : '<span class="channel offline">Draft</span>'}</td><td>${tag(String(item.publishing_status || 'not_published').replaceAll('_',' '))}${item.publishing_last_error ? `<br><small>${html(item.publishing_last_error)}</small>` : ''}</td><td>${item.publishing_last_succeeded_at ? new Date(item.publishing_last_succeeded_at).toLocaleString() : item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '—'}</td></tr>`; }).join('')}</tbody></table>`;
}

function renderLeadInbox(items = []) {
  const needsAction = items.filter((item) => item.next_action && !['won', 'lost'].includes(item.stage));
  const hot = items.filter((item) => ['qualified', 'proposal', 'negotiation'].includes(item.stage));
  const value = items.reduce((total, item) => total + Number(item.value || 0), 0);
  metricCards('#lead-summary', [['Open leads', items.length], ['Needs action', needsAction.length], ['Hot opportunities', hot.length], ['Pipeline value', money(value)]]);
  $('#lead-list').classList.toggle('empty', !items.length);
  $('#lead-list').innerHTML = !items.length ? 'No enquiries have entered the lead inbox yet.' : `<table><thead><tr><th>Enquiry</th><th>Source</th><th>Stage</th><th>Value</th><th>Next action</th></tr></thead><tbody>${items.map((item)=>`<tr><td><strong>${html(item.title)}</strong></td><td>${html(item.source || 'manual')}</td><td>${tag(item.stage || 'new')}</td><td>${money(item.value)}</td><td class="${item.next_action ? 'attention' : ''}">${html(item.next_action || 'Add a next action')}</td></tr>`).join('')}</tbody></table>`;
}

function renderBuyerMatch(data = {}) {
  const requirements = data.requirements || [];
  const matches = data.matches || [];
  metricCards('#buyer-match-summary', [['Active requirements', requirements.length], ['Qualified matches', matches.length], ['Strong matches', matches.filter((item)=>item.score >= 70).length], ['Best score', matches[0]?.score ? `${matches[0].score}%` : '—']]);
  $('#buyer-requirements').classList.toggle('empty', !requirements.length);
  $('#buyer-requirements').innerHTML = !requirements.length ? 'No structured buyer requirements yet.' : `<table><thead><tr><th>Requirement</th><th>Category</th><th>Make / model</th><th>Minimum year</th><th>Maximum budget</th></tr></thead><tbody>${requirements.map((item)=>`<tr><td><strong>${html(item.title)}</strong><br><small>${html(item.summary || '')}</small></td><td>${html(String(item.data?.category || 'Any').replaceAll('-', ' '))}</td><td>${html([item.data?.make,item.data?.model].filter(Boolean).join(' / ') || 'Any')}</td><td>${html(item.data?.min_year || 'Any')}</td><td>${item.data?.max_budget ? money(item.data.max_budget) : 'Open'}</td></tr>`).join('')}</tbody></table>`;
  $('#buyer-match-list').classList.toggle('empty', !matches.length);
  $('#buyer-match-list').innerHTML = !matches.length ? 'No stock currently meets the saved requirements.' : `<table><thead><tr><th>Score</th><th>Requirement</th><th>Matched machine</th><th>Price</th><th>Why it matched</th></tr></thead><tbody>${matches.map((item)=>`<tr><td><span class="score">${html(item.score)}%</span></td><td><strong>${html(item.requirement_title)}</strong></td><td>${html(item.machine_label)}<br><small>${html(String(item.machine_category || '').replaceAll('-', ' '))}</small></td><td>${money(item.price)}</td><td>${html((item.reasons || []).join(', ') || 'General fit')}</td></tr>`).join('')}</tbody></table>`;
}

function renderPreparation(items = []) {
  const tasks = items.filter((item) => ['prep','inspection','service','photography','certification','delivery','task'].includes(item.activity_type));
  const overdue = tasks.filter((item) => item.due_at && !item.completed_at && new Date(item.due_at) < new Date());
  metricCards('#prep-summary', [['Open prep tasks', tasks.filter((item)=>!item.completed_at).length], ['Overdue', overdue.length], ['Completed', tasks.filter((item)=>item.completed_at).length], ['Machine linked', tasks.filter((item)=>item.machine_id).length]]);
  $('#prep-list').classList.toggle('empty', !tasks.length);
  $('#prep-list').innerHTML = !tasks.length ? 'No preparation tasks yet.' : `<table><thead><tr><th>Task</th><th>Type</th><th>Machine</th><th>Due</th><th>Status</th></tr></thead><tbody>${tasks.map((item)=>`<tr><td><strong>${html(item.body)}</strong></td><td>${tag(item.activity_type)}</td><td>${html(item.machine_label || 'General')}</td><td class="${item.due_at && !item.completed_at && new Date(item.due_at) < new Date() ? 'attention' : ''}">${item.due_at ? new Date(item.due_at).toLocaleDateString() : 'No deadline'}</td><td>${tag(item.completed_at ? 'completed' : 'open')}</td></tr>`).join('')}</tbody></table>`;
}

function renderBars(target, groups) {
  const maximum = Math.max(1, ...groups.map(([,value])=>value));
  $(target).innerHTML = groups.map(([label,value])=>`<div class="report-row"><span>${html(String(label).replaceAll('-', ' '))}</span><div class="report-track"><div class="report-fill" style="width:${Math.max(4,Math.round((value/maximum)*100))}%"></div></div><strong class="report-value">${value}</strong></div>`).join('');
}

function renderReports(dashboard = {}, machines = [], opportunities = []) {
  metricCards('#report-metrics', [['Machines', machines.length], ['Published coverage', `${machines.length ? Math.round((machines.filter((item)=>item.is_published).length/machines.length)*100) : 0}%`], ['Open pipeline', opportunities.length], ['Gross margin', money(dashboard.metrics?.grossMargin || 0)]]);
  const stockGroups = Object.entries(machines.reduce((groups,item)=>{ const key=item.status || 'draft'; groups[key]=(groups[key]||0)+1; return groups; },{}));
  const pipelineGroups = Object.entries(opportunities.reduce((groups,item)=>{ const key=item.stage || 'new'; groups[key]=(groups[key]||0)+1; return groups; },{}));
  renderBars('#stock-report', stockGroups.length ? stockGroups : [['No stock',0]]);
  renderBars('#pipeline-report', pipelineGroups.length ? pipelineGroups : [['No opportunities',0]]);
}

function renderTemplates(items = []) {
  $('#template-grid').innerHTML = items.map((item)=>`<article class="template-card"><p class="eyebrow">${html(item.id.replaceAll('-', ' '))}</p><h2>${html(item.label)}</h2><p>Recommended listing specifications</p><div class="field-chips">${item.fields.map((field)=>`<span class="field-chip">${html(field.replaceAll('_', ' '))}</span>`).join('')}</div><p>Preparation checklist</p><ul>${item.preparation.map((task)=>`<li>${html(task)}</li>`).join('')}</ul></article>`).join('');
}

function renderCommercial(items = []) {
  const quotations = items.filter((item)=>item.record_type === 'quotation');
  const reservations = items.filter((item)=>item.record_type === 'reservation');
  const documents = items.filter((item)=>item.record_type === 'document');
  metricCards('#commercial-summary', [['Quotations', quotations.length], ['Active reservations', reservations.filter((item)=>item.status === 'active').length], ['Documents', documents.length], ['Accepted quotes', quotations.filter((item)=>item.status === 'accepted').length]]);
  $('#commercial-list').classList.toggle('empty', !items.length);
  $('#commercial-list').innerHTML = !items.length ? 'No quotations, reservations or documents yet.' : `<table><thead><tr><th>Type</th><th>Reference / title</th><th>Status</th><th>Value / deposit</th><th>Updated</th><th></th></tr></thead><tbody>${items.map((item)=>`<tr><td class="commercial-type">${html(item.record_type)}</td><td><strong>${html(item.reference || item.title)}</strong><br><small>${html(item.summary || item.notes || item.data?.document_type || '')}</small></td><td>${tag(item.status || 'draft')}</td><td>${item.total_price != null ? money(item.total_price) : item.data?.deposit ? money(item.data.deposit) : '—'}</td><td>${item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '—'}</td><td>${item.record_type === 'quotation' ? `<button class="ghost proposal-pdf" data-id="${html(item.id)}" data-reference="${html(item.reference)}">PDF</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
  $$('.proposal-pdf').forEach((button)=>button.addEventListener('click',()=>downloadProposal(button.dataset.id,button.dataset.reference).catch((error)=>toast(error.message,true))));
}

function renderInsights(target, items = []) {
  $(target).innerHTML = items.map((item)=>`<article class="insight-card ${html(item.priority)}"><span class="insight-count">${html(item.count)}</span><h3>${html(item.title)}</h3><p>${html(item.action)}</p><span class="tag">${html(item.priority)}</span></article>`).join('');
}

function renderOSReports(data = {}) {
  metricCards('#report-metrics', [['Stock value', money(data.metrics?.stockValue || 0)], ['Gross margin', money(data.metrics?.grossMargin || 0)], ['Aged 90+ days', data.metrics?.agedStock || 0], ['Automatic matches', data.metrics?.matches || 0]]);
  renderBars('#stock-report', [['All stock', data.metrics?.machines || 0], ['Published', data.metrics?.published || 0], ['Aged stock', data.metrics?.agedStock || 0]]);
  renderBars('#pipeline-report', [['Open enquiries', data.metrics?.openEnquiries || 0], ['Quotations', data.metrics?.quotations || 0], ['Buyer requirements', data.metrics?.requirements || 0], ['Open tasks', data.metrics?.openTasks || 0]]);
  renderInsights('#insight-list', data.insights || []);
}

function renderAI(data = {}) {
  const insights = data.insights || [];
  const automations = data.automations || [];
  metricCards('#ai-summary', [['Insights', insights.filter((item)=>item.count > 0).length], ['Enabled automations', automations.filter((item)=>item.enabled).length], ['Approval protected', automations.filter((item)=>item.requires_approval).length], ['Suggested actions', insights.reduce((total,item)=>total+Number(item.count || 0),0)]]);
  renderInsights('#ai-insights', insights);
}

async function renderOnboarding(organisation = {}) {
  const panel = $('#onboarding-panel');
  if (!panel) return;
  const needsWebsite = organisation.website_connection_status !== 'connected';
  const needsStock = Number(state.dashboard?.metrics?.machines || 0) === 0;
  const needsPublishing = Number(state.dashboard?.metrics?.publishedMachines || 0) === 0;
  panel.classList.toggle('hidden', !needsWebsite && !needsStock && !needsPublishing);
  if (!panel.classList.contains('hidden')) {
    const remaining = [needsWebsite && 'website details', needsStock && 'machine stock', !needsStock && needsPublishing && 'your first published machine'].filter(Boolean);
    $('#onboarding-summary').textContent = `Next: ${remaining.join(', ')}. Your workspace is private and your website connection will be completed as part of your DealerFoundry setup.`;
    const stored=organisation.onboarding_state || {}; const steps=[['Business details',stored.business],['Branding',stored.branding],['Website connection',!needsWebsite],['Initial stock',!needsStock],['Team access',stored.team],['First live listing',!needsPublishing]];
    $('#onboarding-checklist').innerHTML=steps.map(([label,done])=>`<span class="onboarding-step ${done?'done':''}">${done?'✓':'○'} ${html(label)}</span>`).join('');
  }
}

async function loadDashboard() {
  const data = await api('/api/dashboard'); state.dashboard = data; $('#workspace-name').textContent = data.organisation.name; applyPortalModules(data.organisation); renderMetrics(data.metrics); await renderOnboarding(data.organisation); const feed = `${location.origin}/api/machines?publicOrg=${data.organisation.public_slug || 'your-dealer'}`; $('#stock-feed').textContent = feed; $('#stock-feed-2').textContent = feed;
}
async function selectOrganisation() {
  const data = await api('/api/accounts');
  state.accounts = data.items || [];
  const requestedSlug = new URLSearchParams(location.search).get('organisation') || new URLSearchParams(location.search).get('org');
  const requested = requestedSlug ? state.accounts.find((account) => account.public_slug === requestedSlug) : null;
  if (requested) {
    state.selectedOrganisationId = requested.id;
    return true;
  }
  if (state.accounts.length === 1) {
    state.selectedOrganisationId = state.accounts[0].id;
    return true;
  }
  if (state.accounts.length > 1) {
    $('#app').classList.add('hidden'); $('#setup').classList.add('hidden'); $('#signed-out').classList.remove('hidden');
    $('#signed-out').innerHTML = `<p class="eyebrow">DEALER WORKSPACES</p><h1>Choose a dealer workspace.</h1><p>This sign-in has access to more than one organisation. Choose where you want to work.</p><div class="workspace-choices">${state.accounts.map((account) => `<button class="primary workspace-choice" data-organisation-id="${html(account.id)}">${html(account.name)}<small>${html(account.public_slug || '')}</small></button>`).join('')}</div>`;
    $$('.workspace-choice').forEach((button) => button.addEventListener('click', async () => { state.selectedOrganisationId = button.dataset.organisationId; await afterSignIn(); }));
    return false;
  }
  return true;
}
async function loadMachines() { renderMachines((await api('/api/machines')).items); }
async function loadScreen(screen) {
  if (screen === 'command-centre') return loadDashboard();
  if (screen === 'machines') return loadMachines();
  if (screen === 'templates') return renderTemplates((await api('/api/os?resource=templates')).items);
  if (screen === 'publishing') { const [machines, connections] = await Promise.all([api('/api/machines'), api('/api/integrations')]); return renderPublishing(machines.items, connections.items); }
  if (screen === 'lead-inbox') return renderLeadInbox((await api('/api/opportunities')).items);
  if (screen === 'buyer-match') return renderBuyerMatch(await api('/api/os?resource=matches'));
  if (screen === 'preparation') return renderPreparation((await api('/api/activities')).items);
  if (screen === 'commercial') return renderCommercial((await api('/api/os?resource=commercial')).items);
  if (screen === 'reports') return renderOSReports(await api('/api/os?resource=overview'));
  if (screen === 'companies') return renderCompanies((await api('/api/customers')).items);
  if (screen === 'sales-agent') return renderSalesAgent(await api('/api/sales-agent'));
  if (screen === 'sales') return renderSales((await api('/api/opportunities?resource=sales')).items);
  if (screen === 'opportunities') return renderOpportunities((await api('/api/opportunities')).items);
  if (screen === 'automations') return renderAutomations(await api('/api/automations'));
  if (screen === 'ai-workbench') return renderAI(await api('/api/os?resource=ai'));
  if (screen === 'connections') return renderConnections((await api('/api/integrations')).items);
  if (screen === 'notifications') return renderNotifications((await api('/api/notifications')).items);
  if (screen === 'approvals') return renderApprovals((await api('/api/approvals')).items);
}

function openDialog(title, fields, onSubmit) {
  const dialog = $('#dialog'); $('#dialog-content').innerHTML = `<h2>${title}</h2><form id="action-form">${fields}<button class="primary" type="submit">Save</button></form>`; dialog.showModal();
  $('#action-form').addEventListener('submit', async (event) => { event.preventDefault(); const button = event.target.querySelector('button[type=submit]'); button.disabled = true; try { await onSubmit(Object.fromEntries(new FormData(event.target))); dialog.close(); toast('Saved.'); await loadScreen($('.screen.active').dataset.screen); } catch (error) { toast(error.message, true); button.disabled = false; } });
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean); const cells = (line) => { const out=[]; let value='', quote=false; for (let i=0;i<line.length;i+=1) { const char=line[i]; if (char === '"' && line[i+1] === '"') { value += '"'; i+=1; } else if (char === '"') quote=!quote; else if (char === ',' && !quote) { out.push(value.trim()); value=''; } else value+=char; } out.push(value.trim()); return out; }; const headers=cells(lines.shift() || '').map((key) => key.toLowerCase().replace(/[^a-z0-9]/g,'')); return lines.map((line) => Object.fromEntries(cells(line).map((value,index) => [headers[index],value])));
}
function mapMachine(row) { const get=(...keys)=>keys.map((key)=>row[key] ?? row[key.toLowerCase().replace(/[^a-z0-9]/g,'')]).find((value)=>value !== undefined && value !== ''); return { id:get('id','stockid','serialnumber'), brand:get('brand','make','manufacturer'), model:get('model','machinemodel'), type:get('type','machinetype','category'), category:get('websiteCategory','website_category','category'), year:get('year'), hours:get('hours','enginehours'), price:get('price','askingprice'), status:get('status') || 'draft', description:get('description','notes'), imageMain:get('imagemain','image','imageurl','photo') }; }

async function importRows(rows, sourceLabel) {
  const valid = rows.map(mapMachine).filter((item) => item.brand && item.model); if (!valid.length) throw new Error('No rows with both a make and model were found.');
  $('#starter-result').textContent = `${valid.length} ${sourceLabel} rows ready to import.`; const preview = await api('/api/customers?resource=legacy-aegis', { method: 'POST', body: JSON.stringify({ mode: 'preview', stock: valid }) });
  if (!window.confirm(`DealerFoundry found ${preview.preview.counts.machines} machine records. Import them as unpublished drafts?`)) return;
  const result = await api('/api/customers?resource=legacy-aegis', { method: 'POST', body: JSON.stringify({ stock: valid }) }); toast(`${result.imported.machines} machine records imported as drafts.`); await loadDashboard(); await loadMachines();
}

async function bootClerk() {
  const config = await fetch('/api/health').then((response) => response.json());
  if (!config.clerkPublishableKey) throw new Error('Clerk is not configured for the browser app yet.');
  await new Promise((resolve, reject) => { const script=document.createElement('script'); script.async=true; script.crossOrigin='anonymous'; script.setAttribute('data-clerk-publishable-key', config.clerkPublishableKey); script.src='https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js'; script.onload=resolve; script.onerror=()=>reject(new Error('The secure sign-in service could not load.')); document.head.append(script); });
  await window.Clerk.load(); state.clerk = window.Clerk;
  if (state.clerk.user) await afterSignIn(); else showSignedOut();
}
function showSignedOut() { $('#auth-label').textContent='Not signed in'; $('#sign-in').classList.remove('hidden'); $('#sign-out').classList.add('hidden'); $('#signed-out').classList.remove('hidden'); $('#setup').classList.add('hidden'); $('#app').classList.add('hidden'); }
async function afterSignIn() {
  $('#auth-label').textContent=state.clerk.user.primaryEmailAddress?.emailAddress || 'Signed in'; $('#sign-in').classList.add('hidden'); $('#sign-out').classList.remove('hidden'); $('#signed-out').classList.add('hidden');
  try { if (!(await selectOrganisation())) return; await loadDashboard(); $('#setup').classList.add('hidden'); $('#app').classList.remove('hidden'); await loadScreen($('.screen.active').dataset.screen); }
  catch (error) { if (/onboarded|Choose a dealer organisation|access/i.test(error.message)) { $('#app').classList.add('hidden'); $('#setup').classList.remove('hidden'); } else throw error; }
}
function signIn() { state.clerk.openSignIn({ afterSignInUrl: location.href, afterSignUpUrl: location.href }); }

function bind() {
  $$('.nav').forEach((button) => button.addEventListener('click', () => setScreen(button.dataset.screen))); $$('[data-go]').forEach((button) => button.addEventListener('click', () => setScreen(button.dataset.go)));
  $('#sign-in').addEventListener('click', signIn); $('#sign-in-main').addEventListener('click', signIn); $('#sign-out').addEventListener('click', async () => { await state.clerk.signOut(); showSignedOut(); }); $('#refresh').addEventListener('click', () => loadScreen($('.screen.active').dataset.screen).then(() => toast('Workspace refreshed.')).catch((error) => toast(error.message, true)));
  $('#dialog-close').addEventListener('click', () => $('#dialog').close());
  $('#manage-billing').addEventListener('click', async () => { try { const result = await api('/api/billing', { method:'POST', body:JSON.stringify({ action:'manage' }) }); window.location.assign(result.url); } catch(error) { toast(error.message, true); } });
  $('#import-starter').addEventListener('click', () => setScreen('machines'));
  $('#machine-file').addEventListener('change', async (event) => { const file=event.target.files?.[0]; if (!file) return; try { const text=await file.text(); state.fileRows=file.name.toLowerCase().endsWith('.json') ? (JSON.parse(text).items || JSON.parse(text)) : parseCsv(text); $('#import-file').disabled=false; $('#file-result').textContent=`${state.fileRows.length} rows loaded. DealerFoundry will map make, model, price, status and other common fields.`; } catch(error) { state.fileRows=[]; $('#import-file').disabled=true; $('#file-result').textContent=error.message; } });
  $('#import-file').addEventListener('click', () => importRows(state.fileRows,'uploaded').catch((error)=>toast(error.message,true)));
  $('#website-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await api('/api/integrations', { method:'POST', body:JSON.stringify({ providerConfigKey:'website', displayName:'Dealer website', configuration:{url:$('#website-url').value} }) }); toast('Website saved. Use the DealerFoundry stock feed to publish inventory.'); loadScreen('connections'); } catch(error) { toast(error.message,true); } });
  $('#add-machine').addEventListener('click', () => openDialog('Add machine', '<label>Make<input name="make" required /></label><label>Model<input name="model" required /></label><label>Website category<select name="website_category"><option value="forklift-truck">Forklifts</option><option value="pallet-truck">Pallet trucks</option><option value="construction">Construction</option><option value="agricultural">Agricultural</option><option value="commercial-vehicles">Commercial vehicles</option><option value="plant-equipment">Plant &amp; equipment</option><option value="industrial">Industrial</option></select></label><label>Machine type<input name="machine_type" /></label><label>Price<input name="price" type="number" /></label><label>Capacity (kg)<input name="capacity_kg" type="number" /></label><label>Lift height (mm)<input name="lift_height_mm" type="number" /></label><label>Fuel / power type<input name="fuel_type" /></label><label>Engine power (kW)<input name="engine_power_kw" type="number" /></label><label>Transmission<input name="transmission" /></label><label>Attachments<input name="attachments" /></label><label>Status<select name="status"><option value="draft">Draft</option><option value="in-stock">In stock</option><option value="available-to-source">Available to source</option></select></label>', (data)=>{ const keys=['capacity_kg','lift_height_mm','fuel_type','engine_power_kw','transmission','attachments']; const specifications=Object.fromEntries(keys.filter((key)=>data[key] !== '').map((key)=>[key,data[key]])); keys.forEach((key)=>delete data[key]); return api('/api/machines',{method:'POST',body:JSON.stringify({...data,specifications})}); }));
  $('#add-company').addEventListener('click', () => openDialog('Add company', '<label>Company name<input name="name" required /></label><label>Contact name<input name="primary_contact_name" /></label><label>Email<input name="primary_contact_email" type="email" /></label><label>Phone<input name="primary_contact_phone" /></label>', (data)=>api('/api/customers',{method:'POST',body:JSON.stringify(data)})));
  $('#create-opportunity').addEventListener('click', () => openDialog('New opportunity', '<label>Title<input name="title" required /></label><label>Value (GBP)<input name="value" type="number" /></label><label>Next action<input name="nextAction" /></label>', (data)=>api('/api/opportunities',{method:'POST',body:JSON.stringify(data)})));
  $('#create-lead').addEventListener('click', () => openDialog('New lead', '<label>Enquiry title<input name="title" required /></label><label>Source<select name="source"><option value="website">Website</option><option value="phone">Phone</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="marketplace">Marketplace</option></select></label><label>Potential value (GBP)<input name="value" type="number" /></label><label>Next action<input name="nextAction" required /></label>', (data)=>api('/api/opportunities',{method:'POST',body:JSON.stringify(data)})));
  $('#new-prep-task').addEventListener('click', () => openDialog('New preparation task', '<label>Task<input name="body" required /></label><label>Type<select name="activity_type"><option value="inspection">Inspection</option><option value="service">Service or repair</option><option value="photography">Photography</option><option value="certification">Certification</option><option value="delivery">Delivery preparation</option></select></label><label>Due date<input name="due_at" type="datetime-local" /></label>', (data)=>api('/api/activities',{method:'POST',body:JSON.stringify(data)})));
  $('#new-requirement').addEventListener('click', () => openDialog('New buyer requirement', '<label>Requirement title<input name="title" required placeholder="3 tonne diesel forklift" /></label><label>Category<select name="category"><option value="forklift-truck">Forklift truck</option><option value="pallet-truck">Pallet truck</option><option value="construction">Construction</option><option value="agricultural">Agricultural</option><option value="commercial-vehicles">Commercial vehicle</option><option value="plant-equipment">Plant &amp; equipment</option><option value="industrial">Industrial</option></select></label><label>Preferred make<input name="make" /></label><label>Preferred model<input name="model" /></label><label>Minimum year<input name="min_year" type="number" /></label><label>Maximum hours<input name="max_hours" type="number" /></label><label>Maximum budget (GBP)<input name="max_budget" type="number" /></label><label>Other requirements<textarea name="summary"></textarea></label>', (data)=>api('/api/os',{method:'POST',body:JSON.stringify({action:'buyer_requirement',title:data.title,summary:data.summary,data:{category:data.category,make:data.make,model:data.model,min_year:data.min_year,max_hours:data.max_hours,max_budget:data.max_budget}})})));
  $('#new-quotation').addEventListener('click', async () => { try { const [customers,machines,opportunities]=await Promise.all([api('/api/customers'),api('/api/machines'),api('/api/opportunities')]); const customerOptions=customers.items.map((item)=>`<option value="${html(item.id)}">${html(item.name)}</option>`).join(''); const machineOptions=machines.items.map((item)=>`<option value="${html(item.id)}">${html([item.make,item.model].filter(Boolean).join(' '))}</option>`).join(''); const opportunityOptions=opportunities.items.map((item)=>`<option value="${html(item.id)}">${html(item.title)}</option>`).join(''); openDialog('New quotation', `<label>Title<input name="title" required /></label><label>Customer<select name="customerId" required><option value="">Choose customer</option>${customerOptions}</select></label><label>Machine<select name="machineId" required><option value="">Choose machine</option>${machineOptions}</select></label><label>Opportunity<select name="opportunityId"><option value="">No linked opportunity</option>${opportunityOptions}</select></label><label>Asking price (GBP)<input name="askingPrice" type="number" /></label><label>Discount<input name="discount" type="number" value="0" /></label><label>Transport<input name="transportPrice" type="number" value="0" /></label><label>Preparation<input name="preparationPrice" type="number" value="0" /></label><label>Valid until<input name="validUntil" type="date" /></label>`, (data)=>api('/api/proposals',{method:'POST',body:JSON.stringify(data)})); } catch(error) { toast(error.message,true); } });
  $('#new-reservation').addEventListener('click', async () => { try { const machines=(await api('/api/machines')).items.filter((item)=>['in-stock','available-to-source'].includes(item.status)); const options=machines.map((item)=>`<option value="${html(item.id)}">${html([item.make,item.model].filter(Boolean).join(' '))}</option>`).join(''); openDialog('Reserve machine', `<label>Reservation title<input name="title" required /></label><label>Machine<select name="machineId" required><option value="">Choose machine</option>${options}</select></label><label>Deposit (GBP)<input name="deposit" type="number" /></label><label>Expires<input name="expiresAt" type="datetime-local" /></label><label>Notes<textarea name="summary"></textarea></label>`, (data)=>api('/api/os',{method:'POST',body:JSON.stringify({action:'reservation',...data})})); } catch(error) { toast(error.message,true); } });
  $('#new-document').addEventListener('click', () => openDialog('Add commercial document', '<label>Document title<input name="title" required /></label><label>Type<select name="documentType"><option value="inspection">Inspection report</option><option value="service-history">Service history</option><option value="certificate">Certificate</option><option value="purchase-order">Purchase order</option><option value="invoice">Invoice</option><option value="other">Other</option></select></label><label>Secure file URL<input name="fileUrl" type="url" /></label><label>Summary<textarea name="summary"></textarea></label>', (data)=>api('/api/os',{method:'POST',body:JSON.stringify({action:'document',...data})})));
  $('#ask-ai').addEventListener('click', () => openDialog('Prepare an AI-assisted action', '<label>Objective<textarea name="objective" required placeholder="Review what needs attention today"></textarea></label><p class="muted">DealerFoundry will prepare a recommendation in the approval queue. Nothing is sent or published automatically.</p>', (data)=>api('/api/os',{method:'POST',body:JSON.stringify({action:'ai_assist',...data})})));
  $('#record-sale').addEventListener('click', () => openDialog('Record sale', '<label>Reference<input name="reference" /></label><label>Sale price (GBP)<input name="salePrice" type="number" /></label><label>Sale date<input name="saleDate" type="date" /></label><label>Notes<textarea name="notes"></textarea></label>', (data)=>api('/api/opportunities?resource=sales',{method:'POST',body:JSON.stringify(data)})));
  $('#new-automation').addEventListener('click', () => openDialog('Create automation', '<label>Name<input name="name" required /></label><label>Type<select name="kind"><option value="daily_brief">Daily dealer briefing</option><option value="stale_follow_up">Stale follow-up</option><option value="stock_match">Automatic stock matching</option><option value="email_monitor">Email monitor</option><option value="marketplace_monitor">Marketplace monitor</option></select></label><label>Repeat every (minutes)<input name="cadenceMinutes" type="number" min="15" value="1440" /></label>', (data)=>api('/api/automations',{method:'POST',body:JSON.stringify(data)})));
}

bind(); bootClerk().catch((error) => { $('#auth-label').textContent='Workspace unavailable'; $('#signed-out').classList.remove('hidden'); $('#setup').classList.add('hidden'); $('#app').classList.add('hidden'); $('#signed-out').innerHTML=`<p class="eyebrow">WORKSPACE COULD NOT LOAD</p><h1>DealerFoundry could not open this workspace.</h1><p>${html(error.message)}</p><button class="primary" onclick="location.reload()">Try again</button>`; });
