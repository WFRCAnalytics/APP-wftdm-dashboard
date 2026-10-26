import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// A text field with a searchable list of suggestions. The field's text IS the value, so anything typed is accepted:
// the list only suggests (the ARIA "editable combobox with list autocomplete" pattern). Built on Radix Popover for
// placement and portalling, with no extra dependency. Typing filters the suggestions; arrow keys move, Enter picks.
export interface ComboboxInputProps {
  id?: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
  placeholder?: string
  'aria-label'?: string
}

export function ComboboxInput({ id, value, options, onChange, placeholder, 'aria-label': ariaLabel }: ComboboxInputProps) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // Show every suggestion until the viewer actually edits the text, so a saved value does not hide the alternatives.
  const [edited, setEdited] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const shown = useMemo(() => {
    const q = value.trim().toLowerCase()
    return !edited || !q ? [...options] : options.filter((o) => o.toLowerCase().includes(q))
  }, [options, value, edited])

  function pick(next: string) {
    onChange(next)
    setEdited(false)
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      if (shown.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + shown.length) % shown.length)
    } else if (e.key === 'Enter' && open && active >= 0 && shown[active] !== undefined) {
      e.preventDefault()
      pick(shown[active])
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <PopoverPrimitive.Root open={open && shown.length > 0} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div>
          <Input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-expanded={open && shown.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            aria-label={ariaLabel}
            value={value}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              onChange(e.target.value)
              setEdited(true)
              setActive(-1)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          // Keep focus in the text field while the list is open.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target === inputRef.current) e.preventDefault()
          }}
          className="z-[70] max-h-60 w-[var(--radix-popover-trigger-width)] min-w-[180px] overflow-auto rounded-md border border-border bg-popover p-1 font-body text-popover-foreground shadow-md outline-none"
        >
          <ul id={listId} role="listbox" aria-label={ariaLabel ? `${ariaLabel} suggestions` : 'Suggestions'}>
            {shown.map((o, i) => (
              <li
                key={o}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o === value}
                data-active={i === active || undefined}
                // mousedown, not click: the field must not blur first
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(o)
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'cursor-pointer rounded-sm px-2 py-1.5 text-sm',
                  i === active && 'bg-accent text-accent-foreground',
                  o === value && 'font-medium',
                )}
              >
                {o}
              </li>
            ))}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
