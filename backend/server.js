require('dotenv').config();

const express = require('express');
const path = require('node:path');
const { migrate, pool } = require('./db');
const {
  auth,
  migrateAuth,
  requireAnyAdmin,
  requireAuth,
  getSessionUser,
  syncConfiguredRole,
  toNodeHandler,
} = require('./auth');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const FRONTEND_DIST = path.resolve(__dirname, '../frontend/dist');

app.disable('x-powered-by');

// Better Auth debe recibir la petición antes de express.json().
app.all('/api/auth', toNodeHandler(auth));
app.all('/api/auth/*splat', toNodeHandler(auth));
app.use(express.json({ limit: '20kb' }));

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
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
  if (nombre.length < 2 || !/^\d{7,15}$/.test(telefono) || !validDate(fecha) || !validSlot(hora) || !Number.isSafeInteger(canchaId) || canchaId < 1) {
    return { error: 'Nombre, teléfono, fecha u horario inválido' };
  }
  return { nombre, telefono, fecha, hora, canchaId };
}

function validateCourt(body) {
  const nombre = cleanText(body.nombre, 120);
  const barrio = cleanText(body.barrio, 100);
  const direccion = cleanText(body.direccion, 180);
  const tipo = cleanText(body.tipo || 'Fútbol 5', 40);
  const superficie = cleanText(body.superficie || 'Césped sintético', 80);
  const descripcion = cleanText(body.descripcion || '', 500);
  const indoor = Boolean(body.indoor);
  if (nombre.length < 2 || !barrio) return { error: 'Nombre y barrio son obligatorios' };
  return { nombre, barrio, direccion, tipo, superficie, descripcion, indoor };
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

async function courtAccess(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM canchas WHERE id = $1', [req.params.id]);
    const court = rows[0];
    if (!court) return res.status(404).json({ error: 'Cancha no encontrada' });
    if (req.user.role !== 'superadmin' && court.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'No tenés acceso a esta cancha' });
    }
    req.court = court;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function findSlotPrice(canchaId, fecha, hora) {
  const parsed = parseSlot(hora);
  const { rows } = await pool.query(
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

// La API pública sólo expone disponibilidad, nunca datos personales.
app.get('/api/canchas', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.nombre, c.barrio, c.direccion, c.tipo, c.superficie,
              c.descripcion, c.indoor, COALESCE(MIN(h.precio_ars), 0) AS precio_desde
         FROM canchas c
         LEFT JOIN horarios_cancha h ON h.cancha_id = c.id AND h.activo = true
        WHERE c.activa = true
        GROUP BY c.id
        ORDER BY c.nombre`,
    );
    res.json(rows);
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
                AND r.fecha = $2 AND r.hora = to_char(h.hora_inicio, 'HH24:MI') || '-' || to_char(h.hora_fin, 'HH24:MI')) AS reservado
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
    const { rows } = await pool.query('SELECT fecha::text, hora, cancha_id FROM reservas ORDER BY fecha, hora');
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
  try {
    const blocked = await pool.query('SELECT 1 FROM bloqueos WHERE fecha = $1 AND (cancha_id = $2 OR cancha_id IS NULL)', [reservation.fecha, reservation.canchaId]);
    if (blocked.rowCount) return res.status(409).json({ error: 'El día está bloqueado' });
    const price = await findSlotPrice(reservation.canchaId, reservation.fecha, reservation.hora);
    if (price === null) return res.status(409).json({ error: 'Ese horario no está disponible' });
    const { rows } = await pool.query(
      `INSERT INTO reservas (nombre, telefono, fecha, hora, user_id, cancha_id, precio_ars)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, fecha::text, hora, cancha_id, precio_ars`,
      [reservation.nombre, reservation.telefono, reservation.fecha, reservation.hora, req.user.id, reservation.canchaId, price],
    );
    res.status(201).json({ ...rows[0], message: 'Reserva guardada' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ese horario ya está reservado' });
    next(error);
  }
});

app.get('/api/mis-reservas', requireAuth(), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.nombre, r.telefono, r.fecha::text, r.hora, r.precio_ars,
              r.estado, r.created_at, c.id AS cancha_id, c.nombre AS cancha,
              c.barrio, c.tipo, c.superficie
         FROM reservas r LEFT JOIN canchas c ON c.id = r.cancha_id
        WHERE r.user_id = $1 ORDER BY r.fecha, r.hora`,
      [req.user.id],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/session', requireAnyAdmin, (req, res) => {
  res.json({ authenticated: true, user: req.user });
});

app.get('/api/admin/canchas', requireAnyAdmin, async (req, res, next) => {
  try {
    const query = req.user.role === 'superadmin'
      ? 'SELECT * FROM canchas ORDER BY nombre'
      : 'SELECT * FROM canchas WHERE owner_user_id = $1 ORDER BY nombre';
    const result = await pool.query(query, req.user.role === 'superadmin' ? [] : [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/canchas', requireAnyAdmin, async (req, res, next) => {
  const court = validateCourt(req.body || {});
  if (court.error) return res.status(400).json(court);
  try {
    const { rows } = await pool.query(
      `INSERT INTO canchas (owner_user_id, nombre, barrio, direccion, tipo, superficie, descripcion, indoor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, court.nombre, court.barrio, court.direccion, court.tipo, court.superficie, court.descripcion, court.indoor],
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/canchas/:id', requireAnyAdmin, courtAccess, async (req, res, next) => {
  const court = validateCourt({ ...req.court, ...req.body });
  if (court.error) return res.status(400).json(court);
  try {
    const { rows } = await pool.query(
      `UPDATE canchas SET nombre=$1,barrio=$2,direccion=$3,tipo=$4,superficie=$5,
              descripcion=$6,indoor=$7,activa=COALESCE($8, activa),updated_at=NOW()
        WHERE id=$9 RETURNING *`,
      [court.nombre, court.barrio, court.direccion, court.tipo, court.superficie, court.descripcion, court.indoor, req.body.activa, req.params.id],
    );
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/canchas/:id', requireAnyAdmin, courtAccess, async (req, res, next) => {
  try {
    await pool.query('UPDATE canchas SET activa = false, updated_at = NOW() WHERE id = $1', [req.params.id]);
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
      filter = 'WHERE c.owner_user_id = $1';
    }
    const { rows } = await pool.query(
      `SELECT r.id, r.nombre, r.telefono, r.fecha::text, r.hora, r.precio_ars,
              r.estado, r.created_at, c.nombre AS cancha
         FROM reservas r LEFT JOIN canchas c ON c.id = r.cancha_id ${filter}
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
    const params = [req.params.id];
    const filter = req.user.role === 'superadmin' ? '' : ' AND c.owner_user_id = $2';
    if (req.user.role !== 'superadmin') params.push(req.user.id);
    const result = await pool.query(
      `DELETE FROM reservas r USING canchas c WHERE r.id = $1 AND r.cancha_id = c.id${filter}`,
      params,
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json({ message: 'Reserva eliminada con éxito' });
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

if (require.main === module) {
  start().catch((error) => {
    console.error('No se pudo iniciar la aplicación:', error);
    process.exit(1);
  });
}

module.exports = { app, prepare, start, validateReservation };
