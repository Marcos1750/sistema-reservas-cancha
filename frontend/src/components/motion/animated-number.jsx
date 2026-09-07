// Adapted from beui.dev/components/motion/number.
import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

const EASE_OUT = [0.16, 1, 0.3, 1];

export function AnimatedNumber({ value, duration = 1.1, format = (number) => Math.round(number).toLocaleString('es-AR'), className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const previousValue = useRef(0);

  useEffect(() => {
    if (!inView) return undefined;
    if (reduce) {
      previousValue.current = value;
      setDisplay(value);
      return undefined;
    }
    const controls = animate(previousValue.current, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: setDisplay,
    });
    previousValue.current = value;
    return () => controls.stop();
  }, [duration, inView, reduce, value]);

  return <span ref={ref} className={`tabular-nums ${className}`.trim()}>{format(display)}</span>;
}
