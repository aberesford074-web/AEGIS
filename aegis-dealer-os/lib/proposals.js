const amount = (value) => {
  if (value === '' || value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function proposalTotal(values = {}) {
  return amount(values.askingPrice ?? values.asking_price)
    - amount(values.discount)
    + amount(values.transportPrice ?? values.transport_price)
    + amount(values.preparationPrice ?? values.preparation_price);
}

export function proposalNumber(now = new Date(), suffix = '') {
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const time = now.toISOString().slice(11, 19).replaceAll(':', '');
  return `AEGIS-${date}-${time}${suffix ? `-${suffix}` : ''}`;
}
