import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn's own cn() helper — merges conditional class lists (clsx) and then
// resolves conflicting Tailwind utility classes (tailwind-merge), so e.g.
// cn('bg-primary', condition && 'bg-secondary') keeps only the winning
// background class instead of emitting both.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
