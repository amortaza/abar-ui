import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deletePhrase, fetchPhrases, upsertPhrase } from '../../api'
import { subscribe } from '../../events'
import type { Phrase } from '../../types'
import { useCurrentProject } from '../CurrentProjectContext'
import './PhrasesTab.css'

/** "Common phrases" tab: list + filter + CRUD for the selected project. */
export default function PhrasesTab() {
  const { currentProject } = useCurrentProject()
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The input at the top both filters the list (live) and, on Enter, creates
  // a new phrase from its current value.
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const editRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow the edit textarea: shrink to content, then re-grow up to the
  // CSS max-height (11 lines). The browser clamps via min/max-height.
  const autosize = useCallback(() => {
    const el = editRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const load = useCallback(async (projectId: string) => {
    setLoading(true)
    setError(null)
    try {
      setPhrases(await fetchPhrases(projectId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentProject) void load(currentProject)
    else setPhrases([])
  }, [currentProject, load])

  // Live-refresh: reload when phrases for this project change anywhere
  // (another tab/client or an out-of-band backend write).
  useEffect(() => {
    if (!currentProject) return
    return subscribe((e) => {
      if (e.type === 'phrases' && e.project_id === currentProject) void load(currentProject)
    })
  }, [currentProject, load])

  const queryLower = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    const base = queryLower
      ? phrases.filter((p) => p.phrase.toLowerCase().includes(queryLower))
      : phrases
    // Sort alphabetically, ignoring case (matches the filter's casing).
    return [...base].sort((a, b) =>
      a.phrase.toLowerCase().localeCompare(b.phrase.toLowerCase()),
    )
  }, [phrases, queryLower])

  const handleAdd = async () => {
    if (!currentProject) return
    const value = query.trim()
    if (!value) return
    try {
      await upsertPhrase(currentProject, value)
      setQuery('')
      await load(currentProject)
    } catch (e) {
      window.alert(`Add failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  const startEdit = (p: Phrase) => {
    setEditingId(p.phrase_id)
    setDraft(p.phrase)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft('')
  }

  const commitEdit = async (phraseId: string) => {
    if (!currentProject) return
    const value = draft.trim()
    if (!value) {
      cancelEdit()
      return
    }
    try {
      await upsertPhrase(currentProject, value, phraseId)
      cancelEdit()
      await load(currentProject)
    } catch (e) {
      window.alert(`Update failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  const handleDelete = async (p: Phrase) => {
    if (!currentProject) return
    if (!window.confirm(`Delete phrase "${p.phrase}"?`)) return
    try {
      await deletePhrase(currentProject, p.phrase_id)
      await load(currentProject)
    } catch (e) {
      window.alert(`Delete failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  const handleCopy = async (p: Phrase) => {
    try {
      await navigator.clipboard.writeText(p.phrase)
    } catch {
      window.alert('Copy failed')
    }
  }

  if (!currentProject) {
    return (
      <section className="phrases-tab">
        <p className="phrases-empty">No project selected.</p>
      </section>
    )
  }

  return (
    <section className="phrases-tab">
      <div className="phrases-toolbar">
        <input
          className="phrases-input"
          placeholder="Filter…  (Enter adds a new phrase)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void handleAdd()
            }
          }}
        />
      </div>

      {loading && <p className="phrases-empty">Loading…</p>}
      {error && <p className="phrases-error">Error: {error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="phrases-empty">
          {query ? 'No matching phrases.' : 'No phrases yet.'}
        </p>
      )}

      {filtered.length > 0 && (
        <ul className="phrases-list">
          {filtered.map((p) => (
            <li key={p.phrase_id} className="phrases-row">
              {editingId === p.phrase_id ? (
                <>
                  <textarea
                    ref={editRef}
                    className="phrases-input phrases-input--inline phrases-input--editor"
                    autoFocus
                    rows={3}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onInput={autosize}
                    onFocus={autosize}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        void commitEdit(p.phrase_id)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEdit()
                      }
                    }}
                  />
                  <span className="phrases-actions">
                    <button
                      className="icon-btn"
                      title="Save"
                      onClick={() => void commitEdit(p.phrase_id)}
                    >
                      <SaveIcon />
                    </button>
                    <button
                      className="icon-btn"
                      title="Cancel"
                      onClick={cancelEdit}
                    >
                      <CancelIcon />
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <span className="phrases-text">{p.phrase}</span>
                  <span className="phrases-actions">
                    <button
                      className="icon-btn icon-btn--sm icon-btn--edit"
                      title="Edit"
                      onClick={() => startEdit(p)}
                    >
                      <EditIcon />
                    </button>
                    <button
                      className="icon-btn icon-btn--sm icon-btn--copy"
                      title="Copy"
                      onClick={() => void handleCopy(p)}
                    >
                      <CopyIcon />
                    </button>
                    <button
                      className="icon-btn icon-btn--sm icon-btn--danger icon-btn--delete"
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

// ---- Icons (inline SVG keeps the app dependency-free) ----

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
