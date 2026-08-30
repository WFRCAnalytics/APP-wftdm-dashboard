// Required for Tailwind v3 (not itself part of contracts/tailwind-config-
// contract.md, which specifies tailwind.config.js only, but Vite needs this
// file to run Tailwind's PostCSS plugin at all).
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
