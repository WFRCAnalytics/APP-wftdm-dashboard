// shadcn-pattern wrapper over sonner's <Toaster/> — adapted from
// gropaul/dash-ui's own real, installed src/components/ui/sonner.tsx
// (fetched directly, not assumed), the project's own established
// design-inspiration source (see scenariosTab.tsx/basemapTab.tsx). The
// one real adaptation: dash's version reads next-themes' useTheme(),
// a dependency this project doesn't have; this one reads the existing
// hooks/useColorScheme.ts instead (same MutationObserver-driven
// useSyncExternalStore shape every other theme-aware panel already
// uses), and 'system' is never a real value here since useColorScheme()
// always resolves to a concrete 'light' | 'dark'.
import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { useColorScheme } from '@/hooks/useColorScheme'

export function Toaster(props: ToasterProps) {
  const theme = useColorScheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          closeButton:
            'group-[.toast]:bg-card group-[.toast]:text-muted-foreground group-[.toast]:border-border',
        },
      }}
      {...props}
    />
  )
}
