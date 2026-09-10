// 020-settings-modal (US5, T032): finalized — FR-014's own "clearly
// labeled placeholder... no broken or misleading link" requirement. No
// hosted documentation exists yet (project-docs/PIPELINE.md's own backlog notes
// this is a separate, future effort) — deliberately no <a> element at
// all rather than a dead/placeholder href, per the spec's own explicit
// "no broken link" wording.
export function DocumentationTab() {
  return (
    <p className="text-sm text-muted-foreground">
      Documentation is not yet published. Check back here once it is.
    </p>
  )
}
