require('dotenv').config();

const express = require('express');
const path = require('node:path');
const { migrate, pool } = require('./db');
const {
  clearSessionCookie,
  loginAdmin,
  requireAdmin,
  setSessionCookie,
  signSession,
} = require('./auth');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const FRONTEND_DIST = path.resolve(__dirname, '../frontend/dist');
const VALID_HOURS = new Set([
  '08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00',
  '12:00-13:00', '13:00-14:00', '14:00-15:00', '15:00-16:00',
  '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00',
  '20:00-21:00', '21:00-22:00', '22:00-23:00',
]);

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validateReservation(body) {
  const nombre = cleanText(body.nombre, 120);
  const telefono = cleanText(body.telefono, 15);
  const fecha = cleanText(body.fecha, 10);
  const hora = cleanText(body.hora, 11);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(Date.parse(`${fecha}T00:00:00Z`));
  if (nombre.length < 2 || !/^\d{7,15}$/.test(telefono) || !validDate || !VALID_HOURS.has(hora)) {
    return { error: 'Nombre, teléfono, fecha u horario inválido' };
  }
  return { nombre, telefono, fecha, hora };
}

function validateBlock(body) {
  const fecha = cleanText(body.fecha, 10);
  const motivo = cleanText(body.motivo || '', 250);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) {
    return { error: 'Fecha inválida' };
  }
  return { fecha, motivo };
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

// La API pública sólo expone disponibilidad, nunca datos personales.
app.get('/api/reservas', async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT fecha::text, hora FROM reservas ORDER BY fecha, hora');
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

app.post('/api/reservas', async (req, res, next) => {
  const reservation = validateReservation(req.body || {});
  if (reservation.error) return res.status(400).json(reservation);

  try {
    const blocked = await pool.query('SELECT 1 FROM bloqueos WHERE fecha = $1', [reservation.fecha]);
    if (blocked.rowCount) return res.status(409).json({ error: 'El día está bloqueado' });

    const { rows } = await pool.query(
      `INSERT INTO reservas (nombre, telefono, fecha, hora)
       VALUES ($1, $2, $3, $4)
       RETURNING id, fecha::text, hora`,
      [reservation.nombre, reservation.telefono, reservation.fecha, reservation.hora],
    );
    res.status(201).json({ ...rows[0], message: 'Reserva guardada' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ese horario ya está reservado' });
    next(error);
  }
});

app.post('/api/admin/login', async (req, res, next) => {
  try {
    if (!(await loginAdmin(req.body?.password))) {
      return res.status(401).json({ error: 'Clave incorrecta' });
    }
    setSessionCookie(res, signSession());
    res.json({ authenticated: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

app.get('/api/admin/session', requireAdmin, (_req, res) => {
  res.json({ authenticated: true });
});

app.get('/api/admin/reservas', requireAdmin, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nombre, telefono, fecha::text, hora, created_at FROM reservas ORDER BY fecha, hora',
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/reservas/:id', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM reservas WHERE id = $1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json({ message: 'Reserva eliminada con éxito' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/bloqueos', requireAdmin, async (req, res, next) => {
  const block = validateBlock(req.body || {});
  if (block.error) return res.status(400).json(block);
  try {
    await pool.query(
      `INSERT INTO bloqueos (fecha, motivo) VALUES ($1, $2)
       ON CONFLICT (fecha) DO UPDATE SET motivo = EXCLUDED.motivo`,
      [block.fecha, block.motivo],
    );
    res.status(201).json({ message: 'Día bloqueado' });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(FRONTEND_DIST));

// Express 5 requiere el patrón {*splat} para el fallback SPA.
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

async function start() {
  await migrate();
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

module.exports = { app, start };
