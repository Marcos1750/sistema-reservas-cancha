export const mockCourts = [
  {
    id: 'centro-santa-fe', name: 'NEW MATCH Centro', city: 'Santa Fe', province: 'Santa Fe', address: 'Dirección a confirmar', rating: '4,9', reviews: 84, price: 18000, sport: 'Fútbol 5', indoor: false, slots: ['19:00', '20:00', '21:00'], accent: 'lime', description: 'Una cancha abierta, iluminada y lista para el partido de la semana.', amenities: ['Vestuarios', 'Estacionamiento', 'Pelota incluida'],
  },
  {
    id: 'norte-santa-fe', name: 'Norte Club', city: 'Santa Fe', province: 'Santa Fe', address: 'Dirección a confirmar', rating: '4,8', reviews: 52, price: 22000, sport: 'Pádel', indoor: true, slots: ['18:30', '20:30', '22:00'], accent: 'forest', description: 'Cancha techada para jugar sin mirar el pronóstico.', amenities: ['Techada', 'Vestuarios', 'Bar del club'],
  },
  {
    id: 'oeste-santa-fe', name: 'Oeste Indoor', city: 'Santa Fe', province: 'Santa Fe', address: 'Dirección a confirmar', rating: '4,7', reviews: 39, price: 19500, sport: 'Tenis', indoor: true, slots: ['19:30', '21:30'], accent: 'olive', description: 'Un espacio cómodo para tu próximo partido.', amenities: ['Techada', 'Duchas', 'Iluminación'],
  },
];

export const mockBookings = [];
export const mockAdminBookings = [];

export function formatARS(value) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}
