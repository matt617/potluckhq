import { CheckCircle, CircleNotch, Info, Warning, XCircle } from '@phosphor-icons/react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** Ink pill toasts, bottom center; on phones they sit above the floating tab bar. */
const Toaster = (props: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      position="bottom-center"
      offset={{ bottom: 32 }}
      mobileOffset={{ bottom: 'calc(100px + env(safe-area-inset-bottom))' }}
      icons={{
        success: <CheckCircle className="size-4" weight="bold" />,
        info: <Info className="size-4" weight="bold" />,
        warning: <Warning className="size-4" weight="bold" />,
        error: <XCircle className="size-4" weight="bold" />,
        loading: <CircleNotch className="size-4 animate-spin" weight="bold" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'mx-auto flex w-fit max-w-[calc(100vw-32px)] items-center gap-2 rounded-full bg-ink px-5 py-[11px] text-[0.94rem] font-medium text-ink-foreground shadow-float',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
