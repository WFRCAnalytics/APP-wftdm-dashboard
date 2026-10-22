// Toasts in the redesign's floating-glass tier (same surface as the control bar and the nav), not shadcn's card: a rounded
// glass pill, the body font, a status icon coloured by the redesign's --ok / --fail / --brand roles and a quiet close button.
// sonner's own styles are switched off (`unstyled`) so nothing of its default look leaks through. useColorScheme() supplies
// the concrete 'light' | 'dark' sonner needs for the parts it still draws itself (it never resolves to 'system').
import { CircleAlert, CircleCheck, Info, Loader2, TriangleAlert } from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { useColorScheme } from '@/hooks/useColorScheme'

export function Toaster(props: ToasterProps) {
  const theme = useColorScheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-right"
      offset={14}
      closeButton
      icons={{
        success: <CircleCheck className="size-[18px] text-[var(--ok)]" aria-hidden="true" />,
        error: <CircleAlert className="size-[18px] text-[var(--fail)]" aria-hidden="true" />,
        warning: <TriangleAlert className="size-[18px] text-[var(--warn)]" aria-hidden="true" />,
        info: <Info className="size-[18px] text-[var(--brand-text)]" aria-hidden="true" />,
        loading: <Loader2 className="size-[18px] animate-spin text-[var(--brand-text)] motion-reduce:animate-none" aria-hidden="true" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'glass flex w-[min(360px,calc(100vw-28px))] items-center gap-3 rounded-[18px] px-4 py-3 font-body text-sm text-[var(--ink)]',
          icon: 'flex flex-none items-center justify-center',
          content: 'min-w-0 flex-1',
          title: 'font-medium leading-snug',
          description: 'mt-0.5 text-[12.5px] leading-snug text-[var(--mute)]',
          actionButton:
            'rounded-full bg-[var(--brand-text)] px-3 py-1 text-[12.5px] font-medium text-[var(--primary-foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
          cancelButton:
            'rounded-full border border-[var(--glass-line)] px-3 py-1 text-[12.5px] text-[var(--mute)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
          closeButton:
            'glass !flex !size-5 !items-center !justify-center !rounded-full !p-0 [&>svg]:!size-3 [&>svg]:!block !border !border-[var(--glass-line)] !text-[var(--mute)] hover:!text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]',
        },
      }}
      {...props}
    />
  )
}
