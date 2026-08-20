import pg from 'pg';

const { Pool } = pg;

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

async function migrate(client = pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS canchas (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
      nombre TEXT NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 2 AND 120),
      barrio TEXT NOT NULL DEFAULT '',
      direccion TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      tipo TEXT NOT NULL DEFAULT 'Fútbol 5',
      superficie TEXT NOT NULL DEFAULT 'Césped sintético',
      descripcion TEXT NOT NULL DEFAULT '',
      indoor BOOLEAN NOT NULL DEFAULT false,
      activa BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS horarios_cancha (
      id BIGSERIAL PRIMARY KEY,
      cancha_id BIGINT NOT NULL REFERENCES canchas(id) ON DELETE CASCADE,
      dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
      hora_inicio TIME NOT NULL,
      hora_fin TIME NOT NULL,
      precio_ars INTEGER NOT NULL CHECK (precio_ars >= 0),
      activo BOOLEAN NOT NULL DEFAULT true,
      UNIQUE (cancha_id, dia_semana, hora_inicio, hora_fin)
    );

    CREATE TABLE IF NOT EXISTS excepciones_cancha (
      id BIGSERIAL PRIMARY KEY,
      cancha_id BIGINT NOT NULL REFERENCES canchas(id) ON DELETE CASCADE,
      fecha DATE NOT NULL,
      hora_inicio TIME NOT NULL,
      hora_fin TIME NOT NULL,
      precio_ars INTEGER CHECK (precio_ars >= 0),
      disponible BOOLEAN NOT NULL DEFAULT true,
      UNIQUE (cancha_id, fecha, hora_inicio, hora_fin)
    );

    CREATE TABLE IF NOT EXISTS reservas (
      id BIGSERIAL PRIMARY KEY,
      nombre TEXT NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 2 AND 120),
      telefono TEXT NOT NULL CHECK (telefono ~ '^[0-9]{7,15}$'),
      fecha DATE NOT NULL,
      hora TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'confirmada',
      cancelled_at TIMESTAMPTZ,
      cancelled_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      cancel_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (fecha, hora)
    );

    CREATE TABLE IF NOT EXISTS bloqueos (
      id BIGSERIAL PRIMARY KEY,
      fecha DATE NOT NULL UNIQUE,
      cancha_id BIGINT REFERENCES canchas(id) ON DELETE CASCADE,
      motivo TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS invitaciones_admin (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accepted_at TIMESTAMPTZ
    );

    ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_fecha_hora_key;
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancha_id BIGINT REFERENCES canchas(id) ON DELETE SET NULL;
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS precio_ars INTEGER CHECK (precio_ars IS NULL OR precio_ars >= 0);
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'confirmada';
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancelled_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
    ALTER TABLE canchas ADD COLUMN IF NOT EXISTS whatsapp TEXT NOT NULL DEFAULT '';
    ALTER TABLE bloqueos ADD COLUMN IF NOT EXISTS cancha_id BIGINT REFERENCES canchas(id) ON DELETE CASCADE;
    ALTER TABLE bloqueos DROP CONSTRAINT IF EXISTS bloqueos_fecha_key;

    DROP INDEX IF EXISTS reservas_cancha_fecha_hora_uidx;
    DROP INDEX IF EXISTS reservas_legacy_fecha_hora_uidx;
    CREATE UNIQUE INDEX reservas_cancha_fecha_hora_uidx
      ON reservas (cancha_id, fecha, hora) WHERE cancha_id IS NOT NULL AND estado = 'confirmada';
    CREATE UNIQUE INDEX reservas_legacy_fecha_hora_uidx
      ON reservas (fecha, hora) WHERE cancha_id IS NULL AND estado = 'confirmada';
    CREATE INDEX IF NOT EXISTS reservas_fecha_idx ON reservas (fecha);
    CREATE INDEX IF NOT EXISTS reservas_user_idx ON reservas (user_id);
    CREATE INDEX IF NOT EXISTS horarios_cancha_dia_idx ON horarios_cancha (cancha_id, dia_semana);
    CREATE INDEX IF NOT EXISTS canchas_owner_idx ON canchas (owner_user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS bloqueos_cancha_fecha_uidx
      ON bloqueos (cancha_id, fecha) WHERE cancha_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS bloqueos_global_fecha_uidx
      ON bloqueos (fecha) WHERE cancha_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS invitaciones_admin_email_lower_uidx
      ON invitaciones_admin (lower(email));
  `);
}

async function closeDatabase() {
  await pool.end();
}

export { pool, migrate, closeDatabase };
