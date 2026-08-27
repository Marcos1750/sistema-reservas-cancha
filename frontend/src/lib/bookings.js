const INACTIVE_STATUSES = new Set(['Cancelado', 'Vencido']);

function bookingStartTime(booking) {
  const start = String(booking.time || '').split('-')[0];
  const date = new Date(`${booking.date}T${start}:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function sortByTime(direction) {
  return (left, right) => {
    const leftTime = bookingStartTime(left);
    const rightTime = bookingStartTime(right);
    if (leftTime === null || rightTime === null) return String(left.id).localeCompare(String(right.id));
    return (leftTime - rightTime) * direction;
  };
}

export function splitBookingsByTimeline(bookings, now = new Date()) {
  const currentTime = now.getTime();
  const upcoming = [];
  const history = [];

  bookings.forEach((booking) => {
    const startsAt = bookingStartTime(booking);
    if (INACTIVE_STATUSES.has(booking.status) || startsAt === null || startsAt < currentTime) history.push(booking);
    else upcoming.push(booking);
  });

  return {
    upcoming: upcoming.sort(sortByTime(1)),
    history: history.sort(sortByTime(-1)),
  };
}
