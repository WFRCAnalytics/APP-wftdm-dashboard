import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { loadBrandFonts } from '@/lib/loadBrandFonts'

// Throwaway demo page (002-design-tokens) — proves the token pipeline end
// to end. Deliberately out-of-band from any dashboard navigation (FR-009):
// no panel registry entry, no scenario-data dependency, no services/state
// import. See contracts/component-contract.md's Demo page rules.
export function DesignTokenDemo() {
  const [dark, setDark] = React.useState(false)

  React.useEffect(() => {
    // Exercises the font pipeline end to end — not main.ts's boot sequence,
    // which this feature never touches (research.md §8).
    loadBrandFonts()
  }, [])

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
        </div>
      </div>
    </TooltipProvider>
  )
}
