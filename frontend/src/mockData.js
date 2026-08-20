export const mockCourts = [
  {
    id: 'palermo-verde',
    name: 'El Patio Palermo',
    neighborhood: 'Palermo, CABA',
    distance: '1,2 km',
    rating: '4,9',
    reviews: 84,
    price: 18000,
    type: 'Fútbol 5',
    surface: 'Césped sintético',
    indoor: false,
    slots: ['19:00', '20:00', '21:00'],
    accent: 'lime',
    description: 'Un patio abierto, iluminado y listo para el partido de la semana.',
    amenities: ['Vestuarios', 'Estacionamiento', 'Pelota incluida'],
  },
  {
    id: 'nunez-norte',
    name: 'Norte Fútbol Club',
    neighborhood: 'Núñez, CABA',
    distance: '3,8 km',
    rating: '4,8',
    reviews: 52,
    price: 22000,
    type: 'Fútbol 5',
    surface: 'Césped sintético',
    indoor: true,
    slots: ['18:30', '20:30', '22:00'],
    accent: 'forest',
    description: 'Cancha techada para jugar sin mirar el pronóstico.',
    amenities: ['Techada', 'Vestuarios', 'Bar del club'],
  },
  {
    id: 'colegiales-oeste',
    name: 'Oeste Indoor',
    neighborhood: 'Colegiales, CABA',
    distance: '4,4 km',
    rating: '4,7',
    reviews: 39,
    price: 19500,
    type: 'Fútbol 7',
    surface: 'Césped sintético',
    indoor: true,
    slots: ['19:30', '21:30'],
    accent: 'olive',
    description: 'Más espacio para el equipo completo y cambios rápidos.',
    amenities: ['Techada', 'Duchas', 'Cámara de partido'],
  },
  {
    id: 'villa-urquiza',
    name: 'La Línea Villa Urquiza',
    neighborhood: 'Villa Urquiza, CABA',
    distance: '6,1 km',
    rating: '4,6',
    reviews: 27,
    price: 16500,
    type: 'Fútbol 5',
    surface: 'Césped sintético',
    indoor: false,
    slots: ['18:00', '19:00', '22:00'],
    accent: 'slate',
    description: 'Simple, cerca y con turnos que se acomodan a tu semana.',
    amenities: ['Vestuarios', 'Quincho', 'Pago en cancha'],
  },
];

export const mockBookings = [
  { id: 'turno-01', court: 'El Patio Palermo', neighborhood: 'Palermo, CABA', date: 'Hoy', dateValue: '2026-08-19', time: '20:00', type: 'Fútbol 5', status: 'Confirmado', price: 18000 },
  { id: 'turno-02', court: 'Norte Fútbol Club', neighborhood: 'Núñez, CABA', date: 'Sáb 22 ago', dateValue: '2026-08-22', time: '21:30', type: 'Fútbol 5', status: 'Confirmado', price: 22000 },
];

export const mockAdminBookings = [
  { id: 1, date: '2026-08-19', time: '20:00', court: 'Cancha 01', name: 'Martín Sosa', phone: '11 5621 9034', status: 'Confirmado' },
  { id: 2, date: '2026-08-19', time: '21:00', court: 'Cancha 02', name: 'Sofía Benítez', phone: '11 4432 8891', status: 'Confirmado' },
  { id: 3, date: '2026-08-20', time: '19:00', court: 'Cancha 01', name: 'Lucas Ferreyra', phone: '11 3290 1182', status: 'Pendiente' },
  { id: 4, date: '2026-08-20', time: '22:00', court: 'Cancha 03', name: 'Agustín Díaz', phone: '11 6150 4029', status: 'Confirmado' },
];

export function formatARS(value) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}
