function safe(value) {
  return String(value ?? '').replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1');
}

function money(value, currency = 'GBP') {
  return `${currency} ${Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function wrap(value, maximum = 76) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line || `${line} ${word}`.length <= maximum) line = line ? `${line} ${word}` : word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

export function proposalPdf(proposal, organisationName) {
  const lines = [
    { text: organisationName || 'DealerFoundry dealer', size: 17, gap: 55 },
    { text: 'QUOTATION', size: 24, gap: 42 },
    { text: `Reference: ${proposal.proposal_number}`, size: 11, gap: 18 },
    { text: `Prepared: ${new Date().toLocaleDateString('en-GB')}`, size: 11, gap: 18 },
    { text: `Valid until: ${proposal.valid_until || 'As agreed'}`, size: 11, gap: 30 },
    { text: `Customer: ${proposal.customer?.name || 'Not specified'}`, size: 12, gap: 22 },
    { text: `Machine: ${[proposal.machine?.make, proposal.machine?.model].filter(Boolean).join(' ') || 'Not specified'}`, size: 12, gap: 18 },
    { text: `Serial number: ${proposal.machine?.serial_number || 'Not specified'}`, size: 11, gap: 30 },
    { text: `Asking price: ${money(proposal.asking_price, proposal.currency)}`, size: 11, gap: 18 },
    { text: `Discount: ${money(proposal.discount, proposal.currency)}`, size: 11, gap: 18 },
    { text: `Transport: ${money(proposal.transport_price, proposal.currency)}`, size: 11, gap: 18 },
    { text: `Preparation: ${money(proposal.preparation_price, proposal.currency)}`, size: 11, gap: 24 },
    { text: `TOTAL: ${money(proposal.total_price, proposal.currency)}`, size: 16, gap: 38 },
    ...wrap(proposal.summary || '').map((text) => ({ text, size: 10, gap: 15 })),
    ...wrap(proposal.terms || 'Subject to availability, inspection and the seller\'s agreed terms.').map((text) => ({ text, size: 9, gap: 14 }))
  ].filter((line) => line.text);

  let y = 790;
  const commands = [
    '0.055 0.063 0.082 rg', '0 772 595 70 re f',
    '1 0.353 0.039 rg', '0 765 595 7 re f',
    '0.88 0.88 0.90 RG', '54 80 m 541 80 l S',
    '0.35 0.35 0.39 rg', 'BT', '/F1 8 Tf', '1 0 0 1 54 62 Tm', '(Generated securely by DealerFoundry OS) Tj', 'ET',
    '0 0 0 rg', 'BT', '/F1 11 Tf'
  ];
  for (const [index, line] of lines.entries()) {
    commands.push(index === 0 ? '1 1 1 rg' : '0 0 0 rg', `/F1 ${line.size} Tf`, `1 0 0 1 54 ${y} Tm`, `(${safe(line.text)}) Tj`);
    y -= line.gap;
  }
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
