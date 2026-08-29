/*
 * Modo demo del panel: permite recorrer /admin sin backend, sesión de Google ni
 * .env configurado. Sirve datos de ejemplo en memoria y rechaza cualquier
 * escritura, así queda claro que nada se guarda.
 */
import { getBuenosAiresDate } from './lib/adminOverview';

const DEMO_FLAG = 'newmatch:demo-admin';

export function isDemoAdmin() {
  if (new URLSearchParams(window.location.search).has('demo')) return true;
  try {
    return window.sessionStorage.getItem(DEMO_FLAG) === '1';
  } catch {
    return false;
  }
}

export function enableDemoAdmin() {
  try {
    window.sessionStorage.setItem(DEMO_FLAG, '1');
  } catch {
    /* Modo privado sin storage: la demo vive solo en el estado de React. */
  }
}

export function disableDemoAdmin() {
  try {
    window.sessionStorage.removeItem(DEMO_FLAG);
  } catch {
    /* Nada que limpiar. */
  }
}

function shiftDate(days, now = new Date()) {
  const date = new Date(`${getBuenosAiresDate(now)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const DEMO_USER = {
  id: 'demo-admin',
  name: 'Admin Demo',
  email: 'demo@newmatch.app',
  image: null,
  role: 'admin_cancha',
};

const DEMO_ACCESS = {
  type: 'owner',
  can_manage_team: true,
  can_manage_finances: true,
  can_delete_structure: true,
};

const DEMO_CAPABILITIES = {
  can_write: true,
  can_add_complex: false,
  can_add_court: true,
  can_receive_bookings: true,
  max_complexes: 1,
  max_canchas: 6,
};

function demoSubscription() {
  return {
    id: 'demo-sub',
    tipo: 'mercadopago',
    estado: 'activa',
    plan: { code: 'estandar', nombre: 'Estándar', precio_ars: 24900, max_complejos: 1, max_canchas: 6 },
    prueba_finaliza_at: null,
    proximo_cobro_at: `${shiftDate(18)}T12:00:00.000Z`,
    gracia_hasta_at: null,
    founder_pagos: 0,
    founder_consolidado: false,
    complexes_used: 1,
    courts_used: 3,
    anulado_at: null,
    capabilities: DEMO_CAPABILITIES,
  };
}

const DEMO_COURTS = [
  { id: 'demo-cancha-1', nombre: 'Cancha 1 · Fútbol 5', deporte: 'Fútbol 5', descripcion: 'Césped sintético con iluminación LED.', indoor: false, requiere_sena: true, activa: true, precio_desde: 18000 },
  { id: 'demo-cancha-2', nombre: 'Cancha 2 · Fútbol 5', deporte: 'Fútbol 5', descripcion: 'Techada, disponible con lluvia.', indoor: true, requiere_sena: true, activa: true, precio_desde: 21000 },
  { id: 'demo-cancha-3', nombre: 'Cancha 3 · Pádel', deporte: 'Pádel', descripcion: 'Panorámica, con paletas en préstamo.', indoor: true, requiere_sena: false, activa: true, precio_desde: 14000 },
];

function demoComplexes() {
  return [
    {
      id: 'demo-complejo',
      owner_user_id: DEMO_USER.id,
      nombre: 'NEW MATCH Centro',
      ciudad: 'Santa Fe',
      provincia: 'Santa Fe',
      direccion: 'Av. Freyre 2500',
      whatsapp: '+5493425000000',
      descripcion: 'Complejo de ejemplo para recorrer el panel en modo demo.',
      foto_url: null,
      activo: true,
      suspendido_suscripcion: false,
      sena_porcentaje: 30,
      created_at: `${shiftDate(-120)}T12:00:00.000Z`,
      updated_at: `${shiftDate(-3)}T12:00:00.000Z`,
      canchas: DEMO_COURTS,
    },
  ];
}

function booking(id, dayOffset, hora, extra) {
  return {
    id,
    nombre: extra.nombre,
    telefono: extra.telefono,
    fecha: shiftDate(dayOffset),
    hora,
    precio_ars: extra.precio_ars,
    recurrencia_id: null,
    estado: extra.estado,
    created_at: `${shiftDate(dayOffset - 4)}T12:00:00.000Z`,
    historial_oculto_at: null,
    cancha: extra.cancha,
    complejo: 'NEW MATCH Centro',
    ciudad: 'Santa Fe',
    provincia: 'Santa Fe',
    deporte: extra.deporte,
  };
}

function demoBookings() {
  return [
    booking(9001, 0, '20:00-21:00', { nombre: 'Lucía Fernández', telefono: '+5493425111111', precio_ars: 18000, estado: 'confirmada', cancha: 'Cancha 1 · Fútbol 5', deporte: 'Fútbol 5' }),
    booking(9002, 0, '21:00-22:00', { nombre: 'Martín Duarte', telefono: '+5493425222222', precio_ars: 21000, estado: 'pendiente_pago', cancha: 'Cancha 2 · Fútbol 5', deporte: 'Fútbol 5' }),
    booking(9003, 1, '19:00-20:00', { nombre: 'Club Amigos', telefono: '+5493425333333', precio_ars: 14000, estado: 'confirmada', cancha: 'Cancha 3 · Pádel', deporte: 'Pádel' }),
    booking(9004, 3, '22:00-23:00', { nombre: 'Sofía Peralta', telefono: '+5493425444444', precio_ars: 18000, estado: 'confirmada', cancha: 'Cancha 1 · Fútbol 5', deporte: 'Fútbol 5' }),
    booking(9005, 6, '20:30-21:30', { nombre: 'Equipo Norte', telefono: '+5493425555555', precio_ars: 21000, estado: 'confirmada', cancha: 'Cancha 2 · Fútbol 5', deporte: 'Fútbol 5' }),
    booking(9006, -1, '20:00-21:00', { nombre: 'Diego Sosa', telefono: '+5493425666666', precio_ars: 18000, estado: 'confirmada', cancha: 'Cancha 1 · Fútbol 5', deporte: 'Fútbol 5' }),
    booking(9007, -2, '19:00-20:00', { nombre: 'Ana Ruiz', telefono: '+5493425777777', precio_ars: 14000, estado: 'cancelada', cancha: 'Cancha 3 · Pádel', deporte: 'Pádel' }),
    booking(9008, -5, '21:00-22:00', { nombre: 'Pablo Giménez', telefono: '+5493425888888', precio_ars: 21000, estado: 'expirada', cancha: 'Cancha 2 · Fútbol 5', deporte: 'Fútbol 5' }),
  ];
}

const DEMO_SCHEDULE = [1, 2, 3, 4, 5, 6, 0].flatMap((dayOfWeek) => (
  ['19:00', '20:00', '21:00', '22:00'].map((start, index) => ({
    id: `demo-horario-${dayOfWeek}-${index}`,
    dayOfWeek,
    start,
    end: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`,
    price: 18000,
    active: true,
  }))
));

const DEMO_BLOCKS = [{ id: 'demo-bloqueo-1', fecha: shiftDate(9), motivo: 'Mantenimiento del césped' }];

export const demoAdminSession = () => ({
  authenticated: true,
  user: DEMO_USER,
  admin_access: DEMO_ACCESS,
  suscripcion: demoSubscription(),
  capabilities: DEMO_CAPABILITIES,
});

const DEMO_WRITE_ERROR = 'Modo demo: los cambios no se guardan porque no hay conexión con la API.';

/* Reemplaza a `request` dentro del panel: responde las lecturas con datos de
 * ejemplo y corta las escrituras con un mensaje explícito. */
export async function demoRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') throw new Error(DEMO_WRITE_ERROR);

  if (path === '/api/admin/session') return demoAdminSession();
  if (path === '/api/suscripcion') return demoSubscription();
  if (path === '/api/admin/reservas') return demoBookings();
  if (path === '/api/admin/complejos') return demoComplexes();
  if (path === '/api/admin/subadmins') return [];
  if (path === '/api/superadmin/admins') return [];
  if (path === '/api/superadmin/suscripciones') return [];
  if (/^\/api\/admin\/complejos\/[^/]+\/mercadopago$/.test(path)) {
    return { sena_porcentaje: 30, conectado: true, cuenta_id: 'demo-mp' };
  }
  if (/\/horarios$/.test(path)) return DEMO_SCHEDULE;
  if (/\/excepciones$/.test(path)) return [];
  if (/\/bloqueos$/.test(path)) return DEMO_BLOCKS;
  return [];
}
