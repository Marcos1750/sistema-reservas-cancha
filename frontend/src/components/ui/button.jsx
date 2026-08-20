import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[9px] text-[12px] font-extrabold transition-[background-color,border-color,color,transform] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--lime)] focus-visible:ring-offset-3 focus-visible:ring-offset-[var(--ink)] disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default: 'bg-[var(--grass)] text-[var(--warm)] hover:bg-[#208b55] hover:-translate-y-px',
        secondary: 'border border-[var(--line-strong)] bg-transparent text-[var(--lime)] hover:border-[rgba(183,238,85,.55)] hover:bg-[rgba(183,238,85,.06)]',
        ghost: 'bg-transparent text-[var(--lime)] hover:bg-[rgba(183,238,85,.08)]',
      },
      size: {
        default: 'min-h-[47px] px-[18px]',
        sm: 'min-h-[35px] px-[11px] text-[11px]',
        icon: 'size-[34px] rounded-full p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : 'button';

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button };
