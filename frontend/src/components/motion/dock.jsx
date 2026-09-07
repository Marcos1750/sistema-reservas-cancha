// Adapted from beui.dev/components/motion/dock.
import { motion, useReducedMotion } from 'motion/react';
import { Children, cloneElement, useId } from 'react';

export function BeUIDock({ children, className = '', label, ...props }) {
  const pillLayoutId = useId();
  return <nav className={`beui-dock ${className}`.trim()} aria-label={label} {...props}>{Children.map(children, (child) => cloneElement(child, { pillLayoutId }))}</nav>;
}

export function BeUIDockItem({ active, children, className = '', onClick, label, pillLayoutId }) {
  const reduce = useReducedMotion();
  return <motion.button type="button" className={`beui-dock__item ${className}`.trim()} onClick={onClick} aria-label={label} aria-current={active ? 'page' : undefined} whileTap={reduce ? undefined : { scale: 0.92 }}>
    {active && <motion.span layoutId={`beui-dock-pill-${pillLayoutId}`} className="beui-dock__pill" transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 32, mass: .6 }} />}
    {children}
  </motion.button>;
}
