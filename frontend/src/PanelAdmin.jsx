import { useEffect, useState } from 'react';
import { apiFetch } from './api';

async function readError(response, fallback) {
  try {
    const data = await response.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function AdminLogin({ onAuthenticated }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error(await readError(response, 'No se pudo iniciar sesión'));
      onAuthenticated();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 text-white">
      <div className="w-full max-w-sm bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 rounded-3xl p-8 shadow-2xl">
        <div className="text-center mb-8"><div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4"><span className="text-2xl" aria-hidden="true">🔐</span></div><h2 className="text-2xl font-bold">Panel de gestión</h2><p className="text-neutral-500 text-sm mt-1">Acceso restringido para administradores</p></div>
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        <input className="w-full p-4 mb-6 bg-neutral-950 border border-neutral-800 rounded-2xl outline-none focus:border-green-500 text-white" type="password" placeholder="Clave de seguridad" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && login()} autoComplete="current-password" />
        <button type="button" disabled={loading} className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl font-bold text-black disabled:opacity-60" onClick={login}>{loading ? 'Ingresando...' : 'Ingresar al panel'}</button>
      </div>
    </div>
  );
}

export default function PanelAdmin() {
  const [authenticated, setAuthenticated] = useState(null);
  const [reservas, setReservas] = useState([]);
  const [filtroFecha, setFiltroFecha] = useState('');
  const [error, setError] = useState('');

  const loadReservations = async () => {
    const response = await apiFetch('/api/admin/reservas');
    if (response.status === 401) return setAuthenticated(false);
    if (!response.ok) throw new Error(await readError(response, 'No se pudieron cargar las reservas'));
    setReservas(await response.json());
  };

  useEffect(() => {
    apiFetch('/api/admin/session').then(async (response) => {
      if (!response.ok) return setAuthenticated(false);
      setAuthenticated(true);
      try { await loadReservations(); } catch (requestError) { setError(requestError.message); }
    }).catch(() => setAuthenticated(false));
  }, []);

  const eliminarReserva = async (id) => {
    if (!window.confirm('¿Seguro que querés borrar esta reserva?')) return;
    const response = await apiFetch('/api/admin/reservas/' + id, { method: 'DELETE' });
    if (!response.ok) return setError(await readError(response, 'No se pudo eliminar la reserva'));
    setReservas((current) => current.filter((reserva) => reserva.id !== id));
  };

  const logout = async () => {
    await apiFetch('/api/admin/logout', { method: 'POST' });
    setAuthenticated(false);
  };

  if (authenticated === null) return <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">Cargando...</div>;
  if (!authenticated) return <AdminLogin onAuthenticated={() => { setAuthenticated(true); loadReservations().catch((requestError) => setError(requestError.message)); }} />;

  const reservasFiltradas = filtroFecha ? reservas.filter((reserva) => reserva.fecha === filtroFecha) : reservas;
  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 md:p-8"><div className="max-w-4xl mx-auto">
      <header className="flex justify-between items-center mb-8"><h1 className="text-3xl font-extrabold tracking-tight">Panel admin</h1><button type="button" onClick={logout} className="text-sm text-neutral-500 hover:text-white">Salir</button></header>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl mb-8 flex flex-col md:flex-row gap-4 items-center"><div className="flex-1 w-full"><label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 block" htmlFor="filter-date">Filtrar por fecha</label><input id="filter-date" type="date" value={filtroFecha} className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-2xl outline-none focus:border-green-500" onChange={(event) => setFiltroFecha(event.target.value)} /></div><button type="button" onClick={() => setFiltroFecha('')} className="mt-6 px-6 py-3 border border-neutral-800 rounded-2xl hover:bg-neutral-800 text-sm">Limpiar</button></div>
      <div className="grid gap-3">{reservasFiltradas.map((reserva) => <div key={reserva.id} className="bg-neutral-900/50 border border-neutral-800 p-5 rounded-2xl flex justify-between items-center"><div><p className="font-bold">{reserva.fecha} | {reserva.hora}</p><p className="text-sm text-neutral-400">{reserva.nombre} • <span className="text-green-500">{reserva.telefono}</span></p></div><button type="button" onClick={() => eliminarReserva(reserva.id)} className="bg-red-500/10 text-red-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-500 hover:text-white">Eliminar</button></div>)}{reservasFiltradas.length === 0 && <p className="text-neutral-500 text-center py-8">No hay reservas para mostrar.</p>}</div>
    </div></div>
  );
}
