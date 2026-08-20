import { Slot } from '@radix-ui/react-slot';

import { cn } from '@/lib/utils';

function Card({ className, asChild = false, ...props }) {
  const Comp = asChild ? Slot : 'div';

  return <Comp data-slot="card" className={cn('rounded-[16px] border border-[var(--line)] bg-[rgba(18,49,38,.76)]', className)} {...props} />;
}

function CardHeader({ className, ...props }) {
  return <div data-slot="card-header" className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />;
}

function CardContent({ className, ...props }) {
  return <div data-slot="card-content" className={cn('p-6 pt-0', className)} {...props} />;
}

export { Card, CardHeader, CardContent };
