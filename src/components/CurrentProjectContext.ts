import { createContext, useContext } from 'react'

export interface CurrentProjectContextValue {
  /** Currently selected project id, or null when nothing is selected. */
  currentProject: string | null
  /** Select a project id as current, or clear it with null. */
  setCurrentProject: (id: string | null) => void
}

/**
 * Holds the currently selected project id and a setter. Consumed via
 * useCurrentProject(); provided by CurrentProjectProvider.
 */
export const CurrentProjectContext = createContext<CurrentProjectContextValue | null>(
  null,
)

/** Access the current project. Must be used inside a CurrentProjectProvider. */
export function useCurrentProject(): CurrentProjectContextValue {
  const ctx = useContext(CurrentProjectContext)
  if (!ctx) {
    throw new Error(
      'useCurrentProject must be used within a CurrentProjectProvider',
    )
  }
  return ctx
}
