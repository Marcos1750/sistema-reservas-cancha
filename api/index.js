import { app, prepare } from '../backend/server.js';

let initialization;

export default async function vercelHandler(req, res) {
  // Vercel can provide the function with /api/foo or only /foo.
  if (req.url && !req.url.startsWith('/api')) {
    const [pathname, query] = req.url.split('?');
    req.url = '/api' + (pathname.startsWith('/') ? pathname : '/' + pathname) + (query ? '?' + query : '');
  }

  initialization ||= prepare();
  await initialization;
  return app(req, res);
};
