export function getAvailabilityStatus(availability) {
  if (availability?.blocked) return 'blocked';

  const slots = availability?.slots;
  if (!Array.isArray(slots) || slots.length === 0) return 'no-schedule';
  if (!slots.some((slot) => slot.disponible)) return 'fully-booked';

  return 'available';
}
