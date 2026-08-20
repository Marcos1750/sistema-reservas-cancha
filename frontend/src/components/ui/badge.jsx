import { cn } from '@/lib/utils';

function Badge({ className, variant = 'default', ...props }) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(
        'inline-flex items-center gap-1 rounded-[6px] border border-[var(--line)] bg-[rgba(11,14,12,.32)] px-2 py-1 text-[10px] font-bold text-[var(--muted)]',
        variant === 'accent' && 'border-[rgba(183,238,85,.35)] bg-[rgba(183,238,85,.08)] text-[var(--lime)]',
        variant === 'status' && 'border-[rgba(183,238,85,.22)] bg-[rgba(183,238,85,.06)] text-[var(--lime)]',
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
