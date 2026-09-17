const PUBLIC_SCREEN_PATHS = {
  explore: '/',
  bookings: '/turnos',
  saved: '/guardados',
  profile: '/cuenta',
};

export function complexSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function publicScreenPath(screen) {
  return PUBLIC_SCREEN_PATHS[screen] || PUBLIC_SCREEN_PATHS.explore;
}

export function complexPath(complex) {
  const identifier = typeof complex === 'object' ? complex?.name || complex?.id : complex;
  return `/complejos/${encodeURIComponent(complexSlug(identifier))}`;
}

export function bookingPath(complex, courtId, date, time) {
  const params = new URLSearchParams({
    cancha: String(courtId || ''),
    fecha: String(date || ''),
    hora: String(time || ''),
  });
  return `${complexPath(complex)}/reservar?${params}`;
}

export function readBookingSelection(search) {
  const params = new URLSearchParams(search);
  return {
    courtId: Number(params.get('cancha')) || null,
    date: params.get('fecha') || '',
    time: params.get('hora') || '',
  };
}

export function hasCompleteBookingSelection(selection) {
  return Boolean(selection?.courtId && /^\d{4}-\d{2}-\d{2}$/.test(selection.date) && /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(selection.time));
}
