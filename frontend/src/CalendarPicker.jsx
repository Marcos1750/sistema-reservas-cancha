import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react';
import { Icon } from './icons';

const weekDays = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const desktopPopoverWidth = 294;

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromValue(value) {
  return value ? new Date(`${value}T12:00:00`) : new Date();
}

function monthLabel(date) {
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(date);
}

function displayValue(value) {
  if (!value) return 'Elegir fecha';
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(dateFromValue(value));
}

export function CalendarPicker({ value, onChange, min, label = 'Elegir fecha', compact = false, compactValue = '', className = '' }) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const dragControls = useDragControls();
  const reduce = useReducedMotion();
  const dialogId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, flipped: false });
  const [month, setMonth] = useState(() => new Date(dateFromValue(value).getFullYear(), dateFromValue(value).getMonth(), 1));
  const selected = value || '';
  const minimum = min || '';

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return undefined;
    const closeWhenOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !popupRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeWhenOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const updateOverlay = () => {
      const mobile = window.matchMedia('(max-width: 700px)').matches;
      setIsMobile(mobile);
      if (mobile || !triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const left = Math.min(Math.max(12, rect.right - desktopPopoverWidth), window.innerWidth - desktopPopoverWidth - 12);
      const flipped = rect.bottom + 355 > window.innerHeight && rect.top > 355;
      setPosition({ top: flipped ? rect.top - 9 : rect.bottom + 9, left, flipped });
    };
    updateOverlay();
    window.addEventListener('resize', updateOverlay);
    window.addEventListener('scroll', updateOverlay, true);
    return () => {
      window.removeEventListener('resize', updateOverlay);
      window.removeEventListener('scroll', updateOverlay, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !isMobile) return undefined;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, overflow: body.style.overflow };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open, isMobile]);

  const days = useMemo(() => {
    const firstMondayOffset = (month.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(firstMondayOffset).fill(null), ...Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))];
  }, [month]);

  const choose = (date) => {
    const next = isoDate(date);
    if (minimum && next < minimum) return;
    onChange(next);
    setOpen(false);
  };

  const shiftMonth = (amount) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  const toggle = () => {
    if (!open && value) {
      const next = dateFromValue(value);
      setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    }
    setOpen((current) => !current);
  };

  const calendarContent = <>
      {isMobile && <div className="calendar-picker__handle" onPointerDown={(event) => dragControls.start(event)} />}
      <div className="calendar-picker__header">
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mes anterior"><Icon name="back" size={16} /></button>
        <strong>{monthLabel(month)}</strong>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Mes siguiente"><Icon name="arrow" size={16} /></button>
      </div>
      <div className="calendar-picker__weekdays">{weekDays.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-picker__days">{days.map((date, index) => {
        if (!date) return <span key={`blank-${index}`} />;
        const day = isoDate(date);
        const disabled = Boolean(minimum && day < minimum);
        const today = day === isoDate(new Date());
        return <button key={day} type="button" disabled={disabled} onClick={() => choose(date)} className={`${day === selected ? 'is-selected ' : ''}${today ? 'is-today' : ''}`}>{date.getDate()}</button>;
      })}</div>
    </>;

  const calendar = mounted ? createPortal(<AnimatePresence>{open && <div className="calendar-picker__layer">
    {isMobile && <motion.button className="calendar-picker__backdrop" type="button" aria-label="Cerrar calendario" onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0.18 : 0.5, ease: [0.16, 1, 0.3, 1] }} />}
    {isMobile ? <motion.div ref={popupRef} id={dialogId} className="calendar-picker__popover calendar-picker__popover--sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex="-1" drag="y" dragControls={dragControls} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.02, bottom: 0.4 }} dragMomentum={false} onDragEnd={(_, info) => { if (info.velocity.y > 600 || info.offset.y > 120) setOpen(false); }} initial={reduce ? { y: 0, opacity: 0 } : { y: '100%' }} animate={reduce ? { y: 0, opacity: 1 } : { y: 0 }} exit={reduce ? { y: 0, opacity: 0 } : { y: '100%' }} transition={reduce ? { duration: 0.18, ease: [0.16, 1, 0.3, 1] } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>{calendarContent}</motion.div> : <div ref={popupRef} id={dialogId} className={`calendar-picker__popover${position.flipped ? ' is-flipped' : ''}`} style={{ top: position.top, left: position.left }} role="dialog" aria-label={label} tabIndex="-1">{calendarContent}</div>}
  </div>}</AnimatePresence>, document.body) : null;

  return <div ref={rootRef} className={`calendar-picker${compact ? ' calendar-picker--compact' : ''} ${className}`}>
    <button ref={triggerRef} className="calendar-picker__trigger" type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} aria-label={label}>
      <Icon name="calendar" size={compact ? 18 : 17} />
      {compact ? compactValue && <span className="calendar-picker__compact-value" aria-hidden="true">{compactValue}</span> : <span>{displayValue(value)}</span>}
    </button>
    {calendar}
  </div>;
}
