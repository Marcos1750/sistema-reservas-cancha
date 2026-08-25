export const BUENOS_AIRES_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function getBuenosAiresDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUENOS_AIRES_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function getAdminOverviewMetrics(bookings, now = new Date()) {
  const today = getBuenosAiresDate(now);
  const currentMonth = today.slice(0, 7);

  return bookings.reduce((metrics, booking) => {
    if (booking.estado !== 'confirmada') return metrics;

    const isToday = booking.fecha === today;
    if (isToday) metrics.todayBookings += 1;

    const price = Number(booking.precio_ars);
    if (!Number.isFinite(price) || price < 0) return metrics;

    if (isToday) metrics.todayIncome += price;
    if (booking.fecha?.startsWith(`${currentMonth}-`)) metrics.monthIncome += price;

    return metrics;
  }, { today, todayBookings: 0, todayIncome: 0, monthIncome: 0 });
}

export function getCalendarBookings(bookings, now = new Date()) {
  const cutoff = new Date(`${getBuenosAiresDate(now)}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  return bookings.filter((booking) => booking.fecha > cutoffDate);
}
