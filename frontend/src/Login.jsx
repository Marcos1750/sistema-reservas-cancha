import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from './api';

const horarios = [
  '08:00-09:00', '09:00-10:00', '10:00-11:00', '11:00-12:00',
  '12:00-13:00', '13:00-14:00', '14:00-15:00', '15:00-16:00',
  '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00',
  '20:00-21:00', '21:00-22:00', '22:00-23:00',
];

function todayLocal() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function readError(response, fallback) {
  try {
    const data = await response.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export default function Reservas() {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [reservasOcupadas, setReservasOcupadas] = useState([]);
  const [bloqueos, setBloqueos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([apiFetch('/api/reservas'), apiFetch('/api/bloqueos')])
      .then(async ([reservasResponse, bloqueosResponse]) => {
        if (!reservasResponse.ok) throw new Error(await readError(reservasResponse, 'No se pudo cargar la disponibilidad'));
        if (!bloqueosResponse.ok) throw new Error(await readError(bloqueosResponse, 'No se pudo cargar los días bloqueados'));
        setReservasOcupadas(await reservasResponse.json());
        setBloqueos((await bloqueosResponse.json()).map((item) => item.fecha));
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setCargando(false));
  }, []);

  const fechaBloqueada = bloqueos.includes(fecha);
  const horariosDisponibles = useMemo(
    () => new Set(reservasOcupadas.filter((reserva) => reserva.fecha === fecha).map((reserva) => reserva.hora)),
    [fecha, reservasOcupadas],
  );

  const reservar = async () => {
    setError('');
    if (!nombre.trim() || !telefono || !fecha || !hora) return setError('Completá todos los campos');
    if (!/^[0-9]{7,15}$/.test(telefono)) return setError('El teléfono debe tener entre 7 y 15 números');
    if (fechaBloqueada) return setError('El día seleccionado está bloqueado');
    if (horariosDisponibles.has(hora)) return setError('Ese horario ya está reservado');
    setGuardando(true);
    try {
      const response = await apiFetch('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, telefono, fecha, hora }),
      });
      if (!response.ok) throw new Error(await readError(response, 'No se pudo guardar la reserva'));
      const saved = await response.json();
      setReservasOcupadas((current) => [...current, { fecha: saved.fecha || fecha, hora: saved.hora || hora }]);
      setNombre(''); setTelefono(''); setFecha(''); setHora('');
      window.alert('¡Reserva confirmada!');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 rounded-3xl p-8 shadow-[0_0_50px_-12px_rgba(34,197,94,0.15)]">
        <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Reservar Cancha</h1>
        <p className="text-neutral-400 mb-6">Elegí una fecha y un horario disponible.</p>
        {error && <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        {cargando && <p className="mb-4 text-sm text-neutral-400">Cargando disponibilidad...</p>}
        <input className="w-full p-4 mb-4 bg-neutral-950 border border-neutral-800 rounded-2xl outline-none focus:border-green-500 transition-all" placeholder="Tu nombre" value={nombre} onChange={(event) => setNombre(event.target.value)} />
        <input className="w-full p-4 mb-4 bg-neutral-950 border border-neutral-800 rounded-2xl outline-none focus:border-green-500 transition-all" placeholder="Teléfono" type="tel" inputMode="numeric" value={telefono} onChange={(event) => setTelefono(event.target.value.replace(/[^0-9]/g, ''))} />
        <input className="w-full p-4 mb-4 bg-neutral-950 border border-neutral-800 rounded-2xl outline-none focus:border-green-500 transition-all" type="date" min={todayLocal()} value={fecha} onChange={(event) => { setFecha(event.target.value); setHora(''); }} />
        {fechaBloqueada && <p className="mb-4 text-sm text-amber-300">Ese día no recibe reservas.</p>}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {horarios.map((horario) => {
            const ocupado = horariosDisponibles.has(horario);
            const buttonClass = 'py-2 rounded-xl text-[10px] font-semibold border transition-all ' + (hora === horario ? 'bg-green-500 border-green-500 text-black' : ocupado || fechaBloqueada ? 'bg-neutral-900 border-neutral-800 text-neutral-700 cursor-not-allowed opacity-50' : 'bg-neutral-950 border-neutral-800 hover:border-neutral-600');
            return <button key={horario} type="button" disabled={ocupado || fechaBloqueada || cargando} onClick={() => setHora(horario)} className={buttonClass}>{horario}</button>;
          })}
        </div>
        <button type="button" disabled={guardando || cargando} onClick={reservar} className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl font-bold text-white hover:scale-[1.02] active:scale-[0.98] transition-all disabled:cursor-wait disabled:opacity-60">{guardando ? 'Guardando...' : 'Confirmar Reserva'}</button>
      </div>
    </div>
  );
}
