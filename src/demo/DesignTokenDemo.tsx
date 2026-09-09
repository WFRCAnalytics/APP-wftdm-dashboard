import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
// 033-shadcn-default-theme (T026): the seven new form-input primitives —
// this section is their showcase/interaction-verification vehicle (T035).
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Throwaway demo page (002-design-tokens) — proves the token pipeline end
// to end. Deliberately out-of-band from any dashboard navigation (FR-009):
// no panel registry entry, no scenario-data dependency, no services/state
// import. See contracts/component-contract.md's Demo page rules.
//
// 033-shadcn-default-theme: no longer calls the old Google-Fonts-loading
// function on mount — that mechanism, and its whole source module, is
// retired entirely (T024). Real font loading now happens via demo/
// main.tsx's own side-effecting @fontsource-variable/geist(-mono)
// imports, at this entry point's module-load time rather than a
// component mount effect.
export function DesignTokenDemo() {
  const [dark, setDark] = React.useState(false)

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background p-8 text-foreground">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">
          <header className="flex items-center justify-between">
            <h1 className="font-heading text-3xl font-bold">WFRC Design Token Demo</h1>
            <Button variant="outline" onClick={() => setDark((d) => !d)}>
              {dark ? 'Switch to light mode' : 'Switch to dark mode'}
            </Button>
          </header>

          <section className="flex flex-col gap-3">
            <h2 className="font-heading text-xl font-semibold">Button</h2>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-heading text-xl font-semibold">Card</h2>
            <Card className="max-w-sm">
              <CardHeader>
                <CardTitle>Mode share summary</CardTitle>
                <CardDescription>
                  Body text renders in the brand body typeface, resting on the card surface with
                  a visible shadow — not border-alone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  This card demonstrates <code className="font-mono">card</code>/
                  <code className="font-mono">card-foreground</code>, <code className="font-mono">border</code>,{' '}
                  <code className="font-mono">radius</code>, and <code className="font-mono">shadow-md</code>.
                </p>
              </CardContent>
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-heading text-xl font-semibold">Tabs</h2>
            <Tabs defaultValue="observed" className="max-w-md">
              <TabsList>
                <TabsTrigger value="observed">Observed</TabsTrigger>
                <TabsTrigger value="modeled">Modeled</TabsTrigger>
              </TabsList>
              <TabsContent value="observed">
                Inactive tabs use the <code className="font-mono">muted</code>/
                <code className="font-mono">muted-foreground</code> pairing; the active tab uses{' '}
                <code className="font-mono">accent</code>.
              </TabsContent>
              <TabsContent value="modeled">Panel content inherits the body typeface.</TabsContent>
            </Tabs>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-heading text-xl font-semibold">Tooltip</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary">Hover for a tooltip</Button>
              </TooltipTrigger>
              <TooltipContent>
                The tooltip surface reuses <code className="font-mono">card</code>, with{' '}
                <code className="font-mono">border</code> and <code className="font-mono">shadow-lg</code>.
              </TooltipContent>
            </Tooltip>
          </section>

          {/* 033-shadcn-default-theme (T026/T035): the seven new
              form-input primitives, each genuinely interactive — a real
              typed value, checked state, or selection, not a static
              render — so both manual clicking and Playwright automation
              can confirm each one actually works, not just paints. */}
          <section className="flex flex-col gap-4">
            <h2 className="font-heading text-xl font-semibold">Form Inputs</h2>
            <Card className="max-w-md">
              <CardContent className="flex flex-col gap-5 pt-6">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="demo-input">Scenario name</Label>
                  <Input id="demo-input" placeholder="e.g. 2027-rtp-baseyear" />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="demo-select">Comparison scenario</Label>
                  <Select defaultValue="baseline">
                    <SelectTrigger id="demo-select" className="w-full">
                      <SelectValue placeholder="Choose a scenario" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baseline">Baseline</SelectItem>
                      <SelectItem value="density-variant">Density Variant</SelectItem>
                      <SelectItem value="transit-variant">Transit Variant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="demo-textarea">Notes</Label>
                  <Textarea id="demo-textarea" placeholder="Calibration notes for this run..." />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox id="demo-checkbox" defaultChecked />
                  <Label htmlFor="demo-checkbox">Include observed data in comparison</Label>
                </div>

                <div className="flex items-center gap-2">
                  <Switch id="demo-switch" />
                  <Label htmlFor="demo-switch">Enable dark mode</Label>
                </div>

                <fieldset className="flex flex-col gap-2">
                  <legend className="font-body text-sm font-medium">Diff mode</legend>
                  <RadioGroup defaultValue="percent" aria-label="Diff mode">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="percent" id="demo-radio-percent" />
                      <Label htmlFor="demo-radio-percent">Percent change</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="absolute" id="demo-radio-absolute" />
                      <Label htmlFor="demo-radio-absolute">Absolute change</Label>
                    </div>
                  </RadioGroup>
                </fieldset>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </TooltipProvider>
  )
}
