const { Pool } = require('pg');

// Neon en Vercel puede exponer la conexión con el prefijo STORAGE_.
const databaseUrl = process.env.DATABASE_URL
  || process.env.STORAGE_DATABASE_URL
  || process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL es obligatorio para iniciar la aplicación');
}

const pool = new Pool({
  connectionString: databaseUrl,
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
