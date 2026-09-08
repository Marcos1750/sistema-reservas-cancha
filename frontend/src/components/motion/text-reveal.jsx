import { motion, useReducedMotion } from 'motion/react';

const revealSpring = { stiffness: 140, damping: 26, mass: 1.2 };

export function TextReveal({ text, as: Tag = 'span', className = '', stagger = 0.09, delay = 0, blur = 12, yOffset = '40%' }) {
  const reduce = useReducedMotion();
  const units = text.split(' ');

  return <Tag className={`text-reveal ${className}`.trim()}>{units.map((unit, index) => {
    const unitDelay = delay + index * stagger;
    return <span className="text-reveal__word" key={`${unit}-${index}`}><motion.span
      className="text-reveal__unit"
      initial={reduce ? { opacity: 0 } : { y: yOffset, opacity: 0, filter: `blur(${blur}px)` }}
      animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1, filter: 'blur(0px)' }}
      transition={reduce
        ? { duration: 0.22, ease: [0.16, 1, 0.3, 1], delay: unitDelay * 0.3 }
        : { y: { type: 'spring', ...revealSpring, delay: unitDelay }, opacity: { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: unitDelay }, filter: { duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: unitDelay } }}
    >{unit}</motion.span>{index < units.length - 1 && ' '}</span>;
  })}</Tag>;
}
