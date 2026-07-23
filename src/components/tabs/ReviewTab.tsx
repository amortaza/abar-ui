import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPrompt, deletePrompt, fetchPrompts } from '../../api'
import { subscribe } from '../../events'
import { getTabPlatform, setTabPlatform } from '../../settings'
import type { Prompt } from '../../types'
import { useCurrentProject } from '../CurrentProjectContext'
// Reuse the Prompts tab styles: rows are visually identical, so we share the
// stylesheet instead of duplicating it.
import './PromptsTab.css'

/** UI selection; "Both" shows iOS and Android review prompts together. */
type PlatformChoice = 'iOS' | 'Android' | 'Both'
/** A platform that can actually be POSTed to the backend. */
type TargetPlatform = 'iOS' | 'Android'

/** Resolve a UI choice into the concrete platforms to match against. */
function resolveTargets(choice: PlatformChoice): TargetPlatform[] {
  return choice === 'Both' ? ['iOS', 'Android'] : [choice]
}

/**
 * "Review" tab: prompts in the "review" state. Rows mirror the Ready tab's:
 * a platform icon, the prompt text, and edit/copy/delete actions. Editing
 * here upserts in place and keeps the prompt in review.
 */
export default function ReviewTab() {
  const { currentProject } = useCurrentProject()
  const [platform, setPlatformState] = useState<PlatformChoice>(
    () => getTabPlatform('review'),
  )
  // Persist the platform filter as a per-tab setting on change.
  const setPlatform = (p: PlatformChoice) => {
    setPlatformState(p)
    setTabPlatform('review', p)
  }
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const load = useCallback(async (projectId: string) => {
    setLoading(true)
    setError(null)
    try {
      setPrompts(await fetchPrompts(projectId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentProject) void load(currentProject)
    else setPrompts([])
  }, [currentProject, load])

  // Live-refresh: reload when any prompts file for this project changes.
  useEffect(() => {
    if (!currentProject) return
    return subscribe((e) => {
      if (e.type === 'prompts' && e.project_id === currentProject) void load(currentProject)
    })
  }, [currentProject, load])

  const targets = useMemo(() => resolveTargets(platform), [platform])

  // Only review prompts; cross-platform GET filtered client-side.
  const visible = useMemo(
    () =>
      prompts.filter(
        (p) =>
          p.state === 'review' &&
          targets.includes(p.platform as TargetPlatform),
      ),
    [prompts, targets],
  )

  const startEdit = (p: Prompt) => {
    setEditingId(p.prompt_id)
    setDraft(p.prompt)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft('')
  }

  const commitEdit = async (p: Prompt) => {
    if (!currentProject) return
    const value = draft.trim()
    if (!value) {
      cancelEdit()
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Upsert keyed on the existing prompt_id; state stays 'review'.
      await createPrompt(currentProject, p.platform, {
        session_id: p['session-id'],
        prompt_id: p.prompt_id,
        state: 'review',
        prompt: value,
      })
      cancelEdit()
      await load(currentProject)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (p: Prompt) => {
    if (!currentProject) return
    if (!window.confirm(`Delete prompt "${p.prompt}"?`)) return
    setError(null)
    try {
      await deletePrompt(currentProject, p.platform, p.prompt_id)
      await load(currentProject)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleCopy = async (p: Prompt) => {
    try {
      await navigator.clipboard.writeText(p.prompt)
    } catch {
      setError('Copy failed')
    }
  }

  // Move a review prompt to "done". Upserts with state 'done'; once
  // reloaded, the review filter hides it from this list.
  const handleToDone = async (p: Prompt) => {
    if (!currentProject) return
    setBusy(true)
    setError(null)
    try {
      await createPrompt(currentProject, p.platform, {
        session_id: p['session-id'],
        prompt_id: p.prompt_id,
        state: 'done',
        prompt: p.prompt,
      })
      await load(currentProject)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!currentProject) {
    return (
      <section className="prompts-tab">
        <p className="prompts-empty">No project selected.</p>
      </section>
    )
  }

  return (
    <section className="prompts-tab">
      <fieldset className="prompts-platform">
        <legend className="prompts-platform-legend">Platform</legend>
        {(['iOS', 'Android', 'Both'] as const).map((p: PlatformChoice) => (
          <label key={p} className="prompts-platform-option">
            <input
              type="radio"
              name="review-platform"
              value={p}
              checked={platform === p}
              onChange={() => setPlatform(p)}
            />
            {p}
          </label>
        ))}
      </fieldset>

      {error && <p className="prompts-error">Error: {error}</p>}
      {loading && <p className="prompts-empty">Loading…</p>}
      {!loading && !error && visible.length === 0 && (
        <p className="prompts-empty">No review prompts.</p>
      )}

      {visible.length > 0 && (
        <ul className="prompts-list">
          {visible.map((p) => (
            <li key={p.prompt_id} className="prompts-row">
              <span className="prompts-platform-icon">
                {p.platform === 'Android' ? (
                  <AndroidIcon className="icon-android" />
                ) : (
                  <AppleIcon className="icon-apple" />
                )}
              </span>
              {editingId === p.prompt_id ? (
                <>
                  <input
                    className="prompts-input prompts-input--inline"
                    autoFocus
                    disabled={busy}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void commitEdit(p)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEdit()
                      }
                    }}
                  />
                  <span className="prompts-actions">
                    <button
                      className="icon-btn"
                      title="Save"
                      disabled={busy}
                      onClick={() => void commitEdit(p)}
                    >
                      <SaveIcon />
                    </button>
                    <button
                      className="icon-btn"
                      title="Cancel"
                      disabled={busy}
                      onClick={cancelEdit}
                    >
                      <CancelIcon />
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <span className="prompts-text">{p.prompt}</span>
                  <span className="prompts-actions">
                    <button
                      className="icon-btn icon-btn--ready"
                      title="Mark as done"
                      disabled={busy}
                      onClick={() => void handleToDone(p)}
                    >
                      <PlayIcon />
                    </button>
                    <button
                      className="icon-btn icon-btn--edit"
                      title="Edit"
                      onClick={() => startEdit(p)}
                    >
                      <EditIcon />
                    </button>
                    <button
                      className="icon-btn icon-btn--copy"
                      title="Copy"
                      onClick={() => void handleCopy(p)}
                    >
                      <CopyIcon />
                    </button>
                    <button
                      className="icon-btn icon-btn--danger icon-btn--delete"
                      title="Delete"
                      onClick={() => void handleDelete(p)}
                    >
                      <DeleteIcon />
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---- Platform icons (shown only in "Both" mode) ----
// Mirrors PromptsTab; duplicated to keep the tab self-contained.

function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-label="Android"
      role="img"
    >
      <path d="M17.6 9.48l1.84-3.18a.4.4 0 0 0-.69-.4l-1.86 3.23a7.3 7.3 0 0 0-9.78 0L5.25 5.9a.4.4 0 1 0-.69.4L6.4 9.48A7.1 7.1 0 0 0 3 15.5h18a7.1 7.1 0 0 0-3.4-6.02ZM7 13.25a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm10 0a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
    </svg>
  )
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-label="iOS"
      role="img"
    >
      <path d="M16.36 12.47c-.02-2.3 1.88-3.4 1.97-3.46-1.07-1.57-2.74-1.79-3.33-1.81-1.42-.14-2.77.84-3.49.84-.72 0-1.82-.82-3-.8-1.54.02-2.96.9-3.75 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.11 1.67 2.35 2.86 2.31 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.13 2.76-2.24.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65ZM14.02 5.3c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.6-2.66 1.36-.59.68-1.1 1.76-.96 2.8 1.02.08 2.05-.52 2.68-1.27Z" />
    </svg>
  )
}

// ---- Row action icons (inline SVG, same shapes as Prompts tab) ----

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3.5 2.25a.75.75 0 0 1 1.13-.65l9 5.75a.75.75 0 0 1 0 1.3l-9 5.75A.75.75 0 0 1 3.5 13.75v-11.5Z" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064l6.286-6.286Zm-.878-2.29 1.439 1.439 1.293-1.294a.25.25 0 0 0 0-.353l-1.086-1.086a.25.25 0 0 0-.353 0l-1.293 1.293Z" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25v-7.5Z" />
      <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25v-7.5Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-7.5Z" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 13.32 3.55 5h9.9l-.946 8.32a1 1 0 0 1-.99.884H5.486a1 1 0 0 1-.99-.884Z" />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M2.5 1A1.5 1.5 0 0 0 1 2.5v11A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5V4.94L11.06 1H2.5Zm1.5 1.5h1.75a.25.25 0 0 1 .25.25V5.5a.5.5 0 0 0 .5.5h3.5a.5.5 0 0 0 .5-.5V2.75a.25.25 0 0 1 .25-.25h.19L13 4.56V13.5a.5.5 0 0 1-.5.5H11V9.5a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1V14H3.5a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5Zm3 11.5v-3h3v3h-3Z" />
    </svg>
  )
}

function CancelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  )
}
