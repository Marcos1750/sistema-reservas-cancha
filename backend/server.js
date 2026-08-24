import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { del } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';
import { migrate, pool } from './db.js';
import {
  auth,
  migrateAuth,
  requireAnyAdmin,
  requireAuth,
  getSessionUser,
  syncConfiguredRole,
  toNodeHandler,
} from './auth.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.resolve(__dirname, '../frontend/dist');
const CANCELLATION_WINDOW_MS = 2 * 60 * 60 * 1000;
const DEPORTES = ['Fútbol 5', 'Pádel', 'Tenis'];

app.disable('x-powered-by');

// Better Auth debe recibir la petición antes de express.json().
app.all('/api/auth', toNodeHandler(auth));
app.all('/api/auth/*splat', toNodeHandler(auth));
app.use(express.json({ limit: '20kb' }));

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeWhatsApp(value) {
  let digits = cleanText(value, 32).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits && !digits.startsWith('54')) digits = `549${digits}`;
  return /^\d{10,15}$/.test(digits) ? digits : '';
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function validSlot(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return false;
  return match[1] + match[2] < match[3] + match[4];
}

function parseSlot(value) {
  if (!validSlot(value)) return null;
  const [start, end] = value.split('-');
  return { start, end };
}

function validateReservation(body) {
  const nombre = cleanText(body.nombre, 120);
  const telefono = cleanText(body.telefono, 15).replace(/\D/g, '');
  const fecha = cleanText(body.fecha, 10);
  const hora = cleanText(body.hora, 11);
  const canchaId = Number(body.cancha_id);
  const recurrente = body.recurrente === true;
  const semanas = recurrente ? Number(body.semanas) : 1;
  if (nombre.length < 2 || !/^\d{7,15}$/.test(telefono) || !validDate(fecha) || !validSlot(hora) || !Number.isSafeInteger(canchaId) || canchaId < 1) {
    return { error: 'Nombre, teléfono, fecha u horario inválido' };
  }
  if (!Number.isInteger(semanas) || (recurrente && (semanas < 2 || semanas > 52))) return { error: 'La cantidad de semanas es inválida' };
  return { nombre, telefono, fecha, hora, canchaId, recurrente, semanas };
}

function validateComplex(body) {
  const nombre = cleanText(body.nombre, 120);
  const ciudad = cleanText(body.ciudad, 100);
  const provincia = cleanText(body.provincia, 100);
  const direccion = cleanText(body.direccion, 180);
  const descripcion = cleanText(body.descripcion || '', 500);
  const whatsapp = normalizeWhatsApp(body.whatsapp || '');
  const fotoUrl = cleanText(body.foto_url || '', 1000);
  if (nombre.length < 2 || !ciudad || !provincia || !direccion) {
    return { error: 'Nombre, ciudad, provincia y dirección son obligatorios' };
  }
  if (!whatsapp) return { error: 'Ingresá un WhatsApp válido con código de país, por ejemplo 54911...' };
  if (fotoUrl && !/^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i.test(fotoUrl)) {
    return { error: 'La URL de la foto no es válida' };
  }
  return { nombre, ciudad, provincia, direccion, descripcion, whatsapp, fotoUrl };
}

function validateCourt(body) {
  const nombre = cleanText(body.nombre, 120);
  const deporte = cleanText(body.deporte || 'Fútbol 5', 40);
  const descripcion = cleanText(body.descripcion || '', 500);
  const indoor = Boolean(body.indoor);
  if (nombre.length < 2 || !DEPORTES.includes(deporte)) {
    return { error: 'Nombre y deporte son obligatorios' };
  }
  return { nombre, deporte, descripcion, indoor };
}

function validateProfile(body) {
  const nombre = cleanText(body.nombre, 120);
  const whatsapp = cleanText(body.whatsapp, 20).replace(/\D/g, '');
  if (nombre.length < 2 || !/^\d{7,15}$/.test(whatsapp)) return { error: 'Completá un nombre y WhatsApp válidos' };
  return { nombre, whatsapp };
}

function validateBlock(body) {
  const fecha = cleanText(body.fecha, 10);
  const motivo = cleanText(body.motivo || '', 250);
  if (!validDate(fecha)) return { error: 'Fecha inválida' };
  return { fecha, motivo };
}

function validateException(body) {
  const fecha = cleanText(body.fecha, 10);
  const slot = parseSlot(`${cleanText(body.start, 5)}-${cleanText(body.end, 5)}`);
  const price = body.price === '' || body.price === undefined || body.price === null ? null : Number(body.price);
  if (!validDate(fecha) || !slot || (price !== null && (!Number.isFinite(price) || price < 0))) {
    return { error: 'Fecha, horario o precio inválido' };
  }
  return { fecha, start: slot.start, end: slot.end, price: price === null ? null : Math.round(price), available: body.available !== false };
}

function formatSlot(row) {
  return {
    id: row.id,
    dayOfWeek: row.dia_semana,
    start: String(row.hora_inicio).slice(0, 5),
    end: String(row.hora_fin).slice(0, 5),
    price: row.precio_ars,
    active: row.activo,
  };
}

function canCustomerCancel(reservation, now = new Date()) {
  if (reservation.estado !== 'confirmada') return false;
  const slot = parseSlot(reservation.hora);
  if (!slot) return false;
  const startAt = new Date(`${reservation.fecha}T${slot.start}:00-03:00`);
  return Number.isFinite(startAt.getTime()) && startAt.getTime() - now.getTime() >= CANCELLATION_WINDOW_MS;
}

async function courtAccess(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, co.owner_user_id AS complejo_owner_user_id, co.whatsapp AS complejo_whatsapp
         FROM canchas c JOIN complejos co ON co.id = c.complejo_id
        WHERE c.id = $1`,
      [req.params.id],
    );
    const court = rows[0];
    if (!court) return res.status(404).json({ error: 'Cancha no encontrada' });
    if (req.user.role !== 'superadmin' && court.complejo_owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'No tenés acceso a esta cancha' });
    }
    req.court = court;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function complexAccess(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM complejos WHERE id = $1', [req.params.id]);
    const complex = rows[0];
    if (!complex) return res.status(404).json({ error: 'Complejo no encontrado' });
    if (req.user.role !== 'superadmin' && complex.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'No tenés acceso a este complejo' });
    }
    req.complex = complex;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function findSlotPrice(canchaId, fecha, hora, client = pool) {
  const parsed = parseSlot(hora);
  const { rows } = await client.query(
    `SELECT h.precio_ars, h.activo, COALESCE(e.disponible, true) AS exception_available,
            e.precio_ars AS exception_price
       FROM horarios_cancha h
       LEFT JOIN excepciones_cancha e
         ON e.cancha_id = h.cancha_id AND e.fecha = $2
        AND e.hora_inicio = h.hora_inicio AND e.hora_fin = h.hora_fin
      WHERE h.cancha_id = $1
        AND h.dia_semana = EXTRACT(DOW FROM $2::date)::int
        AND h.hora_inicio = $3::time AND h.hora_fin = $4::time
      LIMIT 1`,
    [canchaId, fecha, parsed.start, parsed.end],
  );
  const slot = rows[0];
  if (!slot || !slot.activo || !slot.exception_available) return null;
  return slot.exception_price ?? slot.precio_ars;
}

function dateAfterWeeks(value, weeks) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + (weeks * 7)));
  return date.toISOString().slice(0, 10);
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Healthcheck DB:', error.message);
    res.status(503).json({ status: 'error' });
  }
});

app.get('/api/session', async (req, res, next) => {
  try {
    const current = await getSessionUser(req);
    if (!current) return res.json({ user: null });
    return res.json({ user: await syncConfiguredRole(current) });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/perfil', requireAuth(), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(NULLIF(p.nombre_reserva, ''), u.name) AS nombre,
              p.whatsapp, u.email
         FROM "user" u
         LEFT JOIN perfiles_usuario p ON p.user_id = u.id
        WHERE u.id = $1`,
      [req.user.id],
    );
    res.json({ ...rows[0], role: req.user.role });
  } catch (error) {
    next(error);
  }
});

app.put('/api/perfil', requireAuth(), async (req, res, next) => {
  const profile = validateProfile(req.body || {});
  if (profile.error) return res.status(400).json(profile);
  try {
    const { rows } = await pool.query(
      `INSERT INTO perfiles_usuario (user_id, nombre_reserva, whatsapp)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET nombre_reserva = EXCLUDED.nombre_reserva, whatsapp = EXCLUDED.whatsapp, updated_at = NOW()
       RETURNING nombre_reserva AS nombre, whatsapp`,
      [req.user.id, profile.nombre, profile.whatsapp],
    );
    res.json({ ...rows[0], email: req.user.email, role: req.user.role });
  } catch (error) {
    next(error);
  }
});

// La API pública sólo expone disponibilidad y datos comerciales.
app.get('/api/complejos', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT co.id, co.nombre, co.ciudad, co.provincia, co.direccion, co.descripcion, co.foto_url,
              COUNT(DISTINCT c.id)::int AS cantidad_canchas,
              COALESCE(array_agg(DISTINCT c.deporte) FILTER (WHERE c.id IS NOT NULL), '{}') AS deportes,
              COALESCE(MIN(h.precio_ars) FILTER (WHERE h.activo = true), 0) AS precio_desde
         FROM complejos co
         LEFT JOIN canchas c ON c.complejo_id = co.id AND c.activa = true
         LEFT JOIN horarios_cancha h ON h.cancha_id = c.id AND h.activo = true
        WHERE co.activo = true
        GROUP BY co.id
        HAVING COUNT(c.id) > 0
        ORDER BY co.nombre`,
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/complejos/:id', async (req, res, next) => {
  try {
    const complexResult = await pool.query(
      `SELECT id, nombre, ciudad, provincia, direccion, descripcion, foto_url
         FROM complejos WHERE id = $1 AND activo = true`,
      [req.params.id],
    );
    const complex = complexResult.rows[0];
    if (!complex) return res.status(404).json({ error: 'Complejo no encontrado' });
    const { rows } = await pool.query(
      `SELECT c.id, c.nombre, c.deporte, c.descripcion, c.indoor,
              COALESCE(MIN(h.precio_ars) FILTER (WHERE h.activo = true), 0) AS precio_desde
         FROM canchas c
         LEFT JOIN horarios_cancha h ON h.cancha_id = c.id
        WHERE c.complejo_id = $1 AND c.activa = true
        GROUP BY c.id
        ORDER BY c.nombre`,
      [req.params.id],
    );
    res.json({ ...complex, canchas: rows });
  } catch (error) {
    next(error);
  }
});

// Se conserva temporalmente para clientes anteriores.
app.get('/api/canchas', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.nombre, co.ciudad, co.provincia, co.direccion, c.deporte,
              c.descripcion, c.indoor, co.id AS complejo_id, co.nombre AS complejo_nombre,
              co.foto_url, COALESCE(MIN(h.precio_ars), 0) AS precio_desde
         FROM canchas c
         JOIN complejos co ON co.id = c.complejo_id
         LEFT JOIN horarios_cancha h ON h.cancha_id = c.id AND h.activo = true
        WHERE c.activa = true AND co.activo = true
        GROUP BY c.id, co.id
        ORDER BY co.nombre, c.nombre`,
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/guardados', requireAuth(), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT complejo_id
         FROM complejos_guardados
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [req.user.id],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/guardados', requireAuth(), async (req, res, next) => {
  const complejoId = Number(req.body?.complejo_id);
  if (!Number.isSafeInteger(complejoId) || complejoId < 1) return res.status(400).json({ error: 'Complejo inválido' });
  try {
    const complex = await pool.query('SELECT id FROM complejos WHERE id = $1 AND activo = true', [complejoId]);
    if (!complex.rowCount) return res.status(404).json({ error: 'Complejo no encontrado' });
    await pool.query(
      'INSERT INTO complejos_guardados (user_id, complejo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, complejoId],
    );
    res.status(201).json({ complejo_id: complejoId });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/guardados/:complejoId', requireAuth(), async (req, res, next) => {
  const complejoId = Number(req.params.complejoId);
  if (!Number.isSafeInteger(complejoId) || complejoId < 1) return res.status(400).json({ error: 'Complejo inválido' });
  try {
    await pool.query('DELETE FROM complejos_guardados WHERE user_id = $1 AND complejo_id = $2', [req.user.id, complejoId]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/canchas/:id/disponibilidad', async (req, res, next) => {
  const fecha = cleanText(req.query.fecha, 10);
  if (!validDate(fecha)) return res.status(400).json({ error: 'Fecha inválida' });
  try {
    const blocked = await pool.query('SELECT 1 FROM bloqueos WHERE fecha = $1 AND (cancha_id = $2 OR cancha_id IS NULL)', [fecha, req.params.id]);
    if (blocked.rowCount) return res.json({ fecha, blocked: true, slots: [] });
    const { rows } = await pool.query(
      `SELECT h.hora_inicio, h.hora_fin,
              COALESCE(e.disponible, h.activo) AS disponible,
              COALESCE(e.precio_ars, h.precio_ars) AS precio_ars,
              EXISTS (SELECT 1 FROM reservas r WHERE r.cancha_id = h.cancha_id
                AND r.fecha = $2 AND r.hora = to_char(h.hora_inicio, 'HH24:MI') || '-' || to_char(h.hora_fin, 'HH24:MI')
                AND r.estado = 'confirmada') AS reservado
         FROM horarios_cancha h
         LEFT JOIN excepciones_cancha e ON e.cancha_id = h.cancha_id AND e.fecha = $2
          AND e.hora_inicio = h.hora_inicio AND e.hora_fin = h.hora_fin
        WHERE h.cancha_id = $1 AND h.dia_semana = EXTRACT(DOW FROM $2::date)::int
        ORDER BY h.hora_inicio`,
      [req.params.id, fecha],
    );
    res.json({
      fecha,
      blocked: false,
      slots: rows.map((row) => ({
        hora: `${String(row.hora_inicio).slice(0, 5)}-${String(row.hora_fin).slice(0, 5)}`,
        precio: row.precio_ars,
        disponible: row.disponible && !row.reservado,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/reservas', async (_req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT fecha::text, hora, cancha_id FROM reservas WHERE estado = 'confirmada' ORDER BY fecha, hora");
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/bloqueos', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT fecha::text FROM bloqueos ORDER BY fecha');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/reservas', requireAuth(['cliente', 'admin_cancha', 'superadmin']), async (req, res, next) => {
  const reservation = validateReservation(req.body || {});
  if (reservation.error) return res.status(400).json(reservation);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const courtResult = await client.query(
      `SELECT c.id, c.nombre, c.deporte, co.nombre AS complejo_nombre, co.ciudad, co.provincia,
              co.whatsapp, co.activo AS complejo_activo
         FROM canchas c JOIN complejos co ON co.id = c.complejo_id
        WHERE c.id = $1 AND c.activa = true AND co.activo = true FOR SHARE`,
      [reservation.canchaId],
    );
    const court = courtResult.rows[0];
    if (!court) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'La cancha ya no está disponible' });
    }
    const dates = Array.from({ length: reservation.semanas }, (_, index) => dateAfterWeeks(reservation.fecha, index));
    const pricedDates = [];
    for (const fecha of dates) {
      const blocked = await client.query('SELECT 1 FROM bloqueos WHERE fecha = $1 AND (cancha_id = $2 OR cancha_id IS NULL)', [fecha, reservation.canchaId]);
      if (blocked.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `El día ${fecha} está bloqueado` });
      }
      const price = await findSlotPrice(reservation.canchaId, fecha, reservation.hora, client);
      if (price === null) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `El horario no está disponible el ${fecha}` });
      }
      pricedDates.push({ fecha, price });
    }
    let recurrenceId = null;
    if (reservation.recurrente) {
      const recurring = await client.query(
        `INSERT INTO reservas_recurrentes (user_id, cancha_id, nombre, telefono, hora, dia_semana, fecha_inicio, semanas)
         VALUES ($1,$2,$3,$4,$5,EXTRACT(DOW FROM $6::date)::int,$6,$7) RETURNING id`,
        [req.user.id, reservation.canchaId, reservation.nombre, reservation.telefono, reservation.hora, reservation.fecha, reservation.semanas],
      );
      recurrenceId = recurring.rows[0].id;
    }
    const rows = [];
    for (const occurrence of pricedDates) {
      const result = await client.query(
        `INSERT INTO reservas (nombre, telefono, fecha, hora, user_id, cancha_id, precio_ars, recurrencia_id,
                               cancha_nombre, cancha_ciudad, cancha_provincia, cancha_deporte, cancha_whatsapp,
                               complejo_nombre, complejo_ciudad, complejo_provincia, complejo_whatsapp)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id, fecha::text, hora, cancha_id, precio_ars, recurrencia_id`,
        [reservation.nombre, reservation.telefono, occurrence.fecha, reservation.hora, req.user.id, reservation.canchaId, occurrence.price, recurrenceId,
          court.nombre, court.ciudad, court.provincia, court.deporte, court.whatsapp,
          court.complejo_nombre, court.ciudad, court.provincia, court.whatsapp],
      );
      rows.push(result.rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json({ ...rows[0], reservas: rows, recurrencia_id: recurrenceId, message: reservation.recurrente ? `Horario fijo reservado por ${reservation.semanas} semanas` : 'Reserva guardada' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') return res.status(409).json({ error: 'Uno de los horarios ya fue reservado por otra persona' });
    next(error);
  } finally {
    client.release();
  }
});

app.get('/api/mis-reservas', requireAuth(), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.nombre, r.telefono, r.fecha::text, r.hora, r.precio_ars, r.recurrencia_id,
              r.estado, r.created_at, c.id AS cancha_id, COALESCE(c.nombre, r.cancha_nombre, 'Cancha eliminada') AS cancha,
              COALESCE(co.nombre, r.complejo_nombre, '') AS complejo,
              COALESCE(co.ciudad, r.complejo_ciudad, r.cancha_ciudad, '') AS ciudad,
              COALESCE(co.provincia, r.complejo_provincia, r.cancha_provincia, '') AS provincia,
              COALESCE(c.deporte, r.cancha_deporte, '') AS deporte,
              COALESCE(co.whatsapp, r.complejo_whatsapp, r.cancha_whatsapp, '') AS whatsapp
         FROM reservas r
         LEFT JOIN canchas c ON c.id = r.cancha_id
         LEFT JOIN complejos co ON co.id = c.complejo_id
        WHERE r.user_id = $1 ORDER BY r.fecha, r.hora`,
      [req.user.id],
    );
    res.json(rows.map((reservation) => ({ ...reservation, puede_cancelar: canCustomerCancel(reservation) })));
  } catch (error) {
    next(error);
  }
});

app.post('/api/mis-reservas/:id/cancelar', requireAuth(), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.fecha::text, r.hora, r.estado,
              COALESCE(co.whatsapp, r.complejo_whatsapp, r.cancha_whatsapp) AS whatsapp
         FROM reservas r
         LEFT JOIN canchas c ON c.id = r.cancha_id
         LEFT JOIN complejos co ON co.id = c.complejo_id
        WHERE r.id = $1 AND r.user_id = $2`,
      [req.params.id, req.user.id],
    );
    const reservation = rows[0];
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (!canCustomerCancel(reservation)) {
      return res.status(409).json({ error: 'La cancelación online está disponible hasta dos horas antes del turno', whatsapp: reservation.whatsapp || null });
    }
    const result = await pool.query(
      `UPDATE reservas SET estado = 'cancelada', cancelled_at = NOW(), cancelled_by = $2,
              cancel_reason = 'Cancelada por el cliente'
        WHERE id = $1 AND user_id = $2 AND estado = 'confirmada'
        RETURNING id, estado, cancelled_at`,
      [req.params.id, req.user.id],
    );
    if (!result.rowCount) return res.status(409).json({ error: 'La reserva ya fue cancelada' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/session', requireAnyAdmin, (req, res) => {
  res.json({ authenticated: true, user: req.user });
});

app.post('/api/admin/uploads/complejo', requireAnyAdmin, async (req, res, next) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'La carga de fotos todavía no está configurada en Vercel' });
  }
  try {
    const result = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maximumSizeInBytes: 5 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId: req.user.id, pathname }),
      }),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/complejos', requireAnyAdmin, async (req, res, next) => {
  try {
    const params = [];
    const filter = req.user.role === 'superadmin' ? '' : 'WHERE co.owner_user_id = $1';
    if (req.user.role !== 'superadmin') params.push(req.user.id);
    const { rows } = await pool.query(
      `SELECT co.*,
              COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'id', c.id,
                    'nombre', c.nombre,
                    'deporte', c.deporte,
                    'descripcion', c.descripcion,
                    'indoor', c.indoor,
                    'activa', c.activa,
                    'precio_desde', COALESCE((SELECT MIN(h.precio_ars) FROM horarios_cancha h WHERE h.cancha_id = c.id AND h.activo = true), 0)
                  ) ORDER BY c.nombre
                ) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb
              ) AS canchas
         FROM complejos co
         LEFT JOIN canchas c ON c.complejo_id = co.id
         ${filter}
        GROUP BY co.id
        ORDER BY co.nombre`,
      params,
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/complejos', requireAnyAdmin, async (req, res, next) => {
  const complex = validateComplex(req.body || {});
  const court = validateCourt(req.body?.cancha || {});
  if (complex.error) return res.status(400).json(complex);
  if (court.error) return res.status(400).json(court);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const complexResult = await client.query(
      `INSERT INTO complejos (owner_user_id, nombre, ciudad, provincia, direccion, whatsapp, descripcion, foto_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, complex.nombre, complex.ciudad, complex.provincia, complex.direccion, complex.whatsapp, complex.descripcion, complex.fotoUrl],
    );
    const createdComplex = complexResult.rows[0];
    const courtResult = await client.query(
      `INSERT INTO canchas (owner_user_id, complejo_id, nombre, deporte, descripcion, indoor, barrio, ciudad, provincia, direccion, whatsapp, tipo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$4) RETURNING *`,
      [req.user.id, createdComplex.id, court.nombre, court.deporte, court.descripcion, court.indoor,
        complex.ciudad, complex.provincia, complex.direccion, complex.whatsapp],
    );
    await client.query('COMMIT');
    res.status(201).json({ ...createdComplex, canchas: [courtResult.rows[0]] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

app.patch('/api/admin/complejos/:id', requireAnyAdmin, complexAccess, async (req, res, next) => {
  const complex = validateComplex({ ...req.complex, ...req.body });
  if (complex.error) return res.status(400).json(complex);
  try {
    const { rows } = await pool.query(
      `UPDATE complejos SET nombre=$1, ciudad=$2, provincia=$3, direccion=$4, whatsapp=$5,
              descripcion=$6, foto_url=$7, activo=COALESCE($8, activo), updated_at=NOW()
        WHERE id=$9 RETURNING *`,
      [complex.nombre, complex.ciudad, complex.provincia, complex.direccion, complex.whatsapp,
        complex.descripcion, complex.fotoUrl, req.body.activo, req.params.id],
    );
    await pool.query(
      `UPDATE canchas SET barrio=$1, ciudad=$1, provincia=$2, direccion=$3, whatsapp=$4, updated_at=NOW()
        WHERE complejo_id=$5`,
      [complex.ciudad, complex.provincia, complex.direccion, complex.whatsapp, req.params.id],
    );
    if (req.complex.foto_url && req.complex.foto_url !== complex.fotoUrl && process.env.BLOB_READ_WRITE_TOKEN) {
      del(req.complex.foto_url).catch((error) => console.error('No se pudo borrar la foto anterior:', error.message));
    }
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/complejos/:id', requireAnyAdmin, complexAccess, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM complejos WHERE id = $1', [req.params.id]);
    if (req.complex.foto_url && process.env.BLOB_READ_WRITE_TOKEN) {
      del(req.complex.foto_url).catch((error) => console.error('No se pudo borrar la foto:', error.message));
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/complejos/:id/canchas', requireAnyAdmin, complexAccess, async (req, res, next) => {
  const court = validateCourt(req.body || {});
  if (court.error) return res.status(400).json(court);
  try {
    const { rows } = await pool.query(
      `INSERT INTO canchas (owner_user_id, complejo_id, nombre, deporte, descripcion, indoor, barrio, ciudad, provincia, direccion, whatsapp, tipo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$4) RETURNING *`,
      [req.complex.owner_user_id, req.complex.id, court.nombre, court.deporte, court.descripcion, court.indoor,
        req.complex.ciudad, req.complex.provincia, req.complex.direccion, req.complex.whatsapp],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/canchas', requireAnyAdmin, async (req, res, next) => {
  try {
    const query = req.user.role === 'superadmin'
      ? 'SELECT c.*, co.nombre AS complejo_nombre FROM canchas c JOIN complejos co ON co.id = c.complejo_id ORDER BY co.nombre, c.nombre'
      : 'SELECT c.*, co.nombre AS complejo_nombre FROM canchas c JOIN complejos co ON co.id = c.complejo_id WHERE co.owner_user_id = $1 ORDER BY co.nombre, c.nombre';
    const result = await pool.query(query, req.user.role === 'superadmin' ? [] : [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/canchas', requireAnyAdmin, async (req, res, next) => {
  res.status(410).json({ error: 'Creá la cancha dentro de un complejo' });
});

app.patch('/api/admin/canchas/:id', requireAnyAdmin, courtAccess, async (req, res, next) => {
  const court = validateCourt({ ...req.court, ...req.body });
  if (court.error) return res.status(400).json(court);
  try {
    const { rows } = await pool.query(
      `UPDATE canchas SET nombre=$1, deporte=$2, descripcion=$3, indoor=$4,
              activa=COALESCE($5, activa), tipo=$2, updated_at=NOW()
        WHERE id=$6 RETURNING *`,
      [court.nombre, court.deporte, court.descripcion, court.indoor, req.body.activa, req.params.id],
    );
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/canchas/:id', requireAnyAdmin, courtAccess, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM canchas WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/canchas/:id/horarios', requireAnyAdmin, courtAccess, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM horarios_cancha WHERE cancha_id = $1 ORDER BY dia_semana, hora_inicio', [req.params.id]);
    res.json(rows.map(formatSlot));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/canchas/:id/horarios', requireAnyAdmin, courtAccess, async (req, res, next) => {
  const slots = Array.isArray(req.body?.slots) ? req.body.slots : [];
  if (slots.some((slot) => !Number.isInteger(Number(slot.dayOfWeek)) || Number(slot.dayOfWeek) < 0 || Number(slot.dayOfWeek) > 6 || !validSlot(`${slot.start}-${slot.end}`) || !Number.isFinite(Number(slot.price)) || Number(slot.price) < 0)) {
    return res.status(400).json({ error: 'Hay un día, horario o precio inválido' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM horarios_cancha WHERE cancha_id = $1', [req.params.id]);
    for (const slot of slots) {
      await client.query(
        `INSERT INTO horarios_cancha (cancha_id, dia_semana, hora_inicio, hora_fin, precio_ars, activo)
         VALUES ($1,$2,$3::time,$4::time,$5,$6)`,
        [req.params.id, Number(slot.dayOfWeek), slot.start, slot.end, Math.round(Number(slot.price)), slot.active !== false],
      );
    }
    await client.query('COMMIT');
    res.json({ slots });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

app.get('/api/admin/canchas/:id/excepciones', requireAnyAdmin, courtAccess, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, fecha::text, hora_inicio, hora_fin, precio_ars, disponible FROM excepciones_cancha WHERE cancha_id = $1 ORDER BY fecha, hora_inicio',
      [req.params.id],
    );
    res.json(rows.map((row) => ({
      id: row.id,
      date: row.fecha,
      start: String(row.hora_inicio).slice(0, 5),
      end: String(row.hora_fin).slice(0, 5),
      price: row.precio_ars,
      available: row.disponible,
    })));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/canchas/:id/excepciones', requireAnyAdmin, courtAccess, async (req, res, next) => {
  const exception = validateException(req.body || {});
  if (exception.error) return res.status(400).json(exception);
  try {
    const { rows } = await pool.query(
      `INSERT INTO excepciones_cancha (cancha_id, fecha, hora_inicio, hora_fin, precio_ars, disponible)
       VALUES ($1,$2,$3::time,$4::time,$5,$6)
       ON CONFLICT (cancha_id, fecha, hora_inicio, hora_fin)
       DO UPDATE SET precio_ars = EXCLUDED.precio_ars, disponible = EXCLUDED.disponible
       RETURNING id, fecha::text, hora_inicio, hora_fin, precio_ars, disponible`,
      [req.params.id, exception.fecha, exception.start, exception.end, exception.price, exception.available],
    );
    const row = rows[0];
    res.status(201).json({ ...row, start: String(row.hora_inicio).slice(0, 5), end: String(row.hora_fin).slice(0, 5) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/canchas/:id/excepciones/:exceptionId', requireAnyAdmin, courtAccess, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM excepciones_cancha WHERE id = $1 AND cancha_id = $2', [req.params.exceptionId, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Excepción no encontrada' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/reservas', requireAnyAdmin, async (req, res, next) => {
  try {
    const params = [];
    let filter = '';
    if (req.user.role !== 'superadmin') {
      params.push(req.user.id);
      filter = 'WHERE co.owner_user_id = $1';
    }
    const { rows } = await pool.query(
      `SELECT r.id, r.nombre, r.telefono, r.fecha::text, r.hora, r.precio_ars, r.recurrencia_id,
              r.estado, r.created_at, COALESCE(c.nombre, r.cancha_nombre, 'Cancha eliminada') AS cancha,
              COALESCE(co.nombre, r.complejo_nombre, '') AS complejo,
              COALESCE(co.ciudad, r.complejo_ciudad, r.cancha_ciudad, '') AS ciudad,
              COALESCE(co.provincia, r.complejo_provincia, r.cancha_provincia, '') AS provincia,
              COALESCE(c.deporte, r.cancha_deporte, '') AS deporte
         FROM reservas r
         LEFT JOIN canchas c ON c.id = r.cancha_id
         LEFT JOIN complejos co ON co.id = c.complejo_id ${filter}
        ORDER BY r.fecha, r.hora`,
      params,
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/reservas/:id', requireAnyAdmin, async (req, res, next) => {
  try {
    const params = [req.params.id, req.user.id];
    const filter = req.user.role === 'superadmin' ? '' : ' AND co.owner_user_id = $3';
    if (req.user.role !== 'superadmin') params.push(req.user.id);
    const result = await pool.query(
      `UPDATE reservas r
          SET estado = 'cancelada', cancelled_at = NOW(), cancelled_by = $2,
              cancel_reason = 'Cancelada por administración'
         FROM canchas c JOIN complejos co ON co.id = c.complejo_id
        WHERE r.id = $1 AND r.cancha_id = c.id AND r.estado = 'confirmada'${filter}
        RETURNING r.id`,
      params,
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json({ message: 'Reserva cancelada con éxito' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/canchas/:id/bloqueos', requireAnyAdmin, courtAccess, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, fecha::text, motivo FROM bloqueos WHERE cancha_id = $1 ORDER BY fecha', [req.params.id]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/canchas/:id/bloqueos', requireAnyAdmin, courtAccess, async (req, res, next) => {
  const block = validateBlock(req.body || {});
  if (block.error) return res.status(400).json(block);
  try {
    await pool.query(
      `INSERT INTO bloqueos (cancha_id, fecha, motivo) VALUES ($1, $2, $3)
       ON CONFLICT (cancha_id, fecha) WHERE cancha_id IS NOT NULL DO UPDATE SET motivo = EXCLUDED.motivo`,
      [req.params.id, block.fecha, block.motivo],
    );
    res.status(201).json({ message: 'Día bloqueado' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/superadmin/admins', requireAuth(['superadmin']), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, COALESCE(u.name, 'Pendiente') AS name, i.email, u.image,
              COALESCE(u.role, 'pendiente') AS role, COALESCE(u."createdAt", i.created_at) AS created_at,
              i.id AS invitation_id, i.accepted_at
         FROM invitaciones_admin i
         LEFT JOIN "user" u ON lower(i.email) = lower(u.email)
       UNION ALL
       SELECT u.id, u.name, u.email, u.image, u.role, u."createdAt" AS created_at,
              NULL::BIGINT AS invitation_id, NULL::TIMESTAMPTZ AS accepted_at
         FROM "user" u
        WHERE u.role IN ('admin_cancha', 'superadmin')
          AND NOT EXISTS (SELECT 1 FROM invitaciones_admin i WHERE lower(i.email) = lower(u.email))
        ORDER BY created_at DESC`,
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/superadmin/admins', requireAuth(['superadmin']), async (req, res, next) => {
  const email = cleanText(req.body?.email, 254).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Email inválido' });
  try {
    const result = await pool.query(
      `INSERT INTO invitaciones_admin (email, created_by) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET created_by = EXCLUDED.created_by RETURNING *`,
      [email, req.user.id],
    );
    const user = await pool.query(
      `UPDATE "user" SET role = 'admin_cancha' WHERE lower(email) = $1 AND role = 'cliente'
       RETURNING id, email, role`,
      [email],
    );
    const existingUser = user.rowCount ? user.rows[0] : (await pool.query('SELECT id, email, role FROM "user" WHERE lower(email) = $1', [email])).rows[0];
    if (existingUser) await pool.query('UPDATE invitaciones_admin SET accepted_at = NOW() WHERE id = $1', [result.rows[0].id]);
    res.status(201).json({ ...result.rows[0], accepted_at: existingUser ? new Date().toISOString() : null, user: existingUser || null });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/superadmin/admins/:id', requireAuth(['superadmin']), async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE "user" SET role = 'cliente' WHERE id = $1 AND role = 'admin_cancha' RETURNING id, email, role`,
      [req.params.id],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Administrador no encontrado' });
    await pool.query('DELETE FROM invitaciones_admin WHERE lower(email) = lower($1)', [result.rows[0].email]);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/superadmin/invitaciones/:id', requireAuth(['superadmin']), async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM invitaciones_admin WHERE id = $1 AND accepted_at IS NULL', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Invitación pendiente no encontrada' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use(express.static(FRONTEND_DIST));

app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Error interno del servidor' });
});

async function prepare() {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('el-patio-schema-v1'))");
    await migrateAuth(client);
    await migrate(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('el-patio-schema-v1'))").catch(() => {});
    client.release();
  }
}

async function start() {
  await prepare();
  return app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((error) => {
    console.error('No se pudo iniciar la aplicación:', error);
    process.exit(1);
  });
}

export { app, canCustomerCancel, prepare, start, validateComplex, validateCourt, validateProfile, validateReservation };
