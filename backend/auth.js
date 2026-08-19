const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function getSecret() {
  if (!process.env.AUTH_SECRET) {
    throw new Error('AUTH_SECRET es obligatorio para iniciar la aplicación');
  }
  return process.env.AUTH_SECRET;
}

function readCookie(header, name) {
  if (!header) return null;
  const item = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function createCookie(value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', createCookie(token, SESSION_TTL_SECONDS));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', createCookie('', 0));
}

async function loginAdmin(password) {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash || !password) return false;
  return bcrypt.compare(password, hash);
}

function signSession() {
  return jwt.sign({ role: 'admin' }, getSecret(), { expiresIn: SESSION_TTL_SECONDS });
}

function requireAdmin(req, res, next) {
  try {
    const bearer = req.get('authorization');
    const token = bearer && bearer.startsWith('Bearer ')
      ? bearer.slice('Bearer '.length)
      : readCookie(req.get('cookie'), COOKIE_NAME);

    if (!token) return res.status(401).json({ error: 'Autenticación requerida' });
    const payload = jwt.verify(token, getSecret());
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
    return next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

module.exports = {
  clearSessionCookie,
  loginAdmin,
  requireAdmin,
  setSessionCookie,
  signSession,
};
