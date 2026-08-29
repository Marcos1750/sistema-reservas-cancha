export const BUENOS_AIRES_TIME_ZONE = 'America/Argentina/Buenos_Aires';

function buenosAiresParts(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUENOS_AIRES_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function getBuenosAiresDateTime(now = new Date()) {
  const { year, month, day, hour, minute } = buenosAiresParts(now);
  return {
    date: `${year}-${month}-${day}`,
    minutes: Number(hour) * 60 + Number(minute),
  };
}

export function isSlotSelectable(date, slot, now = new Date()) {
  const start = String(slot || '').split('-')[0];
  if (!/^\d{2}:\d{2}$/.test(start)) return false;
  const current = getBuenosAiresDateTime(now);
  if (date > current.date) return true;
  if (date < current.date) return false;
  const startMinutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
  return startMinutes > current.minutes;
}

export function getSelectableSlots(date, slots, now = new Date()) {
  return Array.isArray(slots) ? slots.filter((slot) => isSlotSelectable(date, slot, now)) : [];
}
