import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadSettings, saveSettings } from '../settings'
import { CurrentProjectContext } from './CurrentProjectContext'

/**
 * Owns the currently selected project id and persists it as an app setting.
 * Wrap the app (or a subtree) so any descendant can read or change it.
 */
export function CurrentProjectProvider({ children }: { children: ReactNode }) {
  // Lazy init: read the persisted setting once on mount.
  const [currentProject, setCurrentProject] = useState<string | null>(
    () => loadSettings().currentProject,
  )

  // Persist on every change (not on first read — only when it actually
  // changes). Merge into existing settings so other fields (e.g. the
  // per-tab platform filters) are preserved.
  useEffect(() => {
    saveSettings({ ...loadSettings(), currentProject })
  }, [currentProject])

  const value = useMemo(
    () => ({ currentProject, setCurrentProject }),
    [currentProject],
  )

  return (
    <CurrentProjectContext.Provider value={value}>
      {children}
    </CurrentProjectContext.Provider>
  )
}
