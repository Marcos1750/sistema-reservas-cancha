import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons';

const weekDays = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

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

export function CalendarPicker({ value, onChange, min, label = 'Elegir fecha', compact = false, className = '' }) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(dateFromValue(value).getFullYear(), dateFromValue(value).getMonth(), 1));
  const selected = value || '';
  const minimum = min || '';

  useEffect(() => {
    if (!open) return undefined;
    const closeWhenOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeWhenOutside);
    return () => document.removeEventListener('pointerdown', closeWhenOutside);
  }, [open]);

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

  return <div ref={rootRef} className={`calendar-picker${compact ? ' calendar-picker--compact' : ''} ${className}`}>
    <button className="calendar-picker__trigger" type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-label={label}>
      <Icon name="calendar" size={compact ? 18 : 17} />
      {!compact && <span>{displayValue(value)}</span>}
    </button>
    {open && <div className="calendar-picker__popover" role="dialog" aria-label={label}>
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
    </div>}
  </div>;
}
