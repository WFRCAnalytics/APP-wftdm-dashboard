// Ambient declaration for the File System Access API's directory-picker
// entry point (Chrome/Edge only — project-docs/ARCHITECTURE.md). TypeScript's own
// bundled lib.dom.d.ts (confirmed against the installed 5.9.3 directly, not
// assumed) declares the FileSystemDirectoryHandle interface itself — added
// for StorageManager.getDirectory()'s OPFS use — but not this Window-level
// entry point. 009-scenario-manager is the first feature to actually call
// it: services/duckdb.ts's registerScenario() has accepted a
// FileSystemDirectoryHandle parameter since 001-data-state-layer, but
// nothing produced one until this feature's scenarioManager.ts.
//
// Declared optional (not asserted always-present) to stay honest about
// Firefox/Safari's real absence — scenarioManager.ts's
// supportsLocalFolderLoading() feature-detects it at runtime, and
// loadLocalScenario() itself guards the call rather than relying on a
// non-null assertion here.
interface Window {
  showDirectoryPicker?: (options?: {
    id?: string
    mode?: 'read' | 'readwrite'
  }) => Promise<FileSystemDirectoryHandle>
}
