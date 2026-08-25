import { betterAuth } from 'better-auth';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { pool } from './db.js';

const ROLES = ['cliente', 'admin_cancha', 'superadmin'];
const baseURL = process.env.BETTER_AUTH_URL || 'http://localhost:3001';
// AUTH_SECRET existed in the original Vercel setup. Accept it as a temporary
// backwards-compatible name so deployments do not need to duplicate a secret.
const authSecret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
const configuredOrigins = String(process.env.BETTER_AUTH_TRUSTED_ORIGINS || '')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

if (!authSecret) {
  throw new Error('BETTER_AUTH_SECRET o AUTH_SECRET es obligatorio para iniciar la aplicación');
}
if (process.env.NODE_ENV === 'production' && (!process.env.BETTER_AUTH_URL || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)) {
  throw new Error('BETTER_AUTH_URL, GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET son obligatorios en producción');
}

const auth = betterAuth({
  baseURL,
  basePath: '/api/auth',
  secret: authSecret,
  database: pool,
  trustedOrigins: [...new Set([baseURL, 'http://localhost:5173', 'http://localhost:3001', ...configuredOrigins])],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      prompt: 'select_account',
    },
  },
  user: {
    additionalFields: {
      role: {
        type: ROLES,
        required: false,
        defaultValue: 'cliente',
        input: false,
      },
    },
  },
  advanced: {
    defaultCookieAttributes: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      httpOnly: true,
    },
  },
});

// Esquema explícito y seguro para arranques concurrentes. Better Auth usa estos
// nombres/campos para PostgreSQL; no se generan migraciones desde la Function.
async function migrateAuth(client = pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      "emailVerified" BOOLEAN NOT NULL DEFAULT false,
      image TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      role TEXT NOT NULL DEFAULT 'cliente' CHECK (role IN ('cliente', 'admin_cancha', 'superadmin'))
    );

    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      token TEXT NOT NULL UNIQUE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      "accountId" TEXT NOT NULL,
      "providerId" TEXT NOT NULL,
      "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      "accessToken" TEXT,
      "refreshToken" TEXT,
      "idToken" TEXT,
      "accessTokenExpiresAt" TIMESTAMPTZ,
      "refreshTokenExpiresAt" TIMESTAMPTZ,
      scope TEXT,
      password TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role TEXT;
    UPDATE "user" SET role = 'cliente' WHERE role IS NULL OR role = '';
    ALTER TABLE "user" ALTER COLUMN role SET DEFAULT 'cliente';
    ALTER TABLE "user" ALTER COLUMN role SET NOT NULL;
    DO $$ BEGIN
      ALTER TABLE "user" ADD CONSTRAINT user_role_check CHECK (role IN ('cliente', 'admin_cancha', 'superadmin'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    CREATE INDEX IF NOT EXISTS session_user_id_idx ON session ("userId");
    CREATE INDEX IF NOT EXISTS account_user_id_idx ON account ("userId");
    CREATE UNIQUE INDEX IF NOT EXISTS account_provider_account_uidx ON account ("providerId", "accountId");
    CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier);
  `);
}

async function getSessionUser(req) {
  const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  return result?.user || null;
}

async function syncConfiguredRole(user) {
  const email = String(user.email || '').trim().toLowerCase();
  const superadminEmail = String(process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  let role = user.role || 'cliente';

  if (superadminEmail && email === superadminEmail && role !== 'superadmin') {
    role = 'superadmin';
    await pool.query('UPDATE "user" SET role = $1 WHERE id = $2', [role, user.id]);
  } else if (role === 'cliente') {
    const invite = await pool.query(
      'SELECT id FROM invitaciones_admin WHERE lower(email) = $1 AND accepted_at IS NULL',
      [email],
    );
    if (invite.rowCount) {
      role = 'admin_cancha';
      await pool.query('UPDATE "user" SET role = $1 WHERE id = $2', [role, user.id]);
      await pool.query('UPDATE invitaciones_admin SET accepted_at = NOW() WHERE id = $1', [invite.rows[0].id]);
    }
  }
  return { ...user, role };
}

function requireAuth(roles = []) {
  return async (req, res, next) => {
    try {
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: 'Autenticación requerida' });
      const syncedUser = await syncConfiguredRole(user);
      if (roles.length && !roles.includes(syncedUser.role)) {
        return res.status(403).json({ error: 'No tenés permisos para realizar esta acción' });
      }
      req.user = syncedUser;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function requireAnyAdmin(req, res, next) {
  return requireAuth(['admin_cancha', 'superadmin'])(req, res, next);
}

export {
  ROLES,
  auth,
  migrateAuth,
  requireAnyAdmin,
  requireAuth,
  getSessionUser,
  syncConfiguredRole,
  toNodeHandler,
};
