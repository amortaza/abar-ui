// Client-side app settings, persisted to localStorage.
//
// Currently only the "current project" is tracked, but the shape is kept
// extensible so future settings can be added without a migration.

const STORAGE_KEY = 'abar.settings.v1'

export interface AppSettings {
  /** Currently selected project id, or null when nothing is selected. */
  currentProject: string | null
}

const DEFAULTS: AppSettings = { currentProject: null }

/** Read and parse settings from localStorage; falls back to defaults. */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    if (
      parsed &&
      (parsed.currentProject === null ||
        typeof parsed.currentProject === 'string')
    ) {
      return { ...DEFAULTS, ...parsed }
    }
  } catch {
    // Corrupt JSON, disabled storage, etc. — fall back silently.
  }
  return { ...DEFAULTS }
}

/** Persist settings to localStorage; swallows quota / disabled-storage errors. */
export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Ignore write failures (private mode, quota exceeded).
  }
}
