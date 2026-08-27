export const BUENOS_AIRES_TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const ADMIN_HISTORY_DAYS = 30;

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
  return getAdminBookingSections(bookings, now).all;
}

function parseBookingTime(booking, end = false) {
  const [start, finish] = String(booking?.hora || '').split('-');
  const value = end ? finish : start;
  if (!/^\d{2}:\d{2}$/.test(value) || !/^\d{4}-\d{2}-\d{2}$/.test(booking?.fecha || '')) return null;
  const result = new Date(`${booking.fecha}T${value}:00-03:00`);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function getBookingEndAt(booking) {
  return parseBookingTime(booking, true) || parseBookingTime(booking);
}

export function isBookingUpcoming(booking, now = new Date()) {
  if (!['confirmada', 'pendiente_pago'].includes(booking?.estado)) return false;
  const endAt = getBookingEndAt(booking);
  return Boolean(endAt && endAt.getTime() > now.getTime());
}

function historyCutoffDate(now) {
  const cutoff = new Date(`${getBuenosAiresDate(now)}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - ADMIN_HISTORY_DAYS);
  return cutoff.toISOString().slice(0, 10);
}

function compareBookings(left, right, direction) {
  const leftKey = `${left.fecha || ''}T${left.hora || ''}`;
  const rightKey = `${right.fecha || ''}T${right.hora || ''}`;
  return direction * (leftKey.localeCompare(rightKey) || Number(left.id || 0) - Number(right.id || 0));
}

export function getAdminBookingSections(bookings, now = new Date()) {
  const cutoffDate = historyCutoffDate(now);
  const visibleBookings = bookings.filter((booking) => !booking.historial_oculto_at);
  const upcoming = visibleBookings.filter((booking) => isBookingUpcoming(booking, now)).sort((a, b) => compareBookings(a, b, 1));
  const history = visibleBookings.filter((booking) => !isBookingUpcoming(booking, now) && booking.fecha > cutoffDate).sort((a, b) => compareBookings(a, b, -1));
  return { upcoming, history, all: [...history, ...upcoming] };
}
