import { CheckCircle, CircleNotch, Info, Warning, XCircle } from '@phosphor-icons/react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      icons={{
        success: <CheckCircle className="size-4" weight="bold" />,
        info: <Info className="size-4" weight="bold" />,
        warning: <Warning className="size-4" weight="bold" />,
        error: <XCircle className="size-4" weight="bold" />,
        loading: <CircleNotch className="size-4 animate-spin" weight="bold" />,
      }}
      style={
        {
          '--normal-bg': 'var(--surface)',
          '--normal-text': 'var(--text)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
