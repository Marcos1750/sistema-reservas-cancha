import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAlert, useConfirm } from "./lib/confirmDialog";
import { CalendarPicker } from "./CalendarPicker";
import { TimePicker } from "./TimePicker";
import { ActionFeedback } from "./ActionFeedback";
import { Icon, PitchMark } from "./icons";
import { authClient } from "./authClient";
import { apiFetch, readApiResponse } from "./api";
import {
  getAdminBookingSections,
  getAdminOverviewMetrics,
  isBookingUpcoming,
} from "./lib/adminOverview";
import { getComplexTheme, getSportTheme } from "./sportTheme";
import { useSessionWithFallback } from "./useSessionWithFallback";
import {
  demoRequest,
  disableDemoAdmin,
  enableDemoAdmin,
  isDemoAdmin,
} from "./demoAdmin";

const sports = ["Fútbol 5", "Pádel", "Tenis"];
const CALENDAR_PAGE_SIZE = 15;
const provinces = [
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Ciudad Autónoma de Buenos Aires",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
];
const emptyComplex = {
  nombre: "",
  ciudad: "",
  provincia: "",
  direccion: "",
  whatsapp: "",
  descripcion: "",
  foto_url: "",
};
const emptyCourt = {
  nombre: "",
  deporte: "Fútbol 5",
  descripcion: "",
  indoor: false,
  requiere_sena: true,
};
const weekdays = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
const defaultSlots = [
  { dayOfWeek: 1, start: "18:00", end: "19:00", price: 30000, active: true },
];

function AdminSportStripes() {
  return null;
}

function GoogleAccess({ onLogin, onDemo, message }) {
  return (
    <div className="admin-login">
      <div className="admin-login__grid" />
      <div className="admin-login__card">
        <div className="admin-login__mark">
          <PitchMark />
        </div>
        <span className="section-kicker">NEW MATCH / OPERACIONES</span>
        <h1>Panel de gestión</h1>
        <p>
          {message ||
            "Ingresá con tu cuenta autorizada para administrar tus complejos."}
        </p>
        <Button className="primary-button" type="button" onClick={onLogin}>
          Continuar con Google <Icon name="arrow" size={17} />
        </Button>
        {onDemo && (
          <>
            <button className="secondary-button" type="button" onClick={onDemo}>
              Ver el panel en modo demo
            </button>
            <small className="demo-note">
              Datos de ejemplo, sin conexión con la API: nada se guarda.
            </small>
          </>
        )}
      </div>
    </div>
  );
}

function AdminTable({ bookings, onCancel, onHideHistory, mode = "upcoming", now = new Date(), emptyTitle, emptyDescription }) {
  if (!bookings.length)
    return (
      <div className="admin-empty">
        <PitchMark compact />
        <h3>{emptyTitle || (mode === "history" ? "No hay historial reciente" : "No hay próximos turnos")}</h3>
        <p>{emptyDescription || (mode === "history" ? "Los turnos finalizados de los últimos 30 días van a aparecer acá." : "Las próximas reservas van a aparecer acá.")}</p>
      </div>
    );
  const labels = {
    confirmada: "Confirmada",
    pendiente_pago: "Pendiente de pago",
    cancelada: "Cancelada",
    expirada: "Vencida",
    cumplido: "Cumplido",
  };
  return (
    <div className="admin-table">
      <div className="admin-table__head">
        <span>Hora</span>
        <span>Cliente</span>
        <span>Lugar</span>
        <span>Estado</span>
        <span />
      </div>
      {bookings.map((booking) => {
        const cancellable =
          mode === "upcoming" &&
          (booking.estado === "confirmada" || booking.estado === "pendiente_pago");
        const completed = mode === "history" && booking.estado === "confirmada" && !isBookingUpcoming(booking, now);
        const displayStatus = completed ? "cumplido" : booking.estado;
        const canHide = mode === "history" && onHideHistory && (
          booking.estado === "cancelada" ||
          booking.estado === "expirada" ||
          (booking.estado === "confirmada" && !isBookingUpcoming(booking, now))
        );
        return (
          <div className={`admin-table__row${completed ? " is-completed" : ""}`} key={booking.id}>
            <div className="admin-booking-time">
              <strong>{booking.hora}</strong>
              <small>
                {booking.fecha?.slice(8, 10)}/{booking.fecha?.slice(5, 7)}
              </small>
            </div>
            <div>
              <strong>{booking.nombre}</strong>
              <small>{booking.telefono}</small>
            </div>
            <div>
              <strong>{booking.complejo || "Complejo eliminado"}</strong>
              <small>
                {booking.cancha || "Cancha eliminada"} ·{" "}
                {booking.precio_ars
                  ? `$${Number(booking.precio_ars).toLocaleString("es-AR")}`
                  : "Sin precio"}
              </small>
            </div>
            <span className={`admin-status admin-status--${displayStatus}`}>
              <span />
              {labels[displayStatus] || booking.estado}
            </span>
            {canHide ? (
              <button
                className="admin-delete admin-history-remove"
                type="button"
                onClick={() => onHideHistory(booking.id)}
                aria-label={`Quitar del historial el turno de ${booking.nombre}`}
              >
                <Icon name="plus" size={17} />
              </button>
            ) : cancellable && (
              <button
                className="admin-delete"
                type="button"
                onClick={() => onCancel(booking.id)}
                aria-label={`Cancelar turno de ${booking.nombre}`}
              >
                <Icon name="plus" size={17} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SlotEditor({ court, request, readOnly = false }) {
  const confirm = useConfirm();
  const [slots, setSlots] = useState(defaultSlots);
  const [exceptions, setExceptions] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [exception, setException] = useState({
    fecha: "",
    start: "18:00",
    end: "19:00",
    price: "",
    available: false,
  });
  const [block, setBlock] = useState({ fecha: "", motivo: "" });
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [messageArea, setMessageArea] = useState("schedule");
  const [quickSchedule, setQuickSchedule] = useState({
    days: [1, 2, 3, 4, 5],
    start: "18:00",
    end: "23:00",
    duration: 60,
    price: "30000",
  });
  const load = useCallback(async () => {
    const [nextSlots, nextExceptions, nextBlocks] = await Promise.all([
      request(`/api/admin/canchas/${court.id}/horarios`),
      request(`/api/admin/canchas/${court.id}/excepciones`),
      request(`/api/admin/canchas/${court.id}/bloqueos`),
    ]);
    setSlots(nextSlots.length ? nextSlots : defaultSlots);
    setExceptions(nextExceptions);
    setBlocks(nextBlocks);
  }, [court.id, request]);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        load().catch((error) => {
          setMessageType("error");
          setMessageArea("schedule");
          setMessage(error.message);
        }),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  const showMessage = (text, type = "success", area = "schedule") => {
    setMessageType(type);
    setMessageArea(area);
    setMessage(text);
  };
  const updateSlot = (index, field, value) =>
    setSlots((current) =>
      current.map((slot, position) =>
        position === index ? { ...slot, [field]: value } : slot,
      ),
    );
  const toggleQuickDay = (day) =>
    setQuickSchedule((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((item) => item !== day)
        : [...current.days, day].sort(),
    }));
  const applyQuickSchedule = () => {
    const minutes = (value) => {
      const [hour, minute] = value.split(":").map(Number);
      return hour * 60 + minute;
    };
    const startMinutes = minutes(quickSchedule.start);
    const endMinutes = minutes(quickSchedule.end);
    const normalizedEndMinutes = endMinutes === 0 && startMinutes > 0 ? 24 * 60 : endMinutes;
    const duration = Number(quickSchedule.duration);
    const price = Number(quickSchedule.price);
    if (
      !quickSchedule.days.length ||
      normalizedEndMinutes <= startMinutes ||
      !Number.isInteger(duration) ||
      duration < 15 ||
      !Number.isFinite(price) ||
      price < 0
    )
      return showMessage(
        "Elegí días, un rango válido, duración y precio.",
        "error",
      );
    if ((normalizedEndMinutes - startMinutes) % duration !== 0)
      return showMessage(
        "El horario final debe coincidir con la duración del turno.",
        "error",
      );
    const formatTime = (value) => {
      const normalized = value % (24 * 60);
      return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
    };
    const generated = quickSchedule.days.flatMap((dayOfWeek) =>
      Array.from(
        { length: (normalizedEndMinutes - startMinutes) / duration },
        (_, index) => ({
          dayOfWeek,
          start: formatTime(startMinutes + index * duration),
          end: formatTime(startMinutes + (index + 1) * duration),
          price: Math.round(price),
          active: true,
        }),
      ),
    );
    setSlots((current) =>
      [
        ...current.filter(
          (slot) => !quickSchedule.days.includes(Number(slot.dayOfWeek)),
        ),
        ...generated,
      ].sort(
        (a, b) =>
          Number(a.dayOfWeek) - Number(b.dayOfWeek) ||
          a.start.localeCompare(b.start),
      ),
    );
    showMessage(
      `Se prepararon ${generated.length} horarios. Guardalos para aplicarlos.`,
      "success",
      "quick",
    );
  };
  const saveSlots = async () => {
    try {
      await request(`/api/admin/canchas/${court.id}/horarios`, {
        method: "PUT",
        body: JSON.stringify({ slots }),
      });
      showMessage("Horarios y precios guardados.", "success", "schedule");
    } catch (error) {
      showMessage(error.message, "error", "schedule");
    }
  };
  const saveException = async (event) => {
    event.preventDefault();
    try {
      await request(`/api/admin/canchas/${court.id}/excepciones`, {
        method: "POST",
        body: JSON.stringify(exception),
      });
      setException({
        fecha: "",
        start: "18:00",
        end: "19:00",
        price: "",
        available: false,
      });
      await load();
      showMessage("Excepción guardada.", "success", "exception");
    } catch (error) {
      showMessage(error.message, "error", "exception");
    }
  };
  const saveBlock = async (event) => {
    event.preventDefault();
    try {
      await request(`/api/admin/canchas/${court.id}/bloqueos`, {
        method: "POST",
        body: JSON.stringify(block),
      });
      setBlock({ fecha: "", motivo: "" });
      await load();
      showMessage("Día bloqueado para esta cancha.", "success", "block");
    } catch (error) {
      showMessage(error.message, "error", "block");
    }
  };
  const removeBlock = async (item) => {
    if (
      !(await confirm({
        title: "¿Desbloquear este día?",
        description: `El ${item.fecha} vuelve a aceptar reservas con los horarios y precios habituales de la cancha.`,
        confirmText: "Desbloquear",
      }))
    )
      return;
    try {
      await request(`/api/admin/canchas/${court.id}/bloqueos/${item.id}`, {
        method: "DELETE",
      });
      await load();
      showMessage("Día desbloqueado.", "success", "blocks");
    } catch (error) {
      showMessage(error.message, "error", "blocks");
    }
  };
  return (
    <section className="admin-manager">
      <fieldset className="admin-readonly-fieldset" disabled={readOnly}>
        <div className="admin-section-heading">
          <div>
            <span className="section-kicker">OPERACIÓN DE CANCHA</span>
            <h2>{court.nombre}</h2>
          </div>
          <div className="admin-action-stack">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={saveSlots}
            >
              Guardar horarios
            </Button>
            <ActionFeedback message={messageArea === "schedule" ? message : ""} tone={messageType} />
          </div>
        </div>
        <section
          className="quick-schedule"
          aria-labelledby="quick-schedule-title"
        >
          <div>
            <h3 id="quick-schedule-title">Horario habitual</h3>
            <p>Configurá varios días y turnos de una sola vez.</p>
          </div>
          <div
            className="quick-schedule__days"
            role="group"
            aria-label="Días de la semana"
          >
            {weekdays.map((day, dayOfWeek) => (
              <button
                className={`quick-day${quickSchedule.days.includes(dayOfWeek) ? " is-selected" : ""}`}
                key={day}
                type="button"
                onClick={() => toggleQuickDay(dayOfWeek)}
                aria-pressed={quickSchedule.days.includes(dayOfWeek)}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
          <div className="quick-schedule__fields">
            <label>
              Desde
              <TimePicker
                label="Hora de inicio del horario habitual"
                value={quickSchedule.start}
                onChange={(start) =>
                  setQuickSchedule({
                    ...quickSchedule,
                    start,
                  })
                }
              />
            </label>
            <label>
              Hasta
              <TimePicker
                label="Hora de finalización del horario habitual"
                value={quickSchedule.end}
                onChange={(end) =>
                  setQuickSchedule({
                    ...quickSchedule,
                    end,
                  })
                }
              />
            </label>
            <label>
              Duración
              <select
                value={quickSchedule.duration}
                onChange={(event) =>
                  setQuickSchedule({
                    ...quickSchedule,
                    duration: Number(event.target.value),
                  })
                }
              >
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
                <option value={120}>120 min</option>
              </select>
            </label>
            <label>
              Precio por turno
              <Input
                type="number"
                min="0"
                value={quickSchedule.price}
                onChange={(event) =>
                  setQuickSchedule({
                    ...quickSchedule,
                    price: event.target.value,
                  })
                }
              />
            </label>
            <Button type="button" onClick={applyQuickSchedule}>
              Aplicar horario
            </Button>
          </div>
          <ActionFeedback message={messageArea === "quick" ? message : ""} tone={messageType} />
          <small>
            Reemplaza solo los horarios de los días elegidos. Después tocá
            “Guardar horarios”.
          </small>
        </section>
        <div className="admin-slot-list">
          {slots.map((slot, index) => (
            <div
              className="admin-slot-row"
              key={`${slot.dayOfWeek}-${slot.start}-${index}`}
            >
              <select
                aria-label="Día"
                value={slot.dayOfWeek}
                onChange={(event) =>
                  updateSlot(index, "dayOfWeek", Number(event.target.value))
                }
              >
                {weekdays.map((day, dayIndex) => (
                  <option key={day} value={dayIndex}>
                    {day}
                  </option>
                ))}
              </select>
              <TimePicker
                aria-label="Hora inicial"
                label="Hora inicial"
                value={slot.start}
                onChange={(start) =>
                  updateSlot(index, "start", start)
                }
              />
              <TimePicker
                aria-label="Hora final"
                label="Hora final"
                value={slot.end}
                onChange={(end) =>
                  updateSlot(index, "end", end)
                }
              />
              <Input
                type="number"
                min="0"
                value={slot.price}
                onChange={(event) =>
                  updateSlot(index, "price", event.target.value)
                }
                aria-label="Precio"
              />
              <label>
                <input
                  type="checkbox"
                  checked={slot.active !== false}
                  onChange={(event) =>
                    updateSlot(index, "active", event.target.checked)
                  }
                />{" "}
                Activo
              </label>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() =>
                  setSlots((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() =>
            setSlots((current) => [...current, { ...defaultSlots[0] }])
          }
        >
          Agregar horario
        </Button>
        <div className="admin-split">
          <form className="admin-form" onSubmit={saveException}>
            <h3>Excepción por fecha</h3>
            <CalendarPicker
              label="Fecha de la excepción"
              value={exception.fecha}
              onChange={(fecha) => setException({ ...exception, fecha })}
            />
            <TimePicker
              label="Hora inicial de la excepción"
              value={exception.start}
              onChange={(start) =>
                setException({ ...exception, start })
              }
            />
            <TimePicker
              label="Hora final de la excepción"
              value={exception.end}
              onChange={(end) =>
                setException({ ...exception, end })
              }
            />
            <Input
              type="number"
              min="0"
              placeholder="Precio opcional"
              value={exception.price}
              onChange={(event) =>
                setException({ ...exception, price: event.target.value })
              }
            />
            <label>
              <input
                type="checkbox"
                checked={exception.available}
                onChange={(event) =>
                  setException({
                    ...exception,
                    available: event.target.checked,
                  })
                }
              />{" "}
              Disponible
            </label>
            <Button variant="secondary" size="sm" type="submit">
              Guardar excepción
            </Button>
            <ActionFeedback message={messageArea === "exception" ? message : ""} tone={messageType} />
          </form>
          <form className="admin-form" onSubmit={saveBlock}>
            <h3>Bloquear día completo</h3>
            <CalendarPicker
              label="Fecha para bloquear"
              value={block.fecha}
              onChange={(fecha) => setBlock({ ...block, fecha })}
            />
            <Input
              placeholder="Motivo opcional"
              value={block.motivo}
              onChange={(event) =>
                setBlock({ ...block, motivo: event.target.value })
              }
            />
            <Button variant="secondary" size="sm" type="submit">
              Bloquear día
            </Button>
            <ActionFeedback message={messageArea === "block" ? message : ""} tone={messageType} />
          </form>
        </div>
        {exceptions.length > 0 && (
          <div className="admin-exception-list">
            {exceptions.map((item) => (
              <div key={item.id}>
                <span>
                  {item.date} · {item.start}-{item.end} ·{" "}
                  {item.available
                    ? `$${Number(item.price || 0).toLocaleString("es-AR")}`
                    : "No disponible"}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await request(
                      `/api/admin/canchas/${court.id}/excepciones/${item.id}`,
                      { method: "DELETE" },
                    );
                    await load();
                  }}
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
        {blocks.length > 0 && (
          <div>
            <div className="admin-exception-list">
              {blocks.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.fecha} · {item.motivo || "Día bloqueado"}
                  </span>
                  <button type="button" onClick={() => removeBlock(item)}>
                    Desbloquear
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <ActionFeedback message={messageArea === "blocks" ? message : ""} tone={messageType} />
      </fieldset>
    </section>
  );
}

function ComplexFields({ value, onChange, disabled = false }) {
  const update = (field, next) => onChange({ ...value, [field]: next });
  return (
    <>
      <label>
        Nombre del complejo
        <Input
          required
          disabled={disabled}
          placeholder="Ej. Club del Parque"
          value={value.nombre}
          onChange={(event) => update("nombre", event.target.value)}
        />
      </label>
      <label>
        Ciudad
        <Input
          required
          disabled={disabled}
          placeholder="Ej. Santa Fe"
          value={value.ciudad}
          onChange={(event) => update("ciudad", event.target.value)}
        />
      </label>
      <label>
        Provincia
        <select
          required
          disabled={disabled}
          value={value.provincia}
          onChange={(event) => update("provincia", event.target.value)}
        >
          <option value="" disabled>
            Elegí una provincia
          </option>
          {provinces.map((province) => (
            <option key={province} value={province}>
              {province}
            </option>
          ))}
        </select>
      </label>
      <label>
        Dirección
        <Input
          required
          disabled={disabled}
          placeholder="Calle y número"
          value={value.direccion}
          onChange={(event) => update("direccion", event.target.value)}
        />
      </label>
      <label>
        WhatsApp
        <Input
          required
          disabled={disabled}
          inputMode="tel"
          placeholder="Ej. 54911 1234 5678"
          value={value.whatsapp}
          onChange={(event) => update("whatsapp", event.target.value)}
        />
      </label>
      <label className="admin-field--wide">
        Descripción
        <Input
          disabled={disabled}
          placeholder="Información general del complejo"
          value={value.descripcion}
          onChange={(event) => update("descripcion", event.target.value)}
        />
      </label>
    </>
  );
}

function CourtFields({ value, onChange, disabled = false, canManageFinances = true }) {
  const update = (field, next) => onChange({ ...value, [field]: next });
  return (
    <>
      <label>
        Nombre de la cancha
        <Input
          required
          disabled={disabled}
          placeholder="Ej. Cancha 1"
          value={value.nombre}
          onChange={(event) => update("nombre", event.target.value)}
        />
      </label>
      <label>
        Deporte
        <select
          required
          disabled={disabled}
          value={value.deporte}
          onChange={(event) => update("deporte", event.target.value)}
        >
          {sports.map((sport) => (
            <option key={sport} value={sport}>
              {sport}
            </option>
          ))}
        </select>
      </label>
      <label>
        Descripción
        <Input
          disabled={disabled}
          placeholder="Dato opcional de esta cancha"
          value={value.descripcion}
          onChange={(event) => update("descripcion", event.target.value)}
        />
      </label>
      <label className="admin-checkbox">
        <input
          disabled={disabled}
          type="checkbox"
          checked={value.indoor}
          onChange={(event) => update("indoor", event.target.checked)}
        />{" "}
        Indoor
      </label>
      {canManageFinances && (
        <label className="admin-checkbox">
          <input
            disabled={disabled}
            type="checkbox"
            checked={value.requiere_sena !== false}
            onChange={(event) => update("requiere_sena", event.target.checked)}
          />{" "}
          Exigir seña
        </label>
      )}
    </>
  );
}

function PhotoField({ currentUrl, file, onFile, onRemove, disabled = false }) {
  const localPreview = useMemo(
    () => (file ? URL.createObjectURL(file) : ""),
    [file],
  );
  useEffect(
    () => () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    },
    [localPreview],
  );
  const preview = localPreview || currentUrl;
  return (
    <div className="admin-photo-field">
      <div className="admin-photo-preview">
        {preview ? (
          <img src={preview} alt="Vista previa del complejo" />
        ) : (
          <div className="admin-photo-placeholder">
            <PitchMark compact />
            <span>Se usará el placeholder de NEW MATCH</span>
          </div>
        )}
      </div>
      <div>
        <label
          className={`secondary-button admin-upload-button${disabled ? " is-disabled" : ""}`}
        >
          {preview ? "Cambiar foto" : "Subir foto"}
          <input
            disabled={disabled}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => onFile(event.target.files?.[0] || null)}
          />
        </label>
        <small>JPG, PNG o WebP. Máximo 5 MB.</small>
        {currentUrl && (
          <button
            className="admin-photo-remove"
            type="button"
            disabled={disabled}
            onClick={onRemove}
          >
            Usar placeholder
          </button>
        )}
      </div>
    </div>
  );
}

async function uploadComplexPhoto(file) {
  if (!file) return "";
  if (file.size > 5 * 1024 * 1024)
    throw new Error("La foto supera el máximo de 5 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("La foto debe ser JPG, PNG o WebP.");
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const blob = await upload(`complejos/${Date.now()}-${safeName}`, file, {
    access: "public",
    handleUploadUrl: "/api/admin/uploads/complejo",
  });
  return blob.url;
}

function MercadoPagoSettings({ complex, request, readOnly = false }) {
  const confirm = useConfirm();
  const [settings, setSettings] = useState(null);
  const [percentage, setPercentage] = useState("10");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    request(`/api/admin/complejos/${complex.id}/mercadopago`)
      .then((data) => {
        if (active) {
          setSettings(data);
          setPercentage(String(data.sena_porcentaje || 10));
        }
      })
      .catch((error) => active && setMessage(error.message));
    return () => {
      active = false;
    };
  }, [complex.id, request]);
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const data = await request(
        `/api/admin/complejos/${complex.id}/mercadopago`,
        {
          method: "PATCH",
          body: JSON.stringify({ sena_porcentaje: Number(percentage) }),
        },
      );
      setSettings(data);
      setPercentage(String(data.sena_porcentaje));
      setMessage("Porcentaje de seña actualizado.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };
  const disconnect = async () => {
    if (
      !(await confirm({
        title: "¿Desconectar Mercado Pago?",
        description:
          "El complejo deja de cobrar señas: no se podrán crear nuevas reservas hasta que vuelvas a conectar la cuenta.",
        confirmText: "Desconectar",
        tone: "danger",
      }))
    )
      return;
    setSaving(true);
    setMessage("");
    try {
      await request(`/api/admin/complejos/${complex.id}/mercadopago`, {
        method: "DELETE",
      });
      setSettings((current) => ({
        ...current,
        conectado: false,
        cuenta_id: null,
      }));
      setMessage("Mercado Pago fue desconectado.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="admin-form admin-payment-settings">
      <div>
        <h3>Señas con Mercado Pago</h3>
        <p>
          El cliente paga una seña y el dinero entra directo a la cuenta
          vinculada del complejo.
        </p>
      </div>
      {settings ? (
        <>
          <form className="admin-payment-settings__form" onSubmit={save}>
            <label>
              Porcentaje de seña
              <input
                required
                type="number"
                min="1"
                max="100"
                inputMode="numeric"
                value={percentage}
                onChange={(event) => setPercentage(event.target.value)}
                disabled={saving || readOnly}
              />
              <span>%</span>
            </label>
            <Button
              variant="secondary"
              type="submit"
              disabled={saving || readOnly}
            >
              Guardar porcentaje
            </Button>
          </form>
          <div className="admin-payment-settings__connection">
            <div>
              <strong>
                {settings.conectado
                  ? "Mercado Pago conectado"
                  : "Mercado Pago no está conectado"}
              </strong>
              <small>
                {settings.conectado
                  ? `Cuenta vinculada${settings.cuenta_id ? ` · ${settings.cuenta_id}` : ""}`
                  : "Conectalo para poder aceptar nuevas reservas."}
              </small>
            </div>
            {settings.conectado ? (
              <Button
                className="admin-danger"
                variant="secondary"
                size="sm"
                type="button"
                onClick={disconnect}
                disabled={saving || readOnly}
              >
                Desconectar
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={readOnly}
                onClick={() =>
                  window.location.assign(
                    `/api/admin/complejos/${complex.id}/mercadopago/conectar`,
                  )
                }
              >
                Conectar Mercado Pago
              </Button>
            )}
          </div>
        </>
      ) : (
        <p>Consultando la configuración de pagos…</p>
      )}
      <ActionFeedback
        message={message}
        tone={message.includes("actualizado") || message.includes("desconectado") ? "success" : "error"}
      />
    </section>
  );
}

function ComplexesManager({ complexes, reload, request, adminAccess }) {
  const confirm = useConfirm();
  const alert = useAlert();
  const [complexForm, setComplexForm] = useState(emptyComplex);
  const [firstCourt, setFirstCourt] = useState(emptyCourt);
  const [createPhoto, setCreatePhoto] = useState(null);
  const [selectedComplex, setSelectedComplex] = useState(null);
  const [selectedCourt, setSelectedCourt] = useState(null);
  const [complexEdit, setComplexEdit] = useState(emptyComplex);
  const [courtEdit, setCourtEdit] = useState(emptyCourt);
  const [newCourt, setNewCourt] = useState(emptyCourt);
  const [editPhoto, setEditPhoto] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [messageArea, setMessageArea] = useState("create");
  const [saving, setSaving] = useState(false);
  const selectComplex = (complex) => {
    setSelectedComplex(complex);
    setSelectedCourt(null);
    setComplexEdit({
      nombre: complex.nombre || "",
      ciudad: complex.ciudad || "",
      provincia: complex.provincia || "",
      direccion: complex.direccion || "",
      whatsapp: complex.whatsapp || "",
      descripcion: complex.descripcion || "",
      foto_url: complex.foto_url || "",
    });
    setEditPhoto(null);
  };
  const selectCourt = (court) => {
    setSelectedCourt(court);
    setCourtEdit({
      nombre: court.nombre || "",
      deporte: court.deporte || "Fútbol 5",
      descripcion: court.descripcion || "",
      indoor: Boolean(court.indoor),
      requiere_sena: court.requiere_sena !== false,
    });
  };
  const activeComplex =
    complexes.find((item) => item.id === selectedComplex?.id) ||
    selectedComplex;
  const isSuperadmin = adminAccess?.type === "superadmin";
  const canManageFinances = Boolean(adminAccess?.can_manage_finances);
  const canDeleteStructure = Boolean(adminAccess?.can_delete_structure);
  const creationReadOnly =
    !isSuperadmin &&
    complexes.some((complex) => complex.suspendido_suscripcion);
  const complexReadOnly =
    !isSuperadmin && Boolean(activeComplex?.suspendido_suscripcion);
  const show = (text, type = "success", area = "create") => {
    setMessageType(type);
    setMessageArea(area);
    setMessage(text);
  };
  const courtPayload = (court) => {
    if (canManageFinances) return court;
    const { requiere_sena: _requiereSena, ...operationalCourt } = court;
    return operationalCourt;
  };
  const createComplex = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const foto_url = createPhoto ? await uploadComplexPhoto(createPhoto) : "";
      const created = await request("/api/admin/complejos", {
        method: "POST",
        body: JSON.stringify({ ...complexForm, foto_url, cancha: courtPayload(firstCourt) }),
      });
      const court = created.canchas[0];
      await request(`/api/admin/canchas/${court.id}/horarios`, {
        method: "PUT",
        body: JSON.stringify({ slots: defaultSlots }),
      });
      setComplexForm(emptyComplex);
      setFirstCourt(emptyCourt);
      setCreatePhoto(null);
      await reload();
      show(
        "Complejo creado. Ya podés configurar los horarios de su primera cancha.",
        "success",
        "create",
      );
    } catch (error) {
      show(error.message, "error", "create");
    } finally {
      setSaving(false);
    }
  };
  const saveComplex = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const foto_url = editPhoto
        ? await uploadComplexPhoto(editPhoto)
        : complexEdit.foto_url;
      await request(`/api/admin/complejos/${activeComplex.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...complexEdit, foto_url }),
      });
      setEditPhoto(null);
      await reload();
      show("Datos del complejo actualizados.", "success", "complex");
    } catch (error) {
      show(error.message, "error", "complex");
    } finally {
      setSaving(false);
    }
  };
  const deleteComplex = async () => {
    if (saving) return;
    if (
      !(await confirm({
        title: `¿Eliminar “${activeComplex.nombre}”?`,
        description:
          "Se eliminan el complejo y todas sus canchas de forma definitiva. El historial de reservas se conserva.",
        confirmText: "Eliminar complejo",
        tone: "danger",
      }))
    )
      return;
    setSaving(true);
    try {
      await request(`/api/admin/complejos/${activeComplex.id}`, {
        method: "DELETE",
      });
      setSelectedComplex(null);
      setSelectedCourt(null);
      await reload();
      show("Complejo eliminado definitivamente.", "success", "complex");
    } catch (error) {
      show(error.message, "error", "complex");
      alert({
        title: "No se pudo eliminar el complejo",
        description: error.message,
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  };
  const createCourt = async (event) => {
    event.preventDefault();
    try {
      const court = await request(
        `/api/admin/complejos/${activeComplex.id}/canchas`,
        { method: "POST", body: JSON.stringify(courtPayload(newCourt)) },
      );
      await request(`/api/admin/canchas/${court.id}/horarios`, {
        method: "PUT",
        body: JSON.stringify({ slots: defaultSlots }),
      });
      setNewCourt(emptyCourt);
      await reload();
      show("Cancha agregada. Configurá sus horarios y precios.", "success", "create-court");
    } catch (error) {
      show(error.message, "error", "create-court");
    }
  };
  const saveCourt = async (event) => {
    event.preventDefault();
    try {
      await request(`/api/admin/canchas/${selectedCourt.id}`, {
        method: "PATCH",
        body: JSON.stringify(courtPayload(courtEdit)),
      });
      await reload();
      show("Datos de la cancha actualizados.", "success", "court");
    } catch (error) {
      show(error.message, "error", "court");
    }
  };
  const deleteCourt = async () => {
    if (
      !(await confirm({
        title: `¿Eliminar “${selectedCourt.nombre}”?`,
        description:
          "La cancha se elimina de forma definitiva junto con sus horarios y precios. El historial de reservas se conserva.",
        confirmText: "Eliminar cancha",
        tone: "danger",
      }))
    )
      return;
    try {
      await request(`/api/admin/canchas/${selectedCourt.id}`, {
        method: "DELETE",
      });
      setSelectedCourt(null);
      await reload();
      show("Cancha eliminada definitivamente.", "success", "court");
    } catch (error) {
      show(error.message, "error", "court");
    }
  };
  return (
    <section className="admin-bookings-section admin-complexes">
      <div className="admin-section-heading">
        <h2>Complejos y canchas</h2>
      </div>
      <form
        className="admin-form admin-complex-create"
        onSubmit={createComplex}
      >
        <div className="admin-complex-create__heading">
          <h3>Agregar nuevo complejo</h3>
          <p>Completá los datos del lugar y su primera cancha.</p>
        </div>
        <div className="admin-form__title">
          <span>1</span>
          <div>
            <h3>Datos del complejo</h3>
            <p>
              La ubicación, el contacto y la foto se comparten entre sus
              canchas.
            </p>
          </div>
        </div>
        <div className="admin-complex-fields">
          <ComplexFields
            value={complexForm}
            onChange={setComplexForm}
            disabled={creationReadOnly}
          />
        </div>
        <PhotoField
          currentUrl=""
          file={createPhoto}
          onFile={setCreatePhoto}
          onRemove={() => setCreatePhoto(null)}
          disabled={creationReadOnly}
        />
        <div className="admin-form__title">
          <span>2</span>
          <div>
            <h3>Primera cancha</h3>
            <p>Después vas a poder sumar todas las que necesites.</p>
          </div>
        </div>
        <div className="admin-court-fields">
          <CourtFields
            value={firstCourt}
            onChange={setFirstCourt}
            disabled={creationReadOnly}
            canManageFinances={canManageFinances}
          />
        </div>
        <Button type="submit" disabled={saving || creationReadOnly}>
          {saving ? "Creando complejo…" : "Crear complejo y cancha"}
        </Button>
        <ActionFeedback message={messageArea === "create" ? message : ""} tone={messageType} />
      </form>
      <div className="admin-complex-list">
        {complexes.map((complex) => {
          const complexSports = complex.canchas.map((court) => court.deporte);
          const theme = getComplexTheme(complexSports);
          return (
            <button
              className={`admin-complex-card sport-theme--${theme}${complex.suspendido_suscripcion ? " is-suspended" : ""}${activeComplex?.id === complex.id ? " is-selected" : ""}`}
              type="button"
              key={complex.id}
              onClick={() => selectComplex(complex)}
            >
              {complex.foto_url ? (
                <img src={complex.foto_url} alt="" />
              ) : (
                <div className="admin-complex-card__placeholder">
                  <PitchMark />
                </div>
              )}
              <AdminSportStripes sports={complexSports} />
              <span>
                <strong>{complex.nombre}</strong>
                <small>
                  {complex.ciudad}, {complex.provincia}
                </small>
                <b>
                  {complex.canchas.length}{" "}
                  {complex.canchas.length === 1 ? "cancha" : "canchas"}
                </b>
                {complex.suspendido_suscripcion && (
                  <em className="admin-complex-card__suspension">
                    Suspendido por suscripción
                  </em>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {activeComplex && (
        <div className="admin-complex-workspace">
          {activeComplex.suspendido_suscripcion && (
            <div className="admin-suspension-notice" role="status">
              <Icon name="spark" size={18} />
              <div>
                <strong>Complejo suspendido por suscripción</strong>
                <p>
                  No está publicado y los clientes no pueden hacer reservas.
                  Reactivá la suscripción para volver a editarlo y recibir
                  turnos.
                </p>
              </div>
            </div>
          )}
          <form
            className="admin-form admin-complex-edit"
            onSubmit={saveComplex}
          >
            <div className="admin-section-heading admin-complex-edit__heading">
              <div>
                <h3>Editar {activeComplex.nombre}</h3>
                <p>Actualizá los datos que comparten sus canchas.</p>
              </div>
              {canDeleteStructure && (
                <Button
                  className="admin-danger"
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={deleteComplex}
                  disabled={complexReadOnly || saving}
                >
                  Eliminar complejo
                </Button>
              )}
            </div>
            <div className="admin-complex-fields">
              <ComplexFields
                value={complexEdit}
                onChange={setComplexEdit}
                disabled={complexReadOnly}
              />
            </div>
            <PhotoField
              currentUrl={complexEdit.foto_url}
              file={editPhoto}
              onFile={setEditPhoto}
              onRemove={() => {
                setEditPhoto(null);
                setComplexEdit({ ...complexEdit, foto_url: "" });
              }}
              disabled={complexReadOnly}
            />
            <Button
              variant="secondary"
              type="submit"
              disabled={saving || complexReadOnly}
            >
              Guardar complejo
            </Button>
            <ActionFeedback message={messageArea === "complex" ? message : ""} tone={messageType} />
          </form>
          {canManageFinances && (
            <MercadoPagoSettings
              key={activeComplex.id}
              complex={activeComplex}
              request={request}
              readOnly={complexReadOnly}
            />
          )}
          <section className="admin-courts-panel">
            <div className="admin-courts-panel__heading">
              <h3>Canchas del complejo</h3>
              <p>Agregá una cancha o elegí una creada para editarla.</p>
            </div>
            <form className="admin-form admin-add-court" onSubmit={createCourt}>
              <div>
                <h3>Agregar otra cancha</h3>
                <p>
                  Quedará disponible para configurar sus horarios después de
                  crearla.
                </p>
              </div>
              <div className="admin-court-fields">
                <CourtFields
                  value={newCourt}
                  onChange={setNewCourt}
                  disabled={complexReadOnly}
                  canManageFinances={canManageFinances}
                />
              </div>
              <Button type="submit" disabled={complexReadOnly}>
                Agregar cancha
              </Button>
              <ActionFeedback message={messageArea === "create-court" ? message : ""} tone={messageType} />
            </form>
            <div className="admin-court-list-section">
              <h3>Canchas creadas</h3>
              <div className="admin-court-list">
                {activeComplex.canchas.map((court) => (
                  <button
                    className={`admin-court-card sport-theme--${getSportTheme(court.deporte)}${selectedCourt?.id === court.id ? " is-selected" : ""}`}
                    type="button"
                    key={court.id}
                    onClick={() => selectCourt(court)}
                  >
                    <strong>{court.nombre}</strong>
                    <small>
                      {court.deporte} ·{" "}
                      {court.indoor ? "Indoor" : "A cielo abierto"}
                    </small>
                    {canManageFinances && (
                      <span
                        className={`admin-court-card__deposit${court.requiere_sena === false ? " is-free" : ""}`}
                      >
                        {court.requiere_sena === false
                          ? "Sin seña"
                          : "Seña requerida"}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            {selectedCourt && (
              <section className="admin-court-editor">
                <form
                  className="admin-form admin-court-edit"
                  onSubmit={saveCourt}
                >
                  <div className="admin-section-heading">
                    <div>
                      <h3>Editar {selectedCourt.nombre}</h3>
                      <p>
                        Datos, horarios, precios y excepciones de esta cancha.
                      </p>
                    </div>
                    {canDeleteStructure && (
                      <Button
                        className="admin-danger"
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={deleteCourt}
                        disabled={complexReadOnly}
                      >
                        Eliminar cancha
                      </Button>
                    )}
                  </div>
                  <div className="admin-court-fields">
                    <CourtFields
                      value={courtEdit}
                      onChange={setCourtEdit}
                      disabled={complexReadOnly}
                      canManageFinances={canManageFinances}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    type="submit"
                    disabled={complexReadOnly}
                  >
                    Guardar cancha
                  </Button>
                  <ActionFeedback message={messageArea === "court" ? message : ""} tone={messageType} />
                </form>
                <SlotEditor
                  key={selectedCourt.id}
                  court={selectedCourt}
                  request={request}
                  readOnly={complexReadOnly}
                />
              </section>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function SuperadminManager({ admins, request, reload }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const invite = async (event) => {
    event.preventDefault();
    try {
      await request("/api/superadmin/admins", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setEmail("");
      setMessage(
        "Administrador autorizado. Al ingresar con Google podrá administrar sus complejos.",
      );
      await reload();
    } catch (error) {
      setMessage(error.message);
    }
  };
  return (
    <section className="admin-bookings-section">
      <div className="admin-section-heading">
        <div>
          <span className="section-kicker">ACCESOS</span>
          <h2>Administradores</h2>
        </div>
      </div>
      <form className="admin-form admin-form--inline" onSubmit={invite}>
        <Input
          type="email"
          required
          placeholder="correo@ejemplo.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit">Autorizar administrador</Button>
      </form>
      <ActionFeedback
        message={message}
        tone={message.includes("autorizado") ? "success" : "error"}
      />
      <div className="admin-access-list">
        {admins.map((admin) => (
          <div
            key={admin.invitation_id || admin.id}
            className="admin-access-row"
          >
            <div>
              <strong>{admin.name}</strong>
              <small>{admin.email}</small>
            </div>
            <span>
              {admin.role === "pendiente" ? "Pendiente de ingreso" : admin.role}
            </span>
            {admin.role === "admin_cancha" && (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={async () => {
                  await request(`/api/superadmin/admins/${admin.id}`, {
                    method: "DELETE",
                  });
                  await reload();
                }}
              >
                Quitar acceso
              </Button>
            )}
            {admin.role === "pendiente" && (
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={async () => {
                  await request(
                    `/api/superadmin/invitaciones/${admin.invitation_id}`,
                    { method: "DELETE" },
                  );
                  await reload();
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SubadminManager({ subadmins, request, reload }) {
  const confirm = useConfirm();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState(null);
  const invite = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const result = await request("/api/admin/subadmins", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setEmail("");
      setMessage(result.estado === "activo"
        ? "El subadministrador ya tiene acceso al panel."
        : "Invitación creada. Tendrá acceso cuando ingrese con Google.");
      await reload();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const revoke = async (member) => {
    const isPending = member.estado === "pendiente";
    if (
      !(await confirm({
        title: isPending ? "¿Cancelar esta invitación?" : "¿Quitar el acceso al panel?",
        description: isPending
          ? `La invitación a ${member.email} deja de ser válida. Podés volver a invitarlo cuando quieras.`
          : `${member.email} pierde el acceso al panel de inmediato. Podés volver a invitarlo cuando quieras.`,
        confirmText: isPending ? "Cancelar invitación" : "Quitar acceso",
        tone: "danger",
      }))
    )
      return;
    setBusyId(member.id);
    setMessage("");
    try {
      await request(`/api/admin/subadmins/${member.id}`, { method: "DELETE" });
      await reload();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyId(null);
    }
  };
  return (
    <section className="admin-bookings-section">
      <div className="admin-section-heading">
        <div>
          <h2>Equipo</h2>
          <p>Delegá la operación diaria sin compartir pagos, señas ni suscripción.</p>
        </div>
      </div>
      <form className="admin-form admin-form--inline" onSubmit={invite}>
        <Input
          type="email"
          required
          placeholder="correo@ejemplo.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit">Agregar subadmin</Button>
      </form>
      <ActionFeedback
        message={message}
        tone={message.includes("acceso") || message.includes("Invitación") ? "success" : "error"}
      />
      <div className="admin-access-list">
        {subadmins.length ? subadmins.map((member) => (
          <div key={member.id} className="admin-access-row">
            <div>
              <strong>{member.name}</strong>
              <small>{member.email}</small>
            </div>
            <span>{member.estado === "pendiente" ? "Pendiente de ingreso" : "Subadmin activo"}</span>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={busyId === member.id}
              onClick={() => revoke(member)}
            >
              {member.estado === "pendiente" ? "Cancelar" : "Quitar acceso"}
            </Button>
          </div>
        )) : (
          <div className="admin-team-empty">
            <Icon name="users" size={20} />
            <div><strong>Tu equipo todavía está vacío</strong><p>Agregá una persona para que gestione reservas y canchas.</p></div>
          </div>
        )}
      </div>
    </section>
  );
}

function SubscriptionStatus({ subscription, onCancel, busy }) {
  if (!subscription || subscription.estado === "sin_suscripcion")
    return (
      <section className="subscription-card subscription-card--warning">
        <div>
          <span className="section-kicker">ACCESO COMERCIAL</span>
          <h2>Necesitás una suscripción</h2>
          <p>Elegí un plan para crear complejos y recibir reservas.</p>
        </div>
        <a className="primary-button" href="/planes">
          Ver planes <Icon name="arrow" size={16} />
        </a>
      </section>
    );
  const stateLabel =
    {
      pendiente: "Pendiente",
      prueba: "En prueba",
      activa: "Activa",
      en_gracia: "En período de gracia",
      vencida: "Vencida",
      anulada: "Anulada",
    }[subscription.estado] || subscription.estado;
  const date =
    subscription.estado === "prueba"
      ? subscription.prueba_finaliza_at
      : subscription.estado === "en_gracia"
        ? subscription.gracia_hasta_at
        : subscription.proximo_cobro_at;
  const dateLabel =
    subscription.estado === "prueba"
      ? "Fin de prueba"
      : subscription.estado === "en_gracia"
        ? "Fin de gracia"
        : "Próximo cobro";
  return (
    <section
      className={`subscription-card subscription-card--${subscription.estado}`}
    >
      <div className="subscription-card__top">
        <div>
          <span className="section-kicker">SUSCRIPCIÓN</span>
          <h2>{subscription.plan?.nombre || "Suscripción"}</h2>
          <p>
            {subscription.tipo === "gratuita"
              ? "Acceso gratuito administrado por NEW MATCH."
              : `${Number(subscription.plan?.precio_ars || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })} por mes · 0% de comisión por reserva.`}
          </p>
        </div>
        <span className="subscription-state">{stateLabel}</span>
      </div>
      <dl className="subscription-details">
        <div>
          <dt>{dateLabel}</dt>
          <dd>
            {date
              ? new Intl.DateTimeFormat("es-AR", {
                  dateStyle: "medium",
                }).format(new Date(date))
              : "A confirmar por Mercado Pago"}
          </dd>
        </div>
        <div>
          <dt>Límites</dt>
          <dd>
            {subscription.complexes_used}/{subscription.plan?.max_complejos}{" "}
            sedes · {subscription.courts_used}/{subscription.plan?.max_canchas}{" "}
            canchas
          </dd>
        </div>
      </dl>
      {subscription.plan?.code !== "pro" &&
        subscription.tipo === "mercadopago" &&
        ["prueba", "activa", "en_gracia"].includes(subscription.estado) && (
          <a className="secondary-button" href="/planes">
            Mejorar a Pro
          </a>
        )}
      {subscription.estado !== "anulada" && (
          <Button
            className="subscription-cancel"
            variant="secondary"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            Anular suscripción
          </Button>
        )}
      <p className="subscription-note">
        Al anular, el acceso termina inmediatamente, los complejos se ocultan y
        no hay devolución proporcional. Para volver, necesitás crear una nueva
        suscripción; la prueba no se repite.
      </p>
    </section>
  );
}

function SubscriptionCancelDialog({ target, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const dialogRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const focusFirst = () =>
      dialogRef.current
        ?.querySelector("textarea, button:not([disabled])")
        ?.focus();
    const timer = window.setTimeout(focusFirst, 0);
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [
        ...dialogRef.current.querySelectorAll(
          "textarea, button:not([disabled])",
        ),
      ];
      if (!controls.length) return;
      const currentIndex = controls.indexOf(document.activeElement);
      if (event.shiftKey && currentIndex <= 0) {
        event.preventDefault();
        controls.at(-1).focus();
      }
      if (!event.shiftKey && currentIndex === controls.length - 1) {
        event.preventDefault();
        controls[0].focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [busy, onClose]);
  const targetName = target?.usuario_nombre || "esta suscripción";
  return (
    <div
      className="subscription-cancel-dialog"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="subscription-cancel-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-subscription-title"
        aria-describedby="cancel-subscription-description"
        ref={dialogRef}
      >
        <div className="subscription-cancel-dialog__heading">
          <div>
            <h3 id="cancel-subscription-title">¿Anular {targetName}?</h3>
            <p id="cancel-subscription-description">
              El acceso termina inmediatamente, los complejos dejan de estar
              publicados y no hay devolución proporcional.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cerrar
          </Button>
        </div>
        <ul className="subscription-cancel-dialog__consequences">
          <li>Se cancela la recurrencia en Mercado Pago.</li>
          <li>Para volver, será necesario crear una suscripción nueva.</li>
          <li>La prueba gratuita no vuelve a estar disponible.</li>
        </ul>
        <details className="subscription-cancel-dialog__reason">
          <summary>
            Agregar motivo administrativo <span>(opcional)</span>
          </summary>
          <label className="subscription-cancel-dialog__label">
            Motivo administrativo
            <textarea
              value={reason}
              maxLength={500}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ej.: Prueba de anulación"
            />
          </label>
        </details>
        <div className="subscription-cancel-dialog__actions">
          <Button
            variant="secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Volver
          </Button>
          <Button
            className="subscription-cancel-dialog__confirm"
            type="button"
            disabled={busy}
            onClick={() => onConfirm(reason)}
          >
            {busy ? "Anulando…" : "Anular suscripción"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function SubscriptionManager({ isSuperadmin, request }) {
  const [subscription, setSubscription] = useState(null);
  const [items, setItems] = useState([]);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(undefined);
  const load = useCallback(async () => {
    const own = await request("/api/suscripcion");
    setSubscription(own);
    if (isSuperadmin) setItems(await request("/api/superadmin/suscripciones"));
  }, [isSuperadmin, request]);
  useEffect(() => {
    const timer = window.setTimeout(
      () => load().catch((error) => setMessage(error.message)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  const cancel = async (reason) => {
    const target = cancelTarget?.target;
    setBusy(true);
    setMessage("");
    try {
      await request(
        target
          ? `/api/superadmin/suscripciones/${target.id}/anular`
          : "/api/suscripcion/anular",
        { method: "POST", body: JSON.stringify({ motivo: reason }) },
      );
      setMessage("La suscripción fue anulada correctamente.");
      setCancelTarget(undefined);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  const createFree = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await request("/api/superadmin/suscripciones/gratuita", {
        method: "POST",
        body: JSON.stringify({ email, nota: note }),
      });
      setEmail("");
      setNote("");
      setMessage(
        "Usuario gratuito creado. Si todavía no tiene cuenta, quedará invitado hasta su primer ingreso con Google.",
      );
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="admin-bookings-section subscription-page">
      <div className="admin-section-heading">
        <div>
          <span className="section-kicker">CONTROL COMERCIAL</span>
          <h2>Suscripciones</h2>
        </div>
      </div>
      {!isSuperadmin && (
        <SubscriptionStatus
          subscription={subscription}
          onCancel={() => setCancelTarget({ target: null })}
          busy={busy}
        />
      )}
      {isSuperadmin && (
        <>
          <section className="subscription-card">
            <div>
              <span className="section-kicker">USUARIOS GRATUITOS</span>
              <h2>Dar acceso gratuito</h2>
              <p>
                Usan los límites del plan Estándar: una sede y hasta seis
                canchas. No tienen prueba, cobros ni vencimiento automático.
              </p>
            </div>
            <form className="subscription-free-form" onSubmit={createFree}>
              <Input
                type="email"
                required
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Input
                placeholder="Nota administrativa (opcional)"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <Button type="submit" disabled={busy}>
                Crear usuario gratuito
              </Button>
              <ActionFeedback
                message={message}
                tone={message.includes("creado") ? "success" : "error"}
              />
            </form>
          </section>
          <div className="subscription-list">
            {items.map((item) => (
              <article className="subscription-list__item" key={item.id}>
                <div>
                  <strong>
                    {item.usuario_nombre || "Pendiente de ingreso"}
                  </strong>
                  <small>
                    {item.email} · {item.plan?.nombre} · {item.tipo}
                  </small>
                </div>
                <div>
                  <span
                    className={`subscription-state subscription-state--${item.estado}`}
                  >
                    {item.estado.replace("_", " ")}
                  </span>
                  <small>
                    {item.complexes_used}/{item.plan?.max_complejos} sedes ·{" "}
                    {item.courts_used}/{item.plan?.max_canchas} canchas
                  </small>
                </div>
                {item.estado !== "anulada" && (
                  <Button
                    className="subscription-cancel"
                    variant="secondary"
                    size="sm"
                    type="button"
                    disabled={busy}
                    onClick={() => setCancelTarget({ target: item })}
                  >
                    Anular
                  </Button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {cancelTarget && (
        <SubscriptionCancelDialog
          target={cancelTarget.target}
          busy={busy}
          onClose={() => !busy && setCancelTarget(undefined)}
          onConfirm={cancel}
        />
      )}
    </section>
  );
}

/* El sidebar de escritorio y el drawer móvil comparten las mismas secciones y accesos. */
function AdminNavContent({
  navItems,
  activeSection,
  attention,
  profile,
  roleLabel,
  onSelect,
  onLogout,
  activeItemRef,
  /* En móvil la marca del encabezado ya lleva a la app pública. */
  showAppLink = true,
}) {
  return (
    <>
      <nav aria-label="Secciones del panel">
        {navItems.map(([id, label, icon]) => {
          const itemAttention = id === "subscriptions" ? attention : null;
          const isActive = activeSection === id;
          return (
            <button
              className={`admin-nav-item${isActive ? " is-active" : ""}`}
              key={id}
              type="button"
              ref={isActive ? activeItemRef : undefined}
              aria-current={isActive ? "page" : undefined}
              aria-label={
                itemAttention ? `${label}. ${itemAttention.label}` : undefined
              }
              onClick={() => onSelect(id)}
            >
              <Icon name={icon} size={18} />
              <span>{label}</span>
              {itemAttention && (
                <span
                  className={`subscription-attention subscription-attention--${itemAttention.tone}`}
                  aria-hidden="true"
                >
                  Atención
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="admin-sidebar__bottom">
        {showAppLink && (
          <a className="admin-nav-item" href="/">
            <Icon name="back" size={18} />
            <span>Ver aplicación</span>
          </a>
        )}
        <button className="admin-nav-item" type="button" onClick={onLogout}>
          <Icon name="logout" size={18} />
          <span>Salir</span>
        </button>
        <div className="admin-profile">
          <span>{profile.name?.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{profile.name}</strong>
            <small>{roleLabel}</small>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PanelAdmin() {
  const { data: session, isPending } = useSessionWithFallback();
  const confirm = useConfirm();
  const alert = useAlert();
  const [demo, setDemo] = useState(isDemoAdmin);
  const sessionUserId = demo ? "demo-admin" : session?.user?.id;
  const [profile, setProfile] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [complexes, setComplexes] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [subadmins, setSubadmins] = useState([]);
  const [adminAccess, setAdminAccess] = useState(null);
  const [filterDate, setFilterDate] = useState("");
  const [agendaNow, setAgendaNow] = useState(() => new Date());
  const [calendarTab, setCalendarTab] = useState("upcoming");
  const [upcomingLimit, setUpcomingLimit] = useState(CALENDAR_PAGE_SIZE);
  const [activeSection, setActiveSection] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [profileAttempt, setProfileAttempt] = useState(0);
  const drawerRef = useRef(null);
  const menuButtonRef = useRef(null);
  const activeItemRef = useRef(null);
  const wasMenuOpenRef = useRef(false);
  const request = useCallback(
    async (path, options) =>
      demo
        ? demoRequest(path, options)
        : readApiResponse(await apiFetch(path, options)),
    [demo],
  );
  const reload = useCallback(async () => {
    const [nextBookings, nextComplexes] = await Promise.all([
      request("/api/admin/reservas"),
      request("/api/admin/complejos"),
    ]);
    setBookings(nextBookings);
    setComplexes(nextComplexes);
    if (profile?.role === "superadmin")
      setAdmins(await request("/api/superadmin/admins"));
    if (profile?.role === "admin_cancha")
      setSubadmins(await request("/api/admin/subadmins"));
  }, [profile?.role, request]);
  useEffect(() => {
    if (!sessionUserId) return undefined;

    let active = true;
    let retryTimer;
    request("/api/admin/session")
      .then((data) => {
        if (active) {
          setProfile(data.user);
          setSubscription(data.suscripcion);
          setAdminAccess(data.admin_access);
        }
      })
      .catch((requestError) => {
        if (!active) return;
        if (profileAttempt < 2)
          retryTimer = window.setTimeout(
            () => setProfileAttempt((current) => current + 1),
            1_500,
          );
        else {
          setProfile(false);
          setError(requestError.message);
        }
      });

    return () => {
      active = false;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [profileAttempt, request, sessionUserId]);
  useEffect(() => {
    if (!profile || profile === false) return undefined;
    const timer = window.setTimeout(
      () => reload().catch((requestError) => setError(requestError.message)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [profile, reload]);
  useEffect(() => {
    const timer = window.setInterval(() => setAgendaNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  /* El <dialog> nativo aporta modalidad, foco atrapado y cierre con Escape.
     El foco se coloca acá —después de showModal/close— para no depender del
     orden en que el navegador restaura el foco previo. */
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    if (menuOpen) {
      if (!drawer.open) drawer.showModal();
      (activeItemRef.current || drawer.querySelector(".admin-nav-item"))?.focus();
      wasMenuOpenRef.current = true;
      return;
    }
    if (drawer.open) drawer.close();
    if (!wasMenuOpenRef.current) return;
    wasMenuOpenRef.current = false;
    /* Si el drawer se cerró al pasar a tablet, el botón ya no existe en pantalla. */
    if (menuButtonRef.current?.offsetParent) menuButtonRef.current.focus();
  }, [menuOpen]);
  /* El evento "close" no burbujea, así que React no lo entrega por onClose:
     sin este listener el estado quedaría abierto y el menú no volvería a abrirse. */
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return undefined;
    const syncClosed = () => setMenuOpen(false);
    drawer.addEventListener("close", syncClosed);
    return () => drawer.removeEventListener("close", syncClosed);
  }, []);
  /* A partir de tablet vuelve el sidebar persistente: el drawer ya no aplica. */
  useEffect(() => {
    const query = window.matchMedia("(min-width: 781px)");
    const closeOnDesktop = () => {
      if (query.matches) setMenuOpen(false);
    };
    query.addEventListener("change", closeOnDesktop);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      query.removeEventListener("change", closeOnDesktop);
      window.removeEventListener("resize", closeOnDesktop);
    };
  }, []);
  const bookingSections = getAdminBookingSections(bookings, agendaNow);
  const upcomingBookings = filterDate
    ? bookingSections.upcoming.filter((booking) => booking.fecha === filterDate)
    : bookingSections.upcoming;
  const historyBookings = filterDate
    ? bookingSections.history.filter((booking) => booking.fecha === filterDate)
    : bookingSections.history;
  const visibleUpcomingBookings = upcomingBookings.slice(0, upcomingLimit);
  const login = () =>
    authClient.signIn.social({
      provider: "google",
      callbackURL: window.location.href,
    });
  const startDemo = () => {
    enableDemoAdmin();
    setError("");
    setProfile(null);
    setProfileAttempt(0);
    setDemo(true);
  };
  const logout = async () => {
    if (demo) {
      disableDemoAdmin();
      setDemo(false);
      setProfile(null);
      setSubscription(null);
      setAdminAccess(null);
      setBookings([]);
      setComplexes([]);
      return;
    }
    await authClient.signOut();
    setProfile(null);
  };
  const changeFilterDate = (nextDate) => {
    setFilterDate(nextDate);
    setUpcomingLimit(CALENDAR_PAGE_SIZE);
  };
  const changeAdminSection = (nextSection) => {
    setActiveSection(nextSection);
    setMenuOpen(false);
    if (nextSection === "calendar") {
      setCalendarTab("upcoming");
      setUpcomingLimit(CALENDAR_PAGE_SIZE);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const closeAdminMenu = () => setMenuOpen(false);
  const cancelBooking = async (id) => {
    if (
      !(await confirm({
        title: "¿Cancelar este turno?",
        description:
          "Si la seña está pendiente, el horario se libera de inmediato y vuelve a quedar disponible para otras personas.",
        confirmText: "Cancelar turno",
        tone: "danger",
      }))
    )
      return;
    setError("");
    try {
      await request(`/api/admin/reservas/${id}`, { method: "DELETE" });
      await reload();
    } catch (requestError) {
      setError(requestError.message);
      alert({
        title: "No se pudo cancelar la reserva",
        description: requestError.message,
        tone: "danger",
      });
    }
  };
  const hideHistoryBooking = async (id) => {
    if (
      !(await confirm({
        title: "¿Quitar este turno del historial?",
        description: "Deja de aparecer en el listado del panel. La reserva y sus pagos se conservan.",
        confirmText: "Quitar del historial",
      }))
    )
      return;
    setError("");
    try {
      await request(`/api/admin/reservas/${id}/ocultar-historial`, { method: "POST" });
      await reload();
    } catch (requestError) {
      setError(requestError.message);
      alert({
        title: "No se pudo quitar del historial",
        description: requestError.message,
        tone: "danger",
      });
    }
  };
  if (demo ? profile === null : isPending || (session?.user && profile === null))
    return (
      <div className="admin-login">
        <div className="admin-login__card">Cargando el panel…</div>
      </div>
    );
  if (!demo && !session?.user)
    return <GoogleAccess onLogin={login} onDemo={startDemo} />;
  if (profile === false)
    return (
      <GoogleAccess
        onLogin={login}
        onDemo={startDemo}
        message={
          error ||
          "Esta cuenta no tiene permisos. Elegí la cuenta autorizada de Google para continuar."
        }
      />
    );
  const isSuperadmin = profile.role === "superadmin";
  const isOwnerAdmin = Boolean(adminAccess?.can_manage_team);
  const canManageFinances = Boolean(adminAccess?.can_manage_finances);
  const navItems = [
    ["overview", "Resumen", "home"],
    ["calendar", "Calendario", "calendar"],
    ["complexes", "Complejos", "pitch"],
    ...(canManageFinances ? [["subscriptions", "Suscripciones", "spark"]] : []),
    ...(isOwnerAdmin ? [["subadmins", "Equipo", "users"]] : []),
    ...(isSuperadmin ? [["admins", "Administradores", "user"]] : []),
  ];
  const attention =
    !isSuperadmin && canManageFinances &&
    ["en_gracia", "vencida", "anulada", "sin_suscripcion"].includes(
      subscription?.estado,
    )
      ? {
          tone: subscription.estado === "en_gracia" ? "warning" : "critical",
          label:
            subscription.estado === "en_gracia"
              ? "Atención: período de gracia"
              : "Atención: suscripción requiere acción",
        }
      : null;
  const overviewMetrics = getAdminOverviewMetrics(bookings);
  const publishedComplexes = complexes.filter(
    (complex) => complex.activo && !complex.suspendido_suscripcion,
  );
  const publishedCourts = publishedComplexes
    .flatMap((complex) => complex.canchas || [])
    .filter((court) => court.activa);
  const roleLabel = demo
    ? "Administrador · Demo"
    : isSuperadmin
      ? "Superadministrador"
      : profile.role === "subadmin"
        ? "Subadministrador"
        : "Administrador";
  const navContentProps = {
    navItems,
    activeSection,
    attention,
    profile,
    roleLabel,
    onSelect: changeAdminSection,
    onLogout: logout,
  };
  return (
    <div className="admin-shell">
      <header className="admin-mobile-bar">
        <a className="brand" href="/" aria-label="Volver a explorar">
          <PitchMark />
          <span>NEW MATCH</span>
        </a>
        <button
          className="admin-mobile-bar__menu"
          type="button"
          ref={menuButtonRef}
          aria-label="Abrir el menú del panel"
          aria-expanded={menuOpen}
          aria-controls="admin-drawer"
          onClick={() => setMenuOpen(true)}
        >
          <Icon name="menu" size={22} />
        </button>
      </header>
      <dialog
        className="admin-drawer"
        id="admin-drawer"
        ref={drawerRef}
        aria-labelledby="admin-drawer-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") closeAdminMenu();
        }}
        onClick={(event) => {
          if (event.target === drawerRef.current) closeAdminMenu();
        }}
      >
        <div className="admin-drawer__panel">
          <div className="admin-drawer__head">
            <h2 id="admin-drawer-title">Operaciones</h2>
            <button
              className="admin-drawer__close"
              type="button"
              aria-label="Cerrar el menú del panel"
              onClick={closeAdminMenu}
            >
              <Icon name="close" size={20} />
            </button>
          </div>
          <AdminNavContent
            {...navContentProps}
            activeItemRef={activeItemRef}
            showAppLink={false}
          />
        </div>
      </dialog>
      <aside className="admin-sidebar">
        <a className="brand" href="/" aria-label="Volver a explorar">
          <PitchMark />
          <span>NEW MATCH</span>
        </a>
        <div className="admin-sidebar__label">OPERACIONES</div>
        <AdminNavContent {...navContentProps} />
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="section-kicker">NEW MATCH / OPERACIONES</span>
            <h1>Buen día, {profile.name?.split(" ")[0]}.</h1>
          </div>
          <div className="admin-topbar__actions">
            <span className="avatar-button">
              {profile.name?.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        {error && <p className="form-error">{error}</p>}
        {activeSection === "overview" && (
          <>
            <section className="admin-stats">
              <div className="admin-stat admin-stat--primary">
                <span className="admin-stat__label">TURNOS DE HOY</span>
                <strong>{overviewMetrics.todayBookings}</strong>
                <small className="admin-stat__description">Agenda de tus canchas</small>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__label">COMPLEJOS PUBLICADOS</span>
                <strong>{publishedComplexes.length}</strong>
                <small className="admin-stat__description">{publishedCourts.length} canchas publicadas</small>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__label">INGRESOS DE HOY</span>
                <strong className="admin-stat__money">
                  <span>$</span>
                  {overviewMetrics.todayIncome.toLocaleString("es-AR")}
                </strong>
                <small className="admin-stat__description">Turnos confirmados</small>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__label">INGRESOS ESTE MES</span>
                <strong className="admin-stat__money">
                  <span>$</span>
                  {overviewMetrics.monthIncome.toLocaleString("es-AR")}
                </strong>
                <small className="admin-stat__description">Turnos confirmados</small>
              </div>
            </section>
            <section className="admin-bookings-section">
              <div className="admin-section-heading">
                <div>
                  <span className="section-kicker">AGENDA</span>
                  <h2>Próximos turnos</h2>
                </div>
                <button
                  className="inline-action admin-overview-more"
                  type="button"
                  onClick={() => changeAdminSection("calendar")}
                  aria-label="Ver más próximos turnos en Calendario"
                >
                  Ver más <Icon name="arrow" size={15} />
                </button>
              </div>
              <AdminTable
                bookings={upcomingBookings.slice(0, 8)}
                onCancel={cancelBooking}
                now={agendaNow}
              />
            </section>
          </>
        )}
        {activeSection === "calendar" && (
          <section className="admin-bookings-section">
            <div className="admin-section-heading">
              <div>
                <span className="section-kicker">AGENDA</span>
                <h2>Reservas</h2>
              </div>
              <div className="admin-filters">
                <CalendarPicker
                  label="Filtrar por fecha"
                  value={filterDate}
                  onChange={changeFilterDate}
                />
                <Button
                  variant="chip"
                  size="sm"
                  type="button"
                  onClick={() => changeFilterDate("")}
                >
                  Todos
                </Button>
              </div>
            </div>
            <div className="admin-calendar-switch" role="group" aria-label="Vista de reservas">
              <button
                className={`admin-calendar-switch__tab${calendarTab === "upcoming" ? " is-active" : ""}`}
                id="admin-calendar-tab-upcoming"
                type="button"
                aria-pressed={calendarTab === "upcoming"}
                aria-controls="admin-calendar-panel-upcoming"
                onClick={() => setCalendarTab("upcoming")}
              >
                <span>Próximos</span>
                <b>{upcomingBookings.length}</b>
              </button>
              <button
                className={`admin-calendar-switch__tab${calendarTab === "history" ? " is-active" : ""}`}
                id="admin-calendar-tab-history"
                type="button"
                aria-pressed={calendarTab === "history"}
                aria-controls="admin-calendar-panel-history"
                onClick={() => setCalendarTab("history")}
              >
                <span>Historial</span>
                <b>{historyBookings.length}</b>
              </button>
            </div>
            {calendarTab === "upcoming" ? (
              <section
                className="admin-calendar-panel"
                id="admin-calendar-panel-upcoming"
                aria-labelledby="admin-calendar-tab-upcoming"
              >
                <AdminTable bookings={visibleUpcomingBookings} onCancel={cancelBooking} now={agendaNow} emptyTitle={filterDate ? "No hay próximos turnos para esta fecha" : undefined} emptyDescription={filterDate ? "Probá con otra fecha o mostrálos todos." : undefined} />
                {upcomingBookings.length > visibleUpcomingBookings.length && (
                  <div className="admin-calendar-load-more">
                    <Button className="admin-calendar-load-more__button" variant="secondary" type="button" onClick={() => setUpcomingLimit((limit) => limit + CALENDAR_PAGE_SIZE)}>
                      Cargar 15 más
                    </Button>
                  </div>
                )}
              </section>
            ) : (
              <section
                className="admin-calendar-panel"
                id="admin-calendar-panel-history"
                aria-labelledby="admin-calendar-tab-history"
              >
                <AdminTable bookings={historyBookings} onHideHistory={hideHistoryBooking} mode="history" now={agendaNow} />
              </section>
            )}
          </section>
        )}
        {activeSection === "complexes" && (
          <ComplexesManager
            complexes={complexes}
            reload={reload}
            request={request}
            adminAccess={adminAccess}
          />
        )}
        {activeSection === "subscriptions" && canManageFinances && (
          <SubscriptionManager isSuperadmin={isSuperadmin} request={request} />
        )}
        {activeSection === "subadmins" && isOwnerAdmin && (
          <SubadminManager subadmins={subadmins} request={request} reload={reload} />
        )}
        {activeSection === "admins" && isSuperadmin && (
          <SuperadminManager
            admins={admins}
            request={request}
            reload={reload}
          />
        )}
      </main>
    </div>
  );
}
