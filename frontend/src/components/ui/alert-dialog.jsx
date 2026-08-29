import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

function AlertDialog({ ...props }) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({ ...props }) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal({ ...props }) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogOverlay({ className, ...props }) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        'fixed inset-0 z-[90] bg-[rgba(4,9,7,.78)] backdrop-blur-[8px] data-[state=open]:animate-[patio-fade-in_.18s_ease-out] data-[state=closed]:animate-[patio-fade-out_.14s_ease-in]',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent({ className, ...props }) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-[91] grid w-[min(460px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-auto rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[0_22px_64px_rgba(0,0,0,.45)] outline-none data-[state=open]:animate-[patio-dialog-in_.2s_cubic-bezier(.22,1,.36,1)] data-[state=closed]:animate-[patio-dialog-out_.14s_ease-in] max-[520px]:p-5',
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }) {
  return <div data-slot="alert-dialog-header" className={cn('grid gap-2.5', className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn('flex flex-wrap justify-end gap-2.5 max-[520px]:grid max-[520px]:grid-cols-1', className)}
      {...props}
    />
  );
}

function AlertDialogTitle({ className, ...props }) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('text-[20px] leading-[1.15] font-extrabold tracking-[-.03em] text-[var(--warm)]', className)}
      {...props}
    />
  );
}

function AlertDialogDescription({ className, ...props }) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('max-w-[46ch] text-[13px] leading-[1.5] text-[var(--muted)]', className)}
      {...props}
    />
  );
}

function AlertDialogAction({ className, variant, children, ...props }) {
  return (
    <AlertDialogPrimitive.Action asChild {...props}>
      <Button variant={variant} className={className}>
        {children}
      </Button>
    </AlertDialogPrimitive.Action>
  );
}

function AlertDialogCancel({ className, children, ...props }) {
  return (
    <AlertDialogPrimitive.Cancel asChild {...props}>
      <Button variant="secondary" className={className}>
        {children}
      </Button>
    </AlertDialogPrimitive.Cancel>
  );
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
