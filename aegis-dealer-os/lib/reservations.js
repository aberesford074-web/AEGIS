export async function expireReservations(supabase, now = new Date()) {
  const { data: expired, error } = await supabase.from('machine_reservations')
    .select('id,organisation_id,machine_id,title,expires_at')
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .lte('expires_at', now.toISOString())
    .limit(200);
  if (error) throw error;
  const results = [];
  for (const reservation of expired || []) {
    const updated = await supabase.from('machine_reservations').update({ status: 'expired' })
      .eq('id', reservation.id).eq('status', 'active').select('id').maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) continue;
    await supabase.from('machines').update({ status: 'in-stock' })
      .eq('organisation_id', reservation.organisation_id)
      .eq('id', reservation.machine_id)
      .eq('status', 'reserved');
    await supabase.from('notifications').insert({
      organisation_id: reservation.organisation_id,
      notification_type: 'reservation_expired',
      title: 'Reservation expired',
      body: `${reservation.title} has expired and the machine is available again.`,
      severity: 'warning',
      related_record_type: 'machine',
      related_record_id: reservation.machine_id
    });
    results.push(reservation.id);
  }
  return results;
}
