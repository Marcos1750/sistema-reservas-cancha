import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './icons';

const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);
const desktopPopoverWidth = 294;

export function TimePicker({ value, onChange, label = 'Elegir horario', className = '', disabled = false }) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const dialogId = useId();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, flipped: false });

  useEffect(() => {
    if (!open) return undefined;
    const closeWhenOutside = (event) => {
      if (!rootRef.current?.contains(event.target) && !popupRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
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
      const flipped = rect.bottom + 360 > window.innerHeight && rect.top > 360;
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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isMobile, open]);

  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const selectedButton = popupRef.current?.querySelector('[aria-pressed="true"]');
      const firstButton = popupRef.current?.querySelector('button');
      (selectedButton || firstButton)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const choose = (time) => {
    onChange(time);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const picker = open ? createPortal(
    <div className="time-picker__layer">
      {isMobile && <button className="time-picker__backdrop" type="button" aria-label="Cerrar selector de horario" onClick={() => setOpen(false)} />}
      <div
        ref={popupRef}
        id={dialogId}
        className={`time-picker__popover${isMobile ? ' time-picker__popover--sheet' : ''}${position.flipped ? ' is-flipped' : ''}`}
        style={isMobile ? undefined : { top: position.top, left: position.left }}
        role="dialog"
        aria-modal={isMobile || undefined}
        aria-label={label}
        tabIndex="-1"
      >
        {isMobile && <div className="time-picker__handle" />}
        <div className="time-picker__header">
          <Icon name="clock" size={17} />
          <strong>{label}</strong>
          <span>24 h</span>
        </div>
        <div className="time-picker__hours" role="group" aria-label={label}>
          {hours.map((time) => (
            <button key={time} type="button" aria-pressed={time === value} onClick={() => choose(time)}>
              {time}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={rootRef} className={`time-picker ${className}`}>
      <button
        ref={triggerRef}
        className="time-picker__trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={label}
      >
        <Icon name="clock" size={17} />
        <span>{value || 'Elegir hora'}</span>
        <Icon name="down" size={15} />
      </button>
      {picker}
    </div>
  );
}
