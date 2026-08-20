import { cn } from '@/lib/utils';

function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn('flex min-h-[50px] w-full rounded-[9px] border border-[var(--line)] bg-[var(--surface)] px-[14px] text-[13px] text-[var(--warm)] outline-none transition-colors placeholder:text-[var(--muted-2)] focus:border-[var(--lime)] focus-visible:ring-2 focus-visible:ring-[var(--lime)] focus-visible:ring-offset-3 focus-visible:ring-offset-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}
    />
  );
}

export { Input };
