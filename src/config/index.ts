// Site configuration (dashboard-config.yaml): the schema table, the validator, the cascade resolver and the mapper to the
// app's `DashboardBranding`. Pure: relative imports only, no `import.meta.env`, no `@/` alias, no DOM.
export * from './paths'
export * from './schema'
export * from './validate'
export * from './resolve'
export * from './toBranding'
