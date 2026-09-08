import { createContext, useContext, useId, useState } from 'react';
import { motion, MotionConfig, useReducedMotion } from 'motion/react';

const TabsContext = createContext(null);

const spring = {
  type: 'spring',
  stiffness: 170,
  damping: 24,
  mass: 1.2,
};

export function BeUITabs({ defaultValue = '', value, onValueChange, variant = 'pill', className = '', children }) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const layoutId = useId();
  const reduce = useReducedMotion();
  const controlled = value !== undefined;
  const currentValue = controlled ? value : internalValue;
  const setValue = (nextValue) => {
    if (!controlled) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };

  return (
    <MotionConfig transition={reduce ? { duration: 0 } : spring}>
      <TabsContext.Provider value={{ currentValue, setValue, layoutId, variant }}>
        <motion.div layoutRoot className={`beui-tabs beui-tabs--${variant} ${className}`.trim()}>
          {children}
        </motion.div>
      </TabsContext.Provider>
    </MotionConfig>
  );
}

export function BeUITabsList({ className = '', children, ...props }) {
  const { variant } = useTabs();
  return <div role="tablist" className={`beui-tabs__list beui-tabs__list--${variant} ${className}`.trim()} {...props}>{children}</div>;
}

export function BeUITabTrigger({ value, className = '', children, indicatorMode = 'layout', ...props }) {
  const { currentValue, setValue, layoutId, variant } = useTabs();
  const active = currentValue === value;

  return (
    <div className={`beui-tabs__trigger-shell${active ? ' is-active' : ''}`}>
      {active && (indicatorMode === 'static'
        ? <span className={`beui-tabs__indicator beui-tabs__indicator--${variant} beui-tabs__indicator--static`} aria-hidden="true" />
        : <motion.span layoutId={layoutId} className={`beui-tabs__indicator beui-tabs__indicator--${variant}`} aria-hidden="true" />)}
      <button
        type="button"
        role="tab"
        aria-selected={active}
        className={`beui-tabs__trigger${active ? ' is-active' : ''} ${className}`.trim()}
        onClick={() => setValue(value)}
        {...props}
      >
        {children}
      </button>
    </div>
  );
}

export function BeUIExpandableTabs({ items, value, onValueChange, className = '', ...props }) {
  const reduce = useReducedMotion();

  return (
    <div role="tablist" className={`beui-expandable-tabs ${className}`.trim()} {...props}>
      {items.map(({ id, label, icon }) => {
        const active = value === id;
        const labelWidth = Math.ceil(label.length * 7.1);
        const tabWidth = active ? labelWidth + 57 : 46;

        return (
          <motion.button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={label}
            className={`beui-expandable-tabs__tab${active ? ' is-active' : ''}`}
            layout={reduce ? false : 'position'}
            animate={{ width: tabWidth }}
            transition={reduce ? { duration: 0 } : { type: 'spring', duration: 0.46, bounce: 0.04 }}
            onClick={() => onValueChange?.(id)}
          >
            <span className="beui-expandable-tabs__icon">{icon}</span>
            <motion.span
              aria-hidden="true"
              className="beui-expandable-tabs__label"
              initial={false}
              animate={{ width: active ? labelWidth : 0, opacity: active ? 1 : 0, marginLeft: active ? 7 : 0 }}
              transition={reduce ? { duration: 0 } : active ? { type: 'spring', duration: 0.38, bounce: 0.03 } : { duration: 0.16 }}
            >
              {label}
            </motion.span>
          </motion.button>
        );
      })}
    </div>
  );
}

function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error('BeUITabsList and BeUITabTrigger must be used inside BeUITabs.');
  return context;
}
