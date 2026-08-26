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
    CREATE TABLE IF NOT EXISTS complejos (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
      nombre TEXT NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 2 AND 120),
      ciudad TEXT NOT NULL DEFAULT '',
      provincia TEXT NOT NULL DEFAULT '',
      direccion TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      descripcion TEXT NOT NULL DEFAULT '',
      foto_url TEXT NOT NULL DEFAULT '',
      activo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS canchas (
      id BIGSERIAL PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
      complejo_id BIGINT REFERENCES complejos(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 2 AND 120),
      barrio TEXT NOT NULL DEFAULT '',
      ciudad TEXT NOT NULL DEFAULT '',
      provincia TEXT NOT NULL DEFAULT '',
      direccion TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      tipo TEXT NOT NULL DEFAULT 'Fútbol 5',
      deporte TEXT NOT NULL DEFAULT 'Fútbol 5',
      superficie TEXT NOT NULL DEFAULT 'Césped sintético',
      descripcion TEXT NOT NULL DEFAULT '',
      indoor BOOLEAN NOT NULL DEFAULT false,
      requiere_sena BOOLEAN NOT NULL DEFAULT true,
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

    CREATE TABLE IF NOT EXISTS canchas_guardadas (
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      cancha_id BIGINT NOT NULL REFERENCES canchas(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, cancha_id)
    );

    CREATE TABLE IF NOT EXISTS complejos_guardados (
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      complejo_id BIGINT NOT NULL REFERENCES complejos(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, complejo_id)
    );

    CREATE TABLE IF NOT EXISTS perfiles_usuario (
      user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      nombre_reserva TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reservas_recurrentes (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      cancha_id BIGINT REFERENCES canchas(id) ON DELETE SET NULL,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      hora TEXT NOT NULL,
      dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
      fecha_inicio DATE NOT NULL,
      semanas SMALLINT NOT NULL CHECK (semanas BETWEEN 2 AND 52),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pagos_reserva (
      id BIGSERIAL PRIMARY KEY,
      reserva_id BIGINT REFERENCES reservas(id) ON DELETE CASCADE,
      recurrencia_id BIGINT REFERENCES reservas_recurrentes(id) ON DELETE CASCADE,
      complejo_id BIGINT REFERENCES complejos(id) ON DELETE SET NULL,
      monto_ars INTEGER NOT NULL CHECK (monto_ars > 0),
      porcentaje_sena SMALLINT NOT NULL CHECK (porcentaje_sena BETWEEN 1 AND 100),
      estado TEXT NOT NULL DEFAULT 'pendiente',
      preferencia_id TEXT UNIQUE,
      pago_mp_id TEXT UNIQUE,
      checkout_url TEXT,
      expira_at TIMESTAMPTZ NOT NULL,
      payload_mp JSONB,
      consultado_mp_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (reserva_id IS NOT NULL OR recurrencia_id IS NOT NULL)
    );

    ALTER TABLE reservas DROP CONSTRAINT IF EXISTS reservas_fecha_hora_key;
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancha_id BIGINT REFERENCES canchas(id) ON DELETE SET NULL;
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS precio_ars INTEGER CHECK (precio_ars IS NULL OR precio_ars >= 0);
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'confirmada';
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancelled_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS recurrencia_id BIGINT REFERENCES reservas_recurrentes(id) ON DELETE SET NULL;
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancha_nombre TEXT NOT NULL DEFAULT '';
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancha_ciudad TEXT NOT NULL DEFAULT '';
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancha_provincia TEXT NOT NULL DEFAULT '';
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancha_deporte TEXT NOT NULL DEFAULT '';
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cancha_whatsapp TEXT NOT NULL DEFAULT '';
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS complejo_nombre TEXT NOT NULL DEFAULT '';
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS complejo_ciudad TEXT NOT NULL DEFAULT '';
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS complejo_provincia TEXT NOT NULL DEFAULT '';
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS complejo_whatsapp TEXT NOT NULL DEFAULT '';
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS complejo_owner_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;
    ALTER TABLE reservas ADD COLUMN IF NOT EXISTS expira_pago_at TIMESTAMPTZ;
    ALTER TABLE pagos_reserva ADD COLUMN IF NOT EXISTS consultado_mp_at TIMESTAMPTZ;
    ALTER TABLE pagos_reserva ALTER COLUMN complejo_id DROP NOT NULL;
    ALTER TABLE pagos_reserva DROP CONSTRAINT IF EXISTS pagos_reserva_complejo_id_fkey;
    ALTER TABLE pagos_reserva
      ADD CONSTRAINT pagos_reserva_complejo_id_fkey
      FOREIGN KEY (complejo_id) REFERENCES complejos(id) ON DELETE SET NULL;
    ALTER TABLE complejos ADD COLUMN IF NOT EXISTS sena_porcentaje SMALLINT NOT NULL DEFAULT 10 CHECK (sena_porcentaje BETWEEN 1 AND 100);
    ALTER TABLE complejos ADD COLUMN IF NOT EXISTS mp_user_id TEXT;
    ALTER TABLE complejos ADD COLUMN IF NOT EXISTS mp_access_token TEXT;
    ALTER TABLE complejos ADD COLUMN IF NOT EXISTS mp_refresh_token TEXT;
    ALTER TABLE complejos ADD COLUMN IF NOT EXISTS mp_token_expires_at TIMESTAMPTZ;
    ALTER TABLE canchas ADD COLUMN IF NOT EXISTS complejo_id BIGINT REFERENCES complejos(id) ON DELETE CASCADE;
    ALTER TABLE canchas ADD COLUMN IF NOT EXISTS whatsapp TEXT NOT NULL DEFAULT '';
    ALTER TABLE canchas ADD COLUMN IF NOT EXISTS ciudad TEXT NOT NULL DEFAULT '';
    ALTER TABLE canchas ADD COLUMN IF NOT EXISTS provincia TEXT NOT NULL DEFAULT '';
    ALTER TABLE canchas ADD COLUMN IF NOT EXISTS deporte TEXT NOT NULL DEFAULT 'Fútbol 5';
    ALTER TABLE canchas ADD COLUMN IF NOT EXISTS requiere_sena BOOLEAN NOT NULL DEFAULT true;
    UPDATE canchas
       SET ciudad = barrio
     WHERE trim(ciudad) = '' AND trim(barrio) <> '';
    UPDATE canchas
       SET provincia = 'Santa Fe'
     WHERE trim(provincia) = '';
    UPDATE canchas
       SET deporte = CASE
         WHEN tipo IN ('Fútbol 5', 'Pádel', 'Tenis') THEN tipo
         ELSE 'Fútbol 5'
       END
     WHERE trim(deporte) = '' OR deporte NOT IN ('Fútbol 5', 'Pádel', 'Tenis');
    DO $$
    DECLARE
      cancha_actual RECORD;
      nuevo_complejo_id BIGINT;
    BEGIN
      FOR cancha_actual IN SELECT * FROM canchas WHERE complejo_id IS NULL LOOP
        INSERT INTO complejos (owner_user_id, nombre, ciudad, provincia, direccion, whatsapp, descripcion)
        VALUES (
          cancha_actual.owner_user_id,
          cancha_actual.nombre,
          cancha_actual.ciudad,
          cancha_actual.provincia,
          cancha_actual.direccion,
          cancha_actual.whatsapp,
          cancha_actual.descripcion
        )
        RETURNING id INTO nuevo_complejo_id;

        UPDATE canchas
           SET complejo_id = nuevo_complejo_id,
               nombre = 'Cancha 1'
         WHERE id = cancha_actual.id;
      END LOOP;
    END $$;
    ALTER TABLE canchas ALTER COLUMN complejo_id SET NOT NULL;
    INSERT INTO complejos_guardados (user_id, complejo_id, created_at)
    SELECT DISTINCT cg.user_id, c.complejo_id, cg.created_at
      FROM canchas_guardadas cg
      JOIN canchas c ON c.id = cg.cancha_id
    ON CONFLICT (user_id, complejo_id) DO NOTHING;
    UPDATE reservas r
       SET cancha_nombre = c.nombre,
           cancha_ciudad = c.ciudad,
           cancha_provincia = c.provincia,
           cancha_deporte = c.deporte,
           cancha_whatsapp = c.whatsapp
     FROM canchas c
     WHERE r.cancha_id = c.id AND trim(r.cancha_nombre) = '';
    UPDATE reservas r
       SET complejo_nombre = co.nombre,
           complejo_ciudad = co.ciudad,
           complejo_provincia = co.provincia,
           complejo_whatsapp = co.whatsapp,
           complejo_owner_user_id = co.owner_user_id
      FROM canchas c
      JOIN complejos co ON co.id = c.complejo_id
     WHERE r.cancha_id = c.id
       AND (trim(r.complejo_nombre) = '' OR r.complejo_owner_user_id IS NULL);
    UPDATE reservas r
       SET estado = 'confirmada',
           expira_pago_at = NULL,
           cancel_reason = NULL
      FROM pagos_reserva p
     WHERE p.estado = 'aprobado'
       AND (p.reserva_id = r.id OR (p.recurrencia_id IS NOT NULL AND p.recurrencia_id = r.recurrencia_id))
       AND r.estado IN ('pendiente_pago', 'expirada');
    ALTER TABLE bloqueos ADD COLUMN IF NOT EXISTS cancha_id BIGINT REFERENCES canchas(id) ON DELETE CASCADE;
    ALTER TABLE bloqueos DROP CONSTRAINT IF EXISTS bloqueos_fecha_key;

    DROP INDEX IF EXISTS reservas_cancha_fecha_hora_uidx;
    DROP INDEX IF EXISTS reservas_legacy_fecha_hora_uidx;
    CREATE UNIQUE INDEX reservas_cancha_fecha_hora_uidx
      ON reservas (cancha_id, fecha, hora) WHERE cancha_id IS NOT NULL AND estado IN ('confirmada', 'pendiente_pago');
    CREATE UNIQUE INDEX reservas_legacy_fecha_hora_uidx
      ON reservas (fecha, hora) WHERE cancha_id IS NULL AND estado = 'confirmada';
    CREATE INDEX IF NOT EXISTS reservas_fecha_idx ON reservas (fecha);
    CREATE INDEX IF NOT EXISTS reservas_user_idx ON reservas (user_id);
    CREATE INDEX IF NOT EXISTS reservas_recurrencia_idx ON reservas (recurrencia_id);
    CREATE INDEX IF NOT EXISTS reservas_complejo_owner_idx ON reservas (complejo_owner_user_id);
    CREATE INDEX IF NOT EXISTS pagos_reserva_reserva_idx ON pagos_reserva (reserva_id);
    CREATE INDEX IF NOT EXISTS pagos_reserva_recurrencia_idx ON pagos_reserva (recurrencia_id);
    CREATE INDEX IF NOT EXISTS pagos_reserva_estado_idx ON pagos_reserva (estado, expira_at);
    CREATE INDEX IF NOT EXISTS canchas_guardadas_user_idx ON canchas_guardadas (user_id);
    CREATE INDEX IF NOT EXISTS complejos_guardados_user_idx ON complejos_guardados (user_id);
    CREATE INDEX IF NOT EXISTS horarios_cancha_dia_idx ON horarios_cancha (cancha_id, dia_semana);
    CREATE INDEX IF NOT EXISTS canchas_owner_idx ON canchas (owner_user_id);
    CREATE INDEX IF NOT EXISTS canchas_complejo_idx ON canchas (complejo_id);
    CREATE INDEX IF NOT EXISTS complejos_owner_idx ON complejos (owner_user_id);
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
