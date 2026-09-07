// Adapted from beui.dev/components/motion/select.
import { Check, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';

export function BeUISelect({ value, onValueChange, options, ariaLabel, className = '', disabled = false }) {
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const optionRefs = useRef([]);
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => String(option.value) === String(value));
  const selectedIndex = Math.max(0, options.findIndex((option) => String(option.value) === String(value)));
  const focusOption = (index) => window.requestAnimationFrame(() => optionRefs.current[index]?.focus());
  const openAt = (index = selectedIndex) => { setActiveIndex(index); setOpen(true); focusOption(index); };
  const selectAt = (index) => { const option = options[index]; if (!option) return; onValueChange(String(option.value)); setOpen(false); window.requestAnimationFrame(() => trigger.current?.focus()); };
  const move = (index, direction) => (index + direction + options.length) % options.length;
  useEffect(() => {
    const close = (event) => { if (root.current && !root.current.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close); window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape); };
  }, []);
  const onTriggerKeyDown = (event) => {
    if (disabled) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); openAt(move(selectedIndex, 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); openAt(move(selectedIndex, -1)); }
    else if (event.key === 'Home') { event.preventDefault(); openAt(0); }
    else if (event.key === 'End') { event.preventDefault(); openAt(options.length - 1); }
    else if (event.key.length === 1) { const found = options.findIndex((option) => option.label.toLocaleLowerCase('es-AR').startsWith(event.key.toLocaleLowerCase('es-AR'))); if (found >= 0) { event.preventDefault(); selectAt(found); } }
  };
  const onOptionKeyDown = (event, index) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); const next = move(index, 1); setActiveIndex(next); focusOption(next); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); const next = move(index, -1); setActiveIndex(next); focusOption(next); }
    else if (event.key === 'Home') { event.preventDefault(); setActiveIndex(0); focusOption(0); }
    else if (event.key === 'End') { event.preventDefault(); const last = options.length - 1; setActiveIndex(last); focusOption(last); }
    else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    else if (event.key.length === 1) { const found = options.findIndex((option) => option.label.toLocaleLowerCase('es-AR').startsWith(event.key.toLocaleLowerCase('es-AR'))); if (found >= 0) { setActiveIndex(found); focusOption(found); } }
  };
  return <div ref={root} className={`beui-select ${className}`.trim()}>
    <motion.button ref={trigger} type="button" id={`${id}-trigger`} className="beui-select__trigger" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} onClick={() => open ? setOpen(false) : openAt()} onKeyDown={onTriggerKeyDown} animate={{ borderRadius: open ? 12 : 14 }}>
      <span>{selected?.label || 'Elegí una opción'}</span><motion.span animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : { type: 'spring', duration: .4, bounce: .3 }}><ChevronDown size={18} /></motion.span>
    </motion.button>
    <AnimatePresence>
      {open && <motion.ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-trigger`} className="beui-select__content" initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, filter: 'blur(3px)' }} transition={{ duration: .18 }}>
        {options.map((option, index) => { const isSelected = String(option.value) === String(value); return <li key={option.value}><button ref={(node) => { optionRefs.current[index] = node; }} type="button" role="option" aria-selected={isSelected} tabIndex={index === activeIndex ? 0 : -1} onKeyDown={(event) => onOptionKeyDown(event, index)} onClick={() => selectAt(index)}><span>{option.label}</span>{isSelected && <Check size={16} />}</button></li>; })}
      </motion.ul>}
    </AnimatePresence>
  </div>;
}
