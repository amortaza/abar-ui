// Client-side app settings, persisted to localStorage.
//
// Tracks the "current project" plus each right-pane tab's platform filter
// (iOS / Android / Both). The shape is kept extensible so future settings
// can be added without a migration.

const STORAGE_KEY = 'abar.settings.v1'

/**
 * Window event name dispatched whenever a setting changes, so other parts of
 * the UI (e.g. the RightPane's row counts) can react to per-tab platform
 * picks that happen inside individual tab components.
 */
export const SETTINGS_EVENT = 'abar:settings'

/** The platform filter chosen in a right-pane tab. */
export type TabPlatform = 'iOS' | 'Android' | 'Both'

export interface AppSettings {
  /** Currently selected project id, or null when nothing is selected. */
  currentProject: string | null
  /** Per-tab platform filter, keyed by tab id (e.g. "prompts", "ready"). */
  platforms: Record<string, TabPlatform>
}

const DEFAULTS: AppSettings = { currentProject: null, platforms: {} }

/** Valid platform values, for validating loaded data. */
const PLATFORMS: readonly TabPlatform[] = ['iOS', 'Android', 'Both']

/** Read and parse settings from localStorage; falls back to defaults. */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const merged: AppSettings = { ...DEFAULTS, ...parsed }
    // Validate platforms: drop any unknown keys/values so corrupt data can't
    // surface as an invalid TabPlatform downstream.
    if (parsed.platforms && typeof parsed.platforms === 'object') {
      const clean: Record<string, TabPlatform> = {}
      for (const [k, v] of Object.entries(parsed.platforms)) {
        if (PLATFORMS.includes(v as TabPlatform)) clean[k] = v as TabPlatform
      }
      merged.platforms = clean
    } else {
      merged.platforms = {}
    }
    if (
      !(merged.currentProject === null ||
        typeof merged.currentProject === 'string')
    ) {
      merged.currentProject = null
    }
    return merged
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

/**
 * Read one tab's persisted platform filter, defaulting to 'iOS'. Does a fresh
 * load each call (cheap — one localStorage read + parse) so it reflects the
 * latest writes, including from other tabs.
 */
export function getTabPlatform(tabId: string): TabPlatform {
  return loadSettings().platforms[tabId] ?? 'iOS'
}

/** Persist one tab's platform filter, leaving all other settings intact. */
export function setTabPlatform(tabId: string, platform: TabPlatform): void {
  const settings = loadSettings()
  settings.platforms[tabId] = platform
  saveSettings(settings)
  // Notify listeners that a platform filter changed (e.g. so the RightPane can
  // update row counts that now respect the per-tab platform pick).
  window.dispatchEvent(new Event(SETTINGS_EVENT))
}
