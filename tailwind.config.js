/** @type {import('tailwindcss').Config} */
// See contracts/tailwind-config-contract.md — every color/font/shadow value
// references a CSS custom property from src/styles/tokens.css directly
// (var(--role)), never a literal hex/rgb/hsl value. Plain hex custom
// properties, not the hsl(var(--x)) wrapping common in shadcn boilerplate —
// see the contract's Note for why that deviation is deliberate.
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        // 024-settings-modal-visual-redesign: new --success token pair
        // (tokens.css) needs its own entry here, same shape as
        // destructive above — Tailwind silently drops any utility class
        // (bg-success, text-success-foreground) with no matching color
        // key, it does not error, so this is required, not optional.
        success: { DEFAULT: 'var(--success)', foreground: 'var(--success-foreground)' },
        // 029-shadcn-chart-panel: the five new categorical chart-series
        // tokens (tokens.css), exposed the same way every other token is
        // — not strictly required for shadcn's own ChartConfig mechanism
        // (which references `var(--chart-N)` directly in JS, not via a
        // Tailwind utility class), but added for consistency with this
        // app's own established "every semantic token gets a Tailwind
        // color entry too" convention (--success's own precedent above).
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        body: ['var(--font-body)'],
        heading: ['var(--font-heading)'],
        mono: ['var(--font-mono)'],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
}
