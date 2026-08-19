const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL es obligatorio para iniciar la aplicación');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reservas (
      id BIGSERIAL PRIMARY KEY,
      nombre TEXT NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 2 AND 120),
      telefono TEXT NOT NULL CHECK (telefono ~ '^[0-9]{7,15}$'),
      fecha DATE NOT NULL,
      hora TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (fecha, hora)
    );

    CREATE TABLE IF NOT EXISTS bloqueos (
      id BIGSERIAL PRIMARY KEY,
      fecha DATE NOT NULL UNIQUE,
      motivo TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS reservas_fecha_idx ON reservas (fecha);
  `);
}

async function closeDatabase() {
  await pool.end();
}

module.exports = { pool, migrate, closeDatabase };
