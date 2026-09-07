// Adapted from beui.dev/components/motion/switch.
import { motion, useReducedMotion } from 'motion/react';
import { useId, useState } from 'react';

export function BeUISwitch({ checked, onCheckedChange, disabled = false, ariaLabel, className = '' }) {
  const id = useId();
  const reduce = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  return <motion.button
    id={id} type="button" role="switch" aria-checked={checked} aria-label={ariaLabel} disabled={disabled}
    onClick={() => !disabled && onCheckedChange(!checked)}
    onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
    initial={false} animate={{ backgroundColor: checked ? '#b7ee55' : 'rgba(157, 170, 160, .34)' }}
    transition={reduce ? { duration: 0 } : { duration: 0.2 }}
    className={`beui-switch ${className}`.trim()}
  >
    <motion.span layout transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 800, damping: 80, mass: 4 }} animate={{ x: checked ? 28 : 0, scale: pressed && !disabled ? 0.88 : 1 }} />
  </motion.button>;
}
